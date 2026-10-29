export const coverBucket = 'project-covers';
export const coverMaxBytes = 5 * 1024 * 1024;

// Перевірка контейнера й геометрії; повне декодування upload належить його обробнику
export function webpInfo(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > coverMaxBytes) {
        throw new Error('Invalid WebP size');
    }

    const text = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) {
        throw new Error('Invalid WebP container');
    }

    let canvas;
    let frame;
    let offset = 12;

    while (offset + 8 <= bytes.length) {
        const type = text(offset, 4);
        const length = view.getUint32(offset + 4, true);
        const start = offset + 8;
        const end = start + length;

        if (end + length % 2 > bytes.length) {
            throw new Error('Truncated WebP chunk');
        }

        if (type === 'VP8X' && length >= 10) {
            const uint24 = index => bytes[index] + bytes[index + 1] * 256 + bytes[index + 2] * 65536;

            canvas = { width: uint24(start + 4) + 1, height: uint24(start + 7) + 1 };
        } else if (type === 'VP8 ' && length >= 10 && text(start + 3, 3) === '\u009d\u0001\u002a') {
            frame = { width: view.getUint16(start + 6, true) & 0x3fff, height: view.getUint16(start + 8, true) & 0x3fff };
        } else if (type === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
            const bits = view.getUint32(start + 1, true);
            frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
        }

        offset = end + length % 2;
    }

    if (offset !== bytes.length || !frame || frame.width < 1 || frame.height < 1) {
        throw new Error('Invalid WebP frame');
    }

    if (canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) {
        throw new Error('WebP dimensions differ');
    }

    return canvas || frame;
}
