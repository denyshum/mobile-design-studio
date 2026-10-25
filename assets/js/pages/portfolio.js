import { initBriefForm } from '../components/brief-form.js';
import { initCommon } from '../common.js';
import { catalogResource } from '../data/projects.js';
import { bindResource, dataPanel } from '../components/data-state.js';
import { watchCover } from '../components/image-fallback.js';
import { fillImage, projectUrl } from '../components/projects.js';
import { plural } from '../data/format.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';

const restoredPosition = history.state?.catalog?.scrollY;
const navigationType = performance.getEntriesByType('navigation')[0]?.type;
let positionRestored = false;
let userMoved = false;
history.scrollRestoration = 'manual';
for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    addEventListener(type, () => {
        userMoved = true;
    }, { passive: true });
}
addEventListener('pagehide', () => {
    history.replaceState({ ...history.state, catalog: { scrollY: window.scrollY } }, '', location.href);
});
addEventListener('pageshow', event => {
    if (event.persisted && Number.isFinite(history.state?.catalog?.scrollY)) {
        window.scrollTo({ top: history.state.catalog.scrollY, behavior: 'instant' });
    }
});

function renderCatalog(records) {
    const catalog = document.querySelector('[data-project-catalog]');
    const cardTemplate = document.getElementById('project-card-template');
    if (catalog && cardTemplate) {
        const cards = document.createDocumentFragment();
        records.forEach(record => {
            const card = cardTemplate.content.firstElementChild.cloneNode(true);
            card.href = projectUrl(record);
            const image = document.createElement('img');
            image.loading = 'lazy';
            card.querySelector('[data-project-image]').replaceWith(image);
            fillImage(image, record);
            card.querySelector('h3').textContent = record.name;
            card.querySelector('.entry-card__category').textContent = record.category;
            card.querySelector('.entry-card__description').textContent = record.description;
            watchCover(card.querySelector('img'));
            cards.append(card);
        });
        catalog.replaceChildren(cards);
        const count = records.length;
        const suffix = plural(count, ['робота', 'роботи', 'робіт']);
        document.querySelector('[data-project-count]').textContent = count + ' ' + suffix;
        if (!records.length) {
            catalog.classList.add('data-region--state');
            catalog.append(dataPanel('catalog', 'empty'));
        }
        document.querySelector('meta[name="description"]').content = count + ' ' + suffix + ' MobileVision. Перегляньте наші проєкти та рішення';
        catalogMotion?.restart();
        if (!positionRestored && !userMoved && Number.isFinite(restoredPosition) && ['back_forward', 'reload'].includes(navigationType)) {
            positionRestored = true;
            requestAnimationFrame(() => {
                if (!userMoved) {
                    window.scrollTo({ top: restoredPosition, behavior: 'instant' });
                }
            });
        }
    }
}

let catalogMotion;
initCommon();
bindResource(catalogResource, {
    host: document.querySelector('[data-project-catalog]'),
    kind: 'catalog',
    render: renderCatalog,
    result: () => document.getElementById('list-title'),
    onState: ({ status }) => {
        if (status !== 'success') {
            document.querySelector('[data-project-count]').textContent = '—';
        }
    },
});
initBriefForm();
if (document.body.hasAttribute('data-reveal-effects')) {
    catalogMotion = mountMotion('revealEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal });
        onCleanup(reveals.stop);
        reveals.add(document.querySelectorAll('.entry-card, .closing-panel'));
    });
}
