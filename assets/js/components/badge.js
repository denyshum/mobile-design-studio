const observed = new WeakSet();

export function paintBadge(badge, count) {
    badge.hidden = !count;
    badge.textContent = count === null ? '' : String(count);
    const measure = () => {
        if (!badge.hidden) {
            badge.parentElement.style.setProperty('--badge-width', badge.getBoundingClientRect().width + 'px');
        } else {
            badge.parentElement.style.removeProperty('--badge-width');
        }
    };
    if (!observed.has(badge) && typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(measure);
        observer.observe(badge);
        observed.add(badge);
    }
    requestAnimationFrame(measure);
}
