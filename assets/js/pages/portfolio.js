import { initBriefForm } from '../components/brief-form.js';
import { initCommon } from '../common.js';
import { projects as collection } from '../data/projects.js';
import { fillImage, projectUrl } from '../components/projects.js';
import { plural } from '../data/format.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';

function renderCatalog() {
    const catalog = document.querySelector('[data-project-catalog]');
    const cardTemplate = document.getElementById('project-card-template');
    if (catalog && cardTemplate) {
        const cards = document.createDocumentFragment();
        collection.records.forEach(record => {
            const card = cardTemplate.content.firstElementChild.cloneNode(true);
            card.href = projectUrl(record);
            fillImage(card.querySelector('img'), record);
            card.querySelector('h3').textContent = record.name;
            card.querySelector('.entry-card__category').textContent = record.category;
            card.querySelector('.entry-card__description').textContent = record.description;
            cards.append(card);
        });
        catalog.replaceChildren(cards);
        const count = collection.records.length;
        const suffix = plural(count, ['робота', 'роботи', 'робіт']);
        document.querySelector('[data-project-count]').textContent = count + ' ' + suffix;
        if (!collection.records.length) {
            const message = document.createElement('p');
            message.textContent = 'Проєкти ще не додано';
            catalog.append(message);
        }
        cardTemplate.remove();
    }
}

renderCatalog();
initCommon();
initBriefForm();
if (document.body.hasAttribute('data-reveal-effects')) {
    mountMotion('revealEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal });
        onCleanup(reveals.stop);
        reveals.add(document.querySelectorAll('.entry-card, .closing-panel'));
    });
}
