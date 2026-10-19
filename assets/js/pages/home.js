import { initCommon } from '../common.js';
import { projects } from '../data/projects.js';
import { projectUrl, fillImage, findProject } from '../components/projects.js';

function initSlider() {
    const swiperEl = document.querySelector('.slider__swiper');
    const wrapper = swiperEl?.querySelector('.swiper-wrapper');
    const indicatorsEl = document.getElementById('slider__indicators');

    if (!swiperEl || !wrapper || !indicatorsEl) {
        return;
    }

    const projectsData = projects.sliderIds.map(findProject).filter(Boolean);

    if (!projectsData.length) {
        swiperEl.closest('.slider')?.remove();
        return;
    }

    // Рендер слайдів
    wrapper.replaceChildren();
    projectsData.forEach(item => {
        const li = document.createElement('li');
        li.className = 'swiper-slide slider__item';
        const link = document.createElement('a');
        link.href = projectUrl(item);
        const image = document.createElement('img');
        fillImage(image, item, false);
        image.className = 'slider__img';
        link.append(image);
        li.append(link);
        wrapper.appendChild(li);
    });

    // Рендер індикаторів
    let swiperInstance;
    indicatorsEl.replaceChildren();

    projectsData.forEach((_, index) => {
        const li = document.createElement('li');
        li.className = 'slider__indicator' + (index === 0 ? ' slider__indicator--active' : '');
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `Перейти до слайду ${index + 1}`);

        const goToSlide = () => {
            if (swiperInstance) {
                swiperInstance.slideToLoop(index);
            }
        };

        li.addEventListener('click', goToSlide);
        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToSlide();
            }
        });
        indicatorsEl.appendChild(li);
    });

    // Оновлення активного індикатора
    const updateIndicators = (activeIndex) => {
        const items = indicatorsEl.querySelectorAll('.slider__indicator');
        items.forEach((item, i) => {
            item.classList.toggle('slider__indicator--active', i === activeIndex);
        });
    };

    // Ініціалізація Swiper
    if (typeof window.Swiper !== 'function') {
        return;
    }
    swiperInstance = new window.Swiper('.slider__swiper', {
        loop: true,
        autoplay: {
            delay: 3000,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        },
        navigation: {
            prevEl: '#slider__btn--prev',
            nextEl: '#slider__btn--next',
        },
        breakpoints: {
            320: {
                slidesPerView: 1.25,
                spaceBetween: 12
            },
            769: {
                slidesPerView: 2,
                spaceBetween: 24
            },
            1025: {
                slidesPerView: 3,
                spaceBetween: 24
            }
        },
        on: {
            slideChange() {
                updateIndicators(this.realIndex);
            }
        }
    });
}

function initHome() {
    // Приховування підказки прокручування, коли видно блок логотипів
    const scrollBlock = document.querySelector('.hero__scroll-block');
    const logoStrip = document.querySelector('.logo-strip__inner');

    if (scrollBlock && logoStrip && 'IntersectionObserver' in window) {
        // IntersectionObserver відстежує, коли елемент (логотипи) потрапляє у видиму зону екрана
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // entry.boundingClientRect.top < 0 означає, що ми проскролили нижче блоку з логотипами
                // isIntersecting стає true, коли видно заданий відсоток блоку (threshold)
                if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
                    scrollBlock.classList.add('hero__scroll-block--hidden');
                    // Ховаємо блок
                } else {
                    scrollBlock.classList.remove('hero__scroll-block--hidden');
                    // Показуємо знову
                }
            });
        }, {
            // Спрацює, коли 80% блоку логотипів з'явиться у вікні браузера
            threshold: 0.8
        });

        // Вказуємо обзерверу, за яким саме елементом стежити
        observer.observe(logoStrip);
    }

    // Паралакс-ефект фотографій у секції про студію
    const aboutSection = document.querySelector('.about');
    const aboutPhotos = document.querySelectorAll('.about__photo');

    if (aboutSection && aboutPhotos.length > 0) {
        window.addEventListener('scroll', () => {
            // Отримуємо координати секції відносно вікна перегляду
            const rect = aboutSection.getBoundingClientRect();

            // Виконуємо розрахунки лише тоді, коли секція перебуває у видимій зоні
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                // Відстань у пікселях від моменту появи секції на екрані
                const scrolled = window.innerHeight - rect.top;

                // Адаптивна швидкість для третього фото
                const thirdPhotoSpeed = window.innerWidth < 1200 ? -0.02 : -0.05;

                // Коефіцієнти швидкості: додатні значення — рух вниз, від'ємні — рух вгору
                const speeds = [
                0.20,  // Фото 1 (Верхнє ліве)
                0.10,  // Фото 2 (Праве)
                thirdPhotoSpeed  // Фото 3 (Нижнє)
                ];

                // Застосовуємо зміщення по осі Y для кожної фотографії
                aboutPhotos.forEach((photo, index) => {
                    const speed = speeds[index];
                    if (speed !== undefined) {
                        photo.style.transform = `translateY(${scrolled * speed}px)`;
                    }
                });
            }
        });
    }

    // Перемикач вкладок послуг із послідовною анімацією
    const tabItems = document.querySelectorAll('.services__item');
    const tabPanels = document.querySelectorAll('.services__panel');
    const tabBtns = document.querySelectorAll('.services__btn');

    let isAnimating = false; // Блокування для запобігання накладанню анімацій при швидких кліках
    const animationDuration = 350; // Тривалість анімації (має відповідати значенню transition в CSS)

    if (tabItems.length > 0 && tabPanels.length > 0) {
        tabItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                // Перериваємо виконання, якщо анімація ще триває або обрана вже активна вкладка
                if (isAnimating || item.classList.contains('services__item--active')) {
                    return;
                }

                isAnimating = true;
                // Вмикаємо стан анімації

                const currentActiveItem = document.querySelector('.services__item--active');
                const currentActivePanel = document.querySelector('.services__panel--visible');
                const newPanel = tabPanels[index];

                // Оновлюємо активний стан пунктів меню та атрибути ARIA
                if (currentActiveItem) {
                    currentActiveItem.classList.remove('services__item--active');
                    const prevBtn = currentActiveItem.querySelector('.services__btn');
                    if (prevBtn) {
                        prevBtn.setAttribute('aria-selected', 'false');
                    }
                }
                item.classList.add('services__item--active');
                const newBtn = item.querySelector('.services__btn');
                if (newBtn) {
                    newBtn.setAttribute('aria-selected', 'true');
                }

                // Запускаємо зникнення поточної панелі
                if (currentActivePanel) {
                    currentActivePanel.classList.remove('services__panel--visible');

                    // Очікуємо завершення анімації зникнення
                    setTimeout(() => {
                        // Приховуємо стару панель (display: none)
                        currentActivePanel.classList.remove('services__panel--active');

                        // Додаємо нову панель у потік документа (display: flex, opacity: 0)
                        newPanel.classList.add('services__panel--active');

                        // Мікро-затримка (20мс) для коректного відпрацювання transition браузером
                        setTimeout(() => {
                            // Запускаємо появу нової панелі
                            newPanel.classList.add('services__panel--visible');

                            // Знімаємо блокування після повного завершення анімації
                            setTimeout(() => {
                                isAnimating = false;
                            }, animationDuration);
                        }, 20);
                    }, animationDuration);
                }
            });
        });

        // Клавіатурна навігація для вкладок згідно WAI-ARIA
        tabBtns.forEach((btn, idx) => {
            btn.addEventListener('keydown', (e) => {
                let targetIdx = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    targetIdx = (idx + 1) % tabBtns.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    targetIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
                } else if (e.key === 'Home') {
                    targetIdx = 0;
                } else if (e.key === 'End') {
                    targetIdx = tabBtns.length - 1;
                }

                if (targetIdx !== null) {
                    e.preventDefault();
                    tabBtns[targetIdx].focus();
                    tabItems[targetIdx].click();
                }
            });
        });
    }
}

initCommon();
initSlider();
initHome();
