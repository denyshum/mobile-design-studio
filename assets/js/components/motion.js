// Налаштування руху та повернення з кешу сторінки мають один життєвий цикл
export function mountMotion(stateKey, setup, { restore = restart => restart() } = {}) {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    let suspended = false;
    let cleanups = [];
    let events;

    function stop() {
        events?.abort();

        for (const cleanup of cleanups.splice(0).reverse()) {
            cleanup();
        }

        root.dataset[stateKey] = 'static';
    }

    function restart() {
        stop();
        root.dataset[stateKey] = preference.matches ? 'reduced' : 'active';

        if (preference.matches || suspended) {
            return;
        }

        if (!('IntersectionObserver' in window) || !Element.prototype.animate) {
            root.dataset[stateKey] = 'static';

            return;
        }

        events = new AbortController();

        try {
            setup({
                signal: events.signal,

                onCleanup(callback) {
                    cleanups.push(callback);
                },
            });

            addEventListener('error', stop, { signal: events.signal });
            addEventListener('unhandledrejection', stop, { signal: events.signal });
        } catch (error) {
            stop();
            console.error(error);
        }
    }

    preference.addEventListener('change', restart);

    addEventListener('pagehide', () => {
        suspended = true;
        stop();
    });

    addEventListener('pageshow', event => {
        suspended = false;

        if (event.persisted) {
            restore(restart);
        }
    });

    restart();

    return { restart, stop };
}
