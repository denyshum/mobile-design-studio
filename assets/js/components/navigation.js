import { sitePath } from './paths.js';

export function initNavigation() {
    // Управління оверлеєм меню
    const mainHeaderNav = document.getElementById("main-header__nav");
    const menuBtn = document.getElementById("menu-btn");
    const menuOverlay = document.getElementById("menu-overlay");
    const menuBtnText = document.getElementById("menu-btn__text");
    const menuBtnUse = document.getElementById("menu-btn__use");
    const body = document.body;

    let menuTimer;
    function setMenuOpen(open) {
        if (!menuOverlay || (!open && !menuOverlay.classList.contains('menu-overlay--open'))) {
            return;
        }
        menuBtn?.classList.add('menu-btn--hidden');
        if (!open && menuOverlay.contains(document.activeElement)) {
            menuBtn?.focus({ preventScroll: true });
        }
        menuOverlay.inert = !open;
        menuOverlay.classList.toggle('menu-overlay--open', open);
        menuOverlay.setAttribute('aria-hidden', String(!open));
        menuBtn?.setAttribute('aria-expanded', String(open));
        body.classList.toggle('no-scroll', open);
        mainHeaderNav?.classList.toggle('nav--hidden', open);
        clearTimeout(menuTimer);
        menuTimer = setTimeout(() => {
            if (menuBtnText) {
                menuBtnText.textContent = open ? 'Закрити' : 'Меню';
            }
            if (menuBtnUse) {
                const icon = sitePath('assets/images/icons-sprite.svg#' + (open ? 'icon-close' : 'icon-burger-menu'));
                menuBtnUse.setAttribute('href', icon);
                menuBtnUse.setAttribute('xlink:href', icon);
            }
            menuBtn?.classList.remove('menu-btn--hidden');
        }, 200);
    }

    function closeMenu() {
        setMenuOpen(false);
    }

    function openMenu() {
        setMenuOpen(true);
    }

    if (menuBtn && menuOverlay) {
        menuBtn.addEventListener("click", () => {
            const isOpen = menuOverlay.classList.contains("menu-overlay--open");
            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Закриття меню при натисканні на навігаційне посилання
        menuOverlay.querySelectorAll('a').forEach(link => {
            link.addEventListener("click", () => {
                closeMenu();
            });
        });

        // Кнопка закриття лишається в header, тому включаємо її в цикл фокуса діалогу
        document.addEventListener('keydown', event => {
            if (event.key !== 'Tab' || !menuOverlay.classList.contains('menu-overlay--open')) {
                return;
            }
            const links = [...menuOverlay.querySelectorAll('a[href]')].filter(link => {
                return link.getClientRects().length > 0;
            });
            const first = menuBtn;
            const last = links.at(-1) || menuBtn;
            // Під час відкриття visibility може оновитися лише в наступному кадрі
            const focusWhenVisible = target => {
                if (!menuOverlay.classList.contains('menu-overlay--open')) {
                    return;
                }
                if (getComputedStyle(target).visibility !== 'visible') {
                    requestAnimationFrame(() => {
                        return focusWhenVisible(target);
                    });
                    return;
                }
                target.focus();
            };
            if (event.shiftKey && (document.activeElement === first || !menuOverlay.contains(document.activeElement))) {
                event.preventDefault();
                focusWhenVisible(last);
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                focusWhenVisible(first);
            }
        });

        // Закриття меню клавішею Escape для доступності
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && menuOverlay.classList.contains("menu-overlay--open")) {
                closeMenu();
                menuBtn.focus();
            }
        });
    }

    // Зміна фону шапки при скролі
    const header = document.querySelector('.main-header');

    if (header) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                header.classList.add('main-header--scrolled');
            } else {
                header.classList.remove('main-header--scrolled');
            }
        });
    }

    // Кнопка повернення нагору
    const scrollTopBtn = document.querySelector('.main-footer__scroll-top');

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () => {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                window.scrollTo({ top: 0, behavior: 'instant' });
                document.querySelector('h1')?.focus({ preventScroll: true });
                return;
            }
            document.documentElement.style.scrollBehavior = 'auto';

            const startPosition = window.scrollY;
            // Поточна позиція
            const distance = -startPosition;
            // Відстань до нуля
            const duration = 1200;
            // Час анімації (мс)
            let start = null;

            function animation(currentTime) {
                if (start === null) {
                    start = currentTime;
                }

                const timeElapsed = currentTime - start;

                // Розрахунок прогресу (від 0 до 1)
                const progress = Math.min(timeElapsed / duration, 1);

                // Формула плавності (ease-in-out)
                const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                window.scrollTo(0, startPosition + distance * ease);

                // Продовжуємо, поки не вийде час
                if (timeElapsed < duration) {
                    requestAnimationFrame(animation);
                } else {
                    document.documentElement.style.scrollBehavior = 'smooth';
                }
            }

            requestAnimationFrame(animation);
        });
    }

    // Клавіатурний перехід продовжує навігацію від цільового заголовка
    if (body.classList.contains('detail-page')) {
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.addEventListener('click', event => {
                const target = document.getElementById(link.getAttribute('href').slice(1));
                const heading = target?.querySelector('h1, h2');
                if (!heading) {
                    return;
                }
                event.preventDefault();
                const hash = link.getAttribute('href');
                if (location.hash !== hash) {
                    history.pushState(null, '', hash);
                }
                target.scrollIntoView({ block: 'start' });
                if (event.detail === 0) {
                    heading.setAttribute('tabindex', '-1');
                    heading.focus({ preventScroll: true });
                }
            });
        });
    }
}
