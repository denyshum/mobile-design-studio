const watched = new WeakSet();

export function watchImage(image) {
    if (watched.has(image)) {
        return;
    }
    watched.add(image);
    const showFallback = () => {
        image.hidden = true;
        const fallback = image.parentElement.querySelector('.media-fallback');
        if (fallback) {
            fallback.hidden = false;
        }
    };
    image.addEventListener('error', showFallback, { once: true });
    // Lazy-зображення в ще не вставленому template не є помилкою завантаження
    if (!image.getAttribute('src') || (image.isConnected && image.complete && image.naturalWidth === 0)) {
        showFallback();
    }
}

export function initImageFallbacks() {
    if (document.body.classList.contains('detail-page')) {
        document.querySelectorAll('.media-frame img, .card-grid__media img, .entry-card__media img').forEach(watchImage);
    }
}
