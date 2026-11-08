import { el } from './controls.js';

export function createCoverImages(client, signal) {
    const urls = new Set();
    const pending = new WeakMap();
    const cache = new Map();
    const images = new Set();
    const loads = new WeakMap();

    function load(node, record) {
        if (!loads.has(node)) {
            loads.set(node, loadImage(node, record));
        }

        return loads.get(node);
    }

    async function loadImage(node, record) {
        const key = record.record_token + ':' + record.cover_revision;

        try {
            if (!cache.has(key)) {
                cache.set(key, client.cover(record, signal).then(blob => {

                    if (signal.aborted) {
                        throw signal.reason;
                    }

                    const url = URL.createObjectURL(blob);
                    urls.add(url);

                    return url;
                }));
            }

            const url = await cache.get(key);

            if (!signal.aborted) {
                node.src = url;
                await node.decode();
            }
        } catch (error) {
            if (!signal.aborted) {
                node.alt = 'Обкладинка недоступна';
                node.setAttribute('data-image-error', 'true');
                cache.delete(key);

                if ([401,403].includes(error.status)) {
                    document.dispatchEvent(new CustomEvent('editor-access-lost', {detail:error}));
                }
            }
        }
    }

    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                observer.unobserve(entry.target);
                load(entry.target,pending.get(entry.target));
            }
        }
    }, {rootMargin:'200px'}) : null;

    signal.addEventListener('abort', () => {
        observer?.disconnect();

        queueMicrotask(() => {
            const release = () => {
                for (const url of urls) {
                    if (![...images].some(node => node.isConnected && node.src === url)) {
                        URL.revokeObjectURL(url);
                        urls.delete(url);
                    }
                }
            };

            release();
            if (urls.size) {
                const cleanup = new MutationObserver(() => {
                    release();
                    if (!urls.size) {
                        cleanup.disconnect();
                    }
                });
                cleanup.observe(document.body, {childList:true,subtree:true});
            }
        });

        cache.clear();
    }, {once:true});

    const image = (record, className = '') => {
        const node = el('img',className);
        node.alt = '';
        node.dataset.coverId = record.id;
        node.width = record.image_width;
        node.height = record.image_height;
        node.decoding = 'async';

        node.addEventListener('error',() => {
            if (signal.aborted) {
                return;
            }

            client.forgetCover(record);
            cache.delete(record.record_token + ':' + record.cover_revision);

            if (urls.delete(node.src)) {
                URL.revokeObjectURL(node.src);
            }

            node.alt = 'Обкладинка недоступна';
            node.dataset.imageError = 'true';
        },{once:true});

        images.add(node);
        pending.set(node,record);

        if (observer) {
            observer.observe(node);
        } else {
            load(node,record);
        }

        return node;
    };

    image.ready = async (root, start = 0) => {
        const nodes = [...root.querySelectorAll('img[data-cover-id]')];
        const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
        // Рядок має щонайменше 4rem обкладинки й 3rem вертикальних відступів
        const count = Math.ceil((innerHeight + 200) / (size * 7)) + 1;
        const offset = Math.max(0,start - 1);
        await Promise.all(nodes.slice(offset, offset + count).map(node => {
            observer?.unobserve(node);
            return load(node, pending.get(node));
        }));
    };

    return image;
}

