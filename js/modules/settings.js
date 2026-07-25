(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  let session = null;
  let settings = null;
  let drafts = [];
  let bound = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function setStatus(message, type = '') {
    const node = byId('settingsStatus');
    if (!node) return;
    node.textContent = String(message || '');
    node.className = `settings-status ${type}`.trim();
  }
  function applySettings(value) {
    settings = value || {};
    if (byId('settingMarksEntry')) byId('settingMarksEntry').checked = settings.marksEntryEnabled !== false;
    if (byId('settingPaperCreator')) byId('settingPaperCreator').checked = settings.creatorEnabled !== false;
    if (byId('settingPaperUpload')) byId('settingPaperUpload').checked = settings.uploadEnabled !== false;
    if (byId('settingPaperSubmission')) byId('settingPaperSubmission').checked = settings.submissionEnabled !== false;
    if (byId('settingEmergencyLock')) byId('settingEmergencyLock').checked = Boolean(settings.emergencyLock);
    if (byId('settingAdminNotice')) byId('settingAdminNotice').value = settings.adminNotice || '';
  }
  function renderDrafts() {
    const list = byId('adminDraftList');
    if (!list) return;
    if (byId('adminDraftCount')) byId('adminDraftCount').textContent = String(drafts.length);
    if (!drafts.length) {
      list.innerHTML = '<div class="empty-state success-empty"><strong>No saved drafts</strong>There are no teacher drafts requiring cleanup.</div>';
      return;
    }
    list.innerHTML = drafts.map((draft) => `<article class="admin-draft-item"><div><strong>${escapeHtml(draft.title || `${draft.className || ''} ${draft.subject || ''}`.trim() || 'Question Paper Draft')}</strong><span>${escapeHtml(draft.teacherId || '—')} · ${escapeHtml(draft.className || '—')} · ${escapeHtml(draft.subject || '—')} · ${escapeHtml(window.BGPS_DATA.safeDate(draft.updatedAt) || '—')}</span></div><button class="btn danger-outline compact" type="button" data-admin-delete-draft="${escapeHtml(draft.draftId)}">Delete Draft</button></article>`).join('');
  }
  async function load(showToast = false) {
    if (!session?.isAdmin) return;
    const refresh = byId('refreshSettingsButton');
    if (refresh) { refresh.disabled = true; refresh.textContent = 'Refreshing…'; }
    setStatus('Loading settings…');
    try {
      const [settingsResult, draftsResult] = await Promise.all([window.BGPS_API.getPaperSettings(), window.BGPS_API.listPaperDrafts()]);
      applySettings(settingsResult.settings || {});
      drafts = Array.isArray(draftsResult.drafts) ? draftsResult.drafts : [];
      renderDrafts();
      setStatus('Settings are up to date.', 'success');
      if (showToast) window.BGPS_APP.toast('Settings refreshed.');
    } catch (error) {
      setStatus(error.message || 'Could not load settings.', 'error');
      if (showToast) window.BGPS_APP.toast(error.message || 'Could not load settings.', 'error');
    } finally {
      if (refresh) { refresh.disabled = false; refresh.textContent = 'Refresh'; }
    }
  }
  async function save() {
    if (!session?.isAdmin) return;
    const button = byId('saveSettingsButton');
    const payload = {
      marksEntryEnabled: Boolean(byId('settingMarksEntry')?.checked),
      creatorEnabled: Boolean(byId('settingPaperCreator')?.checked),
      uploadEnabled: Boolean(byId('settingPaperUpload')?.checked),
      submissionEnabled: Boolean(byId('settingPaperSubmission')?.checked),
      emergencyLock: Boolean(byId('settingEmergencyLock')?.checked),
      adminNotice: String(byId('settingAdminNotice')?.value || '').trim()
    };
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    setStatus('Saving settings…');
    try {
      const result = await window.BGPS_API.updatePaperSettings(payload);
      applySettings(result.settings || payload);
      window.BGPS_STATE.setPaperSettings(result.settings || payload);
      await window.BGPS_MARKS.loadSettings();
      window.BGPS_DASHBOARD.refresh(false).catch(() => {});
      setStatus('Settings saved successfully.', 'success');
      window.BGPS_APP.toast('Administration settings saved.');
    } catch (error) {
      setStatus(error.message || 'Could not save settings.', 'error');
      window.BGPS_APP.toast(error.message || 'Could not save settings.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save Settings'; }
    }
  }
  async function deleteDraft(draftId) {
    const draft = drafts.find((item) => String(item.draftId) === String(draftId));
    const title = draft?.title || 'this draft';
    if (!window.confirm(`Delete ${title}? Submitted and approved papers will not be affected.`)) return;
    try {
      await window.BGPS_API.deletePaperDraft(draftId);
      drafts = drafts.filter((item) => String(item.draftId) !== String(draftId));
      renderDrafts();
      window.BGPS_APP.toast('Draft deleted.');
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not delete the draft.', 'error');
    }
  }
  function bind() {
    if (bound) return;
    bound = true;
    byId('refreshSettingsButton')?.addEventListener('click', () => load(true));
    byId('saveSettingsButton')?.addEventListener('click', save);
    byId('adminDraftList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-delete-draft]');
      if (button) deleteDraft(button.dataset.adminDeleteDraft);
    });
  }
  async function onAuthenticated(user) {
    session = user;
    bind();
    if (user.isAdmin) await load(false);
  }
  function onOpen() { if (session?.isAdmin) load(false); }
  function reset() { session = null; settings = null; drafts = []; setStatus(''); }
  window.BGPS_SETTINGS = Object.freeze({ onAuthenticated, onOpen, reset, load });
})();
