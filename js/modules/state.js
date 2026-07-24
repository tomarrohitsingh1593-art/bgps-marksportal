(function () {
  'use strict';

  const initial = () => ({
    session: null,
    backendOnline: false,
    currentView: 'home',
    paperSettings: null
  });

  let state = initial();
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({
      ...state,
      session: state.session ? Object.freeze({ ...state.session }) : null,
      paperSettings: state.paperSettings ? Object.freeze({ ...state.paperSettings }) : null
    });
  }

  function emit() {
    const value = snapshot();
    listeners.forEach((listener) => {
      try { listener(value); } catch (error) { console.error('State listener failed:', error); }
    });
  }

  function patch(next) {
    state = { ...state, ...(next || {}) };
    emit();
  }

  function get() { return snapshot(); }
  function setSession(session) { patch({ session: session ? { ...session } : null }); }
  function setBackendOnline(value) { patch({ backendOnline: Boolean(value) }); }
  function setCurrentView(value) { patch({ currentView: String(value || 'home') }); }
  function setPaperSettings(settings) { patch({ paperSettings: settings ? { ...settings } : null }); }
  function reset() { state = initial(); emit(); }
  function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

  window.BGPS_STATE = Object.freeze({ get, setSession, setBackendOnline, setCurrentView, setPaperSettings, reset, subscribe });
})();
