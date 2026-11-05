import { initBriefForm } from '../components/brief-form.js';
import { initCommon } from '../common.js';
import { catalogResource } from '../data/projects.js';
import { catalogParameters, searchQuery, selectProjects } from '../data/search.js';
import { bindResource, dataPanel, icon, focusResult } from '../components/data-state.js';
import { watchCover } from '../components/image-fallback.js';
import { fillImage, projectUrl } from '../components/projects.js';
import { plural } from '../data/format.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';

const catalog = document.querySelector('[data-project-catalog]');
const controls = document.querySelector('[data-catalog-controls]');
const toolbar = document.querySelector('[data-catalog-toolbar]');
const searchInput = document.getElementById('catalog-query');
const fields = toolbar.querySelector('.catalog-tools');
const disclosure = document.querySelector('[data-catalog-disclosure]');
const category = toolbar.querySelector('[name="category"]');
const sortControls = [...toolbar.querySelectorAll('[name="sort"]')];
const footer = document.querySelector('[data-catalog-footer]');
const reset = document.querySelector('[data-catalog-reset]');
const announcement = document.querySelector('[data-catalog-announcement]');
const wide = matchMedia('(min-width: 769px)');
const sortNames = Object.fromEntries(sortControls.map(radio => [radio.value, radio.parentElement.textContent.trim()]));
const navigationType = performance.getEntriesByType('navigation')[0]?.type;
let applied = catalogParameters(new URLSearchParams(location.search));
let records = [];
let ready = false;
let catalogMotion;
const projectCards = new Map();
let renderedIds = null;
let resultsFrame;
let revealResults = false;
let restoredPosition = history.state?.catalog?.scrollY;
let positionRestored = !['back_forward', 'reload'].includes(navigationType);
let userMoved = false;
let mobileOpen = Boolean(applied.query || applied.category || applied.sort !== 'studio');
let wasWide = wide.matches;
let editingQuery = false;
history.scrollRestoration = 'manual';

function savePosition() {
    history.replaceState({ ...history.state, catalog: { ...history.state?.catalog, scrollY } }, '', location.href);
}

function writeParameters(replace = false) {
    const target = new URL(location.href);

    for (const key of ['q', 'category', 'sort']) {
        target.searchParams.delete(key);
    }

    if (applied.query) {
        target.searchParams.set('q', applied.query);
    }

    if (applied.category) {
        target.searchParams.set('category', applied.category);
    }

    if (applied.sort !== 'studio') {
        target.searchParams.set('sort', applied.sort);
    }

    if (target.href !== location.href) {
        savePosition();
        history[replace ? 'replaceState' : 'pushState']({ ...history.state }, '', target);
    }
}

function populateCategories() {
    const names = [...new Set(records.map(record => record.category))].sort(new Intl.Collator('uk').compare);
    category.replaceChildren(new Option('Усі напрями', ''));

    for (const name of names) {
        category.append(new Option(name, name));
    }

    if (applied.category && !names.includes(applied.category)) {
        category.append(new Option(applied.category + ' (недоступний)', applied.category));
    }
}

function fillForm() {
    populateCategories();
    searchInput.value = applied.query;
    category.value = applied.category;

    for (const radio of sortControls) {
        radio.checked = radio.value === applied.sort;
    }

    updateForm();
}

function toolbarParameters() {
    return {
        query: searchQuery(searchInput.value),
        category: category.value,
        sort: sortControls.find(control => control.checked).value,
    };
}

function syncSticky() {
    const top = parseFloat(getComputedStyle(controls).top);
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const fits = wide.matches && Number.isFinite(top) && controls.getBoundingClientRect().height + top + gap <= innerHeight;
    controls.classList.toggle('catalog-controls--sticky', fits);
}

function updateForm() {
    reset.hidden = !searchInput.value && !applied.category && applied.sort === 'studio';
    footer.hidden = reset.hidden;
    document.querySelector('[data-catalog-summary]').textContent = [applied.query && '«' + applied.query + '»', applied.category || 'Усі напрями', sortNames[applied.sort]].filter(Boolean).join(' · ');
    syncSticky();
}

function cancelResultsScroll() {
    cancelAnimationFrame(resultsFrame);
    revealResults = false;
}

function updateResults(typing = false) {
    if (!ready || fields.disabled) {
        return;
    }

    const next = toolbarParameters();

    if (next.query === applied.query && next.category === applied.category && next.sort === applied.sort) {
        updateForm();
        return;
    }

    const active = document.activeElement;
    const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const inset = document.querySelector('.main-header').getBoundingClientRect().bottom + gap;
    const passedStart = wide.matches && catalog.getBoundingClientRect().top < inset - 1;
    applied = next;
    writeParameters(typing && editingQuery);
    editingQuery = typing;
    updateForm();
    const result = renderResults();
    announcement.textContent = 'Знайдено робіт: ' + result.count;

    if (result.changed && controls.contains(active)) {
        revealResults ||= passedStart;
        cancelAnimationFrame(resultsFrame);
        resultsFrame = requestAnimationFrame(() => {
            const showStart = revealResults;
            revealResults = false;

            if (document.activeElement !== active || !active.isConnected) {
                return;
            }

            const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const top = document.querySelector('.main-header').getBoundingClientRect().bottom + gap;

            if (showStart) {
                scrollBy({ top: catalog.getBoundingClientRect().top - top, behavior: 'instant' });
            }

            const bounds = active.getBoundingClientRect();
            const delta = bounds.top < top ? bounds.top - top : bounds.bottom > innerHeight - gap ? bounds.bottom - innerHeight + gap : 0;

            if (Math.abs(delta) > 1) {
                scrollBy({ top: delta, behavior: 'instant' });
            }

            savePosition();
        });
    }
}

function restorePosition() {
    if (!positionRestored && !userMoved && Number.isFinite(restoredPosition)) {
        positionRestored = true;
        const url = location.href;

        requestAnimationFrame(() => {
            if (!userMoved && location.href === url) {
                window.scrollTo({ top: restoredPosition, behavior: 'instant' });
            }
        });
    }
}

function projectCard(record) {
    if (projectCards.has(record.id)) {
        return projectCards.get(record.id);
    }

    const template = document.getElementById('project-card-template');
    const card = template.content.firstElementChild.cloneNode(true);
    card.href = projectUrl(record);
    const image = document.createElement('img');
    image.loading = 'lazy';
    card.querySelector('[data-project-image]').replaceWith(image);
    fillImage(image, record);
    card.querySelector('h3').textContent = record.name;
    card.querySelector('.entry-card__category').textContent = record.category;
    card.querySelector('.entry-card__description').textContent = record.description;
    watchCover(image);
    projectCards.set(record.id, card);

    return card;
}

function renderResults() {
    const visible = selectProjects(records, applied);
    const ids = visible.map(record => record.id);
    const changed = !renderedIds || ids.length !== renderedIds.length || ids.some((id, index) => id !== renderedIds[index]);

    if (!changed) {
        restorePosition();
        return { count: visible.length, changed: false };
    }

    renderedIds = ids;
    catalog.classList.remove('data-region--state');
    let next = catalog.firstElementChild;

    for (const record of visible) {
        const card = projectCard(record);
        const root = card.closest('.data-card-shell') || card;

        if (root !== next) {
            catalog.insertBefore(root, next);
        }

        next = root.nextElementSibling;
    }

    while (next) {
        const remaining = next.nextElementSibling;
        next.remove();
        next = remaining;
    }

    const suffix = plural(records.length, ['робота', 'роботи', 'робіт']);
    document.querySelector('[data-project-count]').textContent = visible.length === records.length ? records.length + ' ' + suffix : visible.length + ' з ' + records.length + ' ' + plural(records.length, ['роботи', 'робіт', 'робіт']);
    document.querySelector('meta[name="description"]').content = records.length + ' ' + suffix + ' MobileVision. Перегляньте наші проєкти та рішення';

    if (!visible.length) {
        catalog.classList.add('data-region--state');
        const panel = dataPanel('catalog', 'empty');

        if (records.length) {
            panel.querySelector('h2').textContent = 'Проєктів не знайдено';
            panel.querySelector('p').textContent = 'Змініть запит або напрям. Можна скинути всі параметри';
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'text-action text-action--diagonal data-state__action';
            action.append('Скинути все', icon('arrow-diagonal'));
            action.addEventListener('click', resetSearch);
            panel.append(action);
        }

        catalog.append(panel);
    }

    catalogMotion?.restart();
    restorePosition();

    return { count: visible.length, changed: true };
}

function resetSearch(event) {
    cancelResultsScroll();
    editingQuery = false;
    applied = { query: '', category: '', sort: 'studio' };
    writeParameters();
    fillForm();

    if (ready) {
        renderResults();
    }

    announcement.textContent = 'Параметри скинуто';

    if (event.detail === 0) {
        if (!fields.disabled) {
            searchInput.focus();
        } else {
            focusResult(catalog.querySelector('.data-state__title') || document.getElementById('list-title'));
        }
    }
}

function syncLayout() {
    if (!wasWide) {
        mobileOpen = disclosure.open;
    }

    if (!wide.matches && toolbar.contains(document.activeElement)) {
        mobileOpen = true;
    }

    wasWide = wide.matches;
    disclosure.open = wide.matches || mobileOpen;
    syncSticky();
}

controls.hidden = false;
document.querySelector('.catalog-section').classList.add('catalog-section--sidebar');
fillForm();
writeParameters(true);
disclosure.open = wide.matches || mobileOpen;
wide.addEventListener('change', syncLayout);
disclosure.addEventListener('toggle', () => {
    if (!wide.matches) {
        mobileOpen = disclosure.open;
    }
});
const searchChanged = event => {
    if (!event.isComposing) {
        updateResults(true);
    }
};
searchInput.addEventListener('input', searchChanged);
searchInput.addEventListener('compositionend', searchChanged);
searchInput.addEventListener('blur', () => {
    searchInput.value = applied.query;
    editingQuery = false;
    updateForm();
});
toolbar.addEventListener('change', event => {
    if (event.target !== searchInput) {
        updateResults();
    }
});
searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
        searchInput.value = applied.query;
        editingQuery = false;
        updateForm();
    }
});
addEventListener('resize', syncSticky);

if (typeof ResizeObserver === 'function') {
    const sizing = new ResizeObserver(syncSticky);
    sizing.observe(controls);
}

reset.addEventListener('click', resetSearch);

for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    addEventListener(type, () => {
        userMoved = true;
    }, { passive: true });
}

addEventListener('pagehide', () => {
    cancelResultsScroll();
    savePosition();
});
addEventListener('popstate', () => {
    cancelResultsScroll();
    editingQuery = false;
    applied = catalogParameters(new URLSearchParams(location.search));
    restoredPosition = history.state?.catalog?.scrollY;
    positionRestored = false;
    userMoved = false;
    fillForm();
    writeParameters(true);

    if (ready) {
        announcement.textContent = 'Знайдено робіт: ' + renderResults().count;
    }
});
addEventListener('pageshow', event => {
    if (event.persisted) {
        editingQuery = false;
        applied = catalogParameters(new URLSearchParams(location.search));
        restoredPosition = history.state?.catalog?.scrollY;
        positionRestored = false;
        userMoved = false;
        fillForm();

        if (ready) {
            renderResults();
        }
    }
});

initCommon();
bindResource(catalogResource, {
    host: catalog,
    kind: 'catalog',

    render: data => {
        projectCards.clear();
        renderedIds = null;
        records = data;
        ready = true;
        fillForm();
        renderResults();
    },

    result: () => document.getElementById('list-title'),

    onState: ({ status }) => {
        ready = status === 'success';
        fields.disabled = !ready || !records.length;

        if (!ready) {
            renderedIds = null;
            document.querySelector('[data-project-count]').textContent = '—';
        }

        updateForm();
    },
});

// Перший стан каталогу може перервати нативну плавну прокрутку до якоря
if (navigationType === 'navigate' && location.hash === '#projects-list') {
    requestAnimationFrame(() => {
        if (!userMoved && location.hash === '#projects-list') {
            document.getElementById('projects-list').scrollIntoView({ block: 'start', behavior: 'instant' });
        }
    });
}

initBriefForm();

if (document.body.hasAttribute('data-reveal-effects')) {
    catalogMotion = mountMotion('revealEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal });
        onCleanup(reveals.stop);
        reveals.add(document.querySelectorAll('.entry-card, .closing-panel'));
    });
}
