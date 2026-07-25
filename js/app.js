(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  let teacherStatusRefreshInFlight = false;
  let lastTeacherStatusRefresh = 0;

  const VIEW_COPY = Object.freeze({
    home: ['Overview', 'Academic work and pending actions'],
    marks: ['Marks Entry', 'Enter and update class-wise subject marks'],
    'teacher-report': ['Consolidated Report', 'Review class results and individual progress reports'],
    admin: ['Marks & Reports', 'Review class-wise marks progress'],
    papers: ['Paper Approval', 'Review submitted question papers'],
    'teacher-papers': ['Question Papers', 'Create, save and submit question papers'],
    settings: ['Settings', 'Control academic work and manage saved drafts']
  });

  function toast(message, type) {
    const region = byId('toastRegion');
    if (!region) return;
    const node = document.createElement('div');
    node.className = `toast${type === 'error' ? ' error' : ''}`;
    node.setAttribute('role', 'status');
    node.textContent = String(message || '');
    region.appendChild(node);
    window.setTimeout(() => node.remove(), 3400);
  }

  async function checkBackend() {
    try {
      const result = await window.BGPS_API.health();
      if (!result || result.ok !== true) throw new Error('Unexpected system response.');
      window.BGPS_STATE.setBackendOnline(true);
    } catch (error) {
      window.BGPS_STATE.setBackendOnline(false);
      console.warn('System check failed:', error);
    }
  }

  async function refreshTeacherLiveStatus(force) {
    const state = window.BGPS_STATE.get();
    const session = state.session;
    const view = state.currentView;
    if (!session || session.isAdmin || document.hidden || !['home', 'teacher-papers'].includes(view)) return;
    const now = Date.now();
    if (teacherStatusRefreshInFlight || (!force && now - lastTeacherStatusRefresh < 15000)) return;
    teacherStatusRefreshInFlight = true;
    lastTeacherStatusRefresh = now;
    try {
      if (view === 'teacher-papers') await window.BGPS_PAPER_CREATOR?.loadData(false);
      else await window.BGPS_MARKS?.refreshTeacherPaperStatus(false);
    } catch (error) {
      console.warn('Teacher paper status refresh failed:', error);
    } finally {
      teacherStatusRefreshInFlight = false;
    }
  }

  function openView(view) {
    const target = String(view || 'home');
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.dataset.viewSection === target));
    document.querySelectorAll('.nav-btn[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === target));
    const copy = VIEW_COPY[target] || VIEW_COPY.home;
    if (byId('pageHeading')) byId('pageHeading').textContent = copy[0];
    if (byId('pageSubtitle')) byId('pageSubtitle').textContent = copy[1];
    window.BGPS_STATE.setCurrentView(target);
    if (target === 'papers') window.BGPS_PAPERS?.render();
    if (target === 'teacher-report') window.BGPS_REPORTS?.onOpen();
    if (target === 'teacher-papers') window.BGPS_PAPER_CREATOR?.renderList();
    if (target === 'settings') window.BGPS_SETTINGS?.onOpen();
    if (target === 'home' || target === 'teacher-papers') window.setTimeout(() => refreshTeacherLiveStatus(true), 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setupNavigation() {
    document.querySelectorAll('.nav-btn[data-view], [data-open-view]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled || button.classList.contains('hidden')) return;
        openView(button.dataset.view || button.dataset.openView || 'home');
      });
    });
  }

  async function onAuthenticated(session) {
    await window.BGPS_MARKS.onAuthenticated(session);
    await window.BGPS_REPORTS.onAuthenticated(session);
    await window.BGPS_PAPERS.onAuthenticated(session);
    await window.BGPS_PAPER_CREATOR.onAuthenticated(session);
    await window.BGPS_DASHBOARD.onAuthenticated(session);
    await window.BGPS_SETTINGS.onAuthenticated(session);
    openView(session.paperOnly ? 'teacher-papers' : 'home');
  }

  function resetViews() {
    openView('home');
  }

  function init() {
    window.BGPS_AUTH.init();
    setupNavigation();
    checkBackend();
    window.addEventListener('focus', () => refreshTeacherLiveStatus(false));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshTeacherLiveStatus(false); });
    window.setInterval(() => refreshTeacherLiveStatus(false), 45000);
    const version = byId('buildVersion');
    if (version) version.textContent = window.BGPS_CONFIG.displayName;
  }

  window.BGPS_APP = Object.freeze({ init, toast, checkBackend, openView, onAuthenticated, resetViews });
  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
