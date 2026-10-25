import { createModal } from './modal.js';

export function initBriefForm() {
    const dialog = document.querySelector('.brief');
    const modal = createModal(dialog);
    if (!modal) {
        return;
    }
    const form = dialog.querySelector('form');
    const controls = [...form.querySelectorAll('input, select, textarea')];
    const touched = new Set();
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
            if (control.validity.typeMismatch || value.length > 254) {
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
                    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || candidate.length > 2000) {
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
            control.setAttribute('aria-invalid', 'true');
        } else {
            control.removeAttribute('aria-invalid');
        }
        return !text;
    }
    controls.forEach(control => {
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
    form.addEventListener('submit', event => {
        event.preventDefault();
        let firstInvalid;
        controls.forEach(control => {
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
    });
    function bindOpeners(root = document) {
        root.querySelectorAll('a[data-open-brief]').forEach(link => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = link.className;
            button.dataset.openBrief = '';
            button.append(...link.childNodes);
            button.addEventListener('click', () => {
                modal.open(button);
            });
            link.replaceWith(button);
        });
    }
    bindOpeners();
    return bindOpeners;
}

