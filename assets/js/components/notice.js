import { icon } from './icon.js';

export function createNotice(title, text = '', kind = '') {
    const node = document.createElement('div');
    node.className = 'state-notice' + (kind ? ' state-notice--' + kind : '');
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    if (kind === 'error') {
        node.append(icon('warning'));
    }
    const copy = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = title;
    copy.append(heading);
    if (text) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        copy.append(paragraph);
    }
    node.append(copy);

    return node;
}
