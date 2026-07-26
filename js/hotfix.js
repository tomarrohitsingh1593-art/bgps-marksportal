/* BGPS V13.2.2
   Minimal uploaded-PDF Review & Approve drawer hotfix.
   No backend, teacher editor, upload, paste or approval logic is modified.
*/
'use strict';

(() => {
  const IDS = Object.freeze({
    modal: 'paperReviewModal',
    preview: 'paperPreviewArea',
    trigger: 'bgpsPdfReviewTrigger'
  });

  let observer = null;
  let syncTimer = 0;

  const byId = (id) => document.getElementById(id);

  function modalIsOpen(modal) {
    return Boolean(
      modal &&
      (
        modal.classList.contains('open') ||
        modal.getAttribute('aria-hidden') === 'false'
      )
    );
  }

  function isExactFilePreview(previewArea) {
    if (!previewArea) return false;

    const hasFileViewer = Boolean(
      previewArea.querySelector(
        'iframe, embed[type="application/pdf"], object[type="application/pdf"]'
      )
    );

    const hasProfessionalA4 = Boolean(
      previewArea.querySelector('.bgps-a4-document, .bgps-a4-page')
    );

    return hasFileViewer && !hasProfessionalA4;
  }

  function findOfficialTrigger(modal) {
    return Array.from(modal.querySelectorAll('button')).find((button) => {
      if (button.id === IDS.trigger) return false;

      const label = [
        button.textContent || '',
        button.getAttribute('aria-label') || '',
        button.title || ''
      ].join(' ').toLowerCase();

      return label.includes('review & approve');
    }) || null;
  }

  function findReviewDrawer(modal) {
    const action = modal.querySelector(
      '#paperReviewNote, #approvePaperButton, #returnPaperButton'
    );

    if (!action) return null;

    return action.closest(
      [
        '[data-review-drawer]',
        '.paper-review-drawer',
        '.review-decision-drawer',
        '.paper-review-panel',
        'aside'
      ].join(',')
    );
  }

  function setFallbackDrawerOpen(modal, shouldOpen) {
    const drawer = findReviewDrawer(modal);
    if (!drawer) return false;

    modal.classList.toggle('bgps-pdf-force-drawer', shouldOpen);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
    drawer.classList.toggle('open', shouldOpen);
    drawer.classList.toggle('is-open', shouldOpen);
    drawer.classList.toggle('active', shouldOpen);

    const trigger = byId(IDS.trigger);
    if (trigger) {
      trigger.setAttribute('aria-expanded', String(shouldOpen));
      trigger.textContent = shouldOpen
        ? 'Close Review'
        : 'Review & Approve';
    }

    return true;
  }

  function openReviewActions() {
    const modal = byId(IDS.modal);
    if (!modal) return;

    /*
     * First preference:
     * Proxy the portal's own Review & Approve button so the official
     * V13.2 drawer state and event handler remain the source of truth.
     */
    const officialTrigger = findOfficialTrigger(modal);

    if (officialTrigger) {
      officialTrigger.click();
      return;
    }

    /*
     * Safe fallback for exact-PDF branch where the standard toolbar
     * was not mounted but the already-bound action drawer still exists.
     */
    const currentlyOpen = modal.classList.contains('bgps-pdf-force-drawer');

    if (!setFallbackDrawerOpen(modal, !currentlyOpen)) {
      window.BGPS_APP?.toast(
        'Review actions could not be opened. Refresh once and retry.',
        'error'
      );
    }
  }

  function ensureTrigger(modal) {
    let trigger = byId(IDS.trigger);

    if (trigger) return trigger;

    trigger = document.createElement('button');
    trigger.id = IDS.trigger;
    trigger.type = 'button';
    trigger.className = 'btn primary bgps-pdf-review-trigger';
    trigger.textContent = 'Review & Approve';
    trigger.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'paperReviewNote');
    trigger.addEventListener('click', openReviewActions);

    const header =
      modal.querySelector('.paper-review-header') ||
      modal.firstElementChild ||
      modal;

    header.appendChild(trigger);
    return trigger;
  }

  function syncPdfReviewTrigger() {
    const modal = byId(IDS.modal);
    const previewArea = byId(IDS.preview);
    const trigger = modal ? ensureTrigger(modal) : null;

    const shouldShow = Boolean(
      trigger &&
      modalIsOpen(modal) &&
      isExactFilePreview(previewArea)
    );

    if (trigger) trigger.hidden = !shouldShow;

    if (!shouldShow && modal) {
      setFallbackDrawerOpen(modal, false);
    }
  }

  function queueSync() {
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncPdfReviewTrigger, 50);
  }

  function addStyles() {
    if (byId('bgpsPdfReviewHotfixStyle')) return;

    const style = document.createElement('style');
    style.id = 'bgpsPdfReviewHotfixStyle';
    style.textContent = `
      #${IDS.trigger} {
        position: fixed;
        top: 27px;
        right: 76px;
        z-index: 15020;
        width: auto;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 11px;
        box-shadow: 0 8px 22px rgba(8, 38, 67, 0.18);
      }

      #paperReviewModal.bgps-pdf-force-drawer
      [data-review-drawer],
      #paperReviewModal.bgps-pdf-force-drawer
      .paper-review-drawer,
      #paperReviewModal.bgps-pdf-force-drawer
      .review-decision-drawer,
      #paperReviewModal.bgps-pdf-force-drawer
      .paper-review-panel {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        transform: translateX(0) !important;
        z-index: 15010 !important;
      }

      @media (max-width: 700px) {
        #${IDS.trigger} {
          top: auto;
          right: 14px;
          bottom: calc(18px + env(safe-area-inset-bottom));
          max-width: calc(100vw - 28px);
          box-shadow: 0 10px 28px rgba(8, 38, 67, 0.34);
        }

        #paperReviewModal.bgps-pdf-force-drawer
        .paper-review-panel {
          width: 100% !important;
          max-width: 100% !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function initialise() {
    addStyles();

    const modal = byId(IDS.modal);
    if (!modal) return;

    /*
     * Do not create duplicate observers if hotfix.js is evaluated again
     * by a cached page or development refresh.
     */
    if (!observer) {
      observer = new MutationObserver(queueSync);
      observer.observe(modal, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden', 'src']
      });
    }

    modal.addEventListener('click', (event) => {
      if (!modal.classList.contains('bgps-pdf-force-drawer')) return;

      const drawer = findReviewDrawer(modal);
      const closeButton = event.target.closest(
        [
          '[data-close-review-drawer]',
          '.review-drawer-close',
          '.drawer-close',
          'button[aria-label*="close" i]'
        ].join(',')
      );

      if (drawer && closeButton && drawer.contains(closeButton)) {
        setFallbackDrawerOpen(modal, false);
      }
    });

    syncPdfReviewTrigger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
