import { vacancies } from '../data/vacancies.js';
import { plural } from '../data/format.js';

export function updateVacancyBadges() {
    const count = vacancies.records.length;
    const suffix = plural(count, ['вакансія', 'вакансії', 'вакансій']);
    document.querySelectorAll('[data-vacancy-count]').forEach(badge => {
        badge.hidden = count === 0;
        badge.textContent = String(count);
        badge.parentElement.setAttribute('aria-label', count ? 'Кар’єра, ' + count + ' ' + suffix : 'Кар’єра');
    });
}
