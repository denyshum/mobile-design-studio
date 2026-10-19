import { initNavigation } from './components/navigation.js';
import { syncProjectLinks } from './components/projects.js';
import { updateVacancyBadges } from './components/vacancy-badge.js';
import { initImageFallbacks } from './components/image-fallback.js';

export function initCommon() {
    syncProjectLinks();
    updateVacancyBadges();
    initNavigation();
    initImageFallbacks();
}
