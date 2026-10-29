import { createModal } from '../modal.js';
import { motion, button } from './controls.js';

export function createEditorDialog(dialog) {
    let busy = false;
    const modal = createModal(dialog, {
        initialFocus: () => dialog.querySelector('h2'),

        canClose: () => !busy,

        closeAnimation: async () => {
            dialog.dataset.closing = 'true';
            await motion(dialog,[{opacity:1},{opacity:0}],180);
            delete dialog.dataset.closing;
        },
    });
    const title = dialog.querySelector('h2');
    const description = dialog.querySelector('[aria-describedby]') || dialog.querySelector('#dialog-description');
    const content = dialog.querySelector('[data-dialog-content]');
    const commands = dialog.querySelector('[data-dialog-actions]');
    let closed;

    dialog.addEventListener('close',() => {
        busy = false;
        closed?.();
        closed = null;
    });

    function open(heading, text = '', {picker = false, onClose} = {}) {
        if (dialog.open) {
            return false;
        }

        title.textContent = heading;
        description.textContent = text;
        content.replaceChildren();
        commands.replaceChildren();
        dialog.classList.toggle('state-dialog--picker',picker);
        closed = onClose;
        busy = false;
        const result = modal.open(document.activeElement.closest('.record-menu')?.querySelector('summary') || document.activeElement);

        if (result) {
            motion(dialog,[{opacity:0,transform:'translateY(.5rem)'},{opacity:1,transform:'none'}]);
        }

        return result;
    }

    function setBusy(value) {
        busy = value;
        dialog.setAttribute('aria-busy',String(value));

        for (const control of dialog.querySelectorAll('button')) {
            control.disabled = value;
        }
    }

    function confirm({heading,text,label = 'Продовжити',danger = false,execute}) {
        return new Promise(resolve => {
            if (!open(heading,text,{onClose:() => resolve(false)})) {
                resolve(false);

                return;
            }

            const cancel = button('Скасувати',() => modal.close());
            const submit = button(label,async () => {
                setBusy(true);
                submit.textContent = 'Зберігаємо…';

                try {
                    const saved = await execute();
                    setBusy(false);

                    if (saved) {
                        closed = null;
                        await modal.close();
                        resolve(true);
                    } else {
                        await modal.close();
                        resolve(false);
                    }
                } catch (error) {
                    setBusy(false);
                    description.textContent = error.message;
                    submit.textContent = label;
                }
            },danger ? 'record-action record-action--delete' : 'primary-action');
            commands.append(cancel,submit);
        });
    }

    return {open,close:() => modal.close(),setBusy,confirm,content,commands,title,description};
}

