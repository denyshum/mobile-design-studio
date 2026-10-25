import { createModal } from './modal.js';
import { sitePath } from './paths.js';

export function initImageViewer(record) {
    const cover = document.querySelector('.cover-media');
    const coverImage = cover?.querySelector('img');
    if (!record?.image || !coverImage?.getAttribute('src')) {
        return;
    }
    const dialog = document.querySelector('.image-viewer');
    const modal = createModal(dialog);
    if (!modal) {
        return;
    }
    const stage = dialog.querySelector('.image-viewer__stage');
    const canvas = dialog.querySelector('.image-viewer__canvas');
    const status = dialog.querySelector('.image-viewer__status');
    const modes = [...dialog.querySelectorAll('[data-set-mode]')];
    const retry = dialog.querySelector('.image-viewer__retry');
    const zoomOut = dialog.querySelector('[data-zoom-out]');
    const zoomIn = dialog.querySelector('[data-zoom-in]');
    const zoomValue = dialog.querySelector('.image-viewer__zoom-value');
    const maxScale = 2;
    const wheelSensitivity = .001;
    const maxWheelDelta = 120;
    let zoomDraft = false;
    const source = record.image;
    dialog.querySelector('#image-viewer-title').textContent = record.name;
    dialog.querySelector('.image-viewer__name').textContent = record.name;
    dialog.querySelector('.image-viewer__category').textContent = record.category;
    dialog.querySelector('.image-viewer__description').textContent = record.description;
    let zoom = 1;
    let image;
    let attempt = 0;
    const pointers = new Map();
    let blockCanvasClick = false;
    let trigger;
    let modeFrame;
    function fitScale() {
        return Math.min(1, stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight);
    }
    function currentScale() {
        return Number.parseFloat(image.style.width) / image.naturalWidth;
    }
    function syncZoomValue(force = false) {
        if (!zoomDraft || force) {
            zoomValue.value = Math.round(currentScale() * 1000) / 10 + '%';
        }
    }
    function layout() {
        if (!dialog.open || !image || stage.dataset.state !== 'ready') {
            return;
        }
        const scale = stage.dataset.mode === 'fit' ? fitScale() : zoom;
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        image.style.width = width + 'px';
        image.style.height = height + 'px';
        canvas.style.width = Math.max(stage.clientWidth, width) + 'px';
        canvas.style.height = Math.max(stage.clientHeight, height) + 'px';
        syncZoomValue();
        zoomValue.disabled = false;
        zoomOut.disabled = stage.dataset.mode === 'fit';
        zoomIn.disabled = stage.dataset.mode !== 'fit' && zoom >= maxScale;
    }
    function applyMode(mode, factor) {
        zoomDraft = false;
        zoom = factor;
        stage.dataset.mode = mode;
        modes.forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.setMode === mode));
        });
        layout();
    }
    function zoomAt(factor, origin, destination = origin) {
        const bounds = image.getBoundingClientRect();
        const oldScale = currentScale();
        const point = { x: (origin.x - bounds.left) / oldScale, y: (origin.y - bounds.top) / oldScale };
        const minimum = fitScale();
        const next = Math.max(minimum, Math.min(maxScale, factor));
        const mode = next <= minimum + .0001 ? 'fit' : Math.abs(next - 1) < .0001 ? 'native' : 'zoom';
        cancelAnimationFrame(modeFrame);
        applyMode(mode, next);
        if (mode === 'fit') {
            stage.scrollLeft = 0;
            stage.scrollTop = 0;
            return;
        }
        // Зберігаємо точку зображення під курсором або серединою жесту
        const updated = image.getBoundingClientRect();
        stage.scrollLeft += updated.left + point.x * next - destination.x;
        stage.scrollTop += updated.top + point.y * next - destination.y;
    }
    function setMode(mode, factor = 1, preserveCenter = false) {
        if (stage.dataset.state !== 'ready') {
            return;
        }
        const oldScale = Number.parseFloat(image.style.width) / image.naturalWidth;
        const oldWidth = image.naturalWidth * oldScale;
        const oldHeight = image.naturalHeight * oldScale;
        const centerX = (stage.scrollLeft + stage.clientWidth / 2 - Math.max(0, (stage.clientWidth - oldWidth) / 2)) / oldScale;
        const centerY = (stage.scrollTop + stage.clientHeight / 2 - Math.max(0, (stage.clientHeight - oldHeight) / 2)) / oldScale;
        applyMode(mode, factor);
        cancelAnimationFrame(modeFrame);
        modeFrame = requestAnimationFrame(() => {
            if (!dialog.open || stage.dataset.mode !== mode) {
                return;
            }
            if (mode === 'fit') {
                stage.scrollLeft = 0;
                stage.scrollTop = 0;
            } else if (preserveCenter && oldScale) {
                stage.scrollLeft = centerX * factor - stage.clientWidth / 2;
                stage.scrollTop = centerY * factor - stage.clientHeight / 2;
            } else {
                stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
                stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) * .18);
            }
        });
    }
    function showState(state) {
        stage.dataset.state = state;
        stage.dataset.mode = 'fit';
        canvas.hidden = state !== 'ready';
        status.hidden = state === 'ready';
        retry.hidden = state !== 'error';
        zoomOut.disabled = true;
        zoomIn.disabled = true;
        zoomDraft = false;
        zoomValue.disabled = true;
        zoomValue.value = '—';
        modes.forEach(button => {
            button.disabled = state !== 'ready';
            button.setAttribute('aria-pressed', 'false');
        });
        dialog.querySelector('.image-viewer__status-title').textContent = state === 'loading' ? 'Завантажуємо зображення…' : state === 'error' ? 'Зображення недоступне' : '';
        dialog.querySelector('.image-viewer__status-text').textContent = state === 'loading' ? 'Ще трохи — і можна буде роздивитися деталі' : state === 'error' ? 'Не вдалося завантажити зображення. Спробуйте ще раз або поверніться до кейсу' : '';
    }
    async function loadImage(isRetry = false) {
        const currentAttempt = ++attempt;
        showState('loading');
        const candidate = new Image();
        candidate.alt = record.imageAlt || record.name;
        candidate.draggable = false;
        candidate.className = 'image-viewer__image';
        try {
            await new Promise((resolve, reject) => {
                candidate.onload = resolve;
                candidate.onerror = () => reject(new Error('Image unavailable'));
                candidate.src = source;
            });
            await candidate.decode();
            if (currentAttempt !== attempt || !dialog.open) {
                return;
            }
            image = candidate;
            canvas.replaceChildren(image);
            showState('ready');
            setMode('fit');
            if (isRetry) {
                modes[0].focus({ preventScroll: true });
            }
        } catch {
            if (currentAttempt === attempt && dialog.open) {
                showState('error');
            }
        }
    }
    function addTrigger() {
        if (trigger || !coverImage.naturalWidth || coverImage.hidden) {
            return;
        }
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'image-viewer-trigger';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 20 20');
        icon.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', sitePath('assets/images/icons-sprite.svg#icon-expand'));
        icon.append(use);
        trigger.append(icon, document.createTextNode('Розглянути зображення'));
        trigger.addEventListener('click', () => {
            if (modal.open(trigger)) {
                loadImage();
            }
        });
        cover.append(trigger);
    }
    coverImage.addEventListener('load', addTrigger);
    coverImage.addEventListener('error', () => {
        trigger?.remove();
        trigger = null;
    });
    if (coverImage.complete) {
        addTrigger();
    }
    modes.forEach(button => {
        button.addEventListener('click', () => setMode(button.dataset.setMode));
    });
    zoomIn.addEventListener('click', () => {
        const next = [1, 1.5, maxScale].find(step => step > currentScale() + .005) || maxScale;
        setMode(next === 1 ? 'native' : 'zoom', next, true);
    });
    zoomOut.addEventListener('click', () => {
        const next = [1.5, 1].find(step => step < currentScale() - .005);
        if (next) {
            setMode(next === 1 ? 'native' : 'zoom', next, true);
        } else {
            setMode('fit');
        }
    });
    function commitZoom() {
        if (!zoomDraft || stage.dataset.state !== 'ready') {
            return;
        }
        const value = zoomValue.value.trim().replace(',', '.');
        zoomDraft = false;
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*%?$/.test(value)) {
            syncZoomValue(true);
            return;
        }
        const percentage = Number.parseFloat(value);
        if (!Number.isFinite(percentage)) {
            syncZoomValue(true);
            return;
        }
        const bounds = stage.getBoundingClientRect();
        zoomAt(percentage / 100, {
            x: bounds.left + stage.clientLeft + stage.clientWidth / 2,
            y: bounds.top + stage.clientTop + stage.clientHeight / 2,
        });
    }
    function finishZoomEditing() {
        commitZoom();
        const active = document.activeElement;
        if (active === zoomValue || active === stage) {
            active.blur();
        }
    }
    zoomValue.addEventListener('focus', () => zoomValue.select());
    zoomValue.addEventListener('input', () => {
        zoomDraft = true;
    });
    zoomValue.addEventListener('blur', commitZoom);
    zoomValue.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitZoom();
            zoomValue.select();
        } else if (event.key === 'Escape' && zoomDraft) {
            event.preventDefault();
            event.stopPropagation();
            zoomDraft = false;
            syncZoomValue(true);
            zoomValue.select();
        }
    });
    retry.addEventListener('click', () => loadImage(true));
    dialog.addEventListener('close', () => {
        attempt += 1;
        cancelAnimationFrame(modeFrame);
        canvas.replaceChildren();
        image = null;
        pointers.clear();
        delete stage.dataset.dragging;
        blockCanvasClick = false;
    });
    canvas.addEventListener('click', event => {
        if (blockCanvasClick) {
            blockCanvasClick = false;
            return;
        }
        if (event.target === canvas && stage.dataset.mode === 'fit') {
            modal.close();
        }
    });
    stage.addEventListener('wheel', event => {
        if (!dialog.open || stage.dataset.state !== 'ready' || !event.deltaY) {
            return;
        }
        event.preventDefault();
        finishZoomEditing();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
        const delta = Math.max(-maxWheelDelta, Math.min(maxWheelDelta, event.deltaY * unit));
        zoomAt(currentScale() * Math.exp(-delta * wheelSensitivity), { x: event.clientX, y: event.clientY });
    }, { passive: false });
    function pairGeometry() {
        const [first, second] = pointers.values();
        return {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2,
            distance: Math.hypot(second.x - first.x, second.y - first.y),
        };
    }
    stage.addEventListener('pointerdown', event => {
        if (stage.dataset.state !== 'ready' || event.button !== 0 || pointers.size >= 2) {
            return;
        }
        finishZoomEditing();
        if (event.pointerType === 'mouse' && stage.dataset.mode === 'fit') {
            return;
        }
        event.preventDefault();
        if (!pointers.size) {
            blockCanvasClick = false;
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, emptyCanvas: event.target === canvas });
        if (pointers.size === 2) {
            blockCanvasClick = true;
        }
        if (stage.dataset.mode !== 'fit') {
            stage.dataset.dragging = 'true';
        }
        stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
        const previous = pointers.get(event.pointerId);
        if (!previous) {
            return;
        }
        const oldPair = pointers.size === 2 ? pairGeometry() : null;
        const deltaX = event.clientX - previous.x;
        const deltaY = event.clientY - previous.y;
        previous.x = event.clientX;
        previous.y = event.clientY;
        if (Math.hypot(previous.x - previous.startX, previous.y - previous.startY) > 3) {
            blockCanvasClick = true;
        }
        if (oldPair) {
            const nextPair = pairGeometry();
            if (oldPair.distance > 0 && nextPair.distance > 0) {
                zoomAt(currentScale() * nextPair.distance / oldPair.distance, oldPair, nextPair);
            }
        } else if (stage.dataset.mode !== 'fit') {
            cancelAnimationFrame(modeFrame);
            stage.scrollLeft -= deltaX;
            stage.scrollTop -= deltaY;
        }
        if (stage.dataset.mode !== 'fit') {
            stage.dataset.dragging = 'true';
        }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        stage.addEventListener(type, event => {
            const pointer = pointers.get(event.pointerId);
            pointers.delete(event.pointerId);
            if (!pointers.size) {
                delete stage.dataset.dragging;
                if (type === 'pointerup' && pointer?.emptyCanvas && !blockCanvasClick && stage.dataset.mode === 'fit') {
                    modal.close();
                }
            }
            if (stage.hasPointerCapture(event.pointerId)) {
                stage.releasePointerCapture(event.pointerId);
            }
        });
    }
    stage.addEventListener('keydown', event => {
        if (stage.dataset.mode === 'fit' || event.target !== stage) {
            return;
        }
        const directions = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
        if (directions[event.key]) {
            event.preventDefault();
            stage.scrollBy({ left: directions[event.key][0], top: directions[event.key][1], behavior: 'instant' });
        }
    });
    new ResizeObserver(() => {
        if (dialog.open && image && stage.dataset.state === 'ready' && stage.dataset.mode !== 'fit' && zoom < fitScale()) {
            setMode('fit');
        } else {
            layout();
        }
    }).observe(stage);
}

