import { el } from './controls.js';

export function createCoverImages(client, signal) {
    const urls = new Set();
    const pending = new WeakMap();
    const cache = new Map();

    async function load(node, record) {
        const key = record.record_token + ':' + record.cover_revision;

        try {
            if (!cache.has(key)) {
                cache.set(key, client.request('project-cover?id=' + encodeURIComponent(record.id), {signal}).then(async response => {
                    const blob = await response.blob();

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

        for (const url of urls) {
            URL.revokeObjectURL(url);
        }

        urls.clear();
        cache.clear();
    }, {once:true});

    return (record, className = '') => {
        const node = el('img',className);
        node.alt = '';
        node.width = record.image_width;
        node.height = record.image_height;
        node.decoding = 'async';

        node.addEventListener('error',() => {
            node.alt = 'Обкладинка недоступна';
            node.dataset.imageError = 'true';
        },{once:true});

        pending.set(node,record);

        if (observer) {
            observer.observe(node);
        } else {
            load(node,record);
        }

        return node;
    };
}

