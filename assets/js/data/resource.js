// Ресурс об'єднує одночасні читання й не кешує помилку
export function createResource(loader, { timeout = 15000 } = {}) {
    const listeners = new Set();
    let current = { status: 'idle', data: null };
    let pending;
    function publish(value) {
        current = value;
        listeners.forEach(listener => listener(current));
    }
    function load() {
        if (pending) {
            return pending;
        }
        if (current.status === 'success') {
            return Promise.resolve(current);
        }
        const retry = current.status === 'error';
        publish({ status: retry ? 'retry' : 'loading', data: null });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        pending = Promise.race([
            Promise.resolve().then(() => loader(controller.signal)),
            new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(new Error('Час очікування вичерпано')), { once: true });
            }),
        ]).then(data => {
            publish({ status: 'success', data });
            return current;
        }, () => {
            publish({ status: 'error', data: null });
            return current;
        }).finally(() => {
            clearTimeout(timer);
            pending = null;
        });
        return pending;
    }
    return {
        load,
        get value() {
            return current;
        },
        subscribe(listener) {
            listeners.add(listener);
            listener(current);
            return () => listeners.delete(listener);
        },
    };
}
