import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const initPortfolio = () => {
    if (window.__portfolioInit) return;
    window.__portfolioInit = true;
        gsap.registerPlugin(ScrollTrigger);
        const navbar = document.querySelector('.navbar');
        const navLinks = Array.from(document.querySelectorAll('.nav-links a'));
        const navToggle = document.querySelector('.nav-toggle');
        const mobileNavMq = window.matchMedia('(max-width: 720px)');

        const closeMobileNav = () => {
            if (!navbar || !navToggle) return;
            navbar.classList.remove('is-open');
            navToggle.setAttribute('aria-expanded', 'false');
        };

        if (navToggle && navbar) {
            navToggle.addEventListener('click', () => {
                const nextOpen = !navbar.classList.contains('is-open');
                navbar.classList.toggle('is-open', nextOpen);
                navToggle.setAttribute('aria-expanded', String(nextOpen));
            });
        }
        const navBySection = new Map(
            navLinks
                .map(link => [link.dataset.target, link])
                .filter(([href]) => href && href.startsWith('#'))
        );

        if (navBySection.size) {
            const sections = Array.from(navBySection.keys())
                .map((hash) => document.querySelector(hash))
                .filter(Boolean);

            if (sections.length) {
                const setActive = (id) => {
                        const isDocked = navbar && navbar.classList.contains('nav-docked');
                        navLinks.forEach(link => {
                            const shouldSet = isDocked
                                && !link.classList.contains('nav-link--top')
                                && link.dataset.target === `#${id}`;
                            link.classList.toggle('is-active', shouldSet);
                        });
                    };

                const accentBySection = {
                    hero: '#ffffff',
                    projects: '#FFC14D',
                    about: '#4A3BFF',
                    value: '#FF4150',
                    skills: '#00BAE6',
                    timeline: '#6EFF52',
                    contact: '#FF61D9'
                };
                const setAccent = (id) => {
                    const color = accentBySection[id] || '#ffffff';
                    const root = document.documentElement;
                    root.style.setProperty('--scrollbar-color', color);
                    root.style.setProperty('--nav-hover-color', color);
                    document.querySelectorAll('.section').forEach(sec => {
                        sec.classList.toggle('is-current', sec.id === id);
                    });
                };

                const targets = sections
                    .map(section => {
                        const heading = section.querySelector('h2') || section.querySelector('.eyebrow');
                        return heading ? { id: section.id, heading } : null;
                    })
                    .filter(Boolean);

                let ticking = false;
                const onScroll = () => {
                    if (ticking) return;
                    ticking = true;
                    requestAnimationFrame(() => {
                        const mid = window.innerHeight / 2;
                        let currentId = null;
                        for (const t of targets) {
                            const top = t.heading.getBoundingClientRect().top;
                            if (top <= mid) {
                                currentId = t.id;
                            }
                        }
                        if (!currentId) currentId = 'hero';
                        setActive(currentId);
                        setAccent(currentId);
                        ticking = false;
                    });
                };

                onScroll();
                window.addEventListener('scroll', onScroll, { passive: true });
                window.addEventListener('resize', onScroll);
            }
        }
        if (navLinks.length) {
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    if (mobileNavMq.matches) closeMobileNav();
                });
            });
        }
        mobileNavMq.addEventListener('change', (event) => {
            if (!event.matches) closeMobileNav();
        });
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMobileNav();
        });
    // Move gradient position based on scroll to avoid visible repeats
    const gradientLayer = document.querySelector('.bg-gradient');
    if (gradientLayer) {
        const updateGradient = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const pct = max > 0 ? window.scrollY / max : 0;
            gradientLayer.style.backgroundPosition = `center ${pct * 100}%`;
        };
        updateGradient();
        window.addEventListener('scroll', updateGradient, { passive: true });
        window.addEventListener('resize', updateGradient);
        window.addEventListener('load', updateGradient);
    }

    // Header: dock nav links to right on scroll with "sucked in" effect
    if (navbar) {
        const navLinks = navbar.querySelector('.nav-links');
        let docked = navbar.classList.contains('nav-docked');
        let targetDocked = docked;
        let anim = null;
        let initialized = false;
        let transitioning = false;

        const runTransition = (nextDocked) => {
            if (!navLinks || nextDocked === targetDocked) return;
            targetDocked = nextDocked;
            if (transitioning) {
                if (anim) {
                    anim.cancel();
                    anim = null;
                }
                transitioning = false;
            }
            const fadeOut = navLinks.animate(
                [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.8)' }],
                { duration: 120, easing: 'ease-out', fill: 'forwards' }
            );
            anim = fadeOut;
            transitioning = true;
            fadeOut.onfinish = () => {
                navbar.classList.toggle('nav-docked', targetDocked);
                docked = targetDocked;
                const fadeIn = navLinks.animate(
                    [{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'scale(1)' }],
                    { duration: 120, easing: 'ease-out', fill: 'forwards' }
                );
                anim = fadeIn;
                fadeIn.onfinish = () => {
                    anim = null;
                    transitioning = false;
                };
            };
        };

        const toggleDock = () => {
            if (mobileNavMq.matches) {
                navbar.classList.remove('nav-docked');
                docked = false;
                return;
            }
            const threshold = window.innerHeight * 0.16;
            const hysteresis = 8;
            const shouldDock = window.scrollY > threshold + hysteresis
                ? true
                : window.scrollY < threshold - hysteresis
                    ? false
                    : docked;

            if (!initialized) {
                navbar.classList.toggle('nav-docked', shouldDock);
                docked = shouldDock;
                initialized = true;
                return;
            }
            runTransition(shouldDock);
        };

        toggleDock();
        window.addEventListener('scroll', toggleDock, { passive: true });
        window.addEventListener('resize', toggleDock);
    }

    // Timeline progress
    const track = document.getElementById('timeline-track');
    const progressBar = document.getElementById('timeline-progress-bar');
    if (track && progressBar) {
        const updateProgress = () => {
            const maxScroll = track.scrollWidth - track.clientWidth;
            const pct = maxScroll > 0 ? track.scrollLeft / maxScroll : 1;
            progressBar.style.width = `${Math.min(100, Math.max(0, pct * 100))}%`;
        };
        track.addEventListener('scroll', updateProgress, { passive: true });
        window.addEventListener('resize', updateProgress);
        updateProgress();
    }

};

export default initPortfolio;
