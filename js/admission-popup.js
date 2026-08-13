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
       -------------------------------------------------------------- */
    function levelCard(level) {
        return `
            <li class="adm-level adm-accent-${esc(level.accent)}">
                <span class="adm-level-icon"><i class="fas ${esc(level.icon)}" aria-hidden="true"></i></span>
                <span class="adm-level-name">${esc(level.name)}</span>
                <span class="adm-level-classes">${esc(level.classes)}</span>
                <span class="adm-level-blurb">${esc(level.blurb)}</span>
            </li>`;
    }

    function phoneLink(phone) {
        return `<a href="tel:${esc(site.telHref(phone))}">${esc(phone)}</a>`;
    }

    function template() {
        const c = site.contact;

        return `
        <div class="adm-backdrop" data-adm-close></div>

        <div class="adm-dialog" role="dialog" aria-modal="true" aria-labelledby="admTitle" tabindex="-1">
            <button class="adm-close" type="button" data-adm-close aria-label="Close admission notice">
                <i class="fas fa-times" aria-hidden="true"></i>
            </button>

            <header class="adm-crest-band">
                <img src="${esc(site.crest)}" alt="" width="56" height="56">
                <div>
                    <p class="adm-school">${esc(site.name)}, ${esc(site.city)}</p>
                    <p class="adm-motto">${esc(site.motto)}</p>
                </div>
                <span class="adm-tagline">${esc(site.tagline)}</span>
            </header>

            <div class="adm-body">
                <h2 class="adm-headline" id="admTitle">
                    <span class="adm-headline-1">Admission</span>
                    <span class="adm-headline-2">In Progress</span>
                </h2>

                <p class="adm-into"><span>into</span></p>

                <ul class="adm-levels">
                    ${site.admissions.levels.map(levelCard).join('')}
                </ul>

                <div class="adm-purpose">
                    <div class="adm-purpose-block">
                        <h3><i class="fas fa-eye" aria-hidden="true"></i> Vision</h3>
                        <p>${esc(site.vision)}</p>
                    </div>
                    <div class="adm-purpose-block">
                        <h3><i class="fas fa-bullseye" aria-hidden="true"></i> Mission</h3>
                        <ul>
                            ${site.mission.map(m => `<li>${esc(m)}</li>`).join('')}
                        </ul>
                    </div>
                </div>

                <div class="adm-actions">
                    <a href="admissions.html" class="btn btn-accent">
                        <i class="fas fa-file-alt" aria-hidden="true"></i>
                        <span>Apply Online</span>
                    </a>
                    <a href="https://wa.me/${esc(c.whatsapp)}" target="_blank" rel="noopener" class="btn btn-secondary">
                        <i class="fab fa-whatsapp" aria-hidden="true"></i>
                        <span>Chat With Us</span>
                    </a>
                </div>
            </div>

            <div class="adm-contact">
                <div class="adm-contact-item">
                    <i class="fas fa-phone" aria-hidden="true"></i>
                    <div>
                        <span class="adm-contact-label">Call the office</span>
                        <span class="adm-contact-value">${c.phones.map(phoneLink).join('<span class="adm-sep">·</span>')}</span>
                    </div>
                </div>
                <div class="adm-contact-item">
                    <i class="fas fa-clock" aria-hidden="true"></i>
                    <div>
                        <span class="adm-contact-label">${esc(c.formsNote)}</span>
                        <span class="adm-contact-value">${esc(c.officeHours)}</span>
                    </div>
                </div>
                <div class="adm-contact-item">
                    <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
                    <div>
                        <span class="adm-contact-label">Visit us</span>
                        <span class="adm-contact-value">${esc(c.address)}</span>
                    </div>
                </div>
                <div class="adm-contact-item">
                    <i class="fas fa-envelope" aria-hidden="true"></i>
                    <div>
                        <span class="adm-contact-label">Email</span>
                        <span class="adm-contact-value">
                            <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>
                        </span>
                    </div>
                </div>
            </div>

            <p class="adm-quote">&ldquo;${esc(site.promise)}&rdquo;</p>
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
    if (document.querySelector('[data-admission-popup-auto]') && !isDismissed()) {
        window.setTimeout(open, AUTO_OPEN_DELAY);
    }
})();
