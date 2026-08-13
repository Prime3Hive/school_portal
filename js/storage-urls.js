// ============================================
// STORAGE URL RESOLVER
// ============================================
// Applicant documents are birth certificates and passport photographs of
// children, and payment receipts carry bank details. They were written to a
// PUBLIC storage bucket and the resulting permanent URLs were stored in the
// database, so anyone who ever saw a link — or guessed a path — kept access
// forever.
//
// This module makes every stored document link resolve through a short-lived
// signed URL at the moment it is used, so the bucket can be switched to private
// (migration 0015) without touching a single render site again.
//
// Two entry points, both declarative:
//
//   <a href="<stored url>" data-storage-link>…</a>
//        → intercepted on click, re-signed, opened in a new tab
//   <img data-storage-src="<stored url>">
//        → signed and swapped in shortly after render
//
// Signing works against public buckets too, so wiring this up is safe before
// the bucket is locked down. If signing fails for any reason the original URL
// is used, so a public bucket keeps working exactly as before.

(function () {
    'use strict';

    const BUCKET = 'documents';
    const SIGN_TTL_SECONDS = 300; // 5 minutes — long enough to open, short enough to not be shareable

    /**
     * Extract the in-bucket path from a stored value, which may be:
     *   - a public URL   .../storage/v1/object/public/documents/applications/X/y.pdf
     *   - a signed URL   .../storage/v1/object/sign/documents/applications/X/y.pdf?token=…
     *   - a bare path    applications/X/y.pdf
     * Returns null when the value does not belong to our documents bucket.
     */
    function toStoragePath(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;

        if (!/^https?:\/\//i.test(raw)) {
            // Bare path — strip a leading bucket segment if present.
            return raw.replace(new RegExp(`^/?${BUCKET}/`), '').replace(/^\/+/, '') || null;
        }

        let parsed;
        try {
            parsed = new URL(raw);
        } catch {
            return null;
        }

        const marker = `/storage/v1/object/`;
        const idx = parsed.pathname.indexOf(marker);
        if (idx === -1) return null;

        // .../object/{public|sign|authenticated}/{bucket}/{path}
        const rest = parsed.pathname.slice(idx + marker.length).split('/');
        const scope = rest.shift();               // public | sign | authenticated
        if (!scope) return null;
        const bucket = rest.shift();
        if (bucket !== BUCKET) return null;

        const path = rest.join('/');
        return path ? decodeURIComponent(path) : null;
    }

    /**
     * Mint a short-lived signed URL for a stored document reference.
     * Falls back to the original value if the bucket is public or signing fails.
     */
    async function signStorageUrl(value) {
        const original = String(value ?? '').trim();
        const path = toStoragePath(original);

        if (!path || !window.supabaseClient) return original;

        try {
            const { data, error } = await window.supabaseClient
                .storage
                .from(BUCKET)
                .createSignedUrl(path, SIGN_TTL_SECONDS);
            if (error || !data?.signedUrl) {
                if (error) console.warn('[StorageUrls] Could not sign', path, error.message);
                return original;
            }
            return data.signedUrl;
        } catch (err) {
            console.warn('[StorageUrls] Signing failed:', err?.message);
            return original;
        }
    }

    /** Only http(s) survives — a stored `javascript:` URL must never be opened. */
    function isSafeHttpUrl(value) {
        try {
            return ['http:', 'https:'].includes(new URL(String(value), window.location.origin).protocol);
        } catch {
            return false;
        }
    }

    /**
     * Swap signed URLs into any <img data-storage-src> under `root`.
     * Safe to call repeatedly — each element is only processed once.
     */
    async function hydrateStorageImages(root = document) {
        const images = root.querySelectorAll('img[data-storage-src]:not([data-storage-done])');
        await Promise.all(Array.from(images).map(async (img) => {
            img.setAttribute('data-storage-done', '1');
            const signed = await signStorageUrl(img.getAttribute('data-storage-src'));
            if (isSafeHttpUrl(signed)) img.src = signed;
        }));
    }

    // Click delegation for document links. The new tab is opened synchronously
    // so the browser attributes it to the user gesture; the signed URL is only
    // written into it once available. Without the pre-open, every popup blocker
    // would swallow the tab after the await.
    document.addEventListener('click', function (event) {
        const link = event.target.closest?.('a[data-storage-link]');
        if (!link) return;

        const stored = link.getAttribute('href');
        if (!stored || !toStoragePath(stored)) return; // not ours — let it behave normally

        event.preventDefault();
        event.stopPropagation();

        const tab = window.open('', '_blank', 'noopener,noreferrer');
        signStorageUrl(stored).then((signed) => {
            if (!isSafeHttpUrl(signed)) {
                if (tab) tab.close();
                return;
            }
            if (tab) {
                tab.location = signed;
            } else {
                // Popup blocked — fall back to same-tab navigation.
                window.location.href = signed;
            }
        }).catch(() => {
            if (tab) tab.close();
        });
    }, true);

    // Hydrate images whenever new markup appears. Modules render by assigning
    // innerHTML — including modals opened on demand — so there is no single
    // lifecycle hook to attach to; observing the DOM covers every render site
    // without each module having to remember to call in.
    let hydrateQueued = false;
    function queueHydrate() {
        if (hydrateQueued) return;
        hydrateQueued = true;
        // Coalesce the burst of mutations a single innerHTML assignment produces.
        setTimeout(() => {
            hydrateQueued = false;
            hydrateStorageImages();
        }, 0);
    }

    function startObserving() {
        hydrateStorageImages();
        if (!document.body) return;
        new MutationObserver((records) => {
            for (const record of records) {
                if (record.addedNodes.length) { queueHydrate(); return; }
            }
        }).observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }

    window.storageUrls = { toStoragePath, signStorageUrl, hydrateStorageImages, isSafeHttpUrl };
})();
