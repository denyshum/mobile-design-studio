export function createCoverCache(request, { maxEntries = 24, maxBytes = 32 * 1024 * 1024 } = {}) {
    const entries = new Map();
    let bytes = 0;
    let version = 0;

    function key(record) {
        return record.record_token + ':' + record.cover_revision;
    }

    function remove(identity, entry) {
        if (entries.get(identity) !== entry) {
            return;
        }

        entries.delete(identity);
        bytes -= entry.blob?.size || 0;
        entry.controller?.abort();
    }

    function trim() {
        for (const [identity, entry] of entries) {
            if (entries.size <= maxEntries && bytes <= maxBytes) {
                break;
            }

            if (entry.blob) {
                remove(identity, entry);
            }
        }
    }

    async function load(record, signal) {
        signal?.throwIfAborted();
        const identity = key(record);
        let entry = entries.get(identity);

        if (!entry?.blob && entry?.signal?.aborted) {
            remove(identity, entry);
            entry = null;
        }

        if (!entry) {
            const controller = new AbortController();
            const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
            const currentVersion = version;
            entry = { controller, signal: combined };
            entries.set(identity, entry);
            const current = entry;
            entry.promise = request('project-cover?id=' + encodeURIComponent(record.id), { signal: combined }).then(async response => {
                const blob = await response.blob();
                combined.throwIfAborted();

                if (currentVersion !== version || entries.get(identity) !== current) {
                    throw new DOMException('Завантаження скасовано', 'AbortError');
                }

                current.blob = blob;
                bytes += blob.size;
                trim();

                return blob;
            }).catch(error => {
                remove(identity, current);
                throw error;
            });
        }

        entries.delete(identity);
        entries.set(identity, entry);
        const blob = entry.blob || await entry.promise;
        signal?.throwIfAborted();

        return blob;
    }

    function remember(record, blob) {
        const identity = key(record);
        const previous = entries.get(identity);

        if (previous) {
            remove(identity, previous);
        }

        entries.set(identity, { blob });
        bytes += blob.size;
        trim();
    }

    function forget(record) {
        const identity = key(record);
        const entry = entries.get(identity);

        if (entry) {
            remove(identity, entry);
        }
    }

    function clear() {
        version += 1;

        for (const [identity, entry] of entries) {
            remove(identity, entry);
        }
    }

    return { load, remember, forget, clear };
}
