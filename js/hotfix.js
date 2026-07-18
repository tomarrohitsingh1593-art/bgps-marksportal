/* BGPS HOTFIX LAYER
   Small frontend fixes and enhancements live here so index.html/app.js stay stable.
*/
'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  let pendingOnly = false;
  let refreshQueued = false;

  function paperProgressIsComplete(row) {
    const strong = $('.tracking-papers strong', row);
    if (!strong) return false;
    const text = String(strong.textContent || '');
    const match = text.match(/(\d+)\s*\/\s*(\d+)\s*subjects/i);
    if (!match) return false;
    const done = Number(match[1]);
    const expected = Number(match[2]);
    const workflowPending = /review|correction/i.test(text);
    return expected > 0 && done >= expected && !workflowPending;
  }

  function marksProgressIsComplete(row) {
    const chip = $('.tracking-status .status-chip', row);
    return Boolean(chip && /^complete$/i.test(String(chip.textContent || '').trim()));
  }

  function applyPendingFilter() {
    const list = $('#classTrackingList');
    const button = $('#bgpsPendingOnlyToggle');
    if (!list || !button) return;

    const rows = $$('.tracking-row', list);
    let attentionCount = 0;
    rows.forEach((row) => {
      const fullyComplete = marksProgressIsComplete(row) && paperProgressIsComplete(row);
      if (!fullyComplete) attentionCount += 1;
      const shouldHide = pendingOnly && fullyComplete;
      if (row.hidden !== shouldHide) row.hidden = shouldHide;
    });

    const nextText = `Pending only (${attentionCount})`;
    if (button.textContent !== nextText) button.textContent = nextText;
    const nextPressed = pendingOnly ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== nextPressed) button.setAttribute('aria-pressed', nextPressed);
    button.classList.toggle('is-active', pendingOnly);
  }

  function installDashboardFocusControl() {
    const searchWrap = $('.tracking-head .table-search');
    if (!searchWrap || $('#bgpsPendingOnlyToggle')) return;

    const button = document.createElement('button');
    button.id = 'bgpsPendingOnlyToggle';
    button.type = 'button';
    button.className = 'bgps-pending-toggle';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Pending only';
    button.addEventListener('click', () => {
      pendingOnly = !pendingOnly;
      applyPendingFilter();
    });
    searchWrap.appendChild(button);
  }

  function injectStyles() {
    if ($('#bgpsHotfixStyles')) return;
    const style = document.createElement('style');
    style.id = 'bgpsHotfixStyles';
    style.textContent = `
      .tracking-head .table-search{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .bgps-pending-toggle{min-height:38px;padding:0 12px;border:1px solid #c8d7e8;border-radius:10px;background:#fff;color:#123d69;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}
      .bgps-pending-toggle:hover{background:#f4f8fc;border-color:#8fb0d2}
      .bgps-pending-toggle.is-active{background:#123d69;color:#fff;border-color:#123d69}
      #classTrackingList .tracking-row[hidden]{display:none!important}
      @media (max-width:720px){.tracking-head .table-search{width:100%}.tracking-head .table-search input{flex:1 1 180px}.bgps-pending-toggle{flex:0 0 auto}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    injectStyles();
    installDashboardFocusControl();
    applyPendingFilter();
  }

  // Observe only the class tracking list. Avoid observing the whole document because
  // this hotfix itself changes button text/attributes and can otherwise retrigger endlessly.
  function attachListObserver() {
    const list = $('#classTrackingList');
    if (!list || list.dataset.bgpsPendingObserver === '1') return;
    list.dataset.bgpsPendingObserver = '1';
    const observer = new MutationObserver(() => {
      if (refreshQueued) return;
      refreshQueued = true;
      requestAnimationFrame(() => {
        refreshQueued = false;
        applyPendingFilter();
      });
    });
    observer.observe(list, { childList: true, subtree: true });
  }

  function boot() {
    install();
    attachListObserver();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
