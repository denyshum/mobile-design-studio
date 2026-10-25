import { vacancyResource } from '../data/vacancies.js';
import { plural } from '../data/format.js';

export function updateVacancyBadges() {
    vacancyResource.subscribe(({ status, data }) => {
        const count = status === 'success' ? data.length : null;
        const suffix = plural(count || 0, ['вакансія', 'вакансії', 'вакансій']);
        document.querySelectorAll('[data-vacancy-count]').forEach(badge => {
            badge.hidden = !count;
            badge.textContent = count === null ? '' : String(count);
            badge.parentElement.setAttribute('aria-label', count === null ? 'Кар’єра, кількість вакансій наразі невідома' : count ? 'Кар’єра, ' + count + ' ' + suffix : 'Кар’єра');
        });
    });
    vacancyResource.load();
}
