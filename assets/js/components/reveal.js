export const riseFrames = [
    { opacity: 0, transform: 'translateY(.75rem)' },
    { opacity: 1, transform: 'none' },
];

// Фокус одразу відкриває вміст; скасування не залишає його прихованим
export function createReveals({ signal, seen, rootMargin = '0px 0px 32px 0px' }) {
    const pending = new Map();
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            const state = pending.get(entry.target);

            if (!entry.isIntersecting || !state || state.started) {
                continue;
            }

            if (entry.target.contains(document.activeElement)) {
                show(entry.target);
                continue;
            }

            state.started = true;
            entry.target.dataset.motionReveal = 'running';
            observer.unobserve(entry.target);
            state.animation.play();
        }
    }, { threshold: 0, rootMargin });

    function show(element, remember = true) {
        const state = pending.get(element);

        if (state) {
            pending.delete(element);
            observer.unobserve(element);
            state.animation.cancel();
        }

        if (remember) {
            seen?.add(element);
        }

        element.dataset.motionReveal = 'shown';
    }

    function add(elements, { frames = riseFrames, duration = 420, delay = () => 0 } = {}) {
        for (const element of elements) {
            if (!element.getClientRects().length) {
                continue;
            }

            if (seen?.has(element) || element.getBoundingClientRect().top < innerHeight || element.contains(document.activeElement)) {
                show(element);
                continue;
            }

            const animation = element.animate(typeof frames === 'function' ? frames(element) : frames, {
                duration, delay: delay(element), easing: 'cubic-bezier(.2,.65,.3,1)', fill: 'both',
            });
            animation.pause();
            animation.currentTime = 0;
            pending.set(element, { animation, started: false });
            element.dataset.motionReveal = 'pending';

            animation.finished.then(() => {
                if (pending.get(element)?.animation === animation) {
                    show(element);
                }
            }).catch(error => {
                // AbortError є очікуваним завершенням при фокусі чи очищенні
                if (error.name !== 'AbortError') {
                    show(element);
                    console.error(error);
                }
            });

            observer.observe(element);
        }
    }

    document.addEventListener('focusin', event => {
        for (const element of [...pending.keys()]) {
            if (element.contains(event.target)) {
                show(element);
            }
        }
    }, { signal });

    function stop() {
        observer.disconnect();

        for (const element of [...pending.keys()]) {
            show(element, false);
        }
    }

    return { add, stop };
}
