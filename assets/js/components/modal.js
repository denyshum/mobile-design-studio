let activeDialog;
let pendingScrollRestore;
let restoreFrame;

function finishScrollRestore() {
    cancelAnimationFrame(restoreFrame);
    if (!pendingScrollRestore) {
        return;
    }
    const { overflowAnchor, position } = pendingScrollRestore;
    pendingScrollRestore = null;
    document.documentElement.style.overflowAnchor = overflowAnchor;
    window.scrollTo(position);
}

export function createModal(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') {
        return null;
    }
    let opener;
    let saved;
    let backdropStart = false;
    const close = () => dialog.close();
    dialog.querySelector('[data-close-dialog]').addEventListener('click', close);
    function outside(event) {
        const box = dialog.getBoundingClientRect();
        return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    }
    dialog.addEventListener('pointerdown', event => {
        backdropStart = outside(event);
    });
    dialog.addEventListener('click', event => {
        if (backdropStart && outside(event)) {
            close();
        }
        backdropStart = false;
    });
    dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') {
            return;
        }
        const controls = [...dialog.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(control => {
            return !control.disabled && control.getClientRects().length > 0;
        });
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    dialog.addEventListener('close', () => {
        if (activeDialog !== dialog || !saved) {
            return;
        }
        activeDialog = null;
        document.documentElement.style.overflow = saved.overflow;
        document.documentElement.style.scrollbarGutter = saved.scrollbarGutter;
        window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
        opener?.focus({ preventScroll: true });
        pendingScrollRestore = {
            overflowAnchor: saved.overflowAnchor,
            position: { left: saved.x, top: saved.y, behavior: 'instant' }
        };
        // Відновлюємо прив’язку прокрутки після стабілізації геометрії scrollbar
        restoreFrame = requestAnimationFrame(() => {
            restoreFrame = requestAnimationFrame(finishScrollRestore);
        });
        saved = null;
    });
    return {
        open(trigger) {
            if (activeDialog || document.querySelector('.menu-overlay--open')) {
                return false;
            }
            finishScrollRestore();
            opener = trigger;
            saved = {
                x: window.scrollX,
                y: window.scrollY,
                overflow: document.documentElement.style.overflow,
                scrollbarGutter: document.documentElement.style.scrollbarGutter,
                overflowAnchor: document.documentElement.style.overflowAnchor
            };
            if (window.innerWidth > document.documentElement.clientWidth && getComputedStyle(document.documentElement).scrollbarGutter === 'auto') {
                document.documentElement.style.scrollbarGutter = 'stable';
            }
            document.documentElement.style.overflowAnchor = 'none';
            document.documentElement.style.overflow = 'hidden';
            activeDialog = dialog;
            dialog.showModal();
            dialog.querySelector('[data-close-dialog]').focus({ preventScroll: true });
            return true;
        },
        close
    };
}

