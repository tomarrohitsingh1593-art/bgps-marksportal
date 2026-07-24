(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);

  function normalizeId(value) {
    return String(value || '').trim().toUpperCase();
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function setError(message) {
    const node = byId('loginError');
    if (node) node.textContent = String(message || '');
  }

  function setBusy(busy) {
    const button = byId('loginButton');
    if (!button) return;
    button.disabled = Boolean(busy);
    button.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  function renderAuthenticatedShell(user) {
    byId('loginScreen')?.classList.add('hidden');
    byId('appShell')?.classList.remove('hidden');

    const role = user.isAdmin ? 'Principal / Admin' : (user.paperOnly ? 'Subject Teacher · Papers' : 'Teacher');
    setText('userId', user.teacherId);
    setText('userRole', role);
    setText('userAvatar', user.isAdmin ? 'A' : (user.paperOnly ? 'S' : 'T'));

    const marksNav = byId('marksNav');
    const teacherReportNav = byId('teacherReportNav');
    const teacherPapersNav = byId('teacherPapersNav');
    const adminNav = byId('adminNav');
    const papersNav = byId('papersNav');
    const settingsNav = byId('settingsNav');
    const homeNav = document.querySelector('.nav-btn[data-view="home"]');
    if (homeNav) homeNav.classList.toggle('hidden', Boolean(user.paperOnly));
    if (marksNav) marksNav.classList.toggle('hidden', Boolean(user.isAdmin || user.paperOnly));
    if (teacherReportNav) teacherReportNav.classList.toggle('hidden', Boolean(user.isAdmin || user.paperOnly));
    if (teacherPapersNav) teacherPapersNav.classList.toggle('hidden', Boolean(user.isAdmin));
    if (adminNav) adminNav.classList.toggle('hidden', !user.isAdmin);
    if (papersNav) papersNav.classList.toggle('hidden', !user.isAdmin);
    if (settingsNav) settingsNav.classList.toggle('hidden', !user.isAdmin);

    const teacherHome = byId('teacherHomeContent');
    const adminHome = byId('adminHomeContent');
    if (teacherHome) teacherHome.hidden = Boolean(user.isAdmin);
    if (adminHome) adminHome.hidden = !user.isAdmin;

    document.title = `BG Public School | ${user.isAdmin ? 'Principal Dashboard' : (user.paperOnly ? 'Subject Teacher Papers' : 'Teacher Workspace')}`;
  }

  async function signIn(event) {
    event.preventDefault();
    const idInput = byId('teacherId');
    const passwordInput = byId('pin');
    const teacherId = normalizeId(idInput?.value);
    const password = String(passwordInput?.value || '');

    setError('');
    if (!teacherId || !password) {
      setError('Enter Teacher ID and password.');
      return;
    }

    setBusy(true);
    try {
      const result = await window.BGPS_API.login(teacherId, password);
      const user = result?.user;
      if (!user?.teacherId) throw new Error('User details were not returned by the school system.');

      const session = {
        teacherId: normalizeId(user.teacherId),
        pin: password,
        isAdmin: Boolean(user.isAdmin),
        paperOnly: Boolean(user.paperOnly),
        assignedClass: String(user.assignedClass || '')
      };
      window.BGPS_STATE.setSession(session);
      renderAuthenticatedShell(session);
      if (passwordInput) passwordInput.value = '';
      await window.BGPS_APP.onAuthenticated(session);
      window.BGPS_APP.toast('Sign-in successful.');
    } catch (error) {
      setError(error?.message || 'Unable to sign in.');
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.BGPS_MARKS?.reset();
    window.BGPS_REPORTS?.reset();
    window.BGPS_DASHBOARD?.reset();
    window.BGPS_PAPERS?.reset();
    window.BGPS_PAPER_CREATOR?.reset();
    window.BGPS_SETTINGS?.reset();
    window.BGPS_STATE.reset();
    window.BGPS_APP.resetViews();
    byId('appShell')?.classList.add('hidden');
    byId('loginScreen')?.classList.remove('hidden');
    byId('loginForm')?.reset();
    setError('');
    document.title = 'BG Public School | Academic Portal';
    byId('teacherId')?.focus();
  }

  function togglePassword() {
    const input = byId('pin');
    const button = byId('pinToggle');
    if (!input || !button) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Show' : 'Hide';
    button.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  }

  function init() {
    byId('loginForm')?.addEventListener('submit', signIn);
    byId('pinToggle')?.addEventListener('click', togglePassword);
    document.querySelectorAll('[data-action="logout"]').forEach((button) => button.addEventListener('click', logout));
  }

  window.BGPS_AUTH = Object.freeze({ init, logout });
})();
