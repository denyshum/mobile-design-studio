import { icon, focusResult } from './data-state.js';

const watched = new WeakSet();
const covers = new WeakSet();

export function watchImage(image) {
    if (watched.has(image) || covers.has(image)) {
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

export function watchCover(image) {
    if (covers.has(image)) {
        return;
    }
    covers.add(image);
    let host = image.parentElement;
    if (host.matches('a')) {
        const wrapper = document.createElement('div');
        wrapper.className = host.className;
        host.className = '';
        host.replaceWith(wrapper);
        wrapper.append(host);
        host = wrapper;
    }
    const source = image.getAttribute('src');
    const card = host.closest('a.entry-card');
    let wrapper;
    let message;
    let keyboard = false;
    let retained = false;
    let requestUrl;
    let timeout;
    host.classList.add('data-cover-host');
    host.querySelector('.media-fallback')?.remove();
    function moved(event) {
        if (!host.contains(event.target)) {
            retained = false;
        }
    }
    function show(state) {
        clearTimeout(timeout);
        host.dataset.mediaState = state;
        host.classList.toggle('data-cover-loading', state === 'loading');
        host.setAttribute('aria-busy', String(state === 'loading'));
        message?.remove();
        if (state === 'success') {
            host.removeAttribute('aria-label');
            host.removeAttribute('role');
            if (wrapper) {
                card.prepend(host);
                wrapper.replaceWith(card);
                wrapper = null;
            }
            if (keyboard && retained && location.href === requestUrl) {
                focusResult(card || host.querySelector('.image-viewer-trigger') || host);
            }
            document.removeEventListener('focusin', moved);
            keyboard = false;
            return;
        }
        message = document.createElement('div');
        message.className = 'data-cover-state';
        const text = document.createElement('p');
        text.textContent = state === 'loading' ? 'Завантажуємо…' : 'Зображення недоступне';
        host.setAttribute('aria-label', state === 'loading' ? 'Завантажуємо зображення' : 'Зображення недоступне');
        host.setAttribute('role', state === 'loading' ? 'img' : 'group');
        if (state === 'loading') {
            message.setAttribute('aria-hidden', 'true');
        }
        message.append(text);
        if (state === 'error') {
            if (card && !wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'data-card-shell';
                card.replaceWith(wrapper);
                wrapper.append(host, card);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'data-cover-state__retry';
            button.textContent = 'Повторити';
            button.addEventListener('click', event => {
                keyboard = event.detail === 0;
                retained = keyboard;
                requestUrl = location.href;
                show('loading');
                if (keyboard) {
                    focusResult(host);
                    document.addEventListener('focusin', moved);
                }
                image.setAttribute('src', source);
                timeout = setTimeout(() => show('error'), 15000);
            });
            message.prepend(icon('image-unavailable', 'data-cover-state__icon'));
            message.append(button);
        }
        host.append(message);
        if (state === 'error' && keyboard && retained && location.href === requestUrl) {
            focusResult(message.querySelector('button'));
        }
    }
    image.addEventListener('load', () => show('success'));
    image.addEventListener('error', () => show('error'));
    show(image.complete && image.naturalWidth ? 'success' : 'loading');
    if (image.complete && !image.naturalWidth && image.isConnected) {
        show('error');
    }
}

export function initImageFallbacks() {
    if (document.body.classList.contains('detail-page')) {
        document.querySelectorAll('.media-frame img, .card-grid__media img, .entry-card__media img').forEach(watchImage);
    }
}
