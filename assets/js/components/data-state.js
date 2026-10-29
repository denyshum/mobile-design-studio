import { sitePath } from './paths.js';

const labels = {
    catalog: ['проєкти', 'Проєкти ще не додано', 'Нові роботи з’являться тут. Завітайте пізніше'],
    featured: ['добірку', 'У цій добірці поки немає проєктів', 'Перегляньте всі роботи в портфоліо'],
    slider: ['інші проєкти', 'Інших проєктів у добірці поки немає', 'Перегляньте всі роботи в портфоліо'],
    project: ['проєкт', 'Проєкт не знайдено', 'Цей проєкт наразі недоступний. Перегляньте інші роботи студії'],
    vacancies: ['вакансії', 'Наразі відкритих вакансій немає', 'Перегляньте сторінку пізніше або напишіть нам'],
    vacancy: ['вакансію', 'Вакансію не знайдено', 'Ця роль наразі недоступна. Перегляньте актуальні вакансії або напишіть нам'],
};

export function icon(name, className = 'text-action__icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', name === 'image-unavailable' ? '0 0 40 40' : '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', sitePath('assets/images/icons-sprite.svg#icon-' + name));
    svg.append(use);

    return svg;
}

export function focusResult(element) {
    if (!element) {
        return;
    }

    const previous = element.getAttribute('tabindex');
    element.tabIndex = -1;
    element.focus({ preventScroll: true });

    element.addEventListener('blur', () => {
        if (previous === null) {
            element.removeAttribute('tabindex');
        } else {
            element.setAttribute('tabindex', previous);
        }
    }, { once: true });
}

export function dataPanel(kind, status, retry) {
    const [subject, emptyTitle, emptyText] = labels[kind];
    const panel = document.createElement('div');
    panel.className = 'data-state';
    const heading = document.createElement(['project', 'vacancy'].includes(kind) ? 'h1' : 'h2');
    heading.className = 'data-state__title';
    const paragraph = document.createElement('p');
    paragraph.className = 'data-state__text';
    const loading = ['loading', 'retry'].includes(status);
    heading.textContent = loading ? 'Завантажуємо ' + subject + (status === 'retry' ? ' ще раз…' : '…') : status === 'error' ? 'Не вдалося завантажити ' + subject : emptyTitle;
    paragraph.textContent = loading ? 'Це може зайняти кілька секунд' : status === 'error' ? 'Перевірте з’єднання та спробуйте ще раз' : emptyText;
    panel.append(heading, paragraph);

    if (status === 'error') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-action text-action--diagonal data-state__action';
        button.append('Спробувати ще раз', icon('arrow-diagonal'));
        button.addEventListener('click', retry);
        panel.append(button);
    } else if (status === 'empty' && kind !== 'catalog') {
        const link = document.createElement('a');
        link.className = 'text-action text-action--diagonal data-state__action';
        link.href = kind === 'vacancies' ? 'mailto:hello@mobilevision.studio' : sitePath('portfolio.html#projects-list');
        link.append(kind === 'vacancies' ? 'Написати нам' : 'До портфоліо', icon('arrow-diagonal'));
        panel.append(link);
    }

    if (loading) {
        const placeholders = document.createElement('div');
        placeholders.setAttribute('aria-hidden', 'true');
        placeholders.className = kind === 'catalog' ? 'entry-grid data-state__placeholders' : kind === 'project' ? 'media-summary data-state__placeholders' : 'data-placeholder-grid' + (['vacancies', 'vacancy'].includes(kind) ? ' data-placeholder-grid--rows' : '');

        for (let index = 0; index < (kind === 'featured' ? 4 : kind === 'project' ? 1 : 2); index++) {
            const shape = document.createElement('div');
            shape.className = kind === 'catalog' ? 'entry-card__media data-loading-surface' : kind === 'project' ? 'cover-media--framed data-loading-surface' : 'data-placeholder';
            placeholders.append(shape);
        }

        panel.append(placeholders);
    }

    return panel;
}

export function statusRegion(host) {
    const announcer = document.createElement('p');
    announcer.className = 'data-announcement';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-live', 'polite');
    host.after(announcer);

    return message => {
        announcer.textContent = message;
    };
}

export async function retryResource(resource, event, host, result) {
    if (['loading', 'retry'].includes(resource.value.status)) {
        return;
    }

    const keyboard = event.detail === 0;
    const url = location.href;
    const task = resource.load();

    if (keyboard) {
        focusResult(host.querySelector('.data-state__title, .data-cover-state p') || host);
    }

    let retained = keyboard;

    const moved = event => {
        if (!host.contains(event.target)) {
            retained = false;
        }
    };

    document.addEventListener('focusin', moved);
    await task;
    document.removeEventListener('focusin', moved);

    if (retained && location.href === url) {
        focusResult(result());
    }
}

export function bindResource(resource, { host, kind, render, result, onState = () => {}, renderState = panel => host.replaceChildren(panel) }) {
    const announce = statusRegion(host);
    const originalClass = host.className;

    const retry = event => retryResource(resource, event, host, () => host.querySelector('.data-state__title') || result());

    resource.subscribe(value => {
        if (value.status === 'idle') {
            return;
        }

        const scroll = window.scrollY;
        const busy = ['loading', 'retry'].includes(value.status);
        host.setAttribute('aria-busy', String(busy));
        host.className = originalClass;

        if (value.status === 'success') {
            render(value.data);
            announce('Завантажено ' + labels[kind][0]);
        } else {
            if (!['project', 'vacancy'].includes(kind)) {
                host.classList.add('data-region--state');
            }

            renderState(dataPanel(kind, value.status, retry));
            announce(host.querySelector('.data-state__title').textContent);
        }

        onState(value);
        window.scrollTo({ top: scroll, behavior: 'instant' });
    });

    resource.load();
}
