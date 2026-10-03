// ============================================
// HOME PAGE — behaviour for index.html
// ============================================
// The homepage has its own layout (css/home.css), so it does not load
// js/blog-navigation.js: that script binds to the shared .navbar, .card and
// [data-count] markup the other public pages use. This file covers what the
// homepage needs instead: the menu drawer, scroll state, scroll reveal,
// count-up figures, the FAQ, the photo lightbox and the footer year.
// ============================================

(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* --------------------------------------------------------------
       Menu drawer
       -------------------------------------------------------------- */
    (function drawer() {
        var toggle = document.getElementById('hpBurger');
        var panel = document.getElementById('hpDrawer');
        if (!toggle || !panel) return;

        function setOpen(open) {
            panel.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }

        toggle.addEventListener('click', function () { setOpen(panel.hidden); });
        panel.addEventListener('click', function (event) {
            if (event.target.closest('a')) setOpen(false);
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
        });
        window.matchMedia('(min-width: 1021px)').addEventListener('change', function (event) {
            if (event.matches) setOpen(false);
        });
    })();

    /* --------------------------------------------------------------
       Scroll state — nav shadow, mobile action bar, back to top
       -------------------------------------------------------------- */
    (function scrollState() {
        var nav = document.getElementById('hpNav');
        var bar = document.getElementById('hpMbar');
        var toTop = document.getElementById('hpTop');
        var ticking = false;

        function update() {
            var y = window.scrollY;
            if (nav) nav.classList.toggle('is-scrolled', y > 12);
            if (bar) bar.classList.toggle('is-shown', y > 480);
            if (toTop) toTop.classList.toggle('is-shown', y > 900);
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
        }, { passive: true });
        update();

        if (toTop) {
            toTop.addEventListener('click', function () {
                window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
            });
        }
    })();

    /* --------------------------------------------------------------
       Count-up figures — <span data-count="5000">5,000</span>
       The markup already holds the final value, so nothing is lost
       if this never runs.
       -------------------------------------------------------------- */
    function countUp(el) {
        var target = parseFloat(el.dataset.count) || 0;
        var start = null;
        var duration = 1400;

        function frame(now) {
            if (start === null) start = now;
            var p = Math.min((now - start) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased).toLocaleString('en-NG');
            if (p < 1) window.requestAnimationFrame(frame);
        }
        window.requestAnimationFrame(frame);
    }

    /* --------------------------------------------------------------
       Scroll reveal — [data-reveal], [data-reveal="left|right|zoom"]
       Only elements below the first screen are hidden, so the page
       is complete on first paint and without JavaScript.
       -------------------------------------------------------------- */
    (function reveal() {
        if (reduceMotion || !('IntersectionObserver' in window)) return;

        var items = document.querySelectorAll('[data-reveal]');
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                var wasHidden = el.classList.contains('is-pre');
                el.classList.remove('is-pre');
                if (wasHidden) el.querySelectorAll('[data-count]').forEach(countUp);
                window.setTimeout(function () { el.classList.add('is-done'); }, 1400);
                observer.unobserve(el);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

        var fold = window.innerHeight * 0.9;
        items.forEach(function (el) {
            if (el.getBoundingClientRect().top > fold) el.classList.add('is-pre');
            observer.observe(el);
        });
    })();

    /* --------------------------------------------------------------
       FAQ — one answer open at a time
       -------------------------------------------------------------- */
    (function faq() {
        var items = Array.prototype.slice.call(document.querySelectorAll('.hp-qa'));
        items.forEach(function (item) {
            var trigger = item.querySelector('.hp-qa-btn');
            trigger.addEventListener('click', function () {
                var willOpen = !item.classList.contains('is-open');
                items.forEach(function (other) {
                    other.classList.remove('is-open');
                    other.querySelector('.hp-qa-btn').setAttribute('aria-expanded', 'false');
                });
                if (willOpen) {
                    item.classList.add('is-open');
                    trigger.setAttribute('aria-expanded', 'true');
                }
            });
        });
    })();

    /* --------------------------------------------------------------
       Gallery lightbox — .hp-shot[data-full] + #hpLightbox
       -------------------------------------------------------------- */
    (function lightbox() {
        var box = document.getElementById('hpLightbox');
        var shots = Array.prototype.slice.call(document.querySelectorAll('.hp-shot[data-full]'));
        if (!box || !shots.length) return;

        var img = document.getElementById('hpLightboxImg');
        var caption = document.getElementById('hpLightboxCaption');
        var closeBtn = box.querySelector('.hp-lb-close');
        var current = 0;
        var opener = null;

        function show(index) {
            current = (index + shots.length) % shots.length;
            var shot = shots[current];
            img.src = shot.dataset.full;
            img.alt = shot.querySelector('img').alt;
            caption.textContent = shot.querySelector('.hp-shot-cap').textContent;
            // Restart the entrance animation for each photo.
            img.style.animation = 'none';
            void img.offsetHeight;
            img.style.animation = '';
        }

        function open(index) {
            opener = document.activeElement;
            show(index);
            box.hidden = false;
            document.body.style.overflow = 'hidden';
            closeBtn.focus();
        }

        function close() {
            box.hidden = true;
            document.body.style.overflow = '';
            if (opener) opener.focus();
        }

        shots.forEach(function (shot, i) {
            shot.addEventListener('click', function () { open(i); });
        });
        closeBtn.addEventListener('click', close);
        box.querySelector('.hp-lb-prev').addEventListener('click', function () { show(current - 1); });
        box.querySelector('.hp-lb-next').addEventListener('click', function () { show(current + 1); });
        box.addEventListener('click', function (event) {
            if (event.target === box) close();
        });
        document.addEventListener('keydown', function (event) {
            if (box.hidden) return;
            if (event.key === 'Escape') close();
            if (event.key === 'ArrowLeft') show(current - 1);
            if (event.key === 'ArrowRight') show(current + 1);
        });
    })();

    /* --------------------------------------------------------------
       Footer year
       -------------------------------------------------------------- */
    document.querySelectorAll('[data-year]').forEach(function (el) {
        el.textContent = new Date().getFullYear();
    });
})();
