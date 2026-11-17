import { initCommon } from '../common.js';
import { collectionResource } from '../data/projects.js';
import { bindResource, dataPanel } from '../components/data-state.js';
import { watchCover } from '../components/image-fallback.js';
import { projectUrl, fillImage } from '../components/projects.js';

function initSlider(projectsData) {
    const swiperEl = document.querySelector('.slider__swiper');
    const wrapper = swiperEl?.querySelector('.swiper-wrapper');
    const indicatorsEl = document.getElementById('slider__indicators');

    if (!swiperEl || !wrapper || !indicatorsEl) {
        return;
    }


    if (!projectsData.length) {
        swiperEl.closest('.slider')?.remove();

        return;
    }

    // Render the slides
    wrapper.replaceChildren();

    projectsData.forEach(item => {
        const li = document.createElement('li');
        li.className = 'swiper-slide slider__item';
        const link = document.createElement('a');
        link.href = projectUrl(item);
        const image = document.createElement('img');
        image.loading = 'lazy';
        fillImage(image, item);
        image.className = 'slider__img';
        link.append(image);
        li.append(link);
        watchCover(image);
        wrapper.appendChild(li);
    });

    // Render the slide indicators
    let swiperInstance;
    indicatorsEl.replaceChildren();

    projectsData.forEach((_, index) => {
        const li = document.createElement('li');
        li.className = 'slider__indicator' + (index === 0 ? ' slider__indicator--active' : '');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'slider__indicator-button';
        button.title = `Перейти до слайду ${index + 1}`;
        const label = document.createElement('span');
        label.className = 'visually-hidden';
        label.textContent = button.title;
        button.append(label);

        button.addEventListener('click', () => {
            if (swiperInstance) {
                swiperInstance.slideToLoop(index);
            }
        });

        li.append(button);
        indicatorsEl.appendChild(li);
    });

    // Update the active slide indicator
    const updateIndicators = (activeIndex) => {
        const items = indicatorsEl.querySelectorAll('.slider__indicator');

        items.forEach((item, i) => {
            item.classList.toggle('slider__indicator--active', i === activeIndex);
        });
    };

    // Initialize Swiper
    if (typeof window.Swiper !== 'function') {
        return;
    }

    swiperEl.swiper?.destroy(true, true);

    swiperInstance = new window.Swiper(swiperEl, {
        loop: projectsData.length > 1,
        a11y: { enabled: false },
        // Preserve the selected slide when the cover height changes
        resizeObserver: false,
        autoplay: projectsData.length < 2 ? false : {
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


function initCollections() {
    const featured = document.querySelector('[data-featured]');
    const slider = document.querySelector('.slider__swiper');
    const sliderBottom = document.querySelector('.slider__bottom');
    const sliderSection = document.querySelector('.slider');

    slider?.addEventListener('focusin', event => {
        const swiper = slider.swiper;
        const slide = event.target.closest('.swiper-slide');

        if (!swiper || !slide || !event.target.matches(':focus-visible')) {
            return;
        }

        const index = swiper.slides.indexOf(slide);

        if (index < 0 || index === swiper.activeIndex) {
            return;
        }

        slider.scrollLeft = 0;

        if (swiper.params.loop) {
            swiper.slideToLoop(Number(slide.dataset.swiperSlideIndex), 0);
        } else {
            swiper.slideTo(index, 0);
        }
    });
    const note = document.getElementById('featured-note');

    function globalEmpty() {
        featured.classList.add('data-region--state');
        featured.replaceChildren(dataPanel('catalog', 'empty'));
        sliderSection.hidden = true;
    }

    bindResource(collectionResource('home_featured'), {
        host: featured,
        kind: 'featured',

        result: () => document.querySelector('.projects h2'),

        onState: ({ status }) => {
            if (status !== 'success') {
                featured.append(note.content.cloneNode(true));
            }
        },

        render: ({ records, hasProjects }) => {
            if (!hasProjects) {
                globalEmpty();

                return;
            }

            if (!records.length) {
                featured.classList.add('data-region--state');
                featured.replaceChildren(dataPanel('featured', 'empty'), note.content.cloneNode(true));

                return;
            }

            const columns = [document.createElement('div'), document.createElement('div')];

            columns.forEach(column => {
                column.className = 'projects__col';
            });

            records.forEach(record => {
                const link = document.createElement('a');
                link.className = 'projects__item';
                link.href = projectUrl(record);
                const image = document.createElement('img');
                image.loading = 'lazy';
                image.className = 'projects__img';
                fillImage(image, record);
                link.append(image);
                columns[record.position <= 2 ? 0 : 1].append(link);
                watchCover(image);
            });

            columns[0].append(note.content.cloneNode(true));
            featured.replaceChildren(...columns.filter(column => column.children.length));
        },
    });

    const wrapper = slider.querySelector('.swiper-wrapper');

    bindResource(collectionResource('home_slider'), {
        host: slider,
        kind: 'slider',

        result: () => document.querySelector('.slider h2'),

        onState: ({ status, data }) => {
            sliderBottom.hidden = status !== 'success' || data.records.length < 2;
        },

        render: ({ records, hasProjects }) => {
            if (!hasProjects) {
                globalEmpty();
            } else if (!records.length) {
                slider.classList.add('data-region--state');
                slider.replaceChildren(dataPanel('slider', 'empty'));
            } else {
                slider.replaceChildren(wrapper);
                initSlider(records);
            }
        },
    });
}

function initHome() {
    // Hide the scroll hint when the logo strip is visible
    const scrollBlock = document.querySelector('.hero__scroll-block');
    const logoStrip = document.querySelector('.logo-strip__inner');

    if (scrollBlock && logoStrip && 'IntersectionObserver' in window) {
        // Track when the logo strip enters the viewport with IntersectionObserver
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // A negative entry.boundingClientRect.top means the logo strip has scrolled above the viewport
                // The threshold controls when visibility changes are reported
                if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
                    scrollBlock.classList.add('hero__scroll-block--hidden');
                    // Hide the scroll hint
                } else {
                    scrollBlock.classList.remove('hero__scroll-block--hidden');
                    // Show the scroll hint again
                }
            });
        }, {
            // Report visibility changes at the 80% threshold
            threshold: 0.8
        });

        // Observe the logo strip
        observer.observe(logoStrip);
    }

    // Apply parallax to the photos in the studio section
    const aboutSection = document.querySelector('.about');
    const aboutPhotos = document.querySelectorAll('.about__photo');

    if (aboutSection && aboutPhotos.length > 0) {
        window.addEventListener('scroll', () => {
            // Read the section's position relative to the viewport
            const rect = aboutSection.getBoundingClientRect();

            // Calculate offsets only while the section is visible
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                // Distance in pixels since the section entered the viewport
                const scrolled = window.innerHeight - rect.top;

                // Adjust the third photo's speed for the viewport width
                const thirdPhotoSpeed = window.innerWidth < 1200 ? -0.02 : -0.05;

                // Positive speeds move photos down; negative speeds move them up
                const speeds = [
                0.20,  // Photo 1 (top left)
                0.10,  // Photo 2 (right)
                thirdPhotoSpeed  // Photo 3 (bottom)
                ];

                // Apply the vertical offset to each photo
                aboutPhotos.forEach((photo, index) => {
                    const speed = speeds[index];

                    if (speed !== undefined) {
                        photo.style.transform = `translateY(${scrolled * speed}px)`;
                    }
                });
            }
        });
    }

    // Switch service tabs with sequential transitions
    const tabItems = document.querySelectorAll('.services__item');
    const tabPanels = document.querySelectorAll('.services__panel');
    const tabBtns = document.querySelectorAll('.services__btn');

    let isAnimating = false; // Prevent overlapping animations during rapid clicks
    const animationDuration = 350; // Match the duration of the CSS transition

    if (tabItems.length > 0 && tabPanels.length > 0) {
        tabItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                // Ignore clicks during a transition or on the active tab
                if (isAnimating || item.classList.contains('services__item--active')) {
                    return;
                }

                isAnimating = true;
                // Mark the transition as running

                const currentActiveItem = document.querySelector('.services__item--active');
                const currentActivePanel = document.querySelector('.services__panel--visible');
                const newPanel = tabPanels[index];

                // Update the active tab
                if (currentActiveItem) {
                    currentActiveItem.classList.remove('services__item--active');
                }

                item.classList.add('services__item--active');

                // Fade out the current panel
                if (currentActivePanel) {
                    currentActivePanel.classList.remove('services__panel--visible');

                    // Wait for the fade-out transition to finish
                    setTimeout(() => {
                        // Hide the previous panel with display: none
                        currentActivePanel.classList.remove('services__panel--active');

                        // Place the next panel in the layout with display: flex and opacity: 0
                        newPanel.classList.add('services__panel--active');

                        // Give the browser 20ms to apply the initial styles before starting the transition
                        setTimeout(() => {
                            // Fade in the next panel
                            newPanel.classList.add('services__panel--visible');

                            // Unlock the tabs after the transition finishes
                            setTimeout(() => {
                                isAnimating = false;
                            }, animationDuration);
                        }, 20);
                    }, animationDuration);
                }
            });
        });

        // Support keyboard navigation between the service tabs
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
initCollections();
initHome();
