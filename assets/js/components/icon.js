import { sitePath } from './paths.js';

export function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', sitePath('assets/images/editor-icons.svg') + '#' + name);
    svg.append(use);

    return svg;
}
