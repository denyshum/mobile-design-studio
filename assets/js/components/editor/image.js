import { webpInfo } from './webp.js';

function fail(message = 'Не вдалося відкрити зображення. Оберіть інший файл') {
    throw new Error(message);
}

function orientation(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = String.fromCharCode(...bytes.subarray(0,4)) === 'Exif' ? 6 : 0;

    if (bytes.length < start + 8) {
        fail();
    }

    const little = view.getUint16(start) === 0x4949;

    if ((!little && view.getUint16(start) !== 0x4d4d) || view.getUint16(start + 2,little) !== 42) {
        fail();
    }

    const at = start + view.getUint32(start + 4,little);
    const count = view.getUint16(at,little);

    for (let n = 0; n < count; n += 1) {
        const entry = at + 2 + n * 12;

        if (entry + 12 > bytes.length) {
            fail();
        }

        if (view.getUint16(entry,little) === 0x112) {
            if (view.getUint16(entry + 2,little) !== 3 || view.getUint32(entry + 4,little) !== 1) {
                fail();
            }

            return view.getUint16(entry + 8,little);
        }
    }

    return 1;
}

export function inputImageInfo(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const text = (at, count) => String.fromCharCode(...bytes.subarray(at,at + count));

    if (bytes.length >= 12 && text(0,4) === 'RIFF' && text(8,4) === 'WEBP') {
        const info = webpInfo(bytes);
        let frames = 0;

        for (let at = 12; at + 8 <= bytes.length;) {
            const kind = text(at,4);
            const size = view.getUint32(at + 4,true);

            if (kind === 'ANIM' || kind === 'ANMF' || (kind === 'VP8X' && (bytes[at + 8] & 2))) {
                fail('Анімоване зображення не підходить для обкладинки');
            }

            if (kind === 'EXIF' && ![0,1].includes(orientation(bytes.subarray(at + 8,at + 8 + size)))) {
                fail('WebP має поворот. Збережіть його з правильною орієнтацією');
            }

            if (kind === 'VP8 ' || kind === 'VP8L') {
                frames += 1;
            }

            at += 8 + size + size % 2;
        }

        if (frames !== 1) {
            fail();
        }

        return {...info, type:'image/webp'};
    }

    if (bytes.length >= 33 && text(1,3) === 'PNG' && bytes[0] === 137 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 && text(12,4) === 'IHDR' && view.getUint32(8) === 13) {
        let at = 8;
        let ended = false;

        while (at + 12 <= bytes.length) {
            const length = view.getUint32(at);
            const kind = text(at + 4,4);

            if (at + 12 + length > bytes.length) {
                fail();
            }

            if (kind === 'acTL') {
                fail('Анімоване PNG не підходить для обкладинки');
            }

            at += 12 + length;

            if (kind === 'IEND') {
                ended = true;
                break;
            }
        }

        if (!ended || at !== bytes.length) {
            fail();
        }

        return {type:'image/png', width:view.getUint32(16), height:view.getUint32(20)};
    }

    if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
        let at = 2;

        while (at + 4 <= bytes.length) {
            if (bytes[at] !== 255) {
                fail();
            }

            while (bytes[at] === 255) {
                at += 1;
            }

            const marker = bytes[at++];

            if ([216,217,218].includes(marker)) {
                fail();
            }

            const size = view.getUint16(at);

            if (size < 2 || at + size > bytes.length) {
                fail();
            }

            if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
                if (size < 8) {
                    fail();
                }

                return {type:'image/jpeg', height:view.getUint16(at + 3), width:view.getUint16(at + 5)};
            }

            at += size;
        }
    }

    fail('Оберіть справжній JPEG, PNG або WebP');
}

export async function prepareCover(file) {
    if (!file?.size || file.size > 20 * 1024 * 1024) {
        fail('Оберіть зображення до 20 МіБ');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inputImageInfo(bytes);
    const webp = info.type === 'image/webp';

    if (info.width < 1 || info.height < 1 || info.width > (webp ? 2560 : 8192) || info.height > (webp ? 2560 : 8192) || info.width * info.height > (webp ? 4000000 : 16000000) || (webp && bytes.length > 5 * 1024 * 1024)) {
        fail(webp ? 'WebP має бути до 2560 px, 4 мегапікселів і 5 МіБ' : 'Оберіть зображення до 8192 px і 16 мегапікселів');
    }

    let bitmap;

    try {
        bitmap = await createImageBitmap(new Blob([bytes],{type:info.type}), {imageOrientation:'from-image', colorSpaceConversion:'default'});

        if (webp) {
            if (bitmap.width !== info.width || bitmap.height !== info.height) {
                fail('Перевірте орієнтацію WebP');
            }

            return new Blob([bytes],{type:'image/webp'});
        }

        const scale = Math.min(1,2560 / bitmap.width,2560 / bitmap.height,Math.sqrt(4000000 / (bitmap.width * bitmap.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1,Math.floor(bitmap.width * scale));
        canvas.height = Math.max(1,Math.floor(bitmap.height * scale));
        const context = canvas.getContext('2d', {alpha:true, colorSpace:'srgb'});

        if (!context) {
            fail('Цей браузер не може підготувати обкладинку');
        }

        context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.90));

        if (!blob || blob.type !== 'image/webp' || blob.size > 5 * 1024 * 1024) {
            fail('Не вдалося підготувати WebP до 5 МіБ. Оберіть менше зображення');
        }

        const check = await createImageBitmap(blob);

        try {
            if (check.width !== canvas.width || check.height !== canvas.height) {
                fail();
            }
        } finally {
            check.close();
        }

        return blob;
    } finally {
        bitmap?.close();
    }
}

