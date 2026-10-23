import { initBriefForm } from '../components/brief-form.js';
import { initCommon } from '../common.js';
import { mountMotion } from '../components/motion.js';
import { createReveals } from '../components/reveal.js';

initCommon();
initBriefForm();
if (document.body.hasAttribute('data-scroll-effects')) {
    mountMotion('scrollEffects', ({ signal, onCleanup }) => {
        const reveals = createReveals({ signal, rootMargin: '0px 0px 40px 0px' });
        onCleanup(reveals.stop);
        const lines = [];
        let frame = 0;
        onCleanup(() => {
            cancelAnimationFrame(frame);
            for (const { path } of lines) {
                path.style.removeProperty('stroke-dasharray');
                path.style.removeProperty('stroke-dashoffset');
            }
        });
        const content = '.page-intro .text-block, .page-intro__media, .split-panel > .media-frame, .split-panel > .text-block, ' +
            '.page-section > h2, .staggered-list > li, .alternating-list > li, .card-grid__heading, .card-grid > li, .action-panel > h2, .action-panel__list';
        reveals.add(document.querySelectorAll(content), {
            duration: 340,
            frames(element) {
                return element.classList.contains('media-frame')
                    ? [{ opacity: 0, transform: 'scale(.99)' }, { opacity: 1, transform: 'none' }]
                    : [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }];
            },
            delay(element) {
                const team = element.closest('.card-grid');
                return team ? Math.min(110, [...team.children].indexOf(element) * 55) : 0;
            },
        });
        function draw() {
            frame = 0;
            const viewport = innerHeight;
            for (const { svg, path, length } of lines) {
                if (!svg.getClientRects().length) {
                    path.style.removeProperty('stroke-dasharray');
                    path.style.removeProperty('stroke-dashoffset');
                    continue;
                }
                const rect = path.getBoundingClientRect();
                const progress = Math.min(1, Math.max(0, (viewport * .8 - rect.top) / Math.max(1, rect.height * .95)));
                path.style.strokeDasharray = String(length);
                path.style.strokeDashoffset = String(length * (1 - progress));
            }
        }
        function schedule() {
            if (!frame) {
                frame = requestAnimationFrame(draw);
            }
        }
        document.querySelectorAll('.connector-line').forEach(svg => {
            svg.querySelectorAll('path').forEach(path => {
                return lines.push({ svg, path, length: path.getTotalLength() });
            });
        });
        addEventListener('scroll', schedule, { passive: true, signal });
        addEventListener('resize', schedule, { passive: true, signal });
        draw();

    });
}
