import Sortable from '../../../vendor/editor/sortable.js';
import { icon } from '../icon.js';
import { createNotice } from '../notice.js';

export { icon };

const sortables = new Set();
let toastTimer;
let activeToast;
let retiringToast;
let toastVersion = 0;
let toastOwner;
let toastCleanup = () => {};

export function rememberFocus(control = document.activeElement) {
    const origin = document.activeElement;
    const start = control?.selectionStart;
    const end = control?.selectionEnd;
    const direction = control?.selectionDirection;

    return () => {
        if (!control?.isConnected || control.disabled || !control.getClientRects().length) {
            return;
        }

        if (![document.body, origin, control].includes(document.activeElement)) {
            return;
        }

        control.focus({ preventScroll: true });

        if (Number.isInteger(start) && Number.isInteger(end) && typeof control.selectionStart === 'number') {
            control.setSelectionRange(start, end, direction || 'none');
        }
    };
}

export function positionRecordMenu(menu) {
    if (!menu.open || !menu.isConnected) {
        return;
    }

    const panel = menu.querySelector('.record-menu__items');
    const anchor = menu.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    const viewport = document.documentElement.clientWidth;
    const spacing = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.25;
    const margin = Math.min(spacing, Math.max(0, (viewport - width) / 2));
    const left = Math.min(Math.max(margin, anchor.right - width), viewport - width - margin);
    menu.style.setProperty('--record-menu-inset', (anchor.right - left - width) + 'px');
}

export function publicationLabel(published) {
    return published ? 'Опубліковано' : 'Не опубліковано';
}

export function motion(node, frames, duration = 280) {
    if (typeof node.animate !== 'function') {
        return Promise.resolve();
    }

    return node.animate(frames, { duration, easing: 'cubic-bezier(.22, 1, .36, 1)' }).finished.catch(error => {
        if (error.name !== 'AbortError') {
            throw error;
        }
    });
}

export function deferLoading(show, signal) {
    let node;
    const finish = () => {
        clearTimeout(timer);
        node?.remove();
        signal.removeEventListener('abort', finish);
    };
    const timer = setTimeout(() => {
        if (!signal.aborted) {
            node = show();
        }
    }, 150);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) {
        finish();
    }
    return finish;
}

export function toast(message, { kind = 'success', action, label = 'Повторити', owner, inlineAction = false } = {}) {
    toastCleanup();
    toastCleanup = () => {};
    clearTimeout(toastTimer);
    const version = ++toastVersion;
    toastOwner = owner;

    if (retiringToast) {
        retiringToast.getAnimations?.().forEach(animation => animation.cancel());
        retiringToast.remove();
        retiringToast = null;
    }

    const reuse = activeToast?.isConnected;
    if (!reuse) {
        activeToast = document.createElement('div');
        activeToast.className = 'editor-toast';
        document.body.append(activeToast);
        motion(activeToast, [{ opacity: 0, transform: 'translateY(.75rem)' }, { opacity: 1, transform: 'none' }]);
        activeToast.addEventListener('pointerenter', () => clearTimeout(toastTimer));
        activeToast.addEventListener('focusin', () => clearTimeout(toastTimer));
    }

    const node = activeToast;
    if (reuse) {
        node.getAnimations?.().forEach(animation => animation.cancel());
    }
    node.dataset.kind = kind;
    node.toggleAttribute('data-inline-action', inlineAction);
    delete node.dataset.briefArrival;
    node.replaceChildren();
    const mark = kind === 'busy' ? document.createElement('span') : icon(kind === 'error' ? 'warning' : 'check');
    mark.classList.add(kind === 'busy' ? 'loading-ring' : 'toast-icon');
    const text = document.createElement('span');
    text.className = 'toast-copy';
    text.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    text.textContent = message;
    node.append(mark, text);

    if (action) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'toast-retry';
        retry.textContent = label;
        retry.addEventListener('click', action);
        node.append(retry);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.title = 'Закрити повідомлення';
    close.append(icon('close'));

    async function dismiss() {
        if (node.isConnected) {
            await motion(node, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(.5rem)' }], 180);

            if (version === toastVersion) {
                toastCleanup();
                toastCleanup = () => {};
                node.remove();
            }
        }
    }

    close.addEventListener('click', dismiss);
    node.append(close);

    if (kind === 'success') {
        const schedule = () => {
            if (version !== toastVersion || !node.isConnected) {
                return;
            }

            clearTimeout(toastTimer);
            if (document.querySelector('dialog[open]')) {
                return;
            }

            toastTimer = setTimeout(() => {
                if (document.querySelector('dialog[open]') || node.matches(':hover') || node.contains(document.activeElement)) {
                    schedule();
                } else {
                    dismiss();
                }
            }, 5500);
        };

        document.addEventListener('close', schedule, true);
        node.addEventListener('pointerleave', schedule);
        node.addEventListener('focusout', schedule);
        toastCleanup = () => {
            document.removeEventListener('close', schedule, true);
            node.removeEventListener('pointerleave', schedule);
            node.removeEventListener('focusout', schedule);
        };
        schedule();
    }
}

export async function clearToast(owner) {
    if (owner !== undefined && owner !== toastOwner) {
        return;
    }

    toastCleanup();
    toastCleanup = () => {};
    clearTimeout(toastTimer);
    toastVersion += 1;
    const node = activeToast;
    activeToast = null;
    toastOwner = undefined;

    if (node?.isConnected) {
        retiringToast = node;
        await motion(node,[{opacity:1},{opacity:0}],180);
        node.remove();
        if (retiringToast === node) {
            retiringToast = null;
        }
    }
}

export function disposeSortables() {
    for (const sortable of sortables) {
        sortable.destroy();
    }

    sortables.clear();
}

export function makeSortable(container, selector, onChange) {
    const children = () => [...container.children].filter(node => node.matches(selector));

    let live = container.querySelector('.sort-announcement');

    if (!live) {
        live = document.createElement('span');
        live.className = 'sort-announcement';
        live.setAttribute('role', 'status');
        container.append(live);
    }

    let keyboardOrder;

    const announce = item => {
        live.textContent = 'Позиція ' + (children().indexOf(item) + 1) + ' з ' + children().length;
    };

    for (const item of children()) {
        if (item.querySelector('.drag-handle')) {
            continue;
        }

        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'drag-handle';
        handle.title = 'Перемістити: ' + (item.querySelector('h2, strong, label')?.textContent || 'елемент');
        handle.append(icon('grip'));
        (item.querySelector('.collection-caption') || item).prepend(handle);

        handle.addEventListener('keydown', event => {
            const sortable = Sortable.get(container);

            if (sortable.option('disabled')) {
                return;
            }

            if (event.key === ' ' && !keyboardOrder) {
                event.preventDefault();
                keyboardOrder = children();
                item.classList.add('sortable-chosen');
                announce(item);
            } else if (keyboardOrder && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.preventDefault();
                const items = children();
                const backwards = ['ArrowUp', 'ArrowLeft'].includes(event.key);
                const target = items[items.indexOf(item) + (backwards ? -1 : 1)];

                if (target) {
                    sortable.captureAnimationState();

                    if (backwards) {
                        target.before(item);
                    } else {
                        target.after(item);
                    }

                    sortable.animateAll();
                    handle.focus({ preventScroll: true });
                    item.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
                    announce(item);
                }
            } else if (keyboardOrder && ['Enter', ' ', 'Escape'].includes(event.key)) {
                event.preventDefault();
                const before = keyboardOrder;
                keyboardOrder = null;

                if (event.key === 'Escape') {
                    sortable.captureAnimationState();
                    before.forEach(node => container.append(node));
                    sortable.animateAll();
                } else if (before.some((node, index) => children()[index] !== node)) {
                    onChange(before);
                }

                item.classList.remove('sortable-chosen');
                handle.focus({ preventScroll: true });
                announce(item);
            }
        });
    }

    if (Sortable.get(container)) {
        return Sortable.get(container);
    }

    let before;
    const sortable = new Sortable(container, {
        draggable: selector,
        handle: '.drag-handle',
        animation: 280,
        easing: 'cubic-bezier(.22, 1, .36, 1)',
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        fallbackClass: 'sortable-fallback',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 4,
        delay: 80,
        delayOnTouchOnly: true,
        touchStartThreshold: 4,
        scrollSensitivity: 70,
        scrollSpeed: 12,

        onStart: () => {
            before = children();
        },

        onEnd: event => {

            if (event.oldDraggableIndex !== event.newDraggableIndex) {
                onChange(before);
                announce(event.item);
            }
        },
    });
    sortables.add(sortable);

    return sortable;
}

export function el(tag, className, text) {
    const node = document.createElement(tag);

    if (className) {
        node.className = className;
    }

    if (text !== undefined) {
        node.textContent = text;
    }

    return node;
}

export function actions(...nodes) {
    const node = el('div', 'editor-actions');
    node.append(...nodes);

    return node;
}

export function heading(title, action) {
    const node = el('div', 'editor-heading');
    node.append(el('h1', '', title));

    if (action) {
        node.append(action);
    }

    return node;
}

export function notice(title, text, kind = '', action) {
    if (kind === 'success') {
        toast(title);

        return document.createDocumentFragment();
    }

    const node = createNotice(title, text, kind);

    if (action) {
        node.append(action);
    }

    return node;
}

export function field(key, label, value = '', options = {}) {
    const node = el('div', 'field');
    const caption = el('label', '', label);
    caption.htmlFor = key;
    const control = el(options.multiline ? 'textarea' : 'input');
    control.id = key;

    if (!options.multiline) {
        control.type = options.type || 'text';
    }

    control.value = value ?? '';

    if (options.rows) {
        control.rows = options.rows;
    }

    if (options.readonly) {
        control.readOnly = true;
    }

    if (options.max) {
        control.maxLength = options.max;
    }

    if (options.error) {
        control.setAttribute('data-invalid', 'true');
    }

    node.append(caption, control);

    if (options.error) {
        const error = el('p', 'field__error', options.error);
        error.id = key + '-error';
        node.append(error);
    } else if (options.hint) {
        node.append(el('small', '', options.hint));
    }

    return node;
}

export function section(title) {
    const node = el('section', 'form-section');
    node.append(el('h2', '', title));

    return node;
}

export function button(text, action, className = 'small-action', disabled = false) {
    const node = el('button', className, text);
    node.type = 'button';
    node.disabled = disabled;

    if (action) {
        node.addEventListener('click', action);
    }

    return node;
}



export function fieldError(control,message) {
    const wrapper = control.closest('.field');

    if (!wrapper) {
        return;
    }

    let error = wrapper.querySelector('.field__error');
    const id = control.id + '-error';

    if (message) {
        if (!error) {
            error = el('p','field__error');
            error.id = id;
            wrapper.append(error);
        }

        error.textContent = message;
        control.setAttribute('data-invalid','true');
    } else {
        error?.remove();
        control.removeAttribute('data-invalid');
    }

}
