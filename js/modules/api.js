(function () {
  'use strict';

  class ApiError extends Error {
    constructor(message, code, cause) {
      super(message);
      this.name = 'ApiError';
      this.code = code || 'API_ERROR';
      if (cause) this.cause = cause;
    }
  }

  function config() {
    if (!window.BGPS_CONFIG || !window.BGPS_CONFIG.webAppUrl) {
      throw new ApiError('System configuration is unavailable.', 'CONFIG_MISSING');
    }
    return window.BGPS_CONFIG;
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new ApiError('The server returned an unreadable response.', 'INVALID_JSON', error);
    }
    if (!response.ok || data.ok === false) {
      throw new ApiError(data.error || `Request failed (${response.status}).`, 'BACKEND_REJECTED');
    }
    return data;
  }

  async function fetchWithTimeout(url, options, timeoutOverrideMs) {
    const timeoutMs = Number(timeoutOverrideMs || config().requestTimeoutMs || 25000);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ApiError('The server took too long to respond. Please try again.', 'TIMEOUT', error);
      }
      throw new ApiError('Unable to connect to the school system.', 'NETWORK_ERROR', error);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function send(payload, timeoutMs) {
    const response = await fetchWithTimeout(config().webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {}),
      cache: 'no-store',
      redirect: 'follow'
    }, timeoutMs);
    return parseJsonResponse(response);
  }

  async function health() {
    const response = await fetchWithTimeout(config().webAppUrl, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow'
    });
    return parseJsonResponse(response);
  }

  async function login(teacherId, pin) {
    return send({ action: 'login', teacherId, pin });
  }

  async function request(action, payload) {
    const session = window.BGPS_STATE.get().session;
    if (!session || !session.teacherId || !session.pin) {
      throw new ApiError('Your secure session has expired. Please sign in again.', 'NO_SESSION');
    }
    const paperTimeouts = {
      importDocxPaper: 120000,
      uploadPaper: 90000,
      getPaperDraftPreview: 90000,
      getPaperPreview: 90000,
      getBgpsStandardPreview: 120000,
      getPaperContent: 120000,
      saveBgpsStandardPreview: 120000,
      bulkDeleteApprovedOriginals: 120000,
      updatePaperContentAdmin: 120000,
      submitPaperDraft: 120000
    };
    return send({
      action,
      teacherId: session.teacherId,
      pin: session.pin,
      ...(payload || {})
    }, paperTimeouts[action]);
  }

  const getMarks = (filters) => request('getMarks', { filters: filters || {} });
  const saveMarks = (entries) => request('upsert', { entries });
  const getPaperSettings = () => request('getPaperSettings');
  const listPapers = () => request('listPapers');
  const getPaperContent = (paperId) => request('getPaperContent', { paperId });
  const getPaperFile = (paperId) => request('getPaperFile', { paperId });
  const getPaperOriginalFile = (paperId) => request('getPaperOriginalFile', { paperId });
  const getPaperPreview = (paperId) => request('getPaperPreview', { paperId });
  const getBgpsStandardPreview = (paperId) => request('getBgpsStandardPreview', { paperId });
  const saveBgpsStandardPreview = (paperId, editedContentHtml) => request('saveBgpsStandardPreview', { paperId, editedContentHtml: editedContentHtml || '' });
  const updatePaperContentAdmin = (paperId, paper) => request('updatePaperContentAdmin', { paperId, paper });
  const updatePaperStatus = (paperId, status, adminNote, options = {}) => request('updatePaperStatus', { paperId, status, adminNote: adminNote || '', deleteOriginalAfterApproval: options.deleteOriginalAfterApproval === true });
  const listPaperDrafts = () => request('listPaperDrafts');
  const getPaperDraft = (draftId) => request('getPaperDraft', { draftId });
  const getPaperDraftPreview = (draftId) => request('getPaperDraftPreview', { draftId });
  const savePaperDraft = (draft) => request('savePaperDraft', { draft });
  const deletePaperDraft = (draftId) => request('deletePaperDraft', { draftId });
  const submitPaperDraft = (draftId) => request('submitPaperDraft', { draftId });
  const deletePaper = (paperId) => request('deletePaper', { paperId });
  const bulkDeleteApprovedOriginals = () => request('bulkDeleteApprovedOriginals');
  const uploadPaper = (paper) => request('uploadPaper', { paper });
  const importDocxPaper = (paper) => request('importDocxPaper', { paper });
  const listPrincipalActivity = () => request('listPrincipalActivity');
  const updatePaperSettings = (settings) => request('updatePaperSettings', { settings });

  window.BGPS_API = Object.freeze({ health, login, request, getMarks, saveMarks, getPaperSettings, updatePaperSettings, listPapers, getPaperContent, getPaperFile, getPaperOriginalFile, getPaperPreview, getBgpsStandardPreview, saveBgpsStandardPreview, updatePaperContentAdmin, updatePaperStatus, listPaperDrafts, getPaperDraft, getPaperDraftPreview, savePaperDraft, deletePaperDraft, submitPaperDraft, deletePaper, bulkDeleteApprovedOriginals, uploadPaper, importDocxPaper, listPrincipalActivity, ApiError });
})();
