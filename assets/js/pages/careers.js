import { initCommon } from '../common.js';
import { vacancyResource } from '../data/vacancies.js';
import { dataPanel, statusRegion, retryResource } from '../components/data-state.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';

function renderCareers() {
    let records = [];
    const main = document.querySelector('[data-careers-view]');
    if (!main) {
        return;
    }
    const overview = main.querySelector('.overview-view');
    const detail = main.querySelector('.detail-view');
    const missing = main.querySelector('.vacancy-missing');
    const list = main.querySelector('.browse-list');
    const empty = main.querySelector('.empty-list');
    const roleHost = main.querySelector('[data-vacancy-details]');
    const cardTemplate = document.getElementById('vacancy-card');
    const roleTemplate = document.getElementById('vacancy-layout');
    const description = document.querySelector('meta[name="description"]');
    const initialDescription = description.content;
    const roles = new Map();
    const announce = statusRegion(main);
    let overviewScroll = history.state?.careers?.overviewScroll ?? 0;
    let scrollFrame = 0;

    function optionalTerms(record) {
        const values = [];
        if (record.salary?.trim()) {
            values.push('Зарплата: ' + record.salary.trim());
        }
        if (record.experience?.trim()) {
            values.push('Досвід: ' + record.experience.trim());
        }
        return values;
    }

    function fillTerms(element, terms) {
        element.replaceChildren();
        terms.filter(Boolean).forEach((term, index) => {
            if (index > 0) {
                const separator = document.createElement('span');
                separator.setAttribute('aria-hidden', 'true');
                separator.textContent = '·';
                element.append(' ', separator, ' ');
            }
            element.append(document.createTextNode(term));
        });
        element.hidden = !element.childNodes.length;
    }

    function fillRecords(next) {
        records = next;
        roles.clear();
        list.replaceChildren();
        roleHost.replaceChildren();
        records.forEach(record => {
            const card = cardTemplate.content.firstElementChild.cloneNode(true);
            card.href = '#' + encodeURIComponent(record.id);
            card.querySelector('h2').textContent = record.name;
            fillTerms(card.querySelector('.browse-link__facts'), optionalTerms(record));
            list.append(card);

            const role = roleTemplate.content.firstElementChild.cloneNode(true);
            role.id = record.id;
            role.querySelector('h1').textContent = record.name;
            role.querySelector('.screen-role__intro').textContent = record.intro;
            fillTerms(role.querySelector('.condition-line'), [record.format, record.employment, ...optionalTerms(record)]);
            for (const field of ['responsibilities', 'expectations', 'collaboration']) {
                const section = role.querySelector('[data-vacancy-field="' + field + '"]');
                const items = (record[field] || []).filter(value => {
                    return typeof value === 'string' && value.trim();
                });
                section.hidden = items.length === 0;
                items.forEach(value => {
                    const item = document.createElement('li');
                    item.textContent = value;
                    section.querySelector('ul').append(item);
                });
            }
            const response = role.querySelector('.response-link');
            response.href = 'mailto:hello@mobilevision.studio?subject=' + encodeURIComponent('Вакансія: ' + record.name);
            response.setAttribute('aria-label', 'Зв’язатись щодо вакансії: ' + record.name);
            roleHost.append(role);
            roles.set(record.id, role);
        });
        list.hidden = false;
        empty.hidden = true;
    }

    function focusHeading(heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        heading.addEventListener('blur', () => {
            heading.removeAttribute('tabindex');
        }, { once: true });
    }

    function render(fromKeyboard = false, navigate = true) {
        let fragment = location.hash.slice(1);
        try {
            fragment = decodeURIComponent(fragment);
        } catch {
            // Некоректний fragment показує стан недоступної вакансії
        }
        const ready = vacancyResource.value.status === 'success';
        const role = ready ? roles.get(fragment) : null;
        const isOverview = ['', 'vacancies', 'contact'].includes(fragment);
        overview.hidden = !isOverview;
        detail.hidden = isOverview || (ready && !role);
        missing.hidden = !ready || isOverview || Boolean(role);
        main.classList.toggle('data-missing-view', !missing.hidden);
        missing.querySelector('.return-link')?.classList.remove('return-link');
        if (!ready) {
            list.replaceChildren();
            roleHost.replaceChildren();
            const target = isOverview ? list : roleHost;
            const kind = isOverview ? 'vacancies' : 'vacancy';
            const panel = dataPanel(kind, vacancyResource.value.status, event => retryResource(vacancyResource, event, main, () => [...main.querySelectorAll('.data-state__title, h1')].find(heading => !heading.closest('[hidden]'))));
            target.append(panel);
            if (isOverview) {
                list.classList.add('data-region--state');
            }
        } else if (isOverview && !records.length) {
            list.classList.add('data-region--state');
            list.replaceChildren(dataPanel('vacancies', 'empty'));
        } else {
            list.classList.remove('data-region--state');
        }
        roles.forEach(element => {
            element.hidden = element !== role;
        });
        const heading = role ? role.querySelector('h1') : isOverview ? document.getElementById('page-heading') : !ready ? roleHost.querySelector('h1') : missing.querySelector('h1');
        document.title = isOverview ? 'Кар’єра — MobileVision' : heading.textContent + ' — MobileVision';
        description.content = role ? records.find(record => record.id === fragment).intro : initialDescription;

        if (!navigate) {
            return;
        }
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(() => {
            const saved = history.state?.careers?.overviewScroll;
            if (fragment === 'contact') {
                document.getElementById('contact').scrollIntoView({ block: 'start', behavior: 'instant' });
            } else if (fragment === 'vacancies' && saved === undefined) {
                document.getElementById('vacancies').scrollIntoView({ block: 'start', behavior: 'instant' });
            } else {
                window.scrollTo({ top: role || !isOverview ? 0 : saved ?? overviewScroll, behavior: 'instant' });
            }
            if (fromKeyboard) {
                focusHeading(heading);
            }
        });
    }

    // Перехід до ролі перехоплюється до спільного обробника внутрішніх якорів
    main.addEventListener('click', event => {
        const link = event.target.closest('a[data-vacancy-link], a[data-return-vacancies]');
        if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (link.hasAttribute('data-vacancy-link')) {
            overviewScroll = window.scrollY;
            history.replaceState({ ...history.state, careers: { overviewScroll } }, '', location.href);
        } else {
            overviewScroll = history.state?.careers?.overviewScroll ?? overviewScroll;
        }
        history.pushState({ careers: { overviewScroll } }, '', link.getAttribute('href'));
        render(event.detail === 0);
    }, { capture: true });

    window.addEventListener('popstate', () => {
        render();
    });
    window.addEventListener('hashchange', () => {
        render();
    });
    vacancyResource.subscribe(value => {
        if (value.status === 'idle') {
            return;
        }
        const scroll = window.scrollY;
        if (value.status === 'success') {
            fillRecords(value.data);
        }
        const busy = ['loading', 'retry'].includes(value.status);
        list.setAttribute('aria-busy', String(busy));
        roleHost.setAttribute('aria-busy', String(busy));
        render(false, false);
        announce(value.status === 'success' ? 'Вакансії завантажено' : main.querySelector('.data-state__title').textContent);
        window.scrollTo({ top: scroll, behavior: 'instant' });
    });
    vacancyResource.load();
    render();
}

renderCareers();
initCommon();
if (document.body.hasAttribute('data-careers-effects')) {
    const main = document.querySelector('[data-careers-view]');
    const seen = new WeakSet();
    let suspended = false;
    let viewFrame = 0;
    addEventListener('pagehide', () => {
        suspended = true;
        cancelAnimationFrame(viewFrame);
    });
    addEventListener('pageshow', () => {
        suspended = false;
    });
    function scheduleView(restart) {
        cancelAnimationFrame(viewFrame);
        if (!suspended) {
            viewFrame = requestAnimationFrame(() => {
                viewFrame = requestAnimationFrame(restart);
            });
        }
    }
    const motion = mountMotion('careersEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal, seen });
        onCleanup(reveals.stop);
        reveals.add(main.querySelectorAll('.browse-link, .meeting-section > h2, .stage-list > li, .role-content__section, .response-link'));
    }, { restore: scheduleView });
    // Подання відновлює прокрутку до підготовки позаекранних блоків
    const changes = new MutationObserver(() => {
        scheduleView(motion.restart);
    });
    changes.observe(main, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}
