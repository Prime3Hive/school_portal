// ============================================
// ADMISSION POPUP — public site
// ============================================
// Renders the "Admission in Progress" announcement as a modal, built from
// window.PUBLIC_SITE so the levels and contact details never drift from the
// rest of the site.
//
// Auto-opens once per campaign; the dismissal is remembered in localStorage
// under a key that includes PUBLIC_SITE.campaign, so changing the campaign
// shows it again. Any element with [data-admission-popup] re-opens it, and
// window.admissionPopup.open() is available for anything else.
//
// Requires: js/html-escape.js, js/public-site-config.js
// ============================================

(function () {
    'use strict';

    const site = window.PUBLIC_SITE;
    if (!site) return;

    const esc = window.escapeHtml || (v => String(v == null ? '' : v));
    const STORAGE_KEY = 'tbd:admission-popup:' + site.campaign;
    const AUTO_OPEN_DELAY = 1600;
    const PHONE_AUTO_OPEN_DELAY = 12000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let root = null;
    let dialog = null;
    let lastFocused = null;
    // Tracked separately from the .is-open class, which is only applied a
    // frame later so the open transition can run. Gating on the class would
    // make a close() in that first frame silently do nothing.
    let isOpen = false;

    /* --------------------------------------------------------------
       Dismissal memory — private-mode browsers throw on localStorage,
       so a failure just means the popup shows again next visit.
       -------------------------------------------------------------- */
    function isDismissed() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === 'dismissed';
        } catch (e) {
            return false;
        }
    }

    function remember() {
        try {
            window.localStorage.setItem(STORAGE_KEY, 'dismissed');
        } catch (e) {
            /* no-op */
        }
    }

    /* --------------------------------------------------------------
       Markup
       A short notice, not a brochure: what is open, for whom, and the
       two ways to act on it. Icons are inline SVG so the popup needs no
       icon font; its styles live in css/home.css (.adm-*).
       -------------------------------------------------------------- */
    const ICON = {
        close: '<path d="M6 6l12 12M18 6 6 18" stroke-linecap="round"/>',
        arrow: '<path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>',
        check: '<path d="m6.5 12.5 3.5 3.5 7.5-8" stroke-linecap="round" stroke-linejoin="round"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/>',
        wa: '<path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/>'
    };

    function icon(name) {
        return '<svg class="adm-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">' +
            ICON[name] + '</svg>';
    }

    function template() {
        const c = site.contact;
        const a = site.admissions;
        const waText = encodeURIComponent('Hello ' + site.name + ", I'd like to ask about admission for my child.");
        const levels = a.levels.map(level => `<li>${esc(level.classes)}</li>`).join('');

        return `
        <div class="adm-backdrop" data-adm-close></div>

        <div class="adm-dialog" role="dialog" aria-modal="true" aria-labelledby="admTitle" aria-describedby="admLead" tabindex="-1">
            <span class="adm-handle" aria-hidden="true"></span>

            <div class="adm-photo">
                <picture>
                    <source srcset="assets/gallery/morning-assembly-640.webp" type="image/webp">
                    <img src="assets/gallery/morning-assembly-640.jpg" alt="" width="640" height="480">
                </picture>
                <div class="adm-photo-bar">
                    <span class="adm-brand"><img src="${esc(site.crest)}" alt="" width="28" height="31">${esc(site.name)}</span>
                    <span class="adm-session"><span class="adm-live"></span>${esc(a.session)} session</span>
                </div>
            </div>

            <button class="adm-close" type="button" data-adm-close aria-label="Close admission notice">${icon('close')}</button>

            <div class="adm-body">
                <p class="adm-kicker">${esc(a.status)}</p>
                <h2 class="adm-title" id="admTitle">Places are open for ${esc(a.session)}</h2>
                <p class="adm-lead" id="admLead">We are admitting into every class from Creche to JSS 3. Classes are kept small, so places in each one are limited.</p>

                <ul class="adm-levels" aria-label="Classes open for admission">${levels}</ul>

                <ul class="adm-points">
                    <li>${icon('check')}<span>Apply online from your phone</span></li>
                    <li>${icon('check')}<span>&#8358;5,000 application fee, paid online</span></li>
                    <li>${icon('check')}<span>We call you to arrange an assessment and a visit</span></li>
                </ul>

                <div class="adm-actions">
                    <a href="admissions.html" class="adm-btn adm-btn-primary" data-cta="apply">Apply online ${icon('arrow')}</a>
                    <a href="https://wa.me/${esc(c.whatsapp)}?text=${waText}" target="_blank" rel="noopener" class="adm-btn adm-btn-wa" data-cta="whatsapp">${icon('wa')}Ask on WhatsApp</a>
                </div>

                <p class="adm-foot">${icon('clock')}<span>${esc(c.formsNote)}, ${esc(c.officeHours)}, Monday to Friday.</span></p>
                <button class="adm-later" type="button" data-adm-close>Not now</button>
            </div>
        </div>`;
    }

    /* --------------------------------------------------------------
       Build / open / close
       -------------------------------------------------------------- */
    function build() {
        if (root) return;

        root = document.createElement('div');
        root.className = 'adm-modal';
        root.hidden = true;
        root.innerHTML = template();
        document.body.appendChild(root);

        dialog = root.querySelector('.adm-dialog');

        root.addEventListener('click', function (event) {
            if (event.target.closest('[data-adm-close]')) close();
        });

        // Following a link out of the modal counts as answering it.
        dialog.addEventListener('click', function (event) {
            if (event.target.closest('a[href]')) remember();
        });

        enableSwipeToClose();
    }

    // On a phone the notice is a bottom sheet, and people expect to pull a
    // sheet down to dismiss it. Only starts when the sheet is scrolled to its
    // top, so it never fights the sheet's own scrolling.
    function enableSwipeToClose() {
        let startY = null;
        let dy = 0;

        dialog.addEventListener('touchstart', function (event) {
            if (!window.matchMedia('(max-width: 559px)').matches || dialog.scrollTop > 0) return;
            startY = event.touches[0].clientY;
            dy = 0;
        }, { passive: true });

        dialog.addEventListener('touchmove', function (event) {
            if (startY === null) return;
            dy = Math.max(0, event.touches[0].clientY - startY);
            if (dy > 0) {
                dialog.style.transition = 'none';
                dialog.style.transform = 'translateY(' + dy + 'px)';
            }
        }, { passive: true });

        dialog.addEventListener('touchend', function () {
            if (startY === null) return;
            startY = null;
            dialog.style.transition = '';
            dialog.style.transform = '';
            if (dy > 110) close();
        });
    }

    function focusables() {
        return Array.prototype.filter.call(
            dialog.querySelectorAll('a[href], button:not([disabled])'),
            el => el.offsetParent !== null
        );
    }

    function onKeydown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }

        if (event.key !== 'Tab') return;

        // Keep tabbing inside the dialog while it is open.
        const items = focusables();
        if (!items.length) return;

        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && (active === first || active === dialog)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function open() {
        build();
        if (isOpen) return;
        isOpen = true;

        lastFocused = document.activeElement;
        root.hidden = false;

        // Let the browser paint the hidden state before transitioning in.
        window.requestAnimationFrame(function () {
            if (isOpen) root.classList.add('is-open');
        });

        document.body.classList.add('modal-open');
        document.addEventListener('keydown', onKeydown);
        dialog.focus({ preventScroll: true });
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;

        remember();
        root.classList.remove('is-open');
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', onKeydown);

        // Wait for the exit transition, unless it was re-opened meanwhile.
        const finish = function () { if (!isOpen) root.hidden = true; };
        if (reduceMotion) {
            finish();
        } else {
            window.setTimeout(finish, 300);
        }

        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus({ preventScroll: true });
        }
    }

    /* --------------------------------------------------------------
       Wiring
       -------------------------------------------------------------- */
    document.addEventListener('click', function (event) {
        const trigger = event.target.closest('[data-admission-popup]');
        if (!trigger) return;
        event.preventDefault();
        open();
    });

    window.admissionPopup = { open: open, close: close, isDismissed: isDismissed };

    // Auto-open only where the page asks for it, and only once per campaign.
    // Wait for the load event first, so the notice never competes with the
    // page's own first paint. On a phone the popup fills the screen, so give the visitor
    // time with the page before it appears, and never open it over the menu
    // or the photo viewer.
    if (document.querySelector('[data-admission-popup-auto]') && !isDismissed()) {
        const isPhone = window.matchMedia('(max-width: 759px)').matches;
        const delay = isPhone ? PHONE_AUTO_OPEN_DELAY : AUTO_OPEN_DELAY;
        const busy = function () {
            return document.documentElement.classList.contains('hp-locked') ||
                document.body.style.overflow === 'hidden';
        };
        const attempt = function () {
            if (isDismissed() || isOpen) return;
            if (busy()) { window.setTimeout(attempt, 4000); return; }
            open();
        };
        const schedule = function () { window.setTimeout(attempt, delay); };
        if (document.readyState === 'complete') schedule();
        else window.addEventListener('load', schedule, { once: true });
    }
})();
