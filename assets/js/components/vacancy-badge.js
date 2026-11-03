import { paintBadge } from './badge.js';
import { vacancyResource } from '../data/vacancies.js';

export function updateVacancyBadges() {
    vacancyResource.subscribe(({ status, data }) => {
        const count = status === 'success' ? data.length : null;

        document.querySelectorAll('[data-vacancy-count]').forEach(badge => {
            paintBadge(badge, count);
        });
    });

    vacancyResource.load();
}
