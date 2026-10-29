import { initImageViewer } from '../components/image-viewer.js';
import { initBriefForm } from '../components/brief-form.js';
import { initCommon } from '../common.js';
import { fillImage } from '../components/projects.js';
import { watchCover } from '../components/image-fallback.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';
import { projectResource } from '../data/projects.js';
import { bindResource } from '../components/data-state.js';

function renderProject(record) {
    const main = document.querySelector('.case-content');

    if (main) {
        const template = document.getElementById(record ? 'detail-layout' : 'empty-layout');
        const content = template.content.cloneNode(true);
        main.classList.toggle('case-content--empty', !record);

        if (record) {
            content.querySelector('h1').textContent = record.name;
            content.querySelector('.case-heading__category').textContent = record.category;
            content.querySelector('.summary-panel__intro').textContent = record.description;
            const cover = content.querySelector('.cover-media');
            const image = document.createElement('img');
            cover.querySelector('[data-project-image]').replaceWith(image);
            cover.classList.add('cover-media--framed');

            if (record.image) {
                fillImage(image, record);
            } else {
                image.removeAttribute('src');
            }

            watchCover(image);
            const facts = content.querySelector('.fact-list');

            (record.facts || []).forEach(fact => {
                if (!fact.label?.trim() || !fact.value?.trim()) {
                    return;
                }

                const row = document.createElement('div');
                const label = document.createElement('dt');
                const value = document.createElement('dd');
                label.textContent = fact.label;
                value.textContent = fact.value;
                row.append(label, value);
                facts.append(row);
            });

            if (!facts.children.length) {
                facts.remove();
            }

            const paragraphs = content.querySelectorAll('.story-section p');

            [record.task, record.solution, record.result].forEach((text, index) => {
                paragraphs[index].textContent = text;
            });

            document.title = record.name + ' — MobileVision';
            document.querySelector('meta[name="description"]').content = record.description;
        } else {
            document.title = 'Проєкт не знайдено — MobileVision';
            document.querySelector('meta[name="description"]').content = 'Проєкт не знайдено. Поверніться до портфоліо MobileVision, щоб переглянути роботи студії.';
        }

        main.replaceChildren(content);
        initImageViewer(record);
        bindBrief?.(main);
        projectMotion?.restart();
    }
}

let projectMotion;
initCommon();
const main = document.querySelector('.case-content');

bindResource(projectResource(new URLSearchParams(location.search).get('id')), {
    host: main,
    kind: 'project',
    render: renderProject,

    result: () => main.querySelector('h1'),

    renderState: panel => {
        main.classList.remove('case-content--empty');
        const shell = document.createElement('div');
        shell.className = 'section-wrap';
        const back = document.getElementById('detail-layout').content.querySelector('.text-action--back').cloneNode(true);
        shell.append(back, panel);
        main.replaceChildren(shell);
        document.title = panel.querySelector('h1').textContent + ' — MobileVision';
        document.querySelector('meta[name="description"]').content = panel.querySelector('p').textContent;
    },
});

const bindBrief = initBriefForm();

if (document.body.hasAttribute('data-project-effects')) {
    const seen = new WeakSet();

    projectMotion = mountMotion('projectEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal, seen });
        onCleanup(reveals.stop);
        const tracked = [];
        const svg = document.querySelector('.story-flow__line');
        const path = svg?.querySelector('path');
        const originalViewBox = svg?.getAttribute('viewBox');
        const originalPath = path?.getAttribute('d');
        const box = svg?.viewBox.baseVal;
        const sourceWidth = box?.width || 1;
        const sourceHeight = box?.height || 1;
        let lineWidth = 0;
        let lineHeight = 0;
        let lineLength = 0;

        let frame = 0;

        function resetLine() {
            if (!path) {
                return;
            }

            path.style.removeProperty('stroke-dasharray');
            path.style.removeProperty('stroke-dashoffset');
            path.setAttribute('d', originalPath);
            svg.setAttribute('viewBox', originalViewBox);
            lineWidth = 0;
            lineHeight = 0;
            lineLength = 0;
        }

        onCleanup(() => {
            cancelAnimationFrame(frame);

            for (const item of tracked) {
                item.element.style.removeProperty('transform');
            }

            resetLine();
        });

        function normalizeLine() {
            const rect = svg.getBoundingClientRect();

            if (lineWidth === rect.width && lineHeight === rect.height) {
                return;
            }

            lineWidth = rect.width;
            lineHeight = rect.height;
            let index = 0;
            // Контур M/C/S складається з пар координат; одиниці штриха мають збігатися з екранними
            const d = originalPath.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, value => {
                const scale = index++ % 2 === 0 ? lineWidth / sourceWidth : lineHeight / sourceHeight;

                return String(Number(value) * scale);
            });
            svg.setAttribute('viewBox', '0 0 ' + lineWidth + ' ' + lineHeight);
            path.setAttribute('d', d);
            lineLength = path.getTotalLength();
        }

        function draw() {
            frame = 0;

            for (const item of tracked) {
                const rect = item.anchor.getBoundingClientRect();
                const transform = getComputedStyle(item.row).transform;
                const shift = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
                const top = rect.top - shift;
                const progress = Math.max(0, Math.min(1, (innerHeight * .9 - top) / (innerHeight * .45)));
                item.progress = Math.max(item.progress, progress);

                if (item.progress >= 1) {
                    item.element.style.removeProperty('transform');
                    seen.add(item.element);
                } else {
                    item.element.style.transform = 'translateY(' + (.75 * (1 - item.progress)) + 'rem) scale(' + (.97 + .03 * item.progress) + ')';
                }
            }

            if (!path || !svg.getClientRects().length) {
                resetLine();

                return;
            }

            const rect = path.getBoundingClientRect();
            const revealY = innerHeight * .9;

            if (rect.bottom <= revealY) {
                resetLine();

                return;
            }

            normalizeLine();
            // Кінчик штриха прив’язаний до нижньої частини екрана, а не до частки довжини кривої
            const targetY = revealY - svg.getBoundingClientRect().top;
            let lower = 0;
            let upper = lineLength;

            for (let index = 0; index < 16; index++) {
                const middle = (lower + upper) / 2;

                if (path.getPointAtLength(middle).y < targetY) {
                    lower = middle;
                } else {
                    upper = middle;
                }
            }

            path.style.strokeDasharray = String(lineLength);
            path.style.strokeDashoffset = String(lineLength - lower);
        }

        function schedule() {
            if (!frame) {
                frame = requestAnimationFrame(draw);
            }
        }

        reveals.add(document.querySelectorAll('.media-summary, .story-section, .closing-panel'));

        document.querySelectorAll('.story-section__media img').forEach(element => {
            const anchor = element.parentElement;
            const row = element.closest('.story-section');
            const complete = seen.has(element) || anchor.getBoundingClientRect().top < innerHeight;
            tracked.push({ element, anchor, row, progress: complete ? 1 : 0 });
        });

        addEventListener('scroll', schedule, { passive: true, signal });
        addEventListener('resize', schedule, { passive: true, signal });

        draw();
    });
}
