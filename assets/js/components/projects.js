import { sitePath } from './paths.js';
import { projects } from '../data/projects.js';

export function findProject(id) {
    return projects.records.find(record => record.id === id);
}

export function projectUrl(record) {
    return sitePath('project.html?id=' + encodeURIComponent(record.id));
}

export function fillImage(image, record, withDimensions = true) {
    image.src = sitePath('assets/images/projects/' + record.image);
    image.alt = record.imageAlt;
    if (withDimensions) {
        image.width = record.imageWidth;
        image.height = record.imageHeight;
    }
}

export function syncProjectLinks() {
    const collection = projects;
    let featuredIndex = 0;
    document.querySelectorAll('[data-project-link]').forEach(link => {
        const id = link.classList.contains('projects__item') ? collection.featuredIds[featuredIndex++] : link.dataset.projectLink;
        const record = findProject(id);
        if (!record) {
            link.remove();
            return;
        }
        link.href = projectUrl(record);
        const image = link.querySelector('img');
        if (image) {
            fillImage(image, record, false);
            link.setAttribute('aria-label', 'Проєкт ' + record.name + ': ' + record.description.toLowerCase());
        } else {
            link.textContent = record.name;
        }
    });
}
