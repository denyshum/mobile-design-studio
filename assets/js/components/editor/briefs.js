import { paintBadge } from '../badge.js';
import { el, button, heading, icon, toast, clearToast, positionRecordMenu } from './controls.js';

const labels = { new: 'Нове', progress: 'У роботі', closed: 'Закрите' };
const filters = { all: 'Усі', active: 'Активні', new: 'Нові', progress: 'У роботі', closed: 'Закриті' };
const services = {
    'new-design': 'Дизайн нового застосунку',
    redesign: 'Редизайн наявного застосунку',
    research: 'Дослідження та прототип',
    'design-system': 'Дизайн-система та супровід',
    undecided: 'Ще не визначився',
};
const arrivalOwner = Symbol('brief-arrival');

function state(record) {
    return el(
        'span',
        'record-status brief-state--' + record.status + (record.status === 'closed' ? ' record-status--hidden' : ''),
        labels[record.status]
    );
}

function loading() {
    const container = el('section', 'queue-loading');
    container.setAttribute('role', 'status');
    container.append(el('span', 'sort-announcement', 'Завантажуємо звернення…'));
    for (let i = 0; i < 5; i += 1) {
        const row = el('div', 'queue-loading__row');
        const copy = el('div', 'queue-loading__copy');
        copy.append(
            el('div', 'data-placeholder queue-loading__name'),
            el('div', 'data-placeholder queue-loading__service')
        );
        row.append(
            copy,
            el('div', 'data-placeholder queue-loading__state'),
            el('div', 'data-placeholder queue-loading__action')
        );
        container.append(row);
    }
    return container;
}

export function createBriefsController({ client, main, dialog, navigate, mutations, onAccessLost }) {
    let route = { filter: 'active' };
    let counts;
    let signature;
    let current;
    let rows = [];
    let queuePosition;
    let timer;
    let running = false;
    let polling = false;
    let epoch = 0;
    let recovery;
    let primary;
    let menu;
    let backoff = 60000;
    let countVersion = 0;
    let viewSignal;

    function updateCounts(value) {
        counts = value;
        for (const badge of document.querySelectorAll('[data-brief-count]')) {
            paintBadge(badge, value ? value.new : null);
        }
        for (const counter of main.querySelectorAll('[data-brief-count-filter]')) {
            counter.textContent = value ? String(value[counter.dataset.briefCountFilter]) : '—';
        }
    }

    function go(id, filter = route.filter, options = {}) {
        return navigate('briefs', id, { filter, ...options });
    }

    function navigation(disabled = false) {
        const nav = el('nav', 'queue-navigation');
        for (const [key, label] of Object.entries(filters)) {
            const control = button(
                '',
                () => {
                    queuePosition = null;
                    clearToast(arrivalOwner);
                    go(null, key);
                },
                'queue-link'
            );
            control.dataset.briefFilter = key;
            control.setAttribute('data-selected', String(route.filter === key));
            control.disabled = disabled;
            const count = el(
                'span',
                'queue-link__count' + (key === 'new' ? ' queue-link__count--new' : ''),
                counts ? String(counts[key]) : '—'
            );
            count.dataset.briefCountFilter = key;
            control.append(el('span', 'queue-link__label', label), count);
            nav.append(control);
        }
        return nav;
    }

    function empty() {
        const section = el('section', 'queue-empty');
        const title = {
            active: 'Активних звернень немає',
            new: 'Нових звернень немає',
            progress: 'У роботі поки нічого немає',
            closed: 'Закритих звернень ще немає',
            all: 'Звернень немає',
        }[route.filter];
        section.append(
            el('h2', '', title),
            el(
                'p',
                '',
                !counts?.all
                    ? 'Коли хтось надішле бриф із сайту, він з’явиться тут.'
                    : route.filter === 'active'
                      ? 'Усі отримані звернення опрацьовано. Вони залишаються в закритих.'
                      : 'Можна перейти до активної черги та продовжити роботу.'
            )
        );
        if (route.filter === 'active' && counts?.closed) {
            section.append(button('Переглянути закриті', () => go(null, 'closed'), 'primary-action'));
        } else if (route.filter !== 'active' && counts?.active) {
            section.append(button('До активних звернень', () => go(null, 'active'), 'primary-action'));
        }
        return section;
    }

    async function queue(signal) {
        const requestVersion = ++countVersion;
        main.replaceChildren(heading('Звернення'), navigation(true), loading());
        try {
            const result = await client.briefs(route.filter, signal);
            if (signal.aborted) {
                return;
            }
            rows = result.records;
            if (requestVersion === countVersion) {
                updateCounts(result.counts);
            }
            signature = result.snapshot_digest;
            main.replaceChildren(heading('Звернення'), navigation());
            if (!rows.length) {
                main.append(empty());
            } else {
                const list = el('section', 'brief-list');
                for (const record of rows) {
                    const row = el('article', 'brief-row');
                    row.dataset.record = record.id;
                    const open = () => {
                        queuePosition = { filter: route.filter, top: scrollY, id: record.id };
                        history.replaceState({ ...history.state, briefPosition: queuePosition }, '', location.href);
                        go(record.id);
                    };
                    const copy = el('div', 'record-copy brief-row__copy');
                    const title = el('h2');
                    title.append(button(record.name, open, 'brief-name'));
                    copy.append(title, el('p', '', services[record.service] || 'Напрям не вказано'));
                    const more = button('Переглянути', open, 'record-action record-action--primary brief-row__open');
                    row.append(copy, state(record), more);
                    list.append(row);
                }
                main.append(list);
            }
            const saved = history.state?.briefPosition || queuePosition;
            if (saved?.filter === route.filter) {
                requestAnimationFrame(() => {
                    if (!signal.aborted) {
                        scrollTo({ top: saved.top, behavior: 'instant' });
                        main.querySelector('[data-record="' + CSS.escape(saved.id) + '"] button')?.focus({
                            preventScroll: true,
                        });
                    }
                });
            }
        } catch (error) {
            if (signal.aborted) {
                return;
            }
            if ([401, 403].includes(error.status)) {
                await onAccessLost(error);
                return;
            }
            const section = el('section', 'queue-empty');
            section.append(
                el('h2', '', 'Не вдалося завантажити звернення'),
                el('p', '', 'Перевірте з’єднання та спробуйте ще раз.'),
                button('Спробувати знову', () => go(null), 'primary-action')
            );
            main.replaceChildren(heading('Звернення'), navigation(), section);
        }
    }

    function position(menuNode) {
        positionRecordMenu(menuNode);
        if (!menuNode.open) {
            return;
        }
        const panel = menuNode.querySelector('.record-menu__items');
        const anchor = menuNode.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.5;
        const margin = Math.min(gap * 2, innerHeight / 10);
        const header = document.querySelector('.workspace-header').getBoundingClientRect().bottom;
        const below = Math.max(0, innerHeight - anchor.bottom - gap - margin);
        const above = Math.max(0, anchor.top - Math.max(header, margin) - gap - margin);
        const useAbove = panel.scrollHeight + 2 > below && above > below;
        panel.dataset.placement = useAbove ? 'above' : 'below';
        panel.style.setProperty('--brief-menu-room', Math.floor(useAbove ? above : below) + 'px');
    }

    async function failure(result) {
        if (result.error?.status === 409 && primary?.isConnected) {
            recovery = () => go(current.id, route.filter, { replace: true, resetScroll: false, focus: false });
            primary.disabled = false;
            primary.textContent = 'Показати актуальне';
            menu.inert = true;
            toast('Звернення вже змінилося в іншій вкладці.', { kind: 'error' });
            return true;
        }
        if (result.error?.status === 404) {
            await go(null, route.filter, { replace: true });
            toast('Звернення за цим посиланням недоступне', { kind: 'error' });
            return true;
        }
        return false;
    }

    async function change(status) {
        if (mutations.busy || mutations.pending || !current) {
            return;
        }
        const generation = epoch;
        const record = current;
        primary.disabled = true;
        primary.textContent = status === 'closed' ? 'Закриваємо…' : 'Беремо в роботу…';
        menu.inert = true;
        menu.open = false;
        const result = await mutations.run({
            action: 'brief.status',
            payload: { status },
            expected: { id: current.id, version: current.version },
            context: { id: current.id },
            quietBusy: true,
            message: 'Стан звернення змінено',
        });
        if (generation !== epoch) {
            return;
        }
        if (result.state === 'saved') {
            await go(record.id, route.filter, { replace: true, focus: false, resetScroll: false });
            await poll();
            if (status === 'closed') {
                toast('Звернення закрито', { label: 'До закритих', action: () => go(null, 'closed') });
            }
        } else if (result.state !== 'uncertain' && !(await failure(result)) && primary?.isConnected) {
            primary.disabled = false;
            primary.textContent =
                labels[current.status] === 'Нове'
                    ? 'Взяти в роботу'
                    : current.status === 'progress'
                      ? 'Закрити звернення'
                      : 'Повернути в роботу';
            menu.inert = false;
        }
    }

    async function remove() {
        const generation = epoch;
        menu.open = false;
        const record = current;
        const deleted = await dialog.confirm({
            heading: 'Видалити звернення?',
            text:
                'Відправник: ' +
                record.name +
                '. Бриф і контактні дані буде видалено. Відновити звернення після цього не вдасться.',
            label: 'Видалити',
            busyLabel: 'Видаляємо…',
            danger: true,
            execute: async () => {
                const result = await mutations.run({
                    action: 'brief.delete',
                    payload: {},
                    expected: { id: record.id, version: record.version },
                    context: { id: record.id },
                    quietBusy: true,
                    message: 'Звернення видалено',
                });
                if (generation !== epoch) {
                    return false;
                }
                if (result.state === 'rolled-back') {
                    await failure(result);
                }
                return result.state === 'saved';
            },
        });
        if (deleted && generation === epoch) {
            await go(null, route.filter);
            await poll();
        }
    }

    async function detail(id, signal) {
        if (!/^[a-f0-9-]{36}$/.test(id)) {
            throw Object.assign(new Error('Звернення недоступне'), { status: 404 });
        }
        main.replaceChildren(loading());
        const result = await client.read('brief', { id }, signal);
        if (signal.aborted) {
            return;
        }
        current = result.record;
        const record = current;
        const article = el('article', 'brief-detail');
        const trail = el('div', 'brief-detail__trail');
        trail.append(
            button(
                '← До звернень',
                () => go(null, route.filter, { resetScroll: false }),
                'small-action brief-detail__back'
            )
        );
        const surface = el('div', 'brief-detail__surface');
        const header = el('header', 'brief-detail__heading');
        const overview = el('div', 'brief-detail__overview');
        const identity = el('div', 'brief-detail__identity');
        const title = el('h1', 'brief-detail__title', record.name);
        title.tabIndex = -1;
        title.dataset.detailTitle = '';
        const topic = el('section', 'brief-detail__topic');
        topic.append(
            el('h2', 'brief-detail__label', 'Що потрібно'),
            el('p', 'brief-detail__topic-value', services[record.service] || 'Напрям не вказано')
        );
        const meta = el('div', 'brief-detail__meta');
        const date = el(
            'time',
            'brief-detail__date',
            'Отримано ' +
                new Intl.DateTimeFormat('uk-UA', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                }).format(new Date(record.created_at))
        );
        date.dateTime = record.created_at;
        meta.append(state(record), date);
        identity.append(title, topic, meta);
        const contacts = el('section', 'brief-detail__contact');
        contacts.append(el('h2', 'brief-detail__label', 'Контакти'));
        const links = el('div', 'brief-detail__links');
        const email = el('a', 'brief-detail__link', record.email);
        email.href = 'mailto:' + encodeURIComponent(record.email);
        links.append(email);
        if (record.phone) {
            const phone = el('a', 'brief-detail__link', record.phone);
            phone.href = 'tel:' + record.phone.replace(/[\s()–-]/g, '');
            links.append(phone);
        }
        contacts.append(links);
        overview.append(identity, contacts);
        const controls = el('div', 'editor-actions brief-detail__actions');
        primary = button(
            record.status === 'new'
                ? 'Взяти в роботу'
                : record.status === 'progress'
                  ? 'Закрити звернення'
                  : 'Повернути в роботу',
            async () => {
                if (recovery) {
                    primary.disabled = true;
                    primary.textContent = 'Перевіряємо…';
                    await recovery();
                    if (recovery && primary.isConnected) {
                        primary.disabled = false;
                        primary.textContent = 'Перевірити';
                    }
                } else {
                    await change(record.status === 'progress' ? 'closed' : 'progress');
                }
            },
            'primary-action'
        );
        primary.dataset.briefPrimary = '';
        menu = el('details', 'record-menu');
        const trigger = el('summary', 'small-action', 'Дії');
        const chevron = icon('chevron-down');
        chevron.classList.add('brief-detail__chevron');
        trigger.append(chevron);
        const items = el('div', 'record-menu__items');
        if (record.status === 'new') {
            items.append(button('Закрити звернення', () => change('closed'), 'record-action'));
        }
        items.append(button('Видалити звернення', remove, 'record-action record-action--delete'));
        menu.append(trigger, items);
        const observer = new ResizeObserver(() => position(menu));
        menu.addEventListener('toggle', () => {
            observer.disconnect();
            if (menu.open) {
                position(menu);
                observer.observe(menu);
                observer.observe(items);
            }
        });
        const closeMenu = (event) => {
            if (menu.open && !menu.contains(event.target)) {
                menu.open = false;
            }
        };
        for (const name of ['pointerdown', 'focusin']) {
            document.addEventListener(name, closeMenu, { signal });
        }
        menu.addEventListener('keydown', (event) => {
            const buttons = [...items.querySelectorAll('button')];
            if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                menu.open = true;
                position(menu);
                const step = event.key === 'ArrowDown' ? 1 : -1;
                const index = buttons.indexOf(document.activeElement);
                buttons[
                    index < 0 ? (step > 0 ? 0 : buttons.length - 1) : (index + step + buttons.length) % buttons.length
                ].focus();
            } else if (event.key === 'Escape') {
                menu.open = false;
                trigger.focus();
            }
        });
        window.addEventListener('resize', () => position(menu), { signal });
        window.addEventListener('scroll', () => position(menu), { signal, passive: true });
        signal.addEventListener('abort', () => observer.disconnect(), { once: true });
        controls.append(primary, menu);
        header.append(overview, controls);
        const content = el('div', 'brief-detail__content');
        const message = el('section', 'brief-detail__message');
        message.append(
            el('h2', 'brief-detail__label', 'Коротко про задачу'),
            el('p', 'brief-detail__prose', record.description)
        );
        content.append(message);
        if (record.url) {
            const material = el('section', 'brief-detail__material');
            const link = el('a', 'brief-detail__link', record.url + ' ↗');
            link.href = record.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            material.append(el('h2', 'brief-detail__label', 'Продукт або матеріали'), link);
            content.append(material);
        }
        surface.append(header, content);
        article.append(trail, surface);
        main.replaceChildren(article);
    }

    async function render({ id, filter = 'active', signal }) {
        route = { id, filter: Object.hasOwn(filters, filter) ? filter : 'active' };
        viewSignal = signal;
        recovery = null;
        current = null;
        document.body.classList.toggle('editor-page--brief-detail', Boolean(id));
        try {
            if (id) {
                await detail(id, signal);
            } else {
                await queue(signal);
            }
        } catch (error) {
            if (error.status === 404 && !signal.aborted) {
                await go(null, route.filter, { replace: true });
                toast('Звернення за цим посиланням недоступне', { kind: 'error' });
            } else if (!signal.aborted) {
                throw error;
            }
        }
    }

    async function poll() {
        if (!running || polling || document.visibilityState !== 'visible') {
            return;
        }
        polling = true;
        const generation = epoch;
        const requestVersion = ++countVersion;
        try {
            const result = await client.read('brief-counts');
            if (generation !== epoch) {
                return;
            }
            const incoming = counts ? Math.max(0, result.counts.new - counts.new) : 0;
            if (requestVersion !== countVersion) {
                return;
            }
            updateCounts(result.counts);
            backoff = 60000;
            main.querySelector('[data-brief-connection]')?.remove();
            if (
                incoming &&
                !route.id &&
                new URLSearchParams(location.search).get('view') === 'briefs' &&
                !document.querySelector('dialog[open]') &&
                !document.querySelector('.editor-toast[data-kind="error"]')
            ) {
                toast(incoming === 1 ? 'Нове звернення у черзі' : 'Нових звернень: ' + incoming, {
                    owner: arrivalOwner,
                    label: 'Показати',
                    action: () => go(null, 'new'),
                });
                document.querySelector('.editor-toast').dataset.briefArrival = '';
                const empty = main.querySelector('.queue-empty');
                if (empty) {
                    empty.querySelector('h2').textContent = 'Надійшло нове звернення';
                    empty.querySelector('p').textContent = 'Перейдіть до «Нових», щоб відкрити оновлений список.';
                }
            }
            if (
                signature !== result.signature &&
                current &&
                !mutations.pending &&
                !mutations.busy &&
                !dialog.title.closest('dialog').open &&
                !viewSignal?.aborted
            ) {
                const actual = await client.read('brief', { id: current.id }, viewSignal);
                if (actual.record.version !== current.version) {
                    await go(current.id, route.filter, { replace: true, resetScroll: false, focus: false });
                }
            }
            signature = result.signature;
        } catch (error) {
            if (generation !== epoch) {
                return;
            }
            if ([401, 403].includes(error.status)) {
                await onAccessLost(error);
            } else if (error.status === 404 && current && !viewSignal?.aborted) {
                await go(null, route.filter, { replace: true });
                toast('Звернення за цим посиланням недоступне', { kind: 'error' });
            } else {
                backoff = Math.min(300000, backoff * 2);
                if (
                    new URLSearchParams(location.search).get('view') === 'briefs' &&
                    !main.querySelector('[data-brief-connection]')
                ) {
                    const note = el('div', 'state-notice queue-connection');
                    note.dataset.briefConnection = '';
                    const copy = el('div');
                    copy.append(
                        el('strong', '', 'Не вдалося перевірити нові звернення'),
                        el('p', '', 'Завантажені звернення залишаються доступними.')
                    );
                    note.append(copy, button('Спробувати знову', poll, 'primary-action'));
                    main.prepend(note);
                }
            }
        } finally {
            polling = false;
            clearTimeout(timer);
            if (running) {
                timer = setTimeout(poll, generation === epoch ? backoff : 0);
            }
        }
    }

    function start() {
        if (!running) {
            running = true;
            poll();
        }
    }

    function stop() {
        running = false;
        epoch += 1;
        clearTimeout(timer);
        counts = null;
        current = null;
        rows = [];
        signature = null;
        queuePosition = null;
        recovery = null;
        updateCounts(null);
        clearToast(arrivalOwner);
    }

    function showUncertain(verify, message) {
        recovery = verify;
        if (primary?.isConnected) {
            primary.disabled = false;
            primary.textContent = 'Перевірити';
            menu.inert = true;
        }
        toast(message || 'Не вдалося підтвердити зміну. Перевірте результат.', { kind: 'error' });
    }

    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', poll);
    return { render, start, stop, poll, showUncertain };
}
