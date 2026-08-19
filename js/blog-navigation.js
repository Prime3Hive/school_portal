// Public site behaviour: navigation drawer, scroll effects and the
// interactive widgets used across the public pages.
//
// Every block guards for missing elements so the same file can be shared
// by the homepage / about / academics / admissions / contact.

(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var DESKTOP = '(min-width: 992px)';

    /* ============================================================
       Mobile navigation drawer
       ============================================================ */
    (function navDrawer() {
        var navbar = document.getElementById('navbar');
        var toggle = document.getElementById('navbarToggle');
        var drawer = document.getElementById('navbarMenu');
        if (!navbar || !toggle || !drawer) return;

        // The backdrop is injected so the markup stays identical on
        // every page.
        var backdrop = document.querySelector('.navbar-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 'navbar-backdrop';
            document.body.appendChild(backdrop);
        }

        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-controls', 'navbarMenu');
        if (!toggle.getAttribute('aria-label')) {
            toggle.setAttribute('aria-label', 'Open menu');
        }

        function setOpen(open) {
            drawer.classList.toggle('active', open);
            toggle.classList.toggle('active', open);
            backdrop.classList.toggle('active', open);
            document.body.classList.toggle('nav-open', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }

        function close() {
            if (drawer.classList.contains('active')) setOpen(false);
        }

        toggle.addEventListener('click', function () {
            setOpen(!drawer.classList.contains('active'));
        });

        backdrop.addEventListener('click', close);

        drawer.addEventListener('click', function (event) {
            if (event.target.closest('a')) close();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                close();
                if (document.activeElement !== toggle) toggle.focus();
            }
        });

        // Leaving mobile widths must not strand the drawer open.
        var desktop = window.matchMedia(DESKTOP);
        var onBreakpoint = function (event) {
            if (event.matches) setOpen(false);
        };
        if (desktop.addEventListener) {
            desktop.addEventListener('change', onBreakpoint);
        } else if (desktop.addListener) {
            desktop.addListener(onBreakpoint);
        }
    })();

    /* ============================================================
       Scroll: navbar state, reading progress, floating UI
       ============================================================ */
    (function scrollEffects() {
        var navbar = document.getElementById('navbar');
        var progress = document.querySelector('.navbar-progress span');
        var toTop = document.querySelector('.to-top');
        var mobileBar = document.querySelector('.mobile-bar');
        var ticking = false;

        function update() {
            ticking = false;
            var y = window.pageYOffset || document.documentElement.scrollTop;

            if (navbar) navbar.classList.toggle('scrolled', y > 24);

            if (progress) {
                var scrollable = document.documentElement.scrollHeight - window.innerHeight;
                var ratio = scrollable > 0 ? Math.min(y / scrollable, 1) : 0;
                progress.style.setProperty('--scroll-progress', ratio.toFixed(4));
            }

            if (toTop) toTop.classList.toggle('show', y > 600);
            if (mobileBar) mobileBar.classList.toggle('show', y > 400);
        }

        function onScroll() {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(update);
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();

        if (toTop) {
            toTop.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
            });
        }
    })();

    /* ============================================================
       Smooth scroll for in-page anchors
       ============================================================ */
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (event) {
            var href = anchor.getAttribute('href');
            if (!href || href === '#') return;

            var target = document.querySelector(href);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'start'
            });
            // Keep keyboard focus in step with the visual jump.
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        });
    });

    /* ============================================================
       Scroll reveal with a staggered delay per group
       ============================================================ */
    (function reveal() {
        var items = document.querySelectorAll('.reveal, .card, .section-header');
        if (!items.length) return;

        if (reduceMotion || !('IntersectionObserver' in window)) {
            items.forEach(function (el) { el.classList.add('reveal', 'is-visible'); });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        items.forEach(function (el) {
            el.classList.add('reveal');

            // Siblings inside the same grid fade in one after another.
            var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
            el.style.setProperty('--reveal-delay', Math.min(siblings, 5) * 80 + 'ms');

            observer.observe(el);
        });
    })();

    /* ============================================================
       Count-up numbers — <span data-count="500" data-suffix="+">
       ============================================================ */
    (function counters() {
        var nodes = document.querySelectorAll('[data-count]');
        if (!nodes.length) return;

        function render(el, value) {
            el.textContent = value.toLocaleString() + (el.dataset.suffix || '');
        }

        function run(el) {
            var target = parseFloat(el.dataset.count) || 0;
            if (reduceMotion) {
                render(el, target);
                return;
            }

            var duration = 1400;
            var start = null;

            function frame(now) {
                if (start === null) start = now;
                var progress = Math.min((now - start) / duration, 1);
                // easeOutExpo
                var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                render(el, Math.round(target * eased));
                if (progress < 1) window.requestAnimationFrame(frame);
            }

            window.requestAnimationFrame(frame);
        }

        if (!('IntersectionObserver' in window)) {
            nodes.forEach(function (el) { render(el, parseFloat(el.dataset.count) || 0); });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                run(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.5 });

        nodes.forEach(function (el) {
            render(el, 0);
            observer.observe(el);
        });
    })();

    /* ============================================================
       Tabs — [data-tabs] wrapper with .tab buttons + .tab-panel
       ============================================================ */
    document.querySelectorAll('[data-tabs]').forEach(function (group) {
        var tabs = group.querySelectorAll('.tab');
        if (!tabs.length) return;

        function select(tab) {
            tabs.forEach(function (other) {
                var selected = other === tab;
                other.setAttribute('aria-selected', String(selected));
                other.setAttribute('tabindex', selected ? '0' : '-1');

                var panel = document.getElementById(other.getAttribute('aria-controls'));
                if (panel) {
                    panel.classList.toggle('active', selected);
                    panel.hidden = !selected;
                }
            });
        }

        tabs.forEach(function (tab, index) {
            tab.addEventListener('click', function () { select(tab); });

            tab.addEventListener('keydown', function (event) {
                var offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!offset) return;
                event.preventDefault();
                var next = tabs[(index + offset + tabs.length) % tabs.length];
                next.focus();
                select(next);
            });
        });
    });

    /* ============================================================
       Accordion — .accordion-item with a .accordion-trigger button
       ============================================================ */
    document.querySelectorAll('.accordion').forEach(function (accordion) {
        var items = accordion.querySelectorAll('.accordion-item');

        items.forEach(function (item) {
            var trigger = item.querySelector('.accordion-trigger');
            var panel = item.querySelector('.accordion-panel');
            if (!trigger || !panel) return;

            trigger.setAttribute('aria-expanded', String(item.classList.contains('open')));

            trigger.addEventListener('click', function () {
                var willOpen = !item.classList.contains('open');

                // One panel open at a time keeps the list short on phones.
                items.forEach(function (other) {
                    other.classList.remove('open');
                    var otherTrigger = other.querySelector('.accordion-trigger');
                    if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
                });

                item.classList.toggle('open', willOpen);
                trigger.setAttribute('aria-expanded', String(willOpen));
            });
        });
    });

    /* ============================================================
       Scroll-snap rails — dots track the visible card
       ============================================================ */
    document.querySelectorAll('[data-rail]').forEach(function (rail) {
        var dotsHost = document.querySelector('[data-rail-dots="' + rail.dataset.rail + '"]');
        var cards = rail.children;
        if (!dotsHost || !cards.length) return;

        Array.prototype.forEach.call(cards, function (card, index) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'rail-dot' + (index === 0 ? ' active' : '');
            dot.setAttribute('aria-label', 'Go to testimonial ' + (index + 1));
            dot.addEventListener('click', function () {
                rail.scrollTo({
                    left: card.offsetLeft - rail.offsetLeft,
                    behavior: reduceMotion ? 'auto' : 'smooth'
                });
            });
            dotsHost.appendChild(dot);
        });

        var ticking = false;
        rail.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(function () {
                ticking = false;
                var index = Math.round(rail.scrollLeft / (rail.scrollWidth / cards.length));
                Array.prototype.forEach.call(dotsHost.children, function (dot, i) {
                    dot.classList.toggle('active', i === index);
                });
            });
        }, { passive: true });
    });

    /* ============================================================
       Ticker — duplicate the track so the marquee loops seamlessly
       ============================================================ */
    document.querySelectorAll('.ticker-track').forEach(function (track) {
        if (track.dataset.cloned === 'true') return;

        var clone = document.createDocumentFragment();
        Array.prototype.forEach.call(track.children, function (item) {
            var copy = item.cloneNode(true);
            copy.setAttribute('aria-hidden', 'true'); // the loop is decorative
            clone.appendChild(copy);
        });

        track.appendChild(clone);
        track.dataset.cloned = 'true';
    });

    /* ============================================================
       Gallery lightbox — [data-lightbox] buttons + #lightbox overlay

       The tiles ship at 640px; the full-size 1280px file is only
       fetched when someone actually asks to see it, so browsing the
       page costs nine small images and nothing more.
       ============================================================ */
    (function lightbox() {
        var box = document.getElementById('lightbox');
        var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox]'));
        if (!box || !triggers.length) return;

        var img = box.querySelector('#lightbox-img');
        var caption = box.querySelector('#lightbox-caption');
        var current = 0;
        var lastFocus = null;

        function show(index) {
            current = (index + triggers.length) % triggers.length;
            var t = triggers[current];
            var tile = t.querySelector('img');
            img.src = t.dataset.lightbox;
            // Reuse the tile's alt: it already describes what is happening.
            img.alt = tile ? tile.alt : '';
            caption.textContent = t.dataset.lightboxCaption || '';
        }

        function open(index) {
            lastFocus = document.activeElement;
            show(index);
            box.hidden = false;
            document.body.classList.add('lightbox-open');
            box.querySelector('.lightbox-close').focus();
        }

        function close() {
            box.hidden = true;
            document.body.classList.remove('lightbox-open');
            img.removeAttribute('src');
            if (lastFocus) lastFocus.focus();
        }

        triggers.forEach(function (t, i) {
            t.addEventListener('click', function () { open(i); });
        });

        box.querySelector('.lightbox-close').addEventListener('click', close);
        box.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
        box.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });

        // Clicking the backdrop closes; clicking the photo itself does not.
        box.addEventListener('click', function (e) {
            if (e.target === box) close();
        });

        document.addEventListener('keydown', function (e) {
            if (box.hidden) return;
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowLeft') show(current - 1);
            else if (e.key === 'ArrowRight') show(current + 1);
        });
    })();

    /* ============================================================
       Map facade — [data-map-facade] with a data-map-src

       A Google Maps embed is roughly 800 KB and a third-party cookie.
       On a 2 GB monthly bundle that is not a cost to impose on someone
       who only came to read the phone number, so the iframe is built
       on click instead of on load.
       ============================================================ */
    document.querySelectorAll('[data-map-facade]').forEach(function (facade) {
        facade.addEventListener('click', function () {
            var iframe = document.createElement('iframe');
            iframe.src = facade.dataset.mapSrc;
            iframe.width = '100%';
            iframe.height = '450';
            iframe.loading = 'lazy';
            iframe.referrerPolicy = 'no-referrer-when-downgrade';
            iframe.setAttribute('allowfullscreen', '');
            iframe.style.border = '0';
            iframe.style.display = 'block';
            iframe.title = facade.dataset.mapTitle || 'Map';
            facade.replaceWith(iframe);
        });
    });

    /* ============================================================
       Footer year
       ============================================================ */
    document.querySelectorAll('[data-year]').forEach(function (el) {
        el.textContent = new Date().getFullYear();
    });
})();
