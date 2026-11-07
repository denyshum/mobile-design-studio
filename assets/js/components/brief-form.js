import { createModal } from './modal.js';
import { createBriefSubmission } from '../data/brief.js';
import { createNotice } from './notice.js';

export function initBriefForm() {
    const dialog = document.querySelector('.brief');
    const modal = createModal(dialog);

    if (!modal) {
        return;
    }

    const form = dialog.querySelector('form');
    const controls = [...form.querySelectorAll('input, select, textarea')];
    const touched = new Set();
    const submission = createBriefSubmission();
    const heading = dialog.querySelector('h2');
    const lead = dialog.querySelector('.brief__lead');
    const original = { title: heading.textContent, lead: lead.textContent };
    const submit = form.querySelector('[type="submit"]');
    const arrow = submit.querySelector('svg').cloneNode(true);
    const bottom = form.querySelector('.brief__bottom');
    const result = document.createElement('div');
    result.className = 'brief__bottom brief-result-actions';
    result.hidden = true;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'brief__action';
    close.textContent = 'Закрити';
    close.addEventListener('click', () => modal.close());
    result.append(close);
    dialog.querySelector('.brief__scroll').append(result);
    let phase = 'ready';
    let feedback;
    let retryAt = 0;
    let retryTimer;
    let revealFrame;

    function reveal() {
        cancelAnimationFrame(revealFrame);
        revealFrame = requestAnimationFrame(() => {
            if (!dialog.open || !feedback) {
                return;
            }
            const scroll = dialog.querySelector('.brief__scroll');
            const viewport = scroll.getBoundingClientRect();
            const first = feedback.getBoundingClientRect();
            const last = bottom.getBoundingClientRect();
            const padding = parseFloat(getComputedStyle(scroll).paddingBottom);
            const fits = last.bottom - first.top + padding <= scroll.clientHeight;
            scroll.scrollTo({
                top: scroll.scrollTop + (fits ? last.bottom - viewport.bottom + padding : first.top - viewport.top),
                behavior: 'instant',
            });
        });
    }

    function render(next, text = '') {
        phase = next;
        feedback?.remove();
        feedback = null;
        dialog.dataset.view = next;
        heading.textContent = next === 'success' ? 'Звернення отримано' : original.title;
        lead.textContent = next === 'success' ? 'Дякуємо! Ми зв’яжемося з вами за вказаним email.' : original.lead;
        heading.removeAttribute('tabindex');
        form.hidden = next === 'success';
        result.hidden = next !== 'success';
        const pending = ['sending', 'checking', 'unknown'].includes(next);
        for (const control of controls) {
            control.disabled = pending;
        }
        submit.disabled = ['sending', 'checking'].includes(next) || Date.now() < retryAt;
        const label =
            {
                sending: 'Надсилаємо…',
                checking: 'Перевіряємо…',
                unknown: 'Перевірити результат',
                error: 'Спробувати ще раз',
                rate: 'Спробувати ще раз',
                not_saved: 'Спробувати ще раз',
            }[next] || 'Надіслати запит';
        submit.replaceChildren(document.createTextNode(label));
        if (!['sending', 'checking'].includes(next)) {
            submit.append(arrow.cloneNode(true));
        }
        if (text) {
            feedback = createNotice(text, '', next === 'checking' ? 'pending' : 'error');
            feedback.classList.add('brief-message');
            form.insertBefore(feedback, bottom);
        }
        if (next === 'success') {
            form.reset();
            touched.clear();
            for (const control of controls) {
                control.setCustomValidity('');
                control.removeAttribute('data-invalid');
                const error = document.getElementById(control.id + '-error');
                error.hidden = true;
                error.textContent = '';
            }
            heading.tabIndex = -1;
            if (dialog.open) {
                heading.focus({ preventScroll: true });
            }
        } else if (['sending', 'checking'].includes(next) && dialog.open) {
            dialog.querySelector('[data-close-dialog]').focus({ preventScroll: true });
        }
        reveal();
    }

    function delayRetry(seconds) {
        retryAt = Date.now() + (Number(seconds) || 0) * 1000;
        clearTimeout(retryTimer);
        if (retryAt > Date.now()) {
            retryTimer = setTimeout(() => {
                submit.disabled = false;
            }, retryAt - Date.now());
        }
    }

    async function send(data) {
        const checking = submission.pending;
        render(checking ? 'checking' : 'sending', checking ? 'Поки немає підтвердження отримання.' : '');
        try {
            const outcome = await submission.submit(data);
            if (outcome.outcome === 'accepted') {
                render('success');
            } else if (outcome.outcome === 'not_saved') {
                render('not_saved', 'Звернення не надіслано. Ви можете повторити спробу.');
            } else {
                delayRetry(outcome.retryAfter);
                render('unknown', 'Не вдалося підтвердити надсилання. Перевірте результат перед новою спробою.');
            }
        } catch (error) {
            if (error.fields) {
                render('ready');
                let first;
                for (const control of controls) {
                    if (Object.hasOwn(error.fields, control.name)) {
                        const message = String(error.fields[control.name]);
                        control.setCustomValidity(message);
                        control.setAttribute('data-invalid', 'true');
                        const note = document.getElementById(control.id + '-error');
                        note.textContent = message;
                        note.hidden = false;
                        touched.add(control);
                        first ||= control;
                    }
                }
                if (dialog.open) {
                    first?.focus();
                }
            } else {
                delayRetry(error.retryAfter);
                render(
                    error.status === 429 ? 'rate' : 'error',
                    error.status === 429
                        ? 'Забагато спроб. Спробуйте пізніше.'
                        : 'Не вдалося надіслати запит. Спробуйте ще раз.'
                );
            }
        }
    }

    dialog.addEventListener('close', () => {
        if (phase === 'success') {
            render('ready');
        }
    });

    function message(control) {
        const value = control.value.trim();

        switch (control.name) {
            case 'name':
                if (!value) {
                    return 'Вкажіть, як до вас звертатися.';
                }
                if (value.length > 80) {
                    return 'Скоротіть ім’я до 80 символів.';
                }
                break;
            case 'email':
                if (!value) {
                    return 'Вкажіть email для відповіді.';
                }
                control.value = value;
                if (control.validity.typeMismatch || control.validity.patternMismatch || value.length > 254) {
                    return 'Введіть email у форматі name@example.com.';
                }
                break;
            case 'phone':
                if (value && !/^\+?\d{7,15}$/.test(value.replace(/[\s()–-]/g, ''))) {
                    return 'Введіть від 7 до 15 цифр; плюс — лише на початку, або залиште поле порожнім.';
                }
                break;
            case 'description':
                if (!value) {
                    return 'Коротко опишіть вашу ідею або задачу.';
                }
                if (value.length < 10) {
                    return 'Додайте трохи деталей — щонайменше 10 символів.';
                }
                if (value.length > 2000) {
                    return 'Скоротіть опис до 2000 символів.';
                }
                break;
            case 'url':
                if (value) {
                    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value;

                    try {
                        const parsed = new URL(candidate);

                        if (
                            !['http:', 'https:'].includes(parsed.protocol) ||
                            !parsed.hostname ||
                            candidate.length > 2000
                        ) {
                            return 'Вкажіть http/https-посилання або залиште поле порожнім.';
                        }
                    } catch {
                        return 'Вкажіть коректне посилання або залиште поле порожнім.';
                    }
                }
                break;
        }

        return '';
    }

    function validate(control) {
        control.setCustomValidity('');
        const text = message(control);
        control.setCustomValidity(text);
        const error = document.getElementById(control.id + '-error');
        error.textContent = text;
        error.hidden = !text;

        if (text) {
            control.setAttribute('data-invalid', 'true');
        } else {
            control.removeAttribute('data-invalid');
        }

        return !text;
    }

    controls.forEach((control) => {
        control.addEventListener('blur', () => {
            touched.add(control);
            validate(control);
        });

        control.addEventListener('input', () => {
            if (touched.has(control)) {
                validate(control);
            }
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (['sending', 'checking'].includes(phase) || Date.now() < retryAt) {
            return;
        }
        if (phase === 'unknown') {
            await send();
            return;
        }
        let firstInvalid;

        controls.forEach((control) => {
            touched.add(control);

            if (!validate(control) && !firstInvalid) {
                firstInvalid = control;
            }
        });

        if (firstInvalid) {
            firstInvalid.focus();

            return;
        }

        const url = form.elements.url;
        const value = url.value.trim();

        if (value) {
            url.value = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value;
        }
        await send(Object.fromEntries(controls.map((control) => [control.name, control.value])));
    });

    function bindOpeners(root = document) {
        root.querySelectorAll('a[data-open-brief]').forEach((link) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = link.className;
            button.dataset.openBrief = '';
            button.append(...link.childNodes);

            button.addEventListener('click', () => {
                modal.open(button);
                reveal();
            });

            link.replaceWith(button);
        });
    }

    bindOpeners();

    return bindOpeners;
}
