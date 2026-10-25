import { sitePath } from './paths.js';
import { navigationProjects } from '../data/projects.js';

export function projectUrl(record) {
    return sitePath('project.html?id=' + encodeURIComponent(record.id));
}

export function fillImage(image, record, withDimensions = true) {
    image.src = record.image;
    image.alt = record.imageAlt;
    if (withDimensions) {
        image.width = record.imageWidth;
        image.height = record.imageHeight;
    }
}

export function syncProjectLinks() {
    const links = [...document.querySelectorAll('[data-project-link]')].filter(link => link.dataset.projectLink);
    navigationProjects.subscribe(({ status, data }) => {
        links.forEach(link => {
            const record = status === 'success' ? data.find(item => item.id === link.dataset.projectLink) : null;
            link.hidden = !record;
            if (record) {
                link.href = projectUrl(record);
                link.textContent = record.name;
            }
        });
    });
    navigationProjects.load();
}
