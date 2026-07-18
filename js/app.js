window.BGPS_CONFIG = Object.freeze({
  appName: 'BG Public School',
  displayName: 'Academic Operations Portal',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbynrPG0HfLISVBMuGg1SRjnnwqpXwWm-yx_hcPo2CsmNdH9vOk4TKe3GKEvANdmsskq/exec',
  requestTimeoutMs: 25000,
  rollCount: 50
});


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
  const getPaperPreview = (paperId) => request('getPaperPreview', { paperId });
  const updatePaperContentAdmin = (paperId, paper) => request('updatePaperContentAdmin', { paperId, paper });
  const updatePaperStatus = (paperId, status, adminNote) => request('updatePaperStatus', { paperId, status, adminNote: adminNote || '' });
  const listPaperDrafts = () => request('listPaperDrafts');
  const getPaperDraft = (draftId) => request('getPaperDraft', { draftId });
  const getPaperDraftPreview = (draftId) => request('getPaperDraftPreview', { draftId });
  const savePaperDraft = (draft) => request('savePaperDraft', { draft });
  const deletePaperDraft = (draftId) => request('deletePaperDraft', { draftId });
  const submitPaperDraft = (draftId) => request('submitPaperDraft', { draftId });
  const deletePaper = (paperId) => request('deletePaper', { paperId });
  const uploadPaper = (paper) => request('uploadPaper', { paper });
  const importDocxPaper = (paper) => request('importDocxPaper', { paper });
  const listPrincipalActivity = () => request('listPrincipalActivity');
  const updatePaperSettings = (settings) => request('updatePaperSettings', { settings });

  window.BGPS_API = Object.freeze({ health, login, request, getMarks, saveMarks, getPaperSettings, updatePaperSettings, listPapers, getPaperContent, getPaperFile, getPaperPreview, updatePaperContentAdmin, updatePaperStatus, listPaperDrafts, getPaperDraft, getPaperDraftPreview, savePaperDraft, deletePaperDraft, submitPaperDraft, deletePaper, uploadPaper, importDocxPaper, listPrincipalActivity, ApiError });
})();


(function () {
  'use strict';

  const PDFJS_VERSION = '5.7.284';
  const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/`;
  const MAX_INLINE_PAGES = 40;
  let pdfJsPromise = null;

  function shouldUseCanvas() {
    return window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
  }

  function loadPdfJs() {
    if (!pdfJsPromise) {
      pdfJsPromise = import(`${PDFJS_BASE}legacy/build/pdf.mjs`).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}legacy/build/pdf.worker.mjs`;
        return pdfjs;
      }).catch((error) => {
        pdfJsPromise = null;
        throw error;
      });
    }
    return pdfJsPromise;
  }

  function statusNode(message) {
    const node = document.createElement('div');
    node.className = 'mobile-pdf-status';
    node.setAttribute('role', 'status');
    node.textContent = message;
    return node;
  }

  async function render(blob, container) {
    if (!(blob instanceof Blob) || !container) throw new Error('The PDF preview data is unavailable.');
    const host = document.createElement('div');
    host.className = 'mobile-pdf-preview';
    const progress = statusNode('Preparing PDF preview…');
    host.appendChild(progress);
    container.replaceChildren(host);

    const pdfjs = await loadPdfJs();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${PDFJS_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_BASE}standard_fonts/`,
      wasmUrl: `${PDFJS_BASE}wasm/`
    });
    const pdf = await loadingTask.promise;
    const pageCount = Math.min(pdf.numPages, MAX_INLINE_PAGES);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      progress.textContent = `Opening page ${pageNumber} of ${pdf.numPages}…`;
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(280, Math.min(794, (container.clientWidth || window.innerWidth) - 18));
      const cssScale = availableWidth / baseViewport.width;
      const outputScale = Math.min(Number(window.devicePixelRatio || 1), 1.6);
      const renderViewport = page.getViewport({ scale: cssScale * outputScale });
      const wrapper = document.createElement('section');
      wrapper.className = 'mobile-pdf-page';
      wrapper.setAttribute('aria-label', `PDF page ${pageNumber} of ${pdf.numPages}`);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
      wrapper.appendChild(canvas);
      const label = document.createElement('div');
      label.className = 'mobile-pdf-page-label';
      label.textContent = `Page ${pageNumber} of ${pdf.numPages}`;
      wrapper.appendChild(label);
      host.appendChild(wrapper);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('This browser could not prepare the PDF canvas.');
      await page.render({ canvasContext: context, viewport: renderViewport }).promise;
      page.cleanup();
    }

    if (pdf.numPages > MAX_INLINE_PAGES) {
      progress.textContent = `First ${MAX_INLINE_PAGES} of ${pdf.numPages} pages shown. Use Open PDF for the remaining pages.`;
    } else {
      progress.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} ready`;
      window.setTimeout(() => progress.remove(), 1200);
    }
    return { pageCount: pdf.numPages };
  }

  window.BGPS_PDF_PREVIEW = Object.freeze({ shouldUseCanvas, render });
})();


(function () {
  'use strict';

  const CLASSES = Object.freeze([
    'Playgroup', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'
  ]);

  const EXAMS = Object.freeze(['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Unit Test 3', 'Annual Exam']);
  const COMPONENTS = Object.freeze(['Written', 'Oral', 'Practical']);

  const TEACHER_BY_CLASS = Object.freeze({
    'Playgroup': 'T-1', 'LKG': 'T-2', 'UKG': 'T-3', 'Class 1': 'T-4', 'Class 2': 'T-5',
    'Class 3': 'T-6', 'Class 4': 'T-7', 'Class 5': 'T-8', 'Class 6': 'T-9', 'Class 7': 'T-10',
    'Class 8': 'T-11', 'Class 9': 'T-12', 'Class 10': 'T-13', 'Class 11': 'T-14', 'Class 12': 'T-15'
  });

  const SUBJECTS_BY_CLASS = Object.freeze({
    'Playgroup': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'LKG': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'UKG': Object.freeze(['English', 'Hindi', 'Maths', 'EVS', 'GK/Moral Science']),
    'Class 1': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 2': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 3': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 4': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 5': Object.freeze(['English', 'Hindi', 'Maths', 'SST', 'Science', 'GK/Moral Science', 'Computer']),
    'Class 6': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 7': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 8': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 9': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 10': Object.freeze(['English Language', 'English Literature', 'Hindi', 'Maths', 'Geography', 'History/Civics', 'Physics', 'Chemistry', 'Biology', 'Computer']),
    'Class 11': Object.freeze(['English', 'Physics', 'Chemistry', 'Biology', 'Maths', 'Account', 'Business', 'Economics', 'Computer']),
    'Class 12': Object.freeze(['English', 'Physics', 'Chemistry', 'Biology', 'Maths', 'Account', 'Business', 'Economics', 'Computer'])
  });
  const SUBJECT_SORT_ORDER = Object.freeze(['English','English Language','English Literature','Hindi','Maths','EVS','SST','Science','Geography','History/Civics','Physics','Chemistry','Biology','GK/Moral Science','Computer','Account','Business','Economics']);
  let observedMarksRows = [];

  function unique(values) {
    return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
  }

  function setObservedMarksRows(rows) {
    observedMarksRows = Array.isArray(rows) ? rows.slice() : [];
  }

  function displaySubjectName(value) {
    const key = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const aliases = {
      'ENGLISH LANGUAGE':'English Language','ENGLISH LITERATURE':'English Literature','ENGLISH':'English',
      'HINDI':'Hindi','MATH':'Maths','MATHEMATICS':'Maths','MATHS':'Maths','EVS':'EVS','SST':'SST',
      'SOCIAL STUDIES':'SST','SOCIAL SCIENCE':'SST','SCIENCE':'Science','GENERAL SCIENCE':'Science',
      'GEOGRAPHY':'Geography','HISTORY/CIVICS':'History/Civics','HISTORY AND CIVICS':'History/Civics',
      'PHYSICS':'Physics','CHEMISTRY':'Chemistry','BIOLOGY':'Biology','COMPUTER':'Computer','COMPUTER SCIENCE':'Computer',
      'GK/MORAL SCIENCE':'GK/Moral Science','GK/MSC':'GK/Moral Science','MORAL SCIENCE':'GK/Moral Science',
      'ACCOUNT':'Account','ACCOUNTS':'Account','ACCOUNTANCY':'Account','BUSINESS':'Business','BUSINESS STUDIES':'Business','ECONOMICS':'Economics'
    };
    return aliases[key] || String(value || '').trim();
  }

  function observedSubjectsForClass(className, referenceExam = 'Unit Test 1') {
    const classKey = String(className || '').trim().toUpperCase();
    const examKey = String(referenceExam || '').trim().toUpperCase();
    const values = observedMarksRows
      .filter((row) => String(row.className || '').trim().toUpperCase() === classKey && String(row.examType || '').trim().toUpperCase() === examKey)
      .map((row) => displaySubjectName(row.subject))
      .filter(Boolean);
    const uniqueValues = unique(values);
    return uniqueValues.sort((a,b) => {
      const ai = SUBJECT_SORT_ORDER.indexOf(a); const bi = SUBJECT_SORT_ORDER.indexOf(b);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.localeCompare(b);
    });
  }

  function subjectsForClass(className) {
    const name = String(className || '').trim();
    const observed = observedSubjectsForClass(name, 'Unit Test 1');
    if (observed.length) return observed;
    return [...(SUBJECTS_BY_CLASS[name] || SUBJECT_SORT_ORDER)];
  }

  function normalizeSubjectForStorage(subject, className) {
    let value = String(subject || 'UNKNOWN').toUpperCase().trim().replace(/\s+/g, ' ');
    if (!/^Class\s[1-5]$/.test(String(className || '').trim())) return value;

    if (['ENGLISH LANGUAGE', 'ENGLISH LITERATURE'].includes(value)) return 'ENGLISH';
    if (['MATHEMATICS', 'MATH'].includes(value)) return 'MATHS';
    if ([
      'EVS', 'EVS/SOCIAL', 'EVS / SOCIAL', 'EVS & SOCIAL', 'EVS AND SOCIAL', 'SOCIAL',
      'SOCIAL STUDIES', 'SOCIAL STUDY', 'SOCIAL SCIENCE', 'SST', 'S.ST', 'S.ST.', 'S.STUDIES'
    ].includes(value)) return 'SST';
    if (['GENERAL SCIENCE', 'BASIC SCIENCE', 'SCIENCES'].includes(value)) return 'SCIENCE';
    if ([
      'GK', 'G.K', 'G.K.', 'GENERAL KNOWLEDGE', 'GK/MSC', 'GK / MSC', 'GK-MSC', 'GK & MSC',
      'GK/MORAL SCIENCE', 'GK / MORAL SCIENCE', 'MORAL SCIENCE', 'MORAL SCIENCE/GK', 'MSC', 'M.SC'
    ].includes(value)) return 'GK/MORAL SCIENCE';
    return value;
  }

  function teacherForClass(className) {
    return TEACHER_BY_CLASS[String(className || '').trim()] || '';
  }

  function normalizeRoll(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    const number = Number(raw);
    return Number.isFinite(number) ? String(number) : raw;
  }

  function isAbsent(value) {
    return ['AB', 'ABSENT', 'A'].includes(String(value == null ? '' : value).trim().toUpperCase());
  }

  function safeDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  window.BGPS_DATA = Object.freeze({ CLASSES, EXAMS, COMPONENTS, TEACHER_BY_CLASS, teacherForClass, subjectsForClass, observedSubjectsForClass, setObservedMarksRows, displaySubjectName, normalizeSubjectForStorage, normalizeRoll, isAbsent, safeDate });
})();


(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const ROLL_COUNT = Number(window.BGPS_CONFIG.rollCount || 50);

  let session = null;
  let settings = null;
  let entryDirty = false;
  let loadedContextKey = '';
  let termOverviewRows = [];
  let termOverviewPapers = [];
  let selectedOverviewTerm = '';
  let stableContext = null;
  let adminRows = [];
  let adminSummary = [];

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function setStatus(message, type) {
    const node = byId('marksStatus');
    if (!node) return;
    node.className = `inline-status${type ? ` ${type}` : ''}`;
    node.textContent = String(message || '');
  }

  function optionMarkup(values, placeholder) {
    const first = placeholder == null ? '' : `<option value="">${placeholder}</option>`;
    return first + (values || []).map((value) => `<option value="${escapeAttribute(value)}">${escapeHtml(value)}</option>`).join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) { return escapeHtml(value); }

  function buildRollRows() {
    const container = byId('rollGrid');
    if (!container || container.childElementCount) return;
    const fragment = document.createDocumentFragment();
    for (let roll = 1; roll <= ROLL_COUNT; roll += 1) {
      const row = document.createElement('div');
      row.className = 'roll-row';
      row.dataset.rollRow = String(roll);
      row.innerHTML = `
        <div class="roll-label"><span class="roll-number">${String(roll).padStart(2, '0')}</span><span>Roll No. ${String(roll).padStart(2, '0')}</span></div>
        <input class="mark-input" data-roll="${roll}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Marks" aria-label="Marks for roll ${roll}">
        <label class="absent-control"><input class="absent-input" data-roll="${roll}" type="checkbox"><span>Absent</span></label>`;
      fragment.appendChild(row);
    }
    container.appendChild(fragment);
  }

  function context() {
    return {
      className: String(byId('marksClass')?.value || '').trim(),
      subject: String(byId('marksSubject')?.value || '').trim(),
      examType: String(byId('marksExam')?.value || '').trim(),
      component: String(byId('marksComponent')?.value || '').trim(),
      maxMarks: Number(byId('marksMax')?.value)
    };
  }

  function contextKey(value) {
    const item = value || context();
    return [item.className, window.BGPS_DATA.normalizeSubjectForStorage(item.subject, item.className), item.examType, item.component]
      .map((part) => String(part || '').trim().toUpperCase())
      .join('|');
  }

  function storeStableContext() {
    stableContext = context();
    ['marksSubject', 'marksExam', 'marksComponent'].forEach((id) => {
      const node = byId(id);
      if (node) node.dataset.previousValue = node.value;
    });
  }

  function renderSubjects(className) {
    const select = byId('marksSubject');
    if (!select) return;
    const previous = select.value;
    const options = window.BGPS_DATA.subjectsForClass(className);
    select.innerHTML = optionMarkup(options, 'Select subject');
    if (options.includes(previous)) select.value = previous;
  }

  function configureTeacherForm() {
    const classSelect = byId('marksClass');
    const examSelect = byId('marksExam');
    const componentSelect = byId('marksComponent');
    if (!classSelect || !examSelect || !componentSelect || !session) return;

    classSelect.innerHTML = optionMarkup([session.assignedClass], null);
    classSelect.value = session.assignedClass;
    classSelect.disabled = true;
    examSelect.innerHTML = optionMarkup(window.BGPS_DATA.EXAMS, 'Select exam');
    componentSelect.innerHTML = optionMarkup(window.BGPS_DATA.COMPONENTS, null);
    componentSelect.value = 'Written';
    renderSubjects(session.assignedClass);
    resetEntry({ keepContext: true, status: 'Select a subject and exam, then load existing marks or begin a new entry.' });
    storeStableContext();
  }

  function resetEntry(options) {
    const keepContext = Boolean(options && options.keepContext);
    document.querySelectorAll('.mark-input').forEach((input) => {
      input.value = '';
      input.disabled = false;
      input.removeAttribute('aria-invalid');
    });
    document.querySelectorAll('.absent-input').forEach((checkbox) => { checkbox.checked = false; });
    document.querySelectorAll('.roll-row').forEach((row) => {
      row.classList.remove('is-absent', 'is-invalid', 'is-filled');
      row.hidden = false;
    });
    if (!keepContext) {
      if (byId('marksSubject')) byId('marksSubject').value = '';
      if (byId('marksExam')) byId('marksExam').value = '';
      if (byId('marksComponent')) byId('marksComponent').value = 'Written';
      if (byId('marksMax')) byId('marksMax').value = '';
    }
    const search = byId('rollSearch');
    if (search) search.value = '';
    entryDirty = false;
    loadedContextKey = '';
    const editChip = byId('marksEditMode');
    if (editChip) { editChip.textContent = 'New entry'; editChip.classList.remove('active'); }
    updateCounters();
    setStatus((options && options.status) || 'Entry form cleared.', '');
  }

  function rowForRoll(roll) {
    return document.querySelector(`.roll-row[data-roll-row="${CSS.escape(String(roll))}"]`);
  }

  function inputForRoll(roll) {
    return document.querySelector(`.mark-input[data-roll="${CSS.escape(String(roll))}"]`);
  }

  function absentForRoll(roll) {
    return document.querySelector(`.absent-input[data-roll="${CSS.escape(String(roll))}"]`);
  }

  function applyAbsent(checkbox) {
    const roll = checkbox.dataset.roll;
    const input = inputForRoll(roll);
    const row = rowForRoll(roll);
    if (!input || !row) return;
    if (checkbox.checked) {
      input.value = '';
      input.disabled = true;
      row.classList.add('is-absent');
      row.classList.remove('is-invalid', 'is-filled');
    } else {
      input.disabled = false;
      row.classList.remove('is-absent');
    }
    entryDirty = true;
    validateInput(input);
    updateCounters();
  }

  function validateInput(input) {
    if (!input) return true;
    const roll = input.dataset.roll;
    const row = rowForRoll(roll);
    const absent = Boolean(absentForRoll(roll)?.checked);
    const raw = String(input.value || '').trim();
    const max = Number(byId('marksMax')?.value);
    let valid = true;
    if (!absent && raw !== '') {
      const value = Number(raw);
      valid = Number.isFinite(value) && value >= 0 && Number.isFinite(max) && max > 0 && value <= max;
    }
    row?.classList.toggle('is-invalid', !valid);
    row?.classList.toggle('is-filled', valid && !absent && raw !== '');
    input.setAttribute('aria-invalid', valid ? 'false' : 'true');
    if (Number.isFinite(max) && max > 0) input.max = String(max);
    else input.removeAttribute('max');
    return valid;
  }

  function auditRows() {
    const invalid = [];
    let entered = 0;
    let absent = 0;
    document.querySelectorAll('.mark-input').forEach((input) => {
      const roll = input.dataset.roll;
      if (absentForRoll(roll)?.checked) absent += 1;
      else if (String(input.value || '').trim() !== '') entered += 1;
      if (!validateInput(input)) invalid.push(roll);
    });
    return { entered, absent, remaining: Math.max(0, ROLL_COUNT - entered - absent), invalid };
  }

  function updateCounters() {
    const summary = auditRows();
    setText('countEntered', summary.entered);
    setText('countAbsent', summary.absent);
    setText('countRemaining', summary.remaining);
    setText('countInvalid', summary.invalid.length);
    setText('saveSummary', `${summary.entered} entered · ${summary.absent} absent · ${summary.remaining} remaining`);
    return summary;
  }

  function validateContext(requireMax) {
    const value = context();
    if (!value.className || !value.subject || !value.examType || !value.component) {
      throw new Error('Select Class, Subject, Exam and Component.');
    }
    if (requireMax && (!Number.isFinite(value.maxMarks) || value.maxMarks <= 0)) {
      throw new Error('Enter valid Maximum Marks.');
    }
    return value;
  }

  function setEntryBusy(busy, label) {
    ['loadMarksButton', 'saveMarksButton', 'clearMarksButton'].forEach((id) => {
      const node = byId(id);
      if (node) node.disabled = Boolean(busy) || (id === 'saveMarksButton' && settings && settings.marksEntryEnabled === false);
    });
    const button = byId('loadMarksButton');
    if (button) button.textContent = busy && label === 'load' ? 'Loading…' : 'Load / Edit Saved Marks';
    const save = byId('saveMarksButton');
    if (save) save.textContent = busy && label === 'save' ? 'Saving…' : 'Save / Update records';
  }

  async function loadExisting(showToast) {
    let value;
    try { value = validateContext(false); }
    catch (error) { setStatus(error.message, 'error'); return; }

    setEntryBusy(true, 'load');
    setStatus('Loading saved records…', '');
    try {
      const storageSubject = window.BGPS_DATA.normalizeSubjectForStorage(value.subject, value.className);
      const result = await window.BGPS_API.getMarks({
        className: value.className,
        subject: storageSubject,
        examType: value.examType,
        component: value.component,
        rollNo: ''
      });

      resetEntry({ keepContext: true, status: '' });
      const latest = new Map();
      const maxValues = new Set();
      (result.rows || []).forEach((row) => {
        const roll = window.BGPS_DATA.normalizeRoll(row.rollNo);
        if (!roll) return;
        latest.set(roll, row);
        const max = Number(row.maxMarks);
        if (Number.isFinite(max) && max > 0) maxValues.add(max);
      });

      latest.forEach((row, roll) => {
        const input = inputForRoll(roll);
        const checkbox = absentForRoll(roll);
        if (!input || !checkbox) return;
        if (window.BGPS_DATA.isAbsent(row.marks)) {
          checkbox.checked = true;
          applyAbsent(checkbox);
        } else {
          input.value = String(row.marks == null ? '' : row.marks);
          validateInput(input);
        }
      });

      const validMax = [...maxValues];
      if (validMax.length === 1 && byId('marksMax')) byId('marksMax').value = String(validMax[0]);
      loadedContextKey = contextKey(value);
      entryDirty = false;
      storeStableContext();
      updateCounters();

      const editChip = byId('marksEditMode');
      if (editChip) { editChip.textContent = latest.size ? `Editing ${latest.size} saved record${latest.size === 1 ? '' : 's'}` : 'New entry'; editChip.classList.toggle('active', latest.size > 0); }
      if (latest.size) {
        setStatus(`${latest.size} saved record${latest.size === 1 ? '' : 's'} loaded. Change only the required values and save; existing rows will be updated, not duplicated.`, 'success');
      } else {
        setStatus('No previous records found. You can begin a new entry.', '');
      }
      if (validMax.length > 1) {
        setStatus('Saved records contain different Maximum Marks values. Please verify Maximum Marks before saving.', 'warning');
      }
      if (showToast) window.BGPS_APP.toast(latest.size ? 'Existing marks loaded.' : 'No existing marks found.');
    } catch (error) {
      setStatus(error.message || 'Could not load marks.', 'error');
      window.BGPS_APP.toast(error.message || 'Could not load marks.', 'error');
    } finally {
      setEntryBusy(false, 'load');
      updateModuleAccess();
    }
  }

  function collectEntries() {
    const value = validateContext(true);
    const summary = auditRows();
    if (summary.invalid.length) {
      throw new Error(`Invalid marks in Roll ${summary.invalid.slice(0, 8).join(', ')}. Marks must be between 0 and ${value.maxMarks}.`);
    }
    const entries = [];
    document.querySelectorAll('.mark-input').forEach((input) => {
      const roll = input.dataset.roll;
      const absent = Boolean(absentForRoll(roll)?.checked);
      const raw = String(input.value || '').trim();
      if (!absent && raw === '') return;
      entries.push({
        teacherId: session.teacherId,
        class: value.className,
        subject: window.BGPS_DATA.normalizeSubjectForStorage(value.subject, value.className),
        examType: value.examType,
        type: value.component,
        maxMarks: value.maxMarks,
        rollNo: roll,
        marks: absent ? 'AB' : Number(raw),
        status: absent ? 'ABSENT' : 'PRESENT'
      });
    });
    if (!entries.length) throw new Error('Enter marks or select Absent for at least one student.');
    return { value, summary, entries };
  }

  function openConfirmation(payload) {
    return new Promise((resolve) => {
      const modal = byId('saveConfirmModal');
      if (!modal) { resolve(window.confirm('Save these marks?')); return; }
      setText('confirmClass', payload.value.className);
      setText('confirmSubject', payload.value.subject);
      setText('confirmExam', payload.value.examType);
      setText('confirmComponent', payload.value.component);
      setText('confirmCount', payload.entries.length);
      setText('confirmMax', payload.value.maxMarks);
      const warning = byId('confirmLoadWarning');
      if (warning) warning.hidden = loadedContextKey === contextKey(payload.value);
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');

      const finish = (result) => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        byId('confirmSaveButton')?.removeEventListener('click', approve);
        byId('cancelSaveButton')?.removeEventListener('click', cancel);
        modal.removeEventListener('click', backdrop);
        document.removeEventListener('keydown', keydown);
        resolve(result);
      };
      const approve = () => finish(true);
      const cancel = () => finish(false);
      const backdrop = (event) => { if (event.target === modal) finish(false); };
      const keydown = (event) => { if (event.key === 'Escape') finish(false); };
      byId('confirmSaveButton')?.addEventListener('click', approve);
      byId('cancelSaveButton')?.addEventListener('click', cancel);
      modal.addEventListener('click', backdrop);
      document.addEventListener('keydown', keydown);
      byId('confirmSaveButton')?.focus();
    });
  }

  async function save() {
    if (settings && settings.marksEntryEnabled === false) {
      setStatus(settings.adminNotice || 'Marks entry is currently closed.', 'warning');
      return;
    }
    let payload;
    try { payload = collectEntries(); }
    catch (error) {
      setStatus(error.message, 'error');
      const firstInvalid = document.querySelector('.roll-row.is-invalid .mark-input');
      firstInvalid?.focus();
      return;
    }
    const confirmed = await openConfirmation(payload);
    if (!confirmed) return;

    setEntryBusy(true, 'save');
    setStatus('Saving marks securely…', '');
    try {
      const result = await window.BGPS_API.saveMarks(payload.entries);
      entryDirty = false;
      loadedContextKey = contextKey(payload.value);
      const created = Number(result.created || 0);
      const updated = Number(result.updated || 0);
      const saved = Number(result.saved || payload.entries.length);
      setStatus(`${saved} record${saved === 1 ? '' : 's'} saved successfully · ${updated} updated · ${created} new.`, 'success');
      window.BGPS_APP.toast(updated ? 'Saved marks were updated without duplicate entries.' : 'Marks saved successfully.');
      await loadExisting(false);
      await refreshTeacherSummary(false);
    } catch (error) {
      setStatus(error.message || 'Could not save marks.', 'error');
      window.BGPS_APP.toast(error.message || 'Could not save marks.', 'error');
    } finally {
      setEntryBusy(false, 'save');
      updateModuleAccess();
    }
  }

  function updateModuleAccess() {
    const closed = Boolean(settings && settings.marksEntryEnabled === false);
    const lock = byId('marksModuleLock');
    if (lock) {
      lock.classList.toggle('visible', closed);
      lock.textContent = closed ? (settings.adminNotice || 'Marks entry is currently closed by the school administrator.') : '';
    }
    ['marksSubject', 'marksExam', 'marksComponent', 'marksMax'].forEach((id) => {
      const node = byId(id);
      if (node) node.disabled = closed;
    });
    document.querySelectorAll('.mark-input,.absent-input').forEach((node) => { node.disabled = closed || (node.classList.contains('mark-input') && Boolean(absentForRoll(node.dataset.roll)?.checked)); });
    const saveButton = byId('saveMarksButton');
    if (saveButton) saveButton.disabled = closed;
    setText('homeMarksState', closed ? 'Closed' : 'Open');
    const state = byId('homeMarksState');
    if (state) state.className = closed ? 'status-chip warning' : 'status-chip success';
  }

  async function loadSettings() {
    try {
      const result = await window.BGPS_API.getPaperSettings();
      settings = result.settings || {};
      window.BGPS_STATE.setPaperSettings(settings);
      updateModuleAccess();
      return settings;
    } catch (error) {
      console.warn('Could not load module settings:', error);
      settings = { marksEntryEnabled: true, adminNotice: '' };
      updateModuleAccess();
      return settings;
    }
  }

  function dedupeRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = [row.className, row.subject, row.examType, row.component, window.BGPS_DATA.normalizeRoll(row.rollNo)]
        .map((value) => String(value || '').trim().toUpperCase())
        .join('|');
      const previous = map.get(key);
      const currentTime = new Date(row.timestamp || 0).getTime() || 0;
      const previousTime = previous ? (new Date(previous.timestamp || 0).getTime() || 0) : -1;
      if (!previous || currentTime >= previousTime) map.set(key, row);
    });
    return [...map.values()];
  }

  async function refreshTeacherSummary(showToast) {
    if (!session || session.isAdmin) return;
    try {
      const [result, papersResult] = await Promise.all([
        window.BGPS_API.getMarks({ className: session.assignedClass }),
        window.BGPS_API.listPapers().catch(() => ({ papers: [] }))
      ]);
      const rows = dedupeRows(result.rows || []);
      window.BGPS_DATA.setObservedMarksRows(rows);
      renderSubjects(session.assignedClass);
      const latest = [...rows].sort((a, b) => (new Date(b.timestamp || 0)) - (new Date(a.timestamp || 0)))[0];
      setText('teacherSummaryClass', session.assignedClass || '—');
      setText('teacherSummaryLatest', latest ? window.BGPS_DATA.safeDate(latest.timestamp) : 'No records yet');
      renderInteractiveTermOverview(rows, papersResult.papers || []);
      if (showToast) window.BGPS_APP.toast('Marks summary refreshed.');
    } catch (error) {
      setText('teacherSummaryLatest', 'Unable to load');
      const termOverview = byId('teacherTermOverview');
      if (termOverview) termOverview.innerHTML = '<div class="empty-state"><strong>Term information could not be loaded</strong>Please refresh and try again.</div>';
      if (showToast) window.BGPS_APP.toast(error.message || 'Could not refresh summary.', 'error');
    }
  }

  async function refreshTeacherPaperStatus(showToast) {
    if (!session || session.isAdmin) return;
    try {
      const result = await window.BGPS_API.listPapers();
      renderInteractiveTermOverview(undefined, Array.isArray(result?.papers) ? result.papers : []);
      if (showToast) window.BGPS_APP.toast('Question-paper status refreshed.');
    } catch (error) {
      if (showToast) window.BGPS_APP.toast(error.message || 'Could not refresh question-paper status.', 'error');
      throw error;
    }
  }

  function renderTeacherNotifications(termLabel, pendingSubjects, reviewPapers, returnedPapers) {
    const container = byId('recentMarksList');
    if (!container) return;
    const items = [];
    (returnedPapers || []).slice(0, 3).forEach((paper) => items.push(`<div class="teacher-notification danger"><div class="teacher-notification-copy"><strong>Correction required: ${escapeHtml(paper.subject || paper.title || 'Question Paper')}</strong>${escapeHtml(paper.exam || 'Exam')} · ${escapeHtml(paper.adminNote || 'Please review the Principal note and correct this paper.')}</div><button class="btn danger-outline" type="button" data-notification-action="corrections">Open</button></div>`));
    if ((pendingSubjects || []).length) items.push(`<div class="teacher-notification warning"><div class="teacher-notification-copy"><strong>${pendingSubjects.length} ${escapeHtml(termLabel)} subject${pendingSubjects.length === 1 ? '' : 's'} pending</strong>${escapeHtml(pendingSubjects.join(', '))}</div><button class="btn" type="button" data-notification-action="marks">Enter Marks</button></div>`);
    if ((reviewPapers || []).length) items.push(`<div class="teacher-notification"><div class="teacher-notification-copy"><strong>${reviewPapers.length} paper${reviewPapers.length === 1 ? '' : 's'} awaiting Principal review</strong>${escapeHtml(reviewPapers.map((paper) => paper.subject || paper.title || 'Paper').slice(0, 4).join(', '))}</div><button class="btn" type="button" data-notification-action="review">View Papers</button></div>`);
    if (!items.length) items.push('<div class="teacher-notification success"><div class="teacher-notification-copy"><strong>All selected-term work is up to date</strong>No pending marks, paper reviews or corrections need your attention.</div></div>');
    container.innerHTML = `<div class="teacher-notification-list">${items.join('')}</div>`;
  }

  function renderTermOverview(rows, paperRows) {
    const container = byId('teacherTermOverview');
    if (!container) return;
    const terms = new Map();
    (window.BGPS_DATA.EXAMS || []).forEach((term) => terms.set(String(term || '').trim().toUpperCase(), String(term || '').trim()));
    (rows || []).forEach((row) => {
      const term = String(row.examType || '').trim();
      if (term) terms.set(term.toUpperCase(), term);
    });
    (paperRows || []).forEach((paper) => {
      const term = String(paper.exam || '').trim();
      if (term) terms.set(term.toUpperCase(), term);
    });
    const cards = [...terms.entries()].map(([key, label]) => {
      const termRows = (rows || []).filter((row) => String(row.examType || '').trim().toUpperCase() === key);
      const termPapers = (paperRows || []).filter((paper) => String(paper.exam || '').trim().toUpperCase() === key);
      const subjects = new Set(termRows.map((row) => String(row.subject || '').trim()).filter(Boolean));
      const latest = [...termRows].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
      const approved = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'APPROVED').length;
      const review = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'SUBMITTED').length;
      const correction = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'CORRECTION REQUIRED').length;
      const paperStatus = !termPapers.length ? 'Not submitted' : `${termPapers.length} submitted${approved ? ` · ${approved} approved` : review ? ` · ${review} for review` : correction ? ` · ${correction} correction` : ''}`;
      return `<article class="term-overview-card"><h3>${escapeHtml(label)}</h3><div class="term-fact"><span>Subjects started</span><strong>${subjects.size}</strong></div><div class="term-fact"><span>Saved marks</span><strong>${termRows.length}</strong></div><div class="term-fact"><span>Question papers</span><strong>${escapeHtml(paperStatus)}</strong></div><div class="term-fact"><span>Latest update</span><strong>${escapeHtml(latest ? window.BGPS_DATA.safeDate(latest.timestamp) : 'No records')}</strong></div></article>`;
    });
    container.innerHTML = cards.length ? cards.join('') : '<div class="empty-state"><strong>No term information yet</strong>Saved marks and submitted papers will appear here.</div>';
  }

  function configureAdminFilters() {
    const classSelect = byId('adminClassFilter');
    const examSelect = byId('adminExamFilter');
    if (classSelect) classSelect.innerHTML = optionMarkup(window.BGPS_DATA.CLASSES, 'Select class');
    if (examSelect) examSelect.innerHTML = optionMarkup(window.BGPS_DATA.EXAMS, 'All exams');
  }

  function overviewAcademicYear(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  }

  function renderInteractiveTermOverview(rows, paperRows) {
    if (Array.isArray(rows)) termOverviewRows = rows;
    if (Array.isArray(paperRows)) termOverviewPapers = paperRows;
    const container = byId('teacherTermOverview');
    const yearSelect = byId('teacherTermYearFilter');
    const tabs = byId('teacherTermTabs');
    if (!container || !yearSelect || !tabs || !session) return;

    const currentYear = overviewAcademicYear(new Date());
    const years = new Set([currentYear]);
    termOverviewRows.forEach((row) => { const year = overviewAcademicYear(row.timestamp); if (year) years.add(year); });
    termOverviewPapers.forEach((paper) => { const year = overviewAcademicYear(paper.updatedAt || paper.uploadedAt); if (year) years.add(year); });
    const orderedYears = [...years].filter(Boolean).sort((a, b) => b.localeCompare(a));
    const previousYear = String(yearSelect.value || '').trim();
    yearSelect.innerHTML = orderedYears.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year.replace('-', '–'))}</option>`).join('');
    yearSelect.value = orderedYears.includes(previousYear) ? previousYear : (orderedYears.includes(currentYear) ? currentYear : orderedYears[0]);
    const selectedYear = yearSelect.value;
    const rowsForYear = termOverviewRows.filter((row) => overviewAcademicYear(row.timestamp) === selectedYear);
    const papersForYear = termOverviewPapers.filter((paper) => overviewAcademicYear(paper.updatedAt || paper.uploadedAt) === selectedYear);
    const terms = new Map();
    (window.BGPS_DATA.EXAMS || []).forEach((term) => terms.set(String(term).toUpperCase(), String(term)));
    rowsForYear.forEach((row) => { if (row.examType) terms.set(String(row.examType).trim().toUpperCase(), String(row.examType).trim()); });
    papersForYear.forEach((paper) => { if (paper.exam) terms.set(String(paper.exam).trim().toUpperCase(), String(paper.exam).trim()); });
    const termEntries = [...terms.entries()];
    if (!termEntries.some(([key]) => key === selectedOverviewTerm)) selectedOverviewTerm = termEntries[0]?.[0] || '';
    tabs.innerHTML = termEntries.map(([key, label]) => `<button type="button" role="tab" class="${key === selectedOverviewTerm ? 'active' : ''}" data-overview-term="${escapeHtml(key)}">${escapeHtml(label)}</button>`).join('');
    if (!selectedOverviewTerm) {
      container.innerHTML = '<div class="empty-state"><strong>No term information yet</strong>Saved marks and submitted papers will appear here.</div>';
      return;
    }

    const termRows = rowsForYear.filter((row) => String(row.examType || '').trim().toUpperCase() === selectedOverviewTerm);
    const termPapers = papersForYear.filter((paper) => String(paper.exam || '').trim().toUpperCase() === selectedOverviewTerm);
    const expectedSubjects = window.BGPS_DATA.subjectsForClass(session.assignedClass || '');
    const expectedKeys = new Set(expectedSubjects.map((subject) => String(window.BGPS_DATA.normalizeSubjectForStorage(subject, session.assignedClass) || subject).toUpperCase()));
    const completedKeys = new Set(termRows.map((row) => String(window.BGPS_DATA.normalizeSubjectForStorage(row.subject, session.assignedClass) || row.subject).toUpperCase()).filter(Boolean));
    const marksSubmitted = [...completedKeys].filter((key) => expectedKeys.has(key)).length;
    const marksPending = Math.max(0, expectedKeys.size - marksSubmitted);
    const pendingSubjects = expectedSubjects.filter((subject) => !completedKeys.has(String(window.BGPS_DATA.normalizeSubjectForStorage(subject, session.assignedClass) || subject).toUpperCase()));
    const paperSubmitted = termPapers.length;
    const reviewPapers = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'SUBMITTED');
    const reviewPending = reviewPapers.length;
    const correctionRequired = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'CORRECTION REQUIRED').length;
    const approved = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'APPROVED').length;
    const returnedPapers = papersForYear.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'CORRECTION REQUIRED');
    const latest = [...termRows].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
    const label = terms.get(selectedOverviewTerm) || selectedOverviewTerm;
    const readiness = expectedKeys.size ? Math.round((marksSubmitted / expectedKeys.size) * 100) : 0;
    renderTeacherNotifications(label, pendingSubjects, reviewPapers, returnedPapers);
    container.innerHTML = `
      <article class="term-overview-card"><div class="term-progress-head"><div><h3>${escapeHtml(label)} Marks Progress</h3><small>${escapeHtml(session.assignedClass || 'Assigned class')} · ${escapeHtml(selectedYear.replace('-', '–'))}</small></div><span class="term-readiness">${readiness}%</span></div><div class="term-progress-track" aria-label="${readiness}% marks progress"><span style="width:${readiness}%"></span></div><div class="term-fact"><span>Subjects completed</span><strong>${marksSubmitted}/${expectedKeys.size}</strong></div><div class="term-fact"><span>Subjects pending</span><strong>${marksPending}</strong></div><div class="term-fact"><span>Latest marks update</span><strong>${escapeHtml(latest ? window.BGPS_DATA.safeDate(latest.timestamp) : 'No records')}</strong></div></article>
      <article class="term-overview-card"><div class="term-progress-head"><div><h3>Question Paper Workflow</h3><small>${escapeHtml(label)} status</small></div></div><div class="paper-workflow-grid"><div class="paper-workflow-stat"><span>Total submitted</span><strong>${paperSubmitted}</strong></div><div class="paper-workflow-stat warning"><span>Awaiting review</span><strong>${reviewPending}</strong></div><div class="paper-workflow-stat"><span>Approved</span><strong>${approved}</strong></div><div class="paper-workflow-stat danger"><span>Correction</span><strong>${correctionRequired}</strong></div></div></article>`;
  }

  function aggregateAdminRows(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = `${String(row.subject || '').toUpperCase()}|${String(row.component || '').toUpperCase()}`;
      if (!groups.has(key)) {
        groups.set(key, { subject: row.subject || '—', component: row.component || '—', records: 0, present: 0, absent: 0, maxValues: new Set(), latest: '' });
      }
      const group = groups.get(key);
      group.records += 1;
      if (window.BGPS_DATA.isAbsent(row.marks)) group.absent += 1;
      else group.present += 1;
      const max = Number(row.maxMarks);
      if (Number.isFinite(max) && max > 0) group.maxValues.add(max);
      if (!group.latest || new Date(row.timestamp || 0) > new Date(group.latest || 0)) group.latest = row.timestamp;
    });
    return [...groups.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.component.localeCompare(b.component));
  }

  function renderAdminReport() {
    const body = byId('adminSummaryBody');
    if (!body) return;
    if (!adminSummary.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state"><strong>No records found</strong>Try another class or exam.</div></td></tr>';
    } else {
      body.innerHTML = adminSummary.map((group) => {
        const maxLabel = group.maxValues.size === 1 ? [...group.maxValues][0] : group.maxValues.size > 1 ? 'Mixed' : '—';
        const statusClass = group.records >= ROLL_COUNT ? 'success' : group.records ? 'warning' : '';
        const statusText = group.records >= ROLL_COUNT ? 'Recorded' : `${group.records} ${group.records === 1 ? 'record' : 'records'}`;
        return `<tr>
          <td><strong>${escapeHtml(group.subject)}</strong></td>
          <td>${escapeHtml(group.component)}</td>
          <td>${group.records}</td>
          <td>${group.present}</td>
          <td>${group.absent}</td>
          <td>${escapeHtml(maxLabel)}</td>
          <td>${escapeHtml(window.BGPS_DATA.safeDate(group.latest) || '—')}</td>
          <td><span class="status-chip ${statusClass}">${escapeHtml(statusText)}</span></td>
        </tr>`;
      }).join('');
    }
    renderAdminDetails();
  }

  function renderAdminDetails() {
    const body = byId('adminDetailsBody');
    if (!body) return;
    const query = String(byId('adminRecordSearch')?.value || '').trim().toUpperCase();
    const rows = adminRows.filter((row) => {
      if (!query) return true;
      return [row.subject, row.examType, row.component, row.rollNo, row.teacherId, row.marks]
        .some((value) => String(value == null ? '' : value).toUpperCase().includes(query));
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="empty-state"><strong>No matching records</strong>Change the search text to view records.</div></td></tr>';
      return;
    }
    body.innerHTML = rows.slice(0, 500).map((row) => `<tr>
      <td>${escapeHtml(row.rollNo)}</td>
      <td>${escapeHtml(row.subject)}</td>
      <td>${escapeHtml(row.examType)}</td>
      <td>${escapeHtml(row.component)}</td>
      <td><strong>${window.BGPS_DATA.isAbsent(row.marks) ? 'AB' : escapeHtml(row.marks)}</strong></td>
      <td>${escapeHtml(row.maxMarks)}</td>
      <td>${escapeHtml(row.teacherId || '—')}</td>
      <td>${escapeHtml(window.BGPS_DATA.safeDate(row.timestamp) || '—')}</td>
      <td><span class="status-chip ${window.BGPS_DATA.isAbsent(row.marks) ? 'danger' : 'success'}">${window.BGPS_DATA.isAbsent(row.marks) ? 'Absent' : 'Present'}</span></td>
    </tr>`).join('');
  }

  async function loadAdminReport() {
    const className = String(byId('adminClassFilter')?.value || '').trim();
    const examType = String(byId('adminExamFilter')?.value || '').trim();
    if (!className) {
      window.BGPS_APP.toast('Select a class first.', 'error');
      byId('adminClassFilter')?.focus();
      return;
    }
    const button = byId('loadAdminReportButton');
    if (button) { button.disabled = true; button.textContent = 'Loading…'; }
    setText('adminReportStatus', 'Loading class records…');
    try {
      const result = await window.BGPS_API.getMarks({ className, examType });
      adminRows = dedupeRows(result.rows || []).sort((a, b) => {
        return String(a.subject || '').localeCompare(String(b.subject || '')) || Number(a.rollNo || 0) - Number(b.rollNo || 0);
      });
      adminSummary = aggregateAdminRows(adminRows);
      const subjects = new Set(adminRows.map((row) => row.subject).filter(Boolean));
      const absent = adminRows.filter((row) => window.BGPS_DATA.isAbsent(row.marks)).length;
      const teachers = new Set(adminRows.map((row) => row.teacherId).filter(Boolean));
      setText('adminMetricRecords', adminRows.length);
      setText('adminMetricSubjects', subjects.size);
      setText('adminMetricAbsent', absent);
      setText('adminMetricTeachers', teachers.size);
      setText('adminReportStatus', `${className}${examType ? ` · ${examType}` : ''} · ${adminRows.length} saved records`);
      setText('adminSelectedClass', className);
      setText('adminSelectedExam', examType || 'All exams');
      renderAdminReport();
      window.BGPS_APP.toast('Class marks report loaded.');
    } catch (error) {
      setText('adminReportStatus', error.message || 'Could not load report.');
      window.BGPS_APP.toast(error.message || 'Could not load report.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Load report'; }
    }
  }

  function exportAdminCsv() {
    if (!adminRows.length) {
      window.BGPS_APP.toast('Load a class report before exporting.', 'error');
      return;
    }
    const headers = ['Timestamp', 'Teacher ID', 'Class', 'Subject', 'Exam Type', 'Component', 'Roll No', 'Marks', 'Max Marks'];
    const lines = [headers, ...adminRows.map((row) => [row.timestamp, row.teacherId, row.className, row.subject, row.examType, row.component, row.rollNo, row.marks, row.maxMarks])]
      .map((row) => row.map((value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BGPS_${String(byId('adminClassFilter')?.value || 'Marks').replace(/\s+/g, '_')}_${String(byId('adminExamFilter')?.value || 'All_Exams').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function filterRolls() {
    const query = String(byId('rollSearch')?.value || '').trim();
    document.querySelectorAll('.roll-row').forEach((row) => {
      row.hidden = Boolean(query) && !String(row.dataset.rollRow || '').includes(String(Number(query) || query));
    });
  }

  function handleContextChange(event) {
    const select = event.currentTarget;
    const previous = select.dataset.previousValue == null ? '' : select.dataset.previousValue;
    if (entryDirty) {
      const proceed = window.confirm('Unsaved marks are present. Changing this selection will clear the current entry. Continue?');
      if (!proceed) {
        select.value = previous;
        return;
      }
    }
    if (select.id === 'marksSubject' || select.id === 'marksExam' || select.id === 'marksComponent') {
      resetEntry({ keepContext: true, status: 'Selection changed. Load existing marks before editing saved records.' });
    }
    select.dataset.previousValue = select.value;
    stableContext = context();
  }

  function bindEvents() {
    buildRollRows();
    byId('loadMarksButton')?.addEventListener('click', () => loadExisting(true));
    byId('saveMarksButton')?.addEventListener('click', save);
    byId('clearMarksButton')?.addEventListener('click', () => {
      if (entryDirty && !window.confirm('Clear the unsaved marks on this form?')) return;
      resetEntry({ keepContext: true, status: 'Entry form cleared.' });
      storeStableContext();
    });
    ['marksSubject', 'marksExam', 'marksComponent'].forEach((id) => {
      byId(id)?.addEventListener('change', handleContextChange);
    });
    byId('marksMax')?.addEventListener('input', () => {
      entryDirty = true;
      updateCounters();
    });
    byId('rollGrid')?.addEventListener('input', (event) => {
      if (!event.target.classList.contains('mark-input')) return;
      entryDirty = true;
      validateInput(event.target);
      updateCounters();
    });
    byId('rollGrid')?.addEventListener('change', (event) => {
      if (event.target.classList.contains('absent-input')) applyAbsent(event.target);
    });
    byId('rollSearch')?.addEventListener('input', filterRolls);
    byId('refreshTeacherSummary')?.addEventListener('click', () => refreshTeacherSummary(true));
    byId('teacherTermYearFilter')?.addEventListener('change', () => { selectedOverviewTerm = ''; renderInteractiveTermOverview(); });
    byId('teacherTermTabs')?.addEventListener('click', (event) => {
      const termButton = event.target.closest('[data-overview-term]');
      if (!termButton) return;
      selectedOverviewTerm = termButton.dataset.overviewTerm || '';
      renderInteractiveTermOverview();
    });
    byId('recentMarksList')?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-notification-action]')?.dataset.notificationAction;
      if (!action) return;
      if (action === 'marks') {
        window.BGPS_APP.openView('marks');
        return;
      }
      if (byId('teacherPaperStatusFilter')) byId('teacherPaperStatusFilter').value = action === 'corrections' ? 'Correction Required' : 'Submitted';
      window.BGPS_APP.openView('teacher-papers');
    });
    byId('loadAdminReportButton')?.addEventListener('click', loadAdminReport);
    byId('adminRecordSearch')?.addEventListener('input', renderAdminDetails);
    byId('exportAdminCsvButton')?.addEventListener('click', exportAdminCsv);
  }

  async function onAuthenticated(user) {
    session = user;
    settings = null;
    adminRows = [];
    adminSummary = [];
    const teacherPanel = byId('teacherMarksWorkspace');
    const adminPanel = byId('adminCommandWorkspace');
    if (teacherPanel) teacherPanel.hidden = Boolean(user.isAdmin);
    if (adminPanel) adminPanel.hidden = !user.isAdmin;

    await loadSettings();
    if (user.isAdmin) {
      configureAdminFilters();
      setText('adminMetricRecords', '—');
      setText('adminMetricSubjects', '—');
      setText('adminMetricAbsent', '—');
      setText('adminMetricTeachers', '—');
      setText('adminReportStatus', 'Select a class to review marks progress.');
    } else {
      configureTeacherForm();
      updateModuleAccess();
      await refreshTeacherSummary(false);
    }
  }

  function reset() {
    session = null;
    settings = null;
    entryDirty = false;
    loadedContextKey = '';
    stableContext = null;
    adminRows = [];
    adminSummary = [];
    resetEntry({ keepContext: false, status: 'Select a subject and exam to begin.' });
  }

  bindEvents();
  window.BGPS_MARKS = Object.freeze({ onAuthenticated, loadSettings, refreshTeacherSummary, refreshTeacherPaperStatus, loadExisting, save, reset, loadAdminReport });
})();


(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  let session = null;
  let marksRows = [];
  let papers = [];
  let classProgress = [];
  let teacherProgress = [];
  let initialized = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function normalize(value) {
    return String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, ' ');
  }

  function dedupeMarks(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = [row.className, row.subject, row.examType, row.component, window.BGPS_DATA.normalizeRoll(row.rollNo)]
        .map(normalize).join('|');
      const current = new Date(row.timestamp || 0).getTime() || 0;
      const previous = map.get(key);
      const previousTime = previous ? (new Date(previous.timestamp || 0).getTime() || 0) : -1;
      if (!previous || current >= previousTime) map.set(key, row);
    });
    return [...map.values()];
  }

  function selectedExam() {
    return String(byId('dashboardExamFilter')?.value || window.BGPS_DATA.EXAMS[0] || '').trim();
  }

  function academicYearKey(value) {
    const date = value instanceof Date ? value : new Date(value || 0);
    if (Number.isNaN(date.getTime())) return '';
    const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
  }

  function currentAcademicYearKey() {
    return academicYearKey(new Date());
  }

  function academicYearLabel(key) {
    const value = String(key || '').trim();
    if (!value || value === 'ALL') return 'All academic years';
    return value.replace('-', '–');
  }

  function selectedAcademicYear() {
    return String(byId('dashboardAcademicYearFilter')?.value || currentAcademicYearKey()).trim();
  }

  function recordAcademicYear(record) {
    return academicYearKey(record?.timestamp || record?.updatedAt || record?.uploadedAt || record?.createdAt || '');
  }

  function matchesSelectedAcademicYear(record) {
    const selected = selectedAcademicYear();
    return selected === 'ALL' || recordAcademicYear(record) === selected;
  }

  function configureAcademicYearFilter() {
    const select = byId('dashboardAcademicYearFilter');
    if (!select) return;
    const previous = String(select.value || '').trim();
    const years = new Set([currentAcademicYearKey()]);
    marksRows.forEach((row) => { const key = recordAcademicYear(row); if (key) years.add(key); });
    papers.forEach((paper) => { const key = recordAcademicYear(paper); if (key) years.add(key); });
    const sortedYears = [...years].filter(Boolean).sort((a, b) => b.localeCompare(a));
    select.innerHTML = sortedYears.map((key) => `<option value="${escapeHtml(key)}">${escapeHtml(academicYearLabel(key))}</option>`).join('') + '<option value="ALL">All academic years</option>';
    select.value = sortedYears.includes(previous) || previous === 'ALL' ? previous : currentAcademicYearKey();
  }

  function configureExamFilter() {
    const select = byId('dashboardExamFilter');
    if (!select || select.options.length) return;
    select.innerHTML = window.BGPS_DATA.EXAMS
      .map((exam) => `<option value="${escapeHtml(exam)}">${escapeHtml(exam)}</option>`).join('');
    select.value = window.BGPS_DATA.EXAMS[0] || '';
  }

  function canonicalSubject(subject, className) {
    return normalize(window.BGPS_DATA.normalizeSubjectForStorage(subject, className));
  }

  function teacherForClass(className) {
    return window.BGPS_DATA.teacherForClass(className) || '—';
  }

  function buildProgress() {
    const examName = selectedExam();
    const exam = normalize(examName);
    const examRows = marksRows.filter((row) => normalize(row.examType) === exam && matchesSelectedAcademicYear(row));
    window.BGPS_DATA.setObservedMarksRows(marksRows);

    classProgress = window.BGPS_DATA.CLASSES.map((className) => {
      const expected = window.BGPS_DATA.subjectsForClass(className);
      const classRows = examRows.filter((row) => normalize(row.className) === normalize(className));
      const recordedSubjects = new Set(classRows.map((row) => canonicalSubject(row.subject, className)).filter(Boolean));
      const expectedCanonical = expected.map((subject) => canonicalSubject(subject, className));
      const completedSubjects = expected.filter((subject, index) => recordedSubjects.has(expectedCanonical[index]));
      const pendingSubjects = expected.filter((subject, index) => !recordedSubjects.has(expectedCanonical[index]));
      const classPapers = papers.filter((paper) => normalize(paper.className) === normalize(className) && normalize(paper.exam) === exam && matchesSelectedAcademicYear(paper));
      const paperSubjects = new Set(classPapers.map((paper) => canonicalSubject(paper.subject, className)).filter(Boolean));
      const submittedPaperSubjects = expected.filter((subject, index) => paperSubjects.has(expectedCanonical[index]));
      const pendingPaperSubjects = expected.filter((subject, index) => !paperSubjects.has(expectedCanonical[index]));
      const awaiting = classPapers.filter((paper) => normalize(paper.status) === 'SUBMITTED').length;
      const corrections = classPapers.filter((paper) => normalize(paper.status) === 'CORRECTION REQUIRED').length;
      const approved = classPapers.filter((paper) => normalize(paper.status) === 'APPROVED').length;
      const latestMark = [...classRows].sort((a, b) => (new Date(b.timestamp || 0)) - (new Date(a.timestamp || 0)))[0];
      return {
        className,
        teacherId: teacherForClass(className),
        expectedCount: expected.length,
        completedCount: completedSubjects.length,
        pendingCount: pendingSubjects.length,
        completedSubjects,
        pendingSubjects,
        paperExpectedCount: expected.length,
        paperSubmittedCount: submittedPaperSubjects.length,
        pendingPaperSubjects,
        paperCount: classPapers.length,
        awaiting,
        corrections,
        approved,
        latestMark: latestMark ? latestMark.timestamp : ''
      };
    });

    teacherProgress = classProgress.map((item) => {
      const teacherPapers = papers.filter((paper) => normalize(paper.teacherId) === normalize(item.teacherId) && normalize(paper.exam) === exam && matchesSelectedAcademicYear(paper));
      return {
        teacherId: item.teacherId,
        className: item.className,
        marksDone: item.completedCount,
        marksExpected: item.expectedCount,
        marksPending: item.pendingCount,
        paperExpected: item.paperExpectedCount,
        paperSubmitted: new Set(teacherPapers.map((paper) => `${normalize(paper.className)}|${canonicalSubject(paper.subject, paper.className)}`)).size,
        paperApproved: teacherPapers.filter((paper) => normalize(paper.status) === 'APPROVED').length,
        paperReview: teacherPapers.filter((paper) => normalize(paper.status) === 'SUBMITTED').length,
        paperCorrection: teacherPapers.filter((paper) => normalize(paper.status) === 'CORRECTION REQUIRED').length
      };
    });
  }

  function renderMetrics() {
    const expected = classProgress.reduce((sum, item) => sum + item.expectedCount, 0);
    const completed = classProgress.reduce((sum, item) => sum + item.completedCount, 0);
    const pending = Math.max(0, expected - completed);
    const teachersPending = classProgress.filter((item) => item.pendingCount > 0).length;
    const exam = normalize(selectedExam());
    const workflowPapers = papers.filter((paper) => normalize(paper.exam) === exam && matchesSelectedAcademicYear(paper));
    const review = workflowPapers.filter((paper) => normalize(paper.status) === 'SUBMITTED').length;
    const correction = workflowPapers.filter((paper) => normalize(paper.status) === 'CORRECTION REQUIRED').length;
    const approved = workflowPapers.filter((paper) => normalize(paper.status) === 'APPROVED').length;
    const locked = workflowPapers.filter((paper) => normalize(paper.status) === 'LOCKED').length;
    const resubmitted = workflowPapers.filter((paper) => normalize(paper.status) === 'SUBMITTED' && paper.resubmitted === true).length;

    setText('dashPapersResubmitted', resubmitted);
    setText('dashMarksPending', pending);
    setText('dashTeachersPending', teachersPending);
    setText('dashPapersSubmitted', workflowPapers.length);
    setText('dashPapersReview', review);
    setText('dashPapersCorrection', correction);
    setText('paperStatusSubmitted', review);
    setText('paperStatusApproved', approved);
    setText('paperStatusCorrection', correction);
    setText('paperStatusLocked', locked);
  }

  function renderActions() {
    const container = byId('actionRequiredList');
    if (!container) return;
    const actions = [];
    const marksEntryOpen = window.BGPS_STATE.get().paperSettings?.marksEntryEnabled !== false;

    if (marksEntryOpen) classProgress
      .filter((item) => item.pendingCount > 0)
      .sort((a, b) => b.pendingCount - a.pendingCount)
      .slice(0, 6)
      .forEach((item) => {
        actions.push({
          type: 'marks',
          className: item.className,
          title: `${item.className} marks pending`,
          meta: `${item.teacherId} · ${item.pendingSubjects.slice(0, 3).join(', ')}${item.pendingSubjects.length > 3 ? ` +${item.pendingSubjects.length - 3} more` : ''}`,
          button: 'View Marks'
        });
      });

    const exam = normalize(selectedExam());
    const examPapers = papers.filter((paper) => normalize(paper.exam) === exam && matchesSelectedAcademicYear(paper));

    examPapers
      .filter((paper) => normalize(paper.status) === 'SUBMITTED' && paper.resubmitted === true)
      .slice(0, 5)
      .forEach((paper) => {
        actions.push({
          type: 'paper resubmitted',
          paperId: paper.paperId,
          title: `${paper.className} ${paper.subject} corrected paper received`,
          meta: `${paper.teacherId} · Version ${paper.version || 1}${paper.adminNote ? ` · Returned note: ${paper.adminNote}` : ''}`,
          button: 'Re-review Paper'
        });
      });

    examPapers
      .filter((paper) => normalize(paper.status) === 'SUBMITTED' && paper.resubmitted !== true)
      .slice(0, 5)
      .forEach((paper) => {
        actions.push({
          type: 'paper',
          paperId: paper.paperId,
          title: `${paper.className} ${paper.subject} paper awaiting review`,
          meta: `${paper.teacherId} · ${paper.exam}`,
          button: 'Review Paper'
        });
      });

    examPapers
      .filter((paper) => normalize(paper.status) === 'CORRECTION REQUIRED')
      .slice(0, 3)
      .forEach((paper) => {
        actions.push({
          type: 'paper',
          paperId: paper.paperId,
          title: `${paper.className} ${paper.subject} correction pending`,
          meta: `${paper.teacherId} · ${paper.exam}`,
          button: 'View Paper'
        });
      });

    setText('actionRequiredCount', actions.length);
    if (!actions.length) {
      container.innerHTML = '<div class="empty-state success-empty"><strong>No immediate action required</strong>All available records are up to date for the selected examination.</div>';
      return;
    }

    container.innerHTML = actions.slice(0, 10).map((item) => `
      <div class="action-item ${item.type.includes('paper') ? 'paper-action-item' : ''} ${item.type.includes('resubmitted') ? 'resubmitted-action-item' : ''}">
        <span class="action-marker" aria-hidden="true"></span>
        <div class="action-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
        <button class="btn compact" type="button" ${item.type === 'marks' ? `data-open-class="${escapeHtml(item.className)}"` : `data-open-paper="${escapeHtml(item.paperId)}"`}>${escapeHtml(item.button)}</button>
      </div>`).join('');
  }

  function paperSummary(item) {
    const progress = `${item.paperSubmittedCount}/${item.paperExpectedCount} subjects`;
    const parts = [progress];
    if (item.awaiting) parts.push(`${item.awaiting} review`);
    if (item.corrections) parts.push(`${item.corrections} correction`);
    if (item.approved) parts.push(`${item.approved} approved`);
    if (!item.paperCount) parts.push('No paper submitted');
    return escapeHtml(parts.join(' · '));
  }

  function renderClassTracking() {
    const container = byId('classTrackingList');
    if (!container) return;
    const query = normalize(byId('classTrackingSearch')?.value || '');
    const rows = classProgress.filter((item) => {
      if (!query) return true;
      return normalize(item.className).includes(query) || normalize(item.teacherId).includes(query);
    });

    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><strong>No matching class</strong>Change the search text and try again.</div>';
      return;
    }

    container.innerHTML = rows.map((item) => {
      const percent = item.expectedCount ? Math.round((item.completedCount / item.expectedCount) * 100) : 0;
      const statusClass = item.pendingCount === 0 ? 'success' : item.completedCount ? 'warning' : 'danger';
      const statusText = item.pendingCount === 0 ? 'Complete' : `${item.pendingCount} pending`;
      return `
        <article class="tracking-row">
          <div class="tracking-class"><strong>${escapeHtml(item.className)}</strong><span>${escapeHtml(item.teacherId)}</span></div>
          <div class="tracking-progress">
            <div class="tracking-progress-head"><span>Marks</span><strong>${item.completedCount}/${item.expectedCount} subjects</strong></div>
            <div class="progress-track"><span style="width:${Math.max(0, Math.min(100, percent))}%"></span></div>
            <small>${item.pendingSubjects.length ? `Pending: ${escapeHtml(item.pendingSubjects.slice(0, 3).join(', '))}${item.pendingSubjects.length > 3 ? '…' : ''}` : 'All subjects recorded'}</small>
          </div>
          <div class="tracking-papers"><span>Question Papers</span><strong>${paperSummary(item)}</strong><small>${item.pendingPaperSubjects.length ? `Pending: ${escapeHtml(item.pendingPaperSubjects.slice(0, 3).join(', '))}${item.pendingPaperSubjects.length > 3 ? '…' : ''}` : 'All applicable subjects submitted'}</small></div>
          <div class="tracking-status"><span class="status-chip ${statusClass}">${escapeHtml(statusText)}</span></div>
          <div class="tracking-actions"><button class="btn compact" type="button" data-open-class="${escapeHtml(item.className)}">View</button></div>
        </article>`;
    }).join('');
  }

  function renderTeacherProgress() {
    const container = byId('teacherProgressList');
    if (!container) return;
    const rows = teacherProgress.filter((item) => item.teacherId && item.teacherId !== '—');
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><strong>No teacher progress available</strong>Marks and paper activity will appear here.</div>';
      return;
    }
    container.innerHTML = rows.map((item) => {
      const workflowText = item.paperCorrection ? `${item.paperCorrection} correction` : item.paperReview ? `${item.paperReview} review` : item.paperApproved ? `${item.paperApproved} approved` : 'No pending review';
      const paperText = `${item.paperSubmitted}/${item.paperExpected} subjects · ${workflowText}`;
      return `<article class="teacher-progress-item"><div class="teacher-progress-head"><strong>${escapeHtml(item.teacherId)}</strong><span>${escapeHtml(item.className)}</span></div><div class="teacher-progress-facts"><button type="button" data-open-class="${escapeHtml(item.className)}"><small>Marks Progress</small><b>${item.marksDone}/${item.marksExpected}${item.marksPending ? ` · ${item.marksPending} pending` : ' · Complete'}</b></button><button type="button" data-teacher-papers="${escapeHtml(item.teacherId)}"><small>Paper Progress</small><b>${escapeHtml(paperText)}</b></button></div></article>`;
    }).join('');
  }

  function renderAll() {
    buildProgress();
    renderMetrics();
    renderActions();
    renderClassTracking();
    renderTeacherProgress();
  }

  async function refresh(showToast) {
    if (!session || !session.isAdmin) return;
    const button = byId('refreshPrincipalDashboard');
    if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
    try {
      const [marksResult, paperRows] = await Promise.all([
        window.BGPS_API.getMarks({}),
        window.BGPS_PAPERS.load(false)
      ]);
      marksRows = dedupeMarks(marksResult.rows || []);
      papers = Array.isArray(paperRows) ? paperRows : [];
      configureAcademicYearFilter();
      renderAll();
      if (showToast) window.BGPS_APP.toast('Dashboard refreshed.');
    } catch (error) {
      const container = byId('actionRequiredList');
      if (container) container.innerHTML = `<div class="empty-state"><strong>Dashboard could not be loaded</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      if (showToast) window.BGPS_APP.toast(error.message || 'Could not refresh dashboard.', 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Refresh'; }
    }
  }

  async function openClassReport(className) {
    const classFilter = byId('adminClassFilter');
    const examFilter = byId('adminExamFilter');
    if (classFilter) classFilter.value = className;
    if (examFilter) examFilter.value = selectedExam();
    window.BGPS_APP.openView('admin');
    await window.BGPS_MARKS.loadAdminReport();
  }

  function handleDashboardClick(event) {
    const classButton = event.target.closest('[data-open-class]');
    if (classButton) {
      openClassReport(classButton.dataset.openClass);
      return;
    }
    const teacherPaperButton = event.target.closest('[data-teacher-papers]');
    if (teacherPaperButton) {
      window.BGPS_APP.openView('papers');
      const search = byId('paperSearch');
      if (search) { search.value = teacherPaperButton.dataset.teacherPapers || ''; window.BGPS_PAPERS.render(); }
      return;
    }
    const paperButton = event.target.closest('[data-open-paper]');
    if (paperButton) {
      window.BGPS_APP.openView('papers');
      window.BGPS_PAPERS.openReview(paperButton.dataset.openPaper);
      return;
    }
    const statusButton = event.target.closest('[data-paper-status]');
    if (statusButton) {
      window.BGPS_APP.openView('papers');
      window.BGPS_PAPERS.setStatusFilter(statusButton.dataset.paperStatus);
      return;
    }
    const kpi = event.target.closest('[data-dashboard-action]');
    if (!kpi) return;
    const action = kpi.dataset.dashboardAction;
    if (action.startsWith('papers-')) {
      const status = action === 'papers-review' ? 'Submitted' : action === 'papers-correction' ? 'Correction Required' : '';
      window.BGPS_APP.openView('papers');
      if (action === 'papers-resubmitted') window.BGPS_PAPERS.setResubmittedFilter();
      else window.BGPS_PAPERS.setStatusFilter(status);
    } else {
      byId('classTrackingList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function bind() {
    if (initialized) return;
    initialized = true;
    byId('refreshPrincipalDashboard')?.addEventListener('click', () => refresh(true));
    byId('dashboardAcademicYearFilter')?.addEventListener('change', renderAll);
    byId('dashboardExamFilter')?.addEventListener('change', renderAll);
    byId('classTrackingSearch')?.addEventListener('input', renderClassTracking);
    byId('adminHomeContent')?.addEventListener('click', handleDashboardClick);
  }

  async function onAuthenticated(user) {
    session = user;
    configureExamFilter();
    configureAcademicYearFilter();
    bind();
    if (user.isAdmin) await refresh(false);
  }

  function reset() {
    session = null;
    marksRows = [];
    papers = [];
    classProgress = [];
    teacherProgress = [];
    setText('dashPapersResubmitted', '—');
    setText('dashMarksPending', '—');
  }

  window.BGPS_DASHBOARD = Object.freeze({ onAuthenticated, refresh, reset, openClassReport });
})();


(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  let session = null;
  let papers = [];
  let currentPaper = null;
  let currentObjectUrl = '';
  let currentPreviewUrl = '';
  let deleteInFlight = false;
  let initialized = false;
  let boardFilter = 'all';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalize(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function statusClass(status) {
    const value = normalize(status);
    if (value === 'APPROVED') return 'success';
    if (value === 'CORRECTION REQUIRED') return 'danger';
    if (value === 'SUBMITTED') return 'warning';
    return '';
  }

  function isRevision(paper) {
    return paper?.resubmitted === true;
  }

  function isReadyForRereview(paper) {
    return isRevision(paper) && normalize(paper.status) === 'SUBMITTED';
  }

  function isAwaitingFirstReview(paper) {
    return !isRevision(paper) && normalize(paper.status) === 'SUBMITTED';
  }

  const BOARD_COPY = Object.freeze({
    all: ['All Papers', 'Complete paper approval history, prioritised by pending action.'],
    'first-review': ['Awaiting First Review', 'New submissions waiting for the Principal’s first decision.'],
    submitted: ['All Submitted Papers', 'New and corrected papers currently waiting for review.'],
    resubmitted: ['Corrected Papers Ready for Re-review', 'Priority revisions returned by teachers after addressing Principal remarks.'],
    correction: ['Correction Pending with Teachers', 'Papers returned with remarks and not yet resubmitted.'],
    approved: ['Approved Papers', 'Final papers approved and ready for use.'],
    locked: ['Locked Papers', 'Papers currently locked from further workflow action.']
  });

  function configureFilters() {
    const select = byId('paperClassFilter');
    if (select && select.options.length <= 1) {
      select.innerHTML = '<option value="">All classes</option>' + window.BGPS_DATA.CLASSES
        .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
    }
  }

  function renderMetrics() {
    setText('papersMetricSubmitted', papers.filter(isAwaitingFirstReview).length);
    setText('papersMetricResubmitted', papers.filter(isReadyForRereview).length);
    setText('papersMetricApproved', papers.filter((p) => normalize(p.status) === 'APPROVED').length);
    setText('papersMetricCorrection', papers.filter((p) => normalize(p.status) === 'CORRECTION REQUIRED').length);
    setText('papersMetricTotal', papers.length);
  }

  function matchesBoardFilter(paper) {
    const status = normalize(paper.status);
    if (boardFilter === 'first-review') return isAwaitingFirstReview(paper);
    if (boardFilter === 'resubmitted') return isReadyForRereview(paper);
    if (boardFilter === 'submitted') return status === 'SUBMITTED';
    if (boardFilter === 'correction') return status === 'CORRECTION REQUIRED';
    if (boardFilter === 'approved') return status === 'APPROVED';
    if (boardFilter === 'locked') return status === 'LOCKED';
    return true;
  }

  function paperPriority(paper) {
    if (isReadyForRereview(paper)) return 0;
    if (isAwaitingFirstReview(paper)) return 1;
    if (normalize(paper.status) === 'CORRECTION REQUIRED') return 2;
    if (normalize(paper.status) === 'APPROVED') return 3;
    return 4;
  }

  function renderBoardState(rowCount) {
    document.querySelectorAll('[data-paper-board-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.paperBoardFilter === boardFilter));
    });
    const copy = BOARD_COPY[boardFilter] || BOARD_COPY.all;
    setText('paperListTitle', copy[0]);
    setText('paperListDescription', copy[1]);
    setText('paperListCount', rowCount);
  }

  function filteredPapers() {
    const className = normalize(byId('paperClassFilter')?.value || '');
    const query = normalize(byId('paperSearch')?.value || '');
    return papers.filter((paper) => {
      if (className && normalize(paper.className) !== className) return false;
      if (!matchesBoardFilter(paper)) return false;
      if (query) {
        const haystack = [paper.teacherId, paper.className, paper.subject, paper.exam, paper.title, paper.status, paper.resubmitted ? 'Corrected & Resubmitted' : '']
          .map(normalize).join(' ');
        if (!haystack.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => paperPriority(a) - paperPriority(b) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  function render() {
    renderMetrics();
    const container = byId('paperList');
    if (!container) return;
    const rows = filteredPapers();
    renderBoardState(rows.length);
    if (!rows.length) {
      const copy = BOARD_COPY[boardFilter] || BOARD_COPY.all;
      container.innerHTML = `<div class="empty-state"><strong>No matching papers</strong>${escapeHtml(copy[1])} Change the class/search filters or refresh the list.</div>`;
      return;
    }

    container.innerHTML = rows.map((paper) => {
      const revision = isRevision(paper);
      const rereview = isReadyForRereview(paper);
      const revisionLabel = rereview ? 'Corrected & Resubmitted' : normalize(paper.status) === 'APPROVED' ? 'Corrected Revision' : revision ? 'Revision Returned Again' : '';
      const actionLabel = rereview ? 'Re-review' : normalize(paper.status) === 'SUBMITTED' ? 'Review' : normalize(paper.status) === 'APPROVED' ? 'View Approved' : 'View Return';
      return `
      <article class="paper-row ${revision ? 'revision-paper' : ''} ${rereview ? 'priority-rereview' : ''}">
        <div class="paper-main">
          <div class="paper-title-line"><strong>${escapeHtml(paper.title || `${paper.className} ${paper.subject} Paper`)}</strong><span class="status-chip ${statusClass(paper.status)}">${escapeHtml(paper.status || 'Submitted')}</span>${revision ? `<span class="status-chip resubmitted">${escapeHtml(revisionLabel)}</span>` : ''}</div>
          <div class="paper-meta-line">
            <span>${escapeHtml(paper.className)}</span>
            <span>${escapeHtml(paper.subject)}</span>
            <span>${escapeHtml(paper.exam)}</span>
            <span>${escapeHtml(paper.teacherName || paper.teacherId)}</span>
          </div>
          ${revision ? `<div class="paper-row-note"><strong>${rereview ? 'Ready for re-review.' : 'Revision history retained.'}</strong>${paper.adminNote ? ` Previous Principal remark: ${escapeHtml(paper.adminNote)}` : ''}</div>` : ''}
        </div>
        <div class="paper-facts">
          <span><small>Marks</small><strong>${escapeHtml(paper.maxMarks || '—')}</strong></span>
          <span><small>Version</small><strong>${escapeHtml(paper.version || 1)}</strong></span>
          <span><small>Updated</small><strong>${escapeHtml(window.BGPS_DATA.safeDate(paper.updatedAt) || '—')}</strong></span>
        </div>
        <div class="paper-row-actions"><button class="btn primary compact" type="button" data-open-paper="${escapeHtml(paper.paperId)}">${escapeHtml(actionLabel)}</button><button class="btn compact" type="button" data-edit-admin-paper="${escapeHtml(paper.paperId)}">Edit</button><button class="btn danger-outline compact" type="button" data-delete-paper="${escapeHtml(paper.paperId)}">Delete</button></div>
      </article>`;
    }).join('');
  }

  async function load(showToast) {
    if (!session || !session.isAdmin) return [];
    const button = byId('refreshPapersButton');
    if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
    try {
      const result = await window.BGPS_API.listPapers();
      papers = Array.isArray(result.papers) ? result.papers : [];
      render();
      if (showToast) window.BGPS_APP.toast('Paper list refreshed.');
      return papers;
    } catch (error) {
      const container = byId('paperList');
      if (container) container.innerHTML = `<div class="empty-state"><strong>Papers could not be loaded</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      if (showToast) window.BGPS_APP.toast(error.message || 'Could not load papers.', 'error');
      throw error;
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Refresh'; }
    }
  }

  function paperById(paperId) {
    return papers.find((paper) => String(paper.paperId) === String(paperId));
  }

  function revokeObjectUrl() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = '';
    }
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = '';
    }
  }

  function openModal() {
    const modal = byId('paperReviewModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeReview() {
    revokeObjectUrl();
    currentPaper = null;
    const modal = byId('paperReviewModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
    const preview = byId('paperPreviewArea');
    if (preview) preview.innerHTML = '';
    const note = byId('paperReviewNote');
    if (note) note.value = '';
  }

  function setReviewMeta(paper) {
    const revision = isRevision(paper);
    const resubmitted = isReadyForRereview(paper);
    const status = byId('paperReviewStatus');
    if (status) {
      status.className = `status-chip ${resubmitted ? 'resubmitted' : statusClass(paper.status)}`;
      status.textContent = resubmitted ? 'Corrected & Resubmitted' : (paper.status || 'Submitted');
    }
    setText('paperReviewTitle', paper.title || `${paper.className} ${paper.subject} Paper`);
    setText('paperReviewMeta', `${paper.className} · ${paper.subject} · ${paper.exam}${revision ? ` · Corrected revision Version ${paper.version || 1}${resubmitted ? ' received for re-review' : ''}` : ''}`);
    setText('reviewTeacher', paper.teacherId || '—');
    setText('reviewClass', paper.className || '—');
    setText('reviewSubject', paper.subject || '—');
    setText('reviewExam', paper.exam || '—');
    setText('reviewMaxMarks', paper.maxMarks || '—');
    setText('reviewVersion', paper.version || 1);
    const history = byId('paperCorrectionHistory');
    if (history) {
      history.hidden = !revision;
      history.textContent = revision
        ? `${resubmitted ? 'Corrected version received for re-review.' : 'This paper belongs to a corrected revision workflow.'}${paper.adminNote ? ` Principal correction instruction: ${paper.adminNote}` : ''}`
        : '';
    }
    const note = byId('paperReviewNote');
    if (note) note.value = paper.adminNote || '';
    const approve = byId('approvePaperButton');
    if (approve) approve.disabled = normalize(paper.status) !== 'SUBMITTED';
    const returned = byId('returnPaperButton');
    if (returned) returned.disabled = normalize(paper.status) !== 'SUBMITTED';
  }

  function renderManualPreview(content) {
    const preview = byId('paperPreviewArea');
    if (!preview) return;
    const paper = content.paper || {};
    const html = String(paper.editorHtml || '').trim();
    const bodyText = String(paper.bodyText || '').trim();
    const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><style>
      html{color-scheme:light}body{margin:0;background:#e7edf4;font-family:Arial,sans-serif;color:#111}.sheet{width:min(794px,calc(100% - 24px));min-height:1123px;margin:14px auto;padding:42px 50px;background:#fff;box-shadow:0 8px 30px rgba(15,42,76,.18);box-sizing:border-box}.sheet img{max-width:100%;height:auto}.sheet table{max-width:100%;border-collapse:collapse}.sheet td,.sheet th{border:1px solid #333;padding:5px}@media(max-width:700px){.sheet{width:100%;min-height:0;margin:0;padding:22px 18px;box-shadow:none}}</style></head><body><main class="sheet">${html || `<pre style="white-space:pre-wrap;font:15px/1.6 Arial,sans-serif">${escapeHtml(bodyText || 'Paper content is unavailable.')}</pre>`}</main></body></html>`;
    preview.innerHTML = '<iframe class="paper-preview-frame" title="Question paper preview" sandbox></iframe>';
    const frame = preview.querySelector('iframe');
    frame.srcdoc = documentHtml;
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  }

  function prepareDownload(blob, fileName) {
    revokeObjectUrl();
    currentObjectUrl = URL.createObjectURL(blob);
    const button = byId('downloadPaperButton');
    if (button) {
      button.hidden = false;
      button.dataset.fileName = fileName || 'question-paper';
      const mime = String(blob?.type || '').toLowerCase();
      const name = String(fileName || '').toLowerCase();
      button.textContent = mime.includes('pdf') || name.endsWith('.pdf') ? 'Download PDF' : (mime.includes('wordprocessingml') || name.endsWith('.docx') ? 'Download Original DOCX' : 'Download File');
    }
  }

  async function renderUploadedPreview(result, originalFile) {
    const preview = byId('paperPreviewArea');
    if (!preview) return;
    const downloadSource = originalFile && originalFile.fileBase64 ? originalFile : result;
    if (downloadSource && downloadSource.fileBase64) {
      const originalBlob = base64ToBlob(downloadSource.fileBase64, downloadSource.mimeType || 'application/octet-stream');
      prepareDownload(originalBlob, downloadSource.fileName || result.originalFileName || 'question-paper');
    }

    if (!result || result.previewAvailable === false || !result.fileBase64) {
      const message = result?.error || 'Download the original file to open it.';
      preview.innerHTML = `<div class="empty-state file-empty"><strong>Preview could not be prepared</strong>${escapeHtml(message)}</div>`;
      return;
    }

    const mime = String(result.mimeType || 'application/octet-stream');
    const previewBlob = base64ToBlob(result.fileBase64 || '', mime);
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = URL.createObjectURL(previewBlob);
    const previewUrl = currentPreviewUrl;
    if (mime.includes('pdf')) {
      if (window.BGPS_PDF_PREVIEW.shouldUseCanvas()) {
        try {
          await window.BGPS_PDF_PREVIEW.render(previewBlob, preview);
        } catch (error) {
          preview.innerHTML = `<div class="empty-state file-empty"><strong>Inline preview could not be opened</strong>${escapeHtml(error.message || 'Use Download PDF to open the paper.')}</div>`;
        }
      } else {
        preview.innerHTML = '<iframe class="paper-preview-frame" title="Question paper PDF"></iframe>';
        preview.querySelector('iframe').src = previewUrl;
      }
    } else if (mime.includes('html')) {
      previewBlob.text().then((text) => {
        preview.innerHTML = '<iframe class="paper-preview-frame" title="Question paper preview" sandbox></iframe>';
        preview.querySelector('iframe').srcdoc = text;
        URL.revokeObjectURL(previewUrl);
        if (currentPreviewUrl === previewUrl) currentPreviewUrl = '';
      });
    } else if (mime.startsWith('image/')) {
      preview.innerHTML = `<div class="uploaded-image-preview"><img src="${previewUrl}" alt="Question paper preview"></div>`;
    } else {
      URL.revokeObjectURL(previewUrl);
      if (currentPreviewUrl === previewUrl) currentPreviewUrl = '';
      preview.innerHTML = `<div class="empty-state file-empty"><strong>Preview is not available</strong>${escapeHtml(result.originalFileName || result.fileName || 'The original file can be downloaded.')}</div>`;
    }
  }

  async function openReview(paperId) {
    const paper = paperById(paperId);
    if (!paper) {
      window.BGPS_APP.toast('Paper record was not found.', 'error');
      return;
    }
    currentPaper = paper;
    setReviewMeta(paper);
    const download = byId('downloadPaperButton');
    if (download) download.hidden = true;
    const preview = byId('paperPreviewArea');
    if (preview) preview.innerHTML = '<div class="empty-state"><strong>Opening paper</strong>Please wait while the paper is prepared for review.</div>';
    openModal();

    try {
      const [previewResult, originalFile] = await Promise.all([
        window.BGPS_API.getPaperPreview(paper.paperId),
        window.BGPS_API.getPaperFile(paper.paperId).catch(() => null)
      ]);
      await renderUploadedPreview(previewResult, originalFile);
    } catch (error) {
      if (preview) preview.innerHTML = `<div class="empty-state"><strong>Paper could not be opened</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
    }
  }

  async function updateStatus(status) {
    if (!currentPaper) return;
    if (normalize(currentPaper.status) !== 'SUBMITTED') {
      window.BGPS_APP.toast(currentPaper.status === 'Approved'
        ? 'Approved papers are final.'
        : 'Wait for the teacher to correct and resubmit this paper.', 'error');
      return;
    }
    const note = String(byId('paperReviewNote')?.value || '').trim();
    if (status === 'Correction Required' && !note) {
      window.BGPS_APP.toast('Enter a clear correction note before returning the paper.', 'error');
      byId('paperReviewNote')?.focus();
      return;
    }
    const button = status === 'Approved' ? byId('approvePaperButton') : byId('returnPaperButton');
    if (button) { button.disabled = true; button.textContent = status === 'Approved' ? 'Approving…' : 'Returning…'; }
    try {
      const result = await window.BGPS_API.updatePaperStatus(currentPaper.paperId, status, note);
      currentPaper.status = status;
      currentPaper.adminNote = note;
      setReviewMeta(currentPaper);
      render();
      window.BGPS_APP.toast(status === 'Approved'
        ? 'Paper approved.'
        : (result?.requiresReplacement
          ? 'Paper returned. Teacher will upload a corrected DOCX replacement under the same Paper ID.'
          : 'Paper returned. Teacher can correct and resubmit it under the same Paper ID.'));
      await window.BGPS_DASHBOARD.refresh(false);
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not update paper status.', 'error');
    } finally {
      if (button) {
        button.textContent = status === 'Approved' ? 'Approve Paper' : 'Return for Correction';
        button.disabled = status === 'Approved'
          ? normalize(currentPaper?.status) === 'APPROVED'
          : normalize(currentPaper?.status) === 'CORRECTION REQUIRED';
      }
    }
  }

  async function deleteAdminPaper(paperId) {
    if (deleteInFlight) return;
    const paper = paperById(paperId);
    if (!paper) {
      window.BGPS_APP.toast('Paper record was not found. Refresh and try again.', 'error');
      return;
    }
    const label = paper.title || `${paper.className} ${paper.subject} ${paper.exam} paper`;
    const confirmed = window.confirm(`Delete "${label}"?\n\nThis removes the portal record and moves its stored paper, PDF, source upload and preview files to Drive Trash. This action cannot be undone from the portal.`);
    if (!confirmed) return;

    deleteInFlight = true;
    const modalButton = byId('deleteReviewedPaperButton');
    const rowButtons = [...document.querySelectorAll('[data-delete-paper]')].filter((button) => String(button.dataset.deletePaper) === String(paperId));
    if (modalButton) { modalButton.disabled = true; modalButton.textContent = 'Deleting…'; }
    rowButtons.forEach((button) => { button.disabled = true; button.textContent = 'Deleting…'; });
    try {
      const result = await window.BGPS_API.deletePaper(paperId);
      papers = papers.filter((item) => String(item.paperId) !== String(paperId));
      if (currentPaper && String(currentPaper.paperId) === String(paperId)) closeReview();
      render();
      window.BGPS_APP.toast(`${result.title || label} deleted successfully.`);
      window.BGPS_DASHBOARD.refresh(false).catch(() => {});
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not delete the paper.', 'error');
    } finally {
      deleteInFlight = false;
      if (modalButton) { modalButton.disabled = false; modalButton.textContent = 'Delete Paper'; }
      rowButtons.forEach((button) => { button.disabled = false; button.textContent = 'Delete'; });
    }
  }

  function downloadCurrentFile() {
    if (!currentObjectUrl) return;
    const button = byId('downloadPaperButton');
    const link = document.createElement('a');
    link.href = currentObjectUrl;
    link.download = button?.dataset.fileName || 'question-paper';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function applyBoardFilter(filter, clearSearch = true) {
    boardFilter = BOARD_COPY[filter] ? filter : 'all';
    const select = byId('paperStatusFilter');
    const search = byId('paperSearch');
    const selectValue = {
      all: '', 'first-review': 'First Review', submitted: 'Submitted', resubmitted: 'Resubmitted',
      correction: 'Correction Required', approved: 'Approved', locked: 'Locked'
    }[boardFilter] || '';
    if (select) select.value = selectValue;
    if (clearSearch && search) search.value = '';
    render();
  }

  function setStatusFilter(status) {
    const key = normalize(status);
    const filter = key === 'FIRST REVIEW' ? 'first-review'
      : key === 'RESUBMITTED' ? 'resubmitted'
      : key === 'SUBMITTED' ? 'submitted'
      : key === 'CORRECTION REQUIRED' ? 'correction'
      : key === 'APPROVED' ? 'approved'
      : key === 'LOCKED' ? 'locked' : 'all';
    applyBoardFilter(filter);
  }

  function setResubmittedFilter() {
    applyBoardFilter('resubmitted');
  }

  function bind() {
    if (initialized) return;
    initialized = true;
    byId('refreshPapersButton')?.addEventListener('click', () => load(true));
    byId('paperClassFilter')?.addEventListener('change', render);
    byId('paperStatusFilter')?.addEventListener('change', (event) => setStatusFilter(event.target.value));
    byId('paperSearch')?.addEventListener('input', render);
    byId('approvalMetrics')?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-paper-board-filter]');
      if (card) applyBoardFilter(card.dataset.paperBoardFilter);
    });
    byId('paperList')?.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-paper]');
      if (deleteButton) { deleteAdminPaper(deleteButton.dataset.deletePaper); return; }
      const editButton = event.target.closest('[data-edit-admin-paper]');
      if (editButton) { window.BGPS_PAPER_CREATOR.openAdminEdit(editButton.dataset.editAdminPaper); return; }
      const button = event.target.closest('[data-open-paper]');
      if (button) openReview(button.dataset.openPaper);
    });
    byId('closePaperReview')?.addEventListener('click', closeReview);
    byId('paperReviewModal')?.addEventListener('click', (event) => {
      if (event.target === byId('paperReviewModal')) closeReview();
    });
    byId('approvePaperButton')?.addEventListener('click', () => updateStatus('Approved'));
    byId('editReviewedPaperButton')?.addEventListener('click', () => {
      if (!currentPaper) return;
      const paperId = currentPaper.paperId;
      closeReview();
      window.BGPS_PAPER_CREATOR.openAdminEdit(paperId);
    });
    byId('returnPaperButton')?.addEventListener('click', () => updateStatus('Correction Required'));
    byId('deleteReviewedPaperButton')?.addEventListener('click', () => { if (currentPaper) deleteAdminPaper(currentPaper.paperId); });
    byId('downloadPaperButton')?.addEventListener('click', downloadCurrentFile);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && byId('paperReviewModal')?.classList.contains('open')) closeReview();
    });
  }

  async function onAuthenticated(user) {
    session = user;
    configureFilters();
    bind();
    if (!user.isAdmin) {
      papers = [];
      render();
    }
  }

  function reset() {
    closeReview();
    session = null;
    papers = [];
    currentPaper = null;
    deleteInFlight = false;
    boardFilter = 'all';
    render();
  }

  window.BGPS_PAPERS = Object.freeze({ onAuthenticated, load, render, openReview, setStatusFilter, setResubmittedFilter, reset, getPapers: () => [...papers] });
})();


(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const normalize = (value) => String(value || '').trim();
  const statusKey = (value) => normalize(value).toLowerCase();

  const SYMBOLS = Object.freeze({
    maths: Object.freeze(['sin', 'cos', 'tan', 'log', 'ln', 'lim', '∫', '∑', '√', 'π', 'θ', 'α', 'β', 'γ', '≤', '≥', '≠', '≈', '∴', '∵', '±', '×', '÷', '∞', 'x²', 'x³', 'x₁', 'x₂', '½', '⅓', '¼']),
    physics: Object.freeze(['λ', 'μ', 'Ω', 'ρ', 'ε', 'Δ', '∇', 'φ', 'ω', 'τ', 'η', 'm/s', 'm/s²', 'kg', 'N', 'J', 'W', 'V', 'A', 'Hz', 'Pa', '°C', '→v', '→F', 'q', 'E', 'B']),
    common: Object.freeze(['•', '→', '←', '↔', '↑', '↓', '✓', '✗', '§', '—', '–', '“ ”', '‘ ’', '…', '₹', '%', '°', ':', ';'])
  });

  let initialized = false;
  let session = null;
  let settings = null;
  let drafts = [];
  let papers = [];
  let currentDraftId = '';
  let currentRevision = {};
  let selectedImage = null;
  let editorRange = null;
  let dirty = false;
  let currentObjectUrl = '';
  let currentPreviewUrl = '';
  let dragImage = null;
  let editorMode = 'teacher';
  let adminEditingPaperId = '';
  let dropMarker = null;
  let imageClipboard = null;
  let saveInFlight = false;
  let submitInFlight = false;
  let previewInFlight = false;
  let uploadInFlight = false;
  let uploadRevisionContext = null;
  let pendingPdfUpload = null;

  function toast(message, type) {
    window.BGPS_APP?.toast(message, type);
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function setHidden(id, hidden) {
    const node = byId(id);
    if (node) node.hidden = Boolean(hidden);
  }

  function openModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    const modal = byId(id);
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-backdrop.open')) document.body.classList.remove('modal-open');
  }

  function revokeObjectUrl() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = '';
    }
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = '';
    }
  }

  function populateSelect(select, values, placeholder) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ''}${(values || []).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function classSubjects(className) {
    return window.BGPS_DATA.subjectsForClass(className || '');
  }

  function populateSubjects(classSelectId, subjectSelectId) {
    const classSelect = byId(classSelectId);
    const subjectSelect = byId(subjectSelectId);
    if (!classSelect || !subjectSelect) return;
    const current = subjectSelect.value;
    populateSelect(subjectSelect, classSubjects(classSelect.value), 'Select subject');
    if ([...subjectSelect.options].some((option) => option.value === current)) subjectSelect.value = current;
  }

  function inferTime(maxMarks) {
    const marks = Number(maxMarks || 0);
    if (!marks) return '';
    if (marks <= 20) return '45 Minutes';
    if (marks <= 30) return '1 Hour';
    if (marks <= 40) return '1½ Hours';
    if (marks <= 50) return '2 Hours';
    if (marks <= 60) return '2½ Hours';
    return '3 Hours';
  }

  function readingTime(className, maxMarks) {
    const match = String(className || '').match(/Class\s+(\d+)/i);
    const classNo = match ? Number(match[1]) : 0;
    return classNo >= 9 || Number(maxMarks || 0) >= 70 ? 'Additional 15 Minutes' : 'Additional 10 Minutes';
  }

  function academicSession(dateValue) {
    const parsed = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
  }

  function isPrePrimary(className) {
    return ['PLAYGROUP', 'LKG', 'UKG'].includes(normalize(className).toUpperCase());
  }

  function statusClass(status) {
    const key = statusKey(status);
    if (key === 'draft') return 'draft';
    if (key === 'approved') return 'approved';
    if (key === 'correction required') return 'correction';
    return 'submitted';
  }

  function safeDate(value) {
    return window.BGPS_DATA.safeDate(value) || '—';
  }

  function saveRange() {
    const editor = byId('paperContentEditor');
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) editorRange = range.cloneRange();
  }

  function restoreRange() {
    const editor = byId('paperContentEditor');
    if (!editor) return false;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    if (editorRange && editor.contains(editorRange.commonAncestorContainer)) {
      selection.addRange(editorRange);
      return true;
    }
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
    editorRange = range.cloneRange();
    return true;
  }

  function insertHtml(html) {
    restoreRange();
    document.execCommand('insertHTML', false, html);
    saveRange();
    markDirty();
    updateChecks();
  }

  function insertText(text) {
    restoreRange();
    document.execCommand('insertText', false, String(text || ''));
    saveRange();
    markDirty();
    updateChecks();
  }

  function execCommand(command, value = null) {
    restoreRange();
    document.execCommand(command, false, value);
    saveRange();
    markDirty();
  }

  function renderSymbolPalettes() {
    Object.entries(SYMBOLS).forEach(([key, values]) => {
      const palette = byId(`${key}SymbolPalette`);
      if (!palette) return;
      palette.innerHTML = values.map((symbol) => `<button class="symbol-button" type="button" data-insert-symbol="${escapeHtml(symbol)}">${escapeHtml(symbol)}</button>`).join('');
    });
  }

  function togglePalette(name) {
    document.querySelectorAll('.symbol-palette').forEach((palette) => palette.classList.toggle('open', palette.dataset.palette === name && !palette.classList.contains('open')));
  }

  function currentQuestionCount() {
    return byId('paperContentEditor')?.querySelectorAll('.question-line').length || 0;
  }

  function detectedMarks() {
    const text = byId('paperContentEditor')?.innerText || '';
    let total = 0;
    const regex = /\[\s*(\d+(?:\.\d+)?)\s*(?:marks?)?\s*\]/gi;
    let match;
    while ((match = regex.exec(text))) total += Number(match[1]) || 0;
    return Number(total.toFixed(2));
  }

  function insertQuestion() {
    const marks = Number(byId('newQuestionMarks')?.value || 0);
    if (!Number.isFinite(marks) || marks <= 0) {
      toast('Enter valid marks for the question.', 'error');
      byId('newQuestionMarks')?.focus();
      return;
    }
    const number = currentQuestionCount() + 1;
    insertHtml(`<p class="question-line"><strong>Q${number}.</strong> <span class="q-placeholder">Type question here</span> <span class="mark-token">[${marks}]</span></p><p><br></p>`);
  }

  function insertSection() {
    const count = byId('paperContentEditor')?.querySelectorAll('.section-heading').length || 0;
    const letter = String.fromCharCode(65 + Math.min(count, 25));
    insertHtml(`<h2 class="section-heading"><span>Section ${letter}</span><span>Answer all questions</span></h2><p><br></p>`);
  }

  function insertOr() {
    insertHtml('<p class="or-line">OR</p><p><br></p>');
  }

  function insertTable() {
    insertHtml('<table><tbody><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Write here</td><td>Write here</td></tr></tbody></table><p><br></p>');
  }

  function insertPageBreak() {
    insertHtml('<div class="page-break"></div><p><br></p>');
  }

  function insertFraction() {
    insertHtml('<span class="bgps-fraction"><span>numerator</span><span>denominator</span></span>');
  }

  function insertRoot() {
    insertHtml('<span class="bgps-root">√(<span>value</span>)</span>');
  }

  function markDirty() {
    dirty = true;
    const node = byId('paperSaveStatus');
    if (node) {
      node.textContent = currentDraftId ? 'Changes not saved' : 'Draft not saved';
      node.className = 'paper-save-status dirty';
    }
  }

  function markSaved(message) {
    dirty = false;
    const node = byId('paperSaveStatus');
    if (node) {
      node.textContent = message || 'Draft saved';
      node.className = 'paper-save-status saved';
    }
  }

  function syncPreviewHeader() {
    const className = byId('paperClassInput')?.value || '—';
    const subject = byId('paperSubjectInput')?.value || '—';
    const exam = byId('paperExamInput')?.value || 'EXAM / TERM';
    const maxMarks = byId('paperMaxMarksInput')?.value || '—';
    const time = byId('paperTimeInput')?.value || '—';
    const date = byId('paperDateInput')?.value || '____________';
    setText('paperPreviewClass', className);
    setText('paperPreviewSubject', subject);
    setText('paperPreviewExam', exam);
    setText('paperPreviewSession', academicSession(byId('paperDateInput')?.value));
    setText('paperPreviewMaxMarks', maxMarks);
    setText('paperPreviewTime', time);
    setText('paperPreviewDate', date);
    setText('paperPreviewReadingTime', readingTime(className, maxMarks));

    const instructions = normalize(byId('paperInstructionsInput')?.value);
    const preview = byId('paperInstructionsPreview');
    if (preview) {
      const lines = instructions.split(/\n+/).map(normalize).filter(Boolean);
      preview.hidden = !lines.length;
      preview.innerHTML = lines.length ? `<ol>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol>` : '';
    }
  }

  function updateChecks() {
    const target = Number(byId('paperMaxMarksInput')?.value || 0);
    const used = detectedMarks();
    const remaining = Number((target - used).toFixed(2));
    const count = currentQuestionCount();
    setText('paperDetectedMarks', used);
    setText('paperTargetMarks', target || 0);
    setText('paperRemainingMarks', remaining);
    setText('paperQuestionCount', count);
    const progress = byId('paperMarksProgress');
    if (progress) progress.style.width = `${target > 0 ? Math.min(100, Math.max(0, (used / target) * 100)) : 0}%`;
    const card = byId('paperMarksGauge')?.closest('.marks-check-card');
    if (card) {
      card.classList.toggle('mismatch', target > 0 && used < target);
      card.classList.toggle('over', target > 0 && used > target);
    }
    const message = byId('paperMarksMessage');
    if (message) {
      if (!target) message.textContent = 'Enter maximum marks and add questions.';
      else if (!count) message.textContent = 'Add at least one question.';
      else if (remaining === 0) message.textContent = 'Marks total is correct. The paper is ready for final checking.';
      else if (remaining > 0) message.textContent = `${remaining} mark${remaining === 1 ? '' : 's'} still need to be added.`;
      else message.textContent = `The paper is ${Math.abs(remaining)} mark${Math.abs(remaining) === 1 ? '' : 's'} over the maximum.`;
    }
    syncPreviewHeader();
  }

  function defaultTitle() {
    const className = byId('paperClassInput')?.value || '';
    const subject = byId('paperSubjectInput')?.value || '';
    const exam = byId('paperExamInput')?.value || '';
    if (className && subject && exam) byId('paperTitleInput').value = `${className} ${subject} ${exam}`;
  }

  function sanitizeClone(editor) {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll('.bgps-image-resize-handle,.bgps-image-drag-handle,.image-drop-marker,[data-bgps-transient]').forEach((node) => node.remove());
    clone.querySelectorAll('.is-image-selected').forEach((node) => node.classList.remove('is-image-selected'));
    clone.querySelectorAll('[data-editor-bound]').forEach((node) => node.removeAttribute('data-editor-bound'));
    clone.querySelectorAll('[contenteditable],[draggable],[tabindex]').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('draggable');
      node.removeAttribute('tabindex');
    });
    return clone.innerHTML.trim();
  }

  function collectDraft() {
    const editor = byId('paperContentEditor');
    const className = normalize(byId('paperClassInput')?.value);
    const maxMarks = Number(byId('paperMaxMarksInput')?.value || 0);
    const chaptersRaw = normalize(byId('paperChaptersInput')?.value);
    return {
      draftId: currentDraftId || undefined,
      title: normalize(byId('paperTitleInput')?.value) || `${className} ${normalize(byId('paperSubjectInput')?.value)} ${normalize(byId('paperExamInput')?.value)}`,
      className,
      subject: normalize(byId('paperSubjectInput')?.value),
      exam: normalize(byId('paperExamInput')?.value),
      chapters: chaptersRaw || (isPrePrimary(className) ? 'Class-level learning outcomes' : ''),
      maxMarks,
      examDate: normalize(byId('paperDateInput')?.value),
      note: '',
      timeAllowed: normalize(byId('paperTimeInput')?.value) || inferTime(maxMarks),
      instructions: normalize(byId('paperInstructionsInput')?.value),
      languageMode: normalize(byId('paperLanguageInput')?.value) || 'english',
      editorHtml: editor ? sanitizeClone(editor) : '',
      bodyText: normalize(editor?.innerText),
      detectedMarks: detectedMarks(),
      totalQuestions: currentQuestionCount(),
      sourceType: currentRevision.sourceType || 'Manual',
      originalFileName: currentRevision.originalFileName || '',
      sourceFileId: currentRevision.sourceFileId || '',
      importWarnings: Array.isArray(currentRevision.importWarnings) ? currentRevision.importWarnings : [],
      originalPaperId: currentRevision.originalPaperId || '',
      parentPaperId: currentRevision.parentPaperId || '',
      previousVersion: Number(currentRevision.previousVersion || 0)
    };
  }

  function validateBasic(draft) {
    if (!draft.title || !draft.className || !draft.subject || !draft.exam) throw new Error('Enter Paper Title, Class, Subject and Exam / Term.');
    if (!draft.maxMarks || draft.maxMarks <= 0) throw new Error('Enter valid Maximum Marks.');
    if (!draft.timeAllowed) throw new Error('Enter Time Allowed.');
    if (!draft.chapters && !isPrePrimary(draft.className)) throw new Error('Enter Chapters / Portion.');
    if (!draft.editorHtml || draft.bodyText.length < 5) throw new Error('Write the question paper before saving.');
  }

  function validateForSubmit(draft) {
    validateBasic(draft);
    if (draft.bodyText.toLowerCase().includes('type question here')) throw new Error('Replace every “Type question here” placeholder before submission.');
    if (draft.totalQuestions <= 0) throw new Error('Add at least one question.');
    if (Math.abs(draft.detectedMarks - draft.maxMarks) > 0.01) throw new Error(`Detected marks (${draft.detectedMarks}) must match Maximum Marks (${draft.maxMarks}).`);
  }

  async function saveDraft(showToast = true) {
    // Safety router: Principal/Admin editing an already-submitted manual paper must NEVER
    // go through savePaperDraft(), because that endpoint intentionally rejects Admin.
    // Route any legacy/duplicate Save handler to the admin update endpoint instead.
    if ((editorMode === 'admin' || session?.isAdmin) && adminEditingPaperId) {
      return saveEditorChanges(showToast);
    }
    if (saveInFlight) return currentDraftId;
    const draft = collectDraft();
    validateBasic(draft);
    saveInFlight = true;
    const buttons = [byId('savePaperDraft'), byId('sidebarSaveDraft')].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; button.textContent = 'Saving…'; });
    try {
      const result = await window.BGPS_API.savePaperDraft(draft);
      currentDraftId = result.draftId || currentDraftId;
      syncDraftDeleteControl();
      markSaved(`Draft saved · ${new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
      if (showToast) toast('Question paper draft saved.');
      return currentDraftId;
    } catch (error) {
      const node = byId('paperSaveStatus');
      if (node) { node.textContent = 'Save failed — retry'; node.className = 'paper-save-status dirty'; }
      throw error;
    } finally {
      saveInFlight = false;
      buttons.forEach((button) => { button.disabled = false; button.textContent = button.id === 'savePaperDraft' ? 'Save Draft' : 'Save Draft'; });
    }
  }

  async function saveEditorChanges(showToast = true) {
    if (editorMode !== 'admin') return saveDraft(showToast);
    if (!adminEditingPaperId) throw new Error('No Admin paper is open for editing.');
    const draft = collectDraft();
    validateBasic(draft);
    const buttons = [byId('savePaperDraft'), byId('sidebarSaveDraft')].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; button.textContent = 'Saving…'; });
    try {
      const result = await window.BGPS_API.updatePaperContentAdmin(adminEditingPaperId, draft);
      dirty = false;
      markSaved(`Changes saved · ${new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
      if (showToast) toast('Question paper updated successfully.');
      window.BGPS_PAPERS.load(false).catch(() => {});
      return result;
    } finally {
      buttons.forEach((button) => { button.disabled = false; button.textContent = 'Save Changes'; });
    }
  }

  function updatePaperAccess() {
    if (editorMode === 'admin') {
      setHidden('paperAccessNote', true);
      if (byId('savePaperDraft')) byId('savePaperDraft').disabled = false;
      if (byId('sidebarSaveDraft')) byId('sidebarSaveDraft').disabled = false;
      setHidden('submitPaperForReview', true);
      return;
    }
    const permissions = settings?.permissions || {};
    const notice = byId('paperAccessNote');
    const createAllowed = permissions.canCreate !== false;
    const uploadAllowed = permissions.canUpload !== false;
    const sourceType = normalize(currentRevision?.sourceType).toLowerCase();
    const submitAllowed = sourceType === 'docx upload' ? uploadAllowed : createAllowed;
    byId('createNewPaper').disabled = !createAllowed;
    byId('openPaperUpload').disabled = !uploadAllowed;
    byId('submitPaperForReview').disabled = !submitAllowed;
    if (notice) {
      const message = settings?.settings?.adminNotice || '';
      notice.hidden = createAllowed && uploadAllowed && !message;
      notice.textContent = message || (!createAllowed && !uploadAllowed ? 'Question-paper creation and upload are currently unavailable.' : !createAllowed ? 'Manual paper creation is currently unavailable.' : 'Question-paper upload is currently unavailable.');
    }
  }

  async function loadData(showToast = false) {
    if (!session || session.isAdmin) return;
    const refresh = byId('refreshTeacherPapers');
    if (refresh) { refresh.disabled = true; refresh.textContent = 'Refreshing…'; }
    try {
      const [settingsResult, draftsResult, papersResult] = await Promise.all([
        window.BGPS_API.getPaperSettings(),
        window.BGPS_API.listPaperDrafts(),
        window.BGPS_API.listPapers()
      ]);
      settings = settingsResult || null;
      drafts = Array.isArray(draftsResult?.drafts) ? draftsResult.drafts : [];
      papers = Array.isArray(papersResult?.papers) ? papersResult.papers : [];
      window.BGPS_STATE.setPaperSettings(settingsResult?.settings || null);
      updatePaperAccess();
      renderList();
      if (showToast) toast('Question papers refreshed.');
    } catch (error) {
      const list = byId('teacherPaperList');
      if (list) list.innerHTML = `<div class="empty-state"><strong>Papers could not be loaded</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      if (showToast) toast(error.message || 'Could not load question papers.', 'error');
      throw error;
    } finally {
      if (refresh) { refresh.disabled = false; refresh.textContent = 'Refresh'; }
    }
  }

  function renderMetrics() {
    // Keep summary cards aligned with the exact items visible in My Question Papers.
    // When a submitted/correction paper has an active linked draft, combinedItems() hides
    // the parent paper and shows the draft instead. Counting raw `papers` caused cards
    // such as Correction Required to be higher than the visible current-paper list.
    const currentItems = combinedItems();
    const currentPapers = currentItems.filter((item) => item.kind === 'paper');
    const currentDrafts = currentItems.filter((item) => item.kind === 'draft');
    setText('teacherPaperMetricDraft', currentDrafts.length);
    setText('teacherPaperMetricSubmitted', currentPapers.filter((paper) => statusKey(paper.status) === 'submitted').length);
    setText('teacherPaperMetricCorrection', currentPapers.filter((paper) => statusKey(paper.status) === 'correction required').length);
    setText('teacherPaperMetricApproved', currentPapers.filter((paper) => statusKey(paper.status) === 'approved').length);
  }

  function combinedItems() {
    const linkedPaperIds = new Set(drafts.map((draft) => String(draft.parentPaperId || '')).filter(Boolean));
    const draftItems = drafts.map((draft) => ({ ...draft, kind: 'draft', status: 'Draft', updatedSort: draft.updatedAt || draft.createdAt || '' }));
    const paperItems = papers
      .filter((paper) => !linkedPaperIds.has(String(paper.paperId || '')))
      .map((paper) => ({ ...paper, kind: 'paper', updatedSort: paper.updatedAt || paper.uploadedAt || '' }));
    return [...draftItems, ...paperItems].sort((a, b) => String(b.updatedSort).localeCompare(String(a.updatedSort)));
  }

  function renderList() {
    renderMetrics();
    const list = byId('teacherPaperList');
    if (!list) return;
    const status = normalize(byId('teacherPaperStatusFilter')?.value);
    const className = normalize(byId('teacherPaperClassFilter')?.value);
    const search = normalize(byId('teacherPaperSearch')?.value).toLowerCase();
    const items = combinedItems().filter((item) => {
      if (status && normalize(item.status) !== status) return false;
      if (className && normalize(item.className) !== className) return false;
      if (search) {
        const haystack = [item.title, item.subject, item.exam, item.className, item.chapters].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><strong>No question papers found</strong>Create a new paper or change the current filters.</div>';
      return;
    }
    list.innerHTML = items.map((item) => {
      const isDraft = item.kind === 'draft';
      const correction = statusKey(item.status) === 'correction required';
      const approved = statusKey(item.status) === 'approved';
      const submitted = statusKey(item.status) === 'submitted';
      const resubmitted = submitted && item.resubmitted === true;
      const title = item.title || `${item.className || ''} ${item.subject || ''} ${item.exam || ''}`.trim() || 'Question Paper';
      let actions = '';
      if (isDraft) actions = `<button class="btn primary" type="button" data-edit-draft="${escapeHtml(item.draftId)}">Continue Editing</button><button class="btn" type="button" data-preview-draft="${escapeHtml(item.draftId)}">Preview</button><button class="btn danger-outline" type="button" data-delete-draft="${escapeHtml(item.draftId)}">Delete Draft</button>`;
      else if (correction) actions = `<button class="btn primary" type="button" data-edit-paper="${escapeHtml(item.paperId)}">Edit &amp; Resubmit</button><button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>`;
      else if (submitted) actions = `<button class="btn primary" type="button" data-edit-paper="${escapeHtml(item.paperId)}">Edit Paper</button><button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>`;
      else actions = `<button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>`;
      return `<article class="teacher-paper-item"><div class="teacher-paper-main"><div class="teacher-paper-title-row"><h3>${escapeHtml(title)}</h3><span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status || 'Submitted')}</span>${resubmitted ? '<span class="status-chip resubmitted">Corrected &amp; Resubmitted</span>' : ''}${item.version ? `<span class="status-chip">Version ${escapeHtml(item.version)}</span>` : ''}</div><div class="teacher-paper-meta"><span>${escapeHtml(item.className || '—')}</span><span>${escapeHtml(item.subject || '—')}</span><span>${escapeHtml(item.exam || '—')}</span><span>${escapeHtml(item.maxMarks || '—')} marks</span><span>Updated ${escapeHtml(safeDate(item.updatedAt || item.updatedSort))}</span></div>${correction && item.adminNote ? `<div class="teacher-paper-note"><strong>Principal note:</strong> ${escapeHtml(item.adminNote)}</div>` : ''}${resubmitted ? `<div class="teacher-paper-note" style="border-left-color:#5b4bb7;background:#faf9ff;color:#46378f"><strong>Correction sent:</strong> Version ${escapeHtml(item.version || 1)} is awaiting Principal re-review.${item.adminNote ? ` Returned note: ${escapeHtml(item.adminNote)}` : ''}</div>` : ''}${approved ? '<div class="teacher-paper-note" style="border-left-color:#188f4d;background:#f1faf4;color:#245f3c"><strong>Approved:</strong> This paper is ready for use.</div>' : ''}</div><div class="teacher-paper-actions">${actions}</div></article>`;
    }).join('');
  }

  function setEditorMode(show) {
    setHidden('paperCentreHome', Boolean(show));
    setHidden('paperEditorWorkspace', !show);
    if (show) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function syncDraftDeleteControl() {
    const button = byId('deleteCurrentPaperDraft');
    if (!button) return;
    const canDelete = Boolean(currentDraftId);
    button.hidden = !canDelete;
    button.disabled = !canDelete;
  }

  function clearEditor() {
    currentDraftId = '';
    currentRevision = {};
    dirty = false;
    selectedImage = null;
    editorRange = null;
    ['paperTitleInput', 'paperMaxMarksInput', 'paperTimeInput', 'paperDateInput', 'paperChaptersInput', 'paperInstructionsInput'].forEach((id) => { const node = byId(id); if (node) node.value = ''; });
    if (byId('paperLanguageInput')) byId('paperLanguageInput').value = 'english';
    if (byId('paperContentEditor')) byId('paperContentEditor').innerHTML = '';
    const defaultClass = session?.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0];
    if (byId('paperClassInput')) byId('paperClassInput').value = defaultClass;
    populateSubjects('paperClassInput', 'paperSubjectInput');
    if (byId('paperExamInput')) byId('paperExamInput').value = window.BGPS_DATA.EXAMS[0] || '';
    setHidden('paperCorrectionBanner', true);
    setText('paperEditorEyebrow', 'Question Paper Creator');
    setText('paperEditorTitle', 'Create Question Paper');
    setText('paperEditorSubtitle', 'Prepare the paper in A4 format and save it as a draft before submission.');
    const status = byId('paperSaveStatus');
    if (status) { status.textContent = 'Not saved yet'; status.className = 'paper-save-status'; }
    deselectImage();
    syncDraftDeleteControl();
    updateChecks();
  }

  function openNewPaper() {
    if (settings?.permissions?.canCreate === false) {
      toast(settings?.settings?.adminNotice || 'Question-paper creation is currently unavailable.', 'error');
      return;
    }
    clearEditor();
    updatePaperAccess();
    setEditorMode(true);
    byId('paperTitleInput')?.focus();
  }

  function loadDraftIntoEditor(draft, correctionMode, options = {}) {
    clearEditor();
    const isAdminEdit = options.admin === true;
    const linkedPaper = Boolean(isAdminEdit || correctionMode || draft.parentPaperId || (draft.paperId && !draft.draftId));
    const correctionRequired = !isAdminEdit && (Boolean(correctionMode) || statusKey(draft.status) === 'correction required');
    const pendingTeacherEdit = !isAdminEdit && linkedPaper && !correctionRequired;

    editorMode = isAdminEdit ? 'admin' : 'teacher';
    adminEditingPaperId = isAdminEdit ? String(draft.paperId || '') : '';
    currentDraftId = draft.draftId || '';
    currentRevision = linkedPaper ? {
      originalPaperId: draft.originalPaperId || draft.paperId || '',
      parentPaperId: draft.parentPaperId || draft.paperId || '',
      previousVersion: Number(draft.previousVersion || draft.version || 0),
      sourceType: draft.sourceType || 'Manual',
      originalFileName: draft.originalFileName || '',
      sourceFileId: draft.sourceFileId || '',
      importWarnings: Array.isArray(draft.importWarnings) ? draft.importWarnings : []
    } : {
      originalPaperId: draft.originalPaperId || '',
      parentPaperId: draft.parentPaperId || '',
      previousVersion: Number(draft.previousVersion || 0),
      sourceType: draft.sourceType || 'Manual',
      originalFileName: draft.originalFileName || '',
      sourceFileId: draft.sourceFileId || '',
      importWarnings: Array.isArray(draft.importWarnings) ? draft.importWarnings : []
    };

    const values = {
      paperTitleInput: draft.title || '', paperMaxMarksInput: draft.maxMarks || '', paperTimeInput: draft.timeAllowed || '', paperDateInput: draft.examDate || '', paperChaptersInput: draft.chapters || '', paperInstructionsInput: draft.instructions || '', paperLanguageInput: draft.languageMode || 'english'
    };
    Object.entries(values).forEach(([id, value]) => { const node = byId(id); if (node) node.value = value; });
    if (byId('paperClassInput')) byId('paperClassInput').value = draft.className || window.BGPS_DATA.CLASSES[0];
    populateSubjects('paperClassInput', 'paperSubjectInput');
    if (byId('paperSubjectInput')) byId('paperSubjectInput').value = draft.subject || '';
    if (byId('paperExamInput')) byId('paperExamInput').value = draft.exam || window.BGPS_DATA.EXAMS[0];
    if (byId('paperContentEditor')) byId('paperContentEditor').innerHTML = draft.editorHtml || '';
    hydrateImages();

    if (Array.isArray(draft.importWarnings) && draft.importWarnings.length) {
      toast('Imported DOCX content loaded. Please verify equations and images before saving.');
    }

    if (isAdminEdit) {
      setHidden('paperCorrectionBanner', true);
      setText('paperEditorEyebrow', 'Principal Paper Editor');
      setText('paperEditorTitle', 'Edit Submitted Question Paper');
      setText('paperEditorSubtitle', `${draft.className || ''} · ${draft.subject || ''} · Version ${draft.version || 1}`);
      setText('closePaperEditor', 'Back to Paper Approval');
      setText('savePaperDraft', 'Save Changes');
      setText('sidebarSaveDraft', 'Save Changes');
      setHidden('submitPaperForReview', true);
      markSaved(`Admin edit mode · Version ${draft.version || 1}`);
    } else if (correctionRequired) {
      setHidden('paperCorrectionBanner', false);
      setText('paperCorrectionNote', draft.adminNote || draft.note || 'Please revise the paper as advised by the principal.');
      setText('paperEditorEyebrow', 'Correction Required');
      setText('paperEditorTitle', 'Correct and Resubmit Paper');
      setText('paperEditorSubtitle', `Revision of Version ${draft.version || draft.previousVersion || 1}`);
      setText('closePaperEditor', 'Back to My Papers');
      setText('savePaperDraft', 'Save Draft');
      setText('sidebarSaveDraft', 'Save Draft');
      setHidden('submitPaperForReview', false);
      markDirty();
    } else if (pendingTeacherEdit) {
      setHidden('paperCorrectionBanner', true);
      setText('paperEditorEyebrow', 'Submitted Paper');
      setText('paperEditorTitle', 'Edit Submitted Paper');
      setText('paperEditorSubtitle', `Update Version ${draft.version || 1} before Principal approval.`);
      setText('closePaperEditor', 'Back to My Papers');
      setText('savePaperDraft', 'Save Draft');
      setText('sidebarSaveDraft', 'Save Draft');
      setHidden('submitPaperForReview', false);
      markSaved(`Submitted paper loaded · ${safeDate(draft.updatedAt) || 'ready to edit'}`);
    } else {
      setHidden('paperCorrectionBanner', true);
      setText('paperEditorEyebrow', 'Saved Draft');
      setText('paperEditorTitle', 'Continue Question Paper');
      setText('paperEditorSubtitle', 'Review the paper, complete the marks total and submit it for approval.');
      setText('closePaperEditor', 'Back to My Papers');
      setText('savePaperDraft', 'Save Draft');
      setText('sidebarSaveDraft', 'Save Draft');
      setHidden('submitPaperForReview', false);
      markSaved(`Draft loaded · ${safeDate(draft.updatedAt)}`);
    }

    syncDraftDeleteControl();
    updateChecks();
    updatePaperAccess();
    setEditorMode(true);
  }

  async function openDraft(draftId) {
    try {
      const result = await window.BGPS_API.getPaperDraft(draftId);
      loadDraftIntoEditor(result.draft || {}, false);
    } catch (error) {
      toast(error.message || 'Could not open the draft.', 'error');
    }
  }

  async function openExistingPaperForEdit(paperId) {
    try {
      const result = await window.BGPS_API.getPaperContent(paperId);
      const paper = result.paper || {};
      if (result.requiresReplacement || result.editable === false) {
        if (statusKey(paper.status) === 'correction required') {
          openUploadModal({ correctionPaper: paper });
          toast('This returned paper is reference-only. Upload a corrected DOCX to resubmit it with the same Paper ID.');
        } else {
          toast('This submitted file is reference-only and cannot be edited in the portal. Preview remains available.', 'error');
        }
        return;
      }
      loadDraftIntoEditor(paper, statusKey(paper.status) === 'correction required');
    } catch (error) {
      toast(error.message || 'Could not open the paper for editing.', 'error');
    }
  }

  async function openAdminEdit(paperId) {
    try {
      if (!session?.isAdmin) throw new Error('Admin access is required.');
      const result = await window.BGPS_API.getPaperContent(paperId);
      if (result.requiresReplacement || result.editable === false) {
        throw new Error('This paper is reference-only and cannot be edited safely in the portal.');
      }
      window.BGPS_APP.openView('teacher-papers');
      loadDraftIntoEditor(result.paper || {}, false, { admin: true });
    } catch (error) {
      toast(error.message || 'Could not open Admin paper edit mode.', 'error');
    }
  }

  function closeEditor() {
    if (dirty && !window.confirm('This paper has unsaved changes. Leave the editor without saving?')) return;
    const wasAdmin = editorMode === 'admin';
    setEditorMode(false);
    deselectImage();
    editorMode = 'teacher';
    adminEditingPaperId = '';
    setText('closePaperEditor', 'Back to My Papers');
    setText('savePaperDraft', 'Save Draft');
    setText('sidebarSaveDraft', 'Save Draft');
    setHidden('submitPaperForReview', false);
    if (wasAdmin) {
      window.BGPS_APP.openView('papers');
      window.BGPS_PAPERS.load(false).catch(() => {});
    } else {
      loadData(false).catch(() => {});
    }
  }

  async function deleteDraft(draftId) {
    const id = String(draftId || '').trim();
    if (!id) return;
    const draft = drafts.find((item) => String(item.draftId) === id);
    const title = draft?.title || 'this saved draft';
    if (!window.confirm(`Delete ${title}? This action cannot be undone.`)) return;
    try {
      await window.BGPS_API.deletePaperDraft(id);
      drafts = drafts.filter((item) => String(item.draftId) !== id);
      if (String(currentDraftId) === id) {
        currentDraftId = '';
        currentRevision = {};
        dirty = false;
        setEditorMode(false);
      }
      syncDraftDeleteControl();
      renderList();
      toast('Draft deleted.');
    } catch (error) {
      toast(error.message || 'Could not delete the draft.', 'error');
    }
  }

  function buildPreviewDocument(draft) {
    const instructions = normalize(draft.instructions).split(/\n+/).map(normalize).filter(Boolean);
    const instructionsHtml = instructions.length ? `<div class="instructions"><strong>General Instructions</strong><ol>${instructions.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol></div>` : '';
    const date = draft.examDate || '____________';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4 portrait;margin:11mm 13mm}*{box-sizing:border-box}body{margin:0;background:#dde5ed;color:#111;font-family:Georgia,"Noto Serif Devanagari","Mangal",serif;font-size:10.8pt;line-height:1.34}.print{position:sticky;top:0;z-index:3;text-align:center;padding:8px;background:#dde5ed}.print button{padding:8px 14px;font-weight:700}.paper{width:184mm;min-height:270mm;max-width:calc(100% - 22px);margin:0 auto 20px;padding:0;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.16)}.header{text-align:center;border-bottom:1.4px solid #111;padding:0 0 4px;margin-bottom:5px}.header h1{font-size:18pt;margin:0}.exam{font-size:12pt;font-weight:900;text-transform:uppercase}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;border-bottom:1px solid #555;padding:4px 0 6px;margin-bottom:7px;font-weight:800;font-size:9.8pt}.meta div:nth-child(even){text-align:right}.instructions{border:1px solid #777;padding:5px 9px;margin-bottom:7px;font-size:9.5pt}.instructions ol{margin:3px 0 0 18px;padding:0}.content{position:relative;min-height:220mm}.content::after{content:"";display:block;clear:both}.content p{margin:3px 0;white-space:pre-wrap;tab-size:4}.content .section-heading{clear:both;display:flex;justify-content:space-between;margin:8px 0 4px;padding:3px 6px;border:1px solid #222;background:#f1f1f1;font-size:10.2pt}.question-line{position:relative;padding-right:12mm;break-inside:avoid}.mark-token{float:right;display:inline-flex;align-items:center;justify-content:center;min-width:11mm;min-height:6mm;margin:-.5mm 0 .5mm 2.5mm;padding:.5mm 1.6mm;border:1px solid #555;border-radius:1.2mm;background:#fff;font-weight:900;line-height:1;white-space:nowrap}.or-line{text-align:center;font-weight:900}.content table{clear:both;width:100%;border-collapse:collapse;margin:4px 0}.content td,.content th{border:1px solid #333;padding:3px 4px}.page-break{clear:both;page-break-after:always;height:0;margin:0;border:0}.diagram-box.has-image{box-sizing:border-box;width:var(--bgps-image-width,100%);max-width:100%;padding:1mm;border:0;background:#fff;text-align:center;break-inside:avoid}.diagram-box.has-image>img{display:block;width:100%;height:auto;max-width:100%;max-height:none;margin:auto;object-fit:contain}.diagram-box.bgps-img-center{float:none;clear:both;margin:2mm auto 2.6mm}.diagram-box.bgps-img-left{float:left;clear:none;max-width:48%;margin:1mm 3mm 2mm 0}.diagram-box.bgps-img-right{float:right;clear:none;max-width:48%;margin:1mm 0 2mm 3mm}.diagram-box.bgps-img-inline{display:inline-block;float:none;clear:none;vertical-align:middle;max-width:80%;margin:0 2mm 1mm}.diagram-caption{font-size:7.8pt;margin-top:.5mm;text-align:center;font-style:italic}.bgps-image-resize-handle,.q-placeholder{display:none}@media print{body{background:#fff}.print{display:none}.paper{width:auto;max-width:none;min-height:0;margin:0;box-shadow:none}}@media(max-width:700px){.paper{max-width:100%;padding:0 12px;min-height:0}.meta{grid-template-columns:1fr}.meta div:nth-child(even){text-align:left}}</style></head><body><main class="paper"><div class="header"><h1>BG PUBLIC SCHOOL</h1><div class="exam">${escapeHtml(draft.exam || 'EXAM / TERM')}</div></div><div class="meta"><div>Class: ${escapeHtml(draft.className)}</div><div>Subject: ${escapeHtml(draft.subject)}</div><div>Time Allotted: ${escapeHtml(draft.timeAllowed || inferTime(draft.maxMarks))}</div><div>Maximum Marks: ${escapeHtml(draft.maxMarks)}</div><div>Reading Time: ${escapeHtml(readingTime(draft.className, draft.maxMarks))}</div><div>Date: ${escapeHtml(date)}</div></div>${instructionsHtml}<div class="content">${draft.editorHtml || ''}</div></main></body></html>`;
  }

  function setPreviewHeader(title, meta, status) {
    setText('teacherPaperPreviewTitle', title || 'Question Paper Preview');
    setText('teacherPaperPreviewMeta', meta || '—');
    const chip = byId('teacherPaperPreviewStatus');
    if (chip) { chip.textContent = status || 'Preview'; chip.className = `status-chip ${statusClass(status)}`; }
  }

  function showHtmlPreview(documentHtml, title, meta, status, allowSubmit = false) {
    revokeObjectUrl();
    setPreviewHeader(title, meta, status);
    const body = byId('teacherPaperPreviewBody');
    if (body) {
      body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="Question paper preview" sandbox="allow-modals allow-same-origin"></iframe>';
      body.querySelector('iframe').srcdoc = documentHtml;
    }
    setHidden('downloadTeacherPaper', true);
    setHidden('openTeacherPaperPreviewExternal', true);
    setHidden('submitFromTeacherPaperPreview', !allowSubmit);
    setText('closeTeacherPaperPreviewFooter', 'Back to Edit');
    if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = false;
    openModal('teacherPaperPreviewModal');
  }

  async function showPendingPdfUploadPreview(file, payload) {
    pendingPdfUpload = payload;
    revokeObjectUrl();
    currentPreviewUrl = URL.createObjectURL(file);
    setPreviewHeader(payload.fileName || 'PDF Question Paper', `${payload.className} · ${payload.subject} · ${payload.exam}`, 'Review before submission');
    const body = byId('teacherPaperPreviewBody');
    if (!body) throw new Error('The PDF preview area is unavailable.');
    body.innerHTML = '<div class="empty-state"><strong>Preparing PDF preview</strong>Please wait while the selected file is opened.</div>';
    setHidden('downloadTeacherPaper', true);
    setHidden('openTeacherPaperPreviewExternal', false);
    setHidden('submitFromTeacherPaperPreview', false);
    setText('submitFromTeacherPaperPreview', 'Continue to Submit');
    setText('closeTeacherPaperPreviewFooter', 'Back to Upload');
    if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = false;
    openModal('teacherPaperPreviewModal');
    if (window.BGPS_PDF_PREVIEW.shouldUseCanvas()) {
      await window.BGPS_PDF_PREVIEW.render(file, body);
    } else {
      body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="Uploaded PDF preview"></iframe>';
      body.querySelector('iframe').src = currentPreviewUrl;
    }
  }

  function showPendingDocxUploadReview(file, payload) {
    pendingPdfUpload = payload;
    revokeObjectUrl();
    setPreviewHeader(payload.fileName || 'DOCX Question Paper', `${payload.className} · ${payload.subject} · ${payload.exam}`, 'Original DOCX preserved');
    const body = byId('teacherPaperPreviewBody');
    if (!body) throw new Error('The paper review area is unavailable.');
    const sizeMb = (Number(file?.size || 0) / (1024 * 1024)).toFixed(2);
    body.innerHTML = `<div class="empty-state safe-upload-review"><strong>Original DOCX will be kept unchanged</strong><span>${escapeHtml(payload.fileName || 'Question paper.docx')} · ${escapeHtml(sizeMb)} MB</span><span>BGPS will not rebuild, resize or reflow the document. Images, equations, tables, headers and Word layout remain in the original DOCX.</span><span>After submission, the Principal can preview the generated review PDF and download the original DOCX.</span></div>`;
    setHidden('downloadTeacherPaper', true);
    setHidden('openTeacherPaperPreviewExternal', true);
    setHidden('submitFromTeacherPaperPreview', false);
    setText('submitFromTeacherPaperPreview', 'Continue to Submit');
    setText('closeTeacherPaperPreviewFooter', 'Back to Upload');
    if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = true;
    openModal('teacherPaperPreviewModal');
  }

  async function previewDraft(draftId) {
    try {
      const [preview, draftResult] = await Promise.all([
        window.BGPS_API.getPaperDraftPreview(draftId),
        window.BGPS_API.getPaperDraft(draftId).catch(() => ({ draft: {} }))
      ]);
      const draft = draftResult.draft || {};
      showHtmlPreview(preview.documentHtml, preview.title || draft.title, `${draft.className} · ${draft.subject} · ${draft.exam}`, 'Draft');
    } catch (error) {
      toast(error.message || 'Could not preview the draft.', 'error');
    }
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  }

  async function previewPaper(paperId) {
    const paper = papers.find((item) => String(item.paperId) === String(paperId));
    if (!paper) return;
    revokeObjectUrl();
    setHidden('downloadTeacherPaper', true);
    setHidden('openTeacherPaperPreviewExternal', true);
    setHidden('submitFromTeacherPaperPreview', true);
    if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = true;
    setPreviewHeader(paper.title, `${paper.className} · ${paper.subject} · ${paper.exam}`, paper.status);
    const body = byId('teacherPaperPreviewBody');
    if (body) body.innerHTML = '<div class="empty-state"><strong>Opening paper</strong>Please wait while the file is prepared.</div>';
    openModal('teacherPaperPreviewModal');
    try {
      const [previewResult, originalFile] = await Promise.all([
        window.BGPS_API.getPaperPreview(paperId),
        window.BGPS_API.getPaperFile(paperId).catch(() => null)
      ]);
      if (originalFile?.fileBase64) {
        const originalBlob = base64ToBlob(originalFile.fileBase64, originalFile.mimeType);
        revokeObjectUrl();
        currentObjectUrl = URL.createObjectURL(originalBlob);
      }
      const download = byId('downloadTeacherPaper');
      if (download) {
        download.hidden = statusKey(paper.status) !== 'approved' || !currentObjectUrl;
        download.dataset.fileName = originalFile?.fileName || previewResult.originalFileName || 'question-paper';
        const downloadMime = String(originalFile?.mimeType || '').toLowerCase();
        const downloadName = String(download.dataset.fileName || '').toLowerCase();
        download.textContent = downloadMime.includes('pdf') || downloadName.endsWith('.pdf') ? 'Download PDF' : (downloadMime.includes('wordprocessingml') || downloadName.endsWith('.docx') ? 'Download Original DOCX' : 'Download File');
      }

      if (!previewResult || previewResult.previewAvailable === false || !previewResult.fileBase64) {
        const message = previewResult?.error || 'Use Download File to open the original paper.';
        body.innerHTML = `<div class="empty-state"><strong>Preview could not be prepared</strong>${escapeHtml(message)}</div>`;
        return;
      }
      const previewMime = String(previewResult.mimeType || '');
      const previewBlob = base64ToBlob(previewResult.fileBase64, previewMime);
      if (previewMime.includes('html')) {
        const text = await previewBlob.text();
        body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="Question paper preview" sandbox="allow-modals allow-same-origin"></iframe>';
        body.querySelector('iframe').srcdoc = text;
        if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = false;
      } else if (previewMime.includes('pdf')) {
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(previewBlob);
        const previewUrl = currentPreviewUrl;
        if (window.BGPS_PDF_PREVIEW.shouldUseCanvas()) {
          try {
            await window.BGPS_PDF_PREVIEW.render(previewBlob, body);
          } catch (error) {
            body.innerHTML = `<div class="empty-state"><strong>Inline preview could not be opened</strong>${escapeHtml(error.message || 'Use Open PDF to open the paper in your PDF app.')}</div>`;
          }
        } else {
          body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="Question paper PDF"></iframe>';
          body.querySelector('iframe').src = previewUrl;
        }
        setHidden('openTeacherPaperPreviewExternal', false);
        if (byId('printTeacherPaper')) byId('printTeacherPaper').disabled = false;
      } else if (previewMime.startsWith('image/')) {
        if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = URL.createObjectURL(previewBlob);
        const previewUrl = currentPreviewUrl;
        body.innerHTML = `<div style="display:grid;place-items:center;min-height:500px"><img src="${previewUrl}" alt="Question paper preview" style="max-width:100%;height:auto"></div>`;
      } else {
        body.innerHTML = `<div class="empty-state"><strong>Preview is unavailable</strong>Use Download File to open the original paper.</div>`;
      }
    } catch (error) {
      if (body) body.innerHTML = `<div class="empty-state"><strong>Paper could not be opened</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
    }
  }

  async function previewCurrent() {
    if (previewInFlight) return;
    const buttons = [byId('previewCurrentPaper'), byId('sidebarPreviewPaper')].filter(Boolean);
    try {
      const draft = collectDraft();
      validateBasic(draft);
      previewInFlight = true;
      buttons.forEach((button) => { button.disabled = true; button.textContent = 'Preparing…'; });
      setPreviewHeader(draft.title, `${draft.className} · ${draft.subject} · ${draft.exam}`, 'Preparing');
      const body = byId('teacherPaperPreviewBody');
      if (body) body.innerHTML = '<div class="empty-state"><strong>Preparing latest preview</strong>Saving your current changes and building the standard A4 paper.</div>';
      openModal('teacherPaperPreviewModal');
      if ((editorMode === 'admin' || session?.isAdmin) && adminEditingPaperId) {
        // Admin/Principal preview is local and read-only until Save Changes is explicitly clicked.
        // Do not call savePaperDraft(): backend correctly blocks Admin from creating teacher drafts.
        const documentHtml = buildPreviewDocument(draft);
        showHtmlPreview(documentHtml, draft.title, `${draft.className} · ${draft.subject} · ${draft.exam}`, 'Preview ready', false);
      } else {
        const draftId = await saveDraft(false);
        const preview = await window.BGPS_API.getPaperDraftPreview(draftId);
        showHtmlPreview(preview.documentHtml, preview.title || draft.title, `${draft.className} · ${draft.subject} · ${draft.exam}`, 'Preview ready', true);
      }
    } catch (error) {
      const body = byId('teacherPaperPreviewBody');
      if (body && byId('teacherPaperPreviewModal')?.classList.contains('open')) {
        body.innerHTML = `<div class="empty-state"><strong>Preview could not be prepared</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      } else {
        toast(error.message || 'Preview could not be prepared.', 'error');
      }
    } finally {
      previewInFlight = false;
      buttons.forEach((button) => { button.disabled = false; button.textContent = button.id === 'sidebarPreviewPaper' ? 'Preview Paper' : 'Preview'; });
    }
  }

  function closePreview(preservePendingPdf = false) {
    const preservePdf = preservePendingPdf === true;
    const returnToUpload = !preservePdf && Boolean(pendingPdfUpload);
    closeModal('teacherPaperPreviewModal');
    revokeObjectUrl();
    if (!preservePdf) pendingPdfUpload = null;
    setHidden('openTeacherPaperPreviewExternal', true);
    setHidden('submitFromTeacherPaperPreview', true);
    setText('closeTeacherPaperPreviewFooter', 'Back to Edit');
    const body = byId('teacherPaperPreviewBody');
    if (body) body.innerHTML = '';
    if (returnToUpload) openModal('paperUploadModal');
  }

  function printPreview() {
    const frame = byId('teacherPaperPreviewBody')?.querySelector('iframe');
    if (frame?.contentWindow) frame.contentWindow.print();
    else if (currentPreviewUrl || currentObjectUrl) window.open(currentPreviewUrl || currentObjectUrl, '_blank', 'noopener');
  }

  function openPreviewExternally() {
    const url = currentPreviewUrl || currentObjectUrl;
    if (!url) { toast('A PDF preview is not available for this paper.', 'error'); return; }
    window.open(url, '_blank', 'noopener');
  }

  function downloadPreview() {
    if (!currentObjectUrl) return;
    const link = document.createElement('a');
    link.href = currentObjectUrl;
    link.download = byId('downloadTeacherPaper')?.dataset.fileName || 'question-paper';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function prepareSubmit() {
    try {
      pendingPdfUpload = null;
      setText('paperSubmitTitle', 'Submit Question Paper');
      const draft = collectDraft();
      validateForSubmit(draft);
      setText('submitPaperClass', draft.className);
      setText('submitPaperSubject', draft.subject);
      setText('submitPaperExam', draft.exam);
      setText('submitPaperQuestions', draft.totalQuestions);
      setText('submitPaperMarks', draft.detectedMarks);
      setText('submitPaperMaxMarks', draft.maxMarks);
      openModal('paperSubmitModal');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function preparePendingPdfSubmit() {
    if (!pendingPdfUpload) return;
    const name = String(pendingPdfUpload.fileName || '').toLowerCase();
    const isDocx = name.endsWith('.docx');
    setText('paperSubmitTitle', isDocx ? 'Submit Original DOCX' : 'Submit PDF Question Paper');
    setText('submitPaperClass', pendingPdfUpload.className);
    setText('submitPaperSubject', pendingPdfUpload.subject);
    setText('submitPaperExam', pendingPdfUpload.exam);
    setText('submitPaperQuestions', isDocx ? 'Original DOCX' : 'Reference PDF');
    setText('submitPaperMarks', isDocx ? 'Layout preserved' : 'Check preview');
    setText('submitPaperMaxMarks', pendingPdfUpload.maxMarks);
    openModal('paperSubmitModal');
  }

  function cancelPaperSubmit() {
    const wasPdf = Boolean(pendingPdfUpload);
    closeModal('paperSubmitModal');
    setText('paperSubmitTitle', 'Submit Question Paper');
    if (wasPdf) {
      pendingPdfUpload = null;
      openModal('paperUploadModal');
      setUploadProgress('The file was not submitted. Review it again when you are ready.');
    }
  }

  function showSubmissionSuccess(result) {
    const resubmitted = Boolean(result?.resubmitted);
    setText('paperSubmitSuccessTitle', resubmitted ? 'Corrected Paper Resent Successfully' : 'Paper Sent Successfully');
    setText('submittedPaperId', result?.paperId || 'Recorded');
    setText('submittedPaperStatus', result?.status || 'Submitted');
    setText('submittedPaperVersion', result?.version || 1);
    openModal('paperSubmitSuccessModal');
  }

  async function submitPaper() {
    if (submitInFlight) return;
    if (saveInFlight) { toast('Please wait for the current save to finish.', 'error'); return; }
    submitInFlight = true;
    const button = byId('confirmPaperSubmit');
    if (button) { button.disabled = true; button.textContent = 'Submitting…'; }
    try {
      let result;
      if (pendingPdfUpload) {
        result = await window.BGPS_API.uploadPaper(pendingPdfUpload);
      } else {
        const draftId = await saveDraft(false);
        result = await window.BGPS_API.submitPaperDraft(draftId);
      }
      closeModal('paperSubmitModal');
      closeModal('paperUploadModal');
      setEditorMode(false);
      currentDraftId = '';
      currentRevision = {};
      dirty = false;
      pendingPdfUpload = null;
      uploadRevisionContext = null;
      byId('paperUploadForm')?.reset();
      setUploadProgress('');
      setText('paperSubmitTitle', 'Submit Question Paper');
      syncDraftDeleteControl();
      showSubmissionSuccess(result);
      loadData(false).catch(() => {
        toast('Paper was sent successfully. Refresh My Papers to update the list.');
      });
    } catch (error) {
      toast(error.message || 'Could not submit the paper.', 'error');
    } finally {
      submitInFlight = false;
      if (button) { button.disabled = false; button.textContent = 'Submit for Approval'; }
    }
  }

  async function compressImage(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Select a PNG, JPG or WebP image.');
    if (file.size > 12 * 1024 * 1024) throw new Error('The image is too large. Use an image below 12 MB.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The image could not be read.'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('The image could not be opened.'));
      node.src = dataUrl;
    });
    const maxSide = 1400;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: file.type === 'image/png' });
    context.drawImage(image, 0, 0, width, height);
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return canvas.toDataURL(mime, mime === 'image/png' ? undefined : 0.84);
  }

  function transientHandle() {
    const handle = document.createElement('span');
    handle.className = 'bgps-image-resize-handle';
    handle.dataset.bgpsTransient = 'true';
    handle.setAttribute('aria-hidden', 'true');
    return handle;
  }

  function transientDragHandle() {
    const handle = document.createElement('span');
    handle.className = 'bgps-image-drag-handle';
    handle.dataset.bgpsTransient = 'true';
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', 'Move image');
    handle.title = 'Drag to move image';
    handle.textContent = '';
    return handle;
  }

  function imageWidth(box) {
    const raw = box.style.getPropertyValue('--bgps-image-width') || box.style.width || '100%';
    const number = Number.parseFloat(raw);
    return Number.isFinite(number) ? Math.min(100, Math.max(20, number)) : 100;
  }

  function layoutForBox(box) {
    if (box.classList.contains('bgps-img-left')) return 'left';
    if (box.classList.contains('bgps-img-right')) return 'right';
    if (box.classList.contains('bgps-img-inline')) return 'inline';
    if (box.classList.contains('bgps-img-free')) return 'free';
    return 'center';
  }

  function applyImageWidth(box, width) {
    // One sizing authority only: the Scale slider / resize handle.
    // Alignment must never silently shrink or reset the selected image.
    const value = Math.min(100, Math.max(20, Number(width) || 100));
    box.style.setProperty('--bgps-image-width', `${value}%`);
    box.style.width = `${value}%`;
    if (selectedImage === box) {
      if (byId('paperImageWidth')) byId('paperImageWidth').value = String(value);
      setText('paperImageWidthValue', `${Math.round(value)}%`);
    }
    markDirty();
  }

  function freeImageOffset(box) {
    return {
      x: parseFloat(box?.style?.getPropertyValue('--bgps-free-x')) || 0,
      y: parseFloat(box?.style?.getPropertyValue('--bgps-free-y')) || 0
    };
  }

  function applyFreeImageOffset(box, x, y) {
    if (!box) return;
    const safeX = Number.isFinite(Number(x)) ? Math.round(Number(x) * 10) / 10 : 0;
    const safeY = Number.isFinite(Number(y)) ? Math.round(Number(y) * 10) / 10 : 0;
    box.style.setProperty('--bgps-free-x', `${safeX}px`);
    box.style.setProperty('--bgps-free-y', `${safeY}px`);
    box.style.transform = 'translate3d(var(--bgps-free-x), var(--bgps-free-y), 0)';
  }

  function resetFreeImageOffset(box) {
    if (!box) return;
    box.style.removeProperty('--bgps-free-x');
    box.style.removeProperty('--bgps-free-y');
    box.style.removeProperty('transform');
  }

  function clampFreeImageOffset(box) {
    const editor = byId('paperContentEditor');
    if (!box || !editor || !box.classList.contains('bgps-img-free')) return;
    const current = freeImageOffset(box);
    const editorRect = editor.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const baseLeft = (boxRect.left - editorRect.left) - current.x;
    const baseTop = (boxRect.top - editorRect.top) - current.y;
    const minX = -baseLeft;
    const maxX = Math.max(minX, editorRect.width - boxRect.width - baseLeft);
    const minY = -baseTop;
    const maxY = Math.max(minY, editor.scrollHeight - boxRect.height - baseTop);
    applyFreeImageOffset(
      box,
      Math.max(minX, Math.min(maxX, current.x)),
      Math.max(minY, Math.min(maxY, current.y))
    );
  }

  function setImageLayout(layout) {
    if (!selectedImage) return;
    selectedImage.classList.remove('bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-floating', 'bgps-img-free', 'bgps-img-compact');
    selectedImage.classList.add(`bgps-img-${layout}`);
    if (layout === 'free') {
      const current = freeImageOffset(selectedImage);
      applyFreeImageOffset(selectedImage, current.x, current.y);
      requestAnimationFrame(() => clampFreeImageOffset(selectedImage));
    } else {
      resetFreeImageOffset(selectedImage);
    }
    applyImageWidth(selectedImage, imageWidth(selectedImage));
    updateImageInspector();
    markDirty();
  }

  function ensureImageControls(box) {
    if (!box.querySelector('.bgps-image-resize-handle')) box.appendChild(transientHandle());
    if (!box.querySelector('.bgps-image-drag-handle')) box.appendChild(transientDragHandle());
    const resizeHandle = box.querySelector('.bgps-image-resize-handle');
    const dragHandle = box.querySelector('.bgps-image-drag-handle');
    if (resizeHandle && resizeHandle.dataset.boundPointer !== 'true') {
      resizeHandle.dataset.boundPointer = 'true';
      resizeHandle.addEventListener('pointerdown', startResize);
    }
    if (dragHandle && dragHandle.dataset.boundPointer !== 'true') {
      dragHandle.dataset.boundPointer = 'true';
      dragHandle.addEventListener('pointerdown', startImageMove);
    }
  }

  function selectImage(box) {
    if (!box || !box.isConnected) return;
    if (selectedImage && selectedImage !== box) selectedImage.classList.remove('is-image-selected');
    selectedImage = box;
    box.classList.add('is-image-selected');
    ensureImageControls(box);
    updateImageInspector();
  }

  function deselectImage() {
    if (selectedImage) selectedImage.classList.remove('is-image-selected');
    selectedImage = null;
    updateImageInspector();
  }

  function updateImageInspector() {
    const active = Boolean(selectedImage && selectedImage.isConnected);
    setHidden('paperImageEmpty', active);
    setHidden('paperImageControls', !active);
    if (!active) return;
    const width = imageWidth(selectedImage);
    if (byId('paperImageWidth')) byId('paperImageWidth').value = String(width);
    setText('paperImageWidthValue', `${Math.round(width)}%`);
    const layout = layoutForBox(selectedImage);
    document.querySelectorAll('[data-image-layout]').forEach((button) => button.classList.toggle('active', button.dataset.imageLayout === layout));
  }

  function bindImageBox(box) {
    if (!box) return;
    if (!box.classList.contains('has-image')) box.classList.add('has-image');
    if (!['bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-free'].some((name) => box.classList.contains(name))) box.classList.add('bgps-img-center');
    const width = imageWidth(box);
    box.style.setProperty('--bgps-image-width', `${width}%`);
    box.style.width = `${width}%`;
    if (box.classList.contains('bgps-img-free')) {
      const current = freeImageOffset(box);
      applyFreeImageOffset(box, current.x, current.y);
    }
    box.setAttribute('contenteditable', 'false');
    box.removeAttribute('draggable');
    ensureImageControls(box);
    if (box.dataset.editorBound === 'true') return;
    box.dataset.editorBound = 'true';
    box.addEventListener('click', (event) => { event.stopPropagation(); selectImage(box); });
    box.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest('.bgps-image-resize-handle')) return;
      startImageMove(event);
    });
  }

  function hydrateImages() {
    const editor = byId('paperContentEditor');
    if (!editor) return;
    editor.querySelectorAll('.diagram-box.has-image').forEach(bindImageBox);
  }

  function startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const box = handle.closest('.diagram-box.has-image');
    const editor = byId('paperContentEditor');
    if (!box || !editor) return;
    selectImage(box);
    handle.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = box.getBoundingClientRect().width;
    const editorWidth = Math.max(1, editor.getBoundingClientRect().width);
    let nextWidth = imageWidth(box);
    let raf = 0;

    const paint = () => {
      raf = 0;
      applyImageWidth(box, nextWidth);
    };
    const move = (moveEvent) => {
      const widthPx = Math.max(editorWidth * .2, Math.min(editorWidth, startWidth + moveEvent.clientX - startX));
      nextWidth = Math.round((widthPx / editorWidth) * 1000) / 10;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      applyImageWidth(box, nextWidth);
      requestAnimationFrame(() => clampFreeImageOffset(box));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      saveRange();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  function startImageMove(event) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const box = handle.closest('.diagram-box.has-image');
    const editor = byId('paperContentEditor');
    if (!box || !editor) return;

    selectImage(box);
    box.classList.remove('bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-floating', 'bgps-img-compact');
    box.classList.add('bgps-img-free', 'is-moving-image');

    const current = freeImageOffset(box);
    applyFreeImageOffset(box, current.x, current.y);

    const editorRect = editor.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const baseLeft = (boxRect.left - editorRect.left) - current.x;
    const baseTop = (boxRect.top - editorRect.top) - current.y;
    const minX = -baseLeft;
    const maxX = Math.max(minX, editorRect.width - boxRect.width - baseLeft);
    const minY = -baseTop;
    const maxY = Math.max(minY, editor.scrollHeight - boxRect.height - baseTop);
    const startX = event.clientX;
    const startY = event.clientY;

    handle.setPointerCapture?.(event.pointerId);
    let nextX = current.x;
    let nextY = current.y;
    let raf = 0;

    const snapX = (value) => {
      const left = -baseLeft;
      const centre = ((editorRect.width - boxRect.width) / 2) - baseLeft;
      const right = (editorRect.width - boxRect.width) - baseLeft;
      for (const target of [left, centre, right]) {
        if (Math.abs(value - target) <= 9) return target;
      }
      return value;
    };

    const paint = () => {
      raf = 0;
      applyFreeImageOffset(box, nextX, nextY);
    };

    const move = (moveEvent) => {
      nextX = snapX(Math.max(minX, Math.min(maxX, current.x + moveEvent.clientX - startX)));
      nextY = Math.max(minY, Math.min(maxY, current.y + moveEvent.clientY - startY));
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      paint();
      box.classList.remove('is-moving-image');
      clampFreeImageOffset(box);
      markDirty();
      updateChecks();
      updateImageInspector();
      saveRange();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  function moveSelected(direction) {
    if (!selectedImage) return;
    const sibling = direction < 0 ? selectedImage.previousElementSibling : selectedImage.nextElementSibling;
    if (!sibling) return;
    if (direction < 0) selectedImage.parentNode.insertBefore(selectedImage, sibling);
    else selectedImage.parentNode.insertBefore(sibling, selectedImage);
    markDirty();
  }

  function duplicateSelectedImage() {
    if (!selectedImage) return;
    const clone = selectedImage.cloneNode(true);
    clone.removeAttribute('data-editor-bound');
    clone.classList.remove('is-image-selected');
    clone.querySelectorAll('.bgps-image-resize-handle,.bgps-image-drag-handle').forEach((node) => node.remove());
    selectedImage.insertAdjacentElement('afterend', clone);
    bindImageBox(clone);
    selectImage(clone);
    markDirty();
  }

  function copySelectedImage() {
    if (!selectedImage) return;
    imageClipboard = selectedImage.cloneNode(true);
    imageClipboard.removeAttribute('data-editor-bound');
    imageClipboard.classList.remove('is-image-selected');
    imageClipboard.querySelectorAll('.bgps-image-resize-handle,.bgps-image-drag-handle').forEach((node) => node.remove());
    toast('Image copied.');
  }

  function cutSelectedImage() {
    if (!selectedImage) return;
    copySelectedImage();
    const target = selectedImage;
    deselectImage();
    target.remove();
    markDirty();
  }

  function pasteCopiedImage() {
    if (!imageClipboard) { toast('Copy or cut an image first.', 'error'); return; }
    const clone = imageClipboard.cloneNode(true);
    clone.removeAttribute('data-editor-bound');
    const editor = byId('paperContentEditor');
    if (selectedImage?.isConnected) selectedImage.insertAdjacentElement('afterend', clone);
    else editor?.appendChild(clone);
    bindImageBox(clone);
    selectImage(clone);
    markDirty();
  }

  async function replaceSelectedImage(file) {
    if (!selectedImage || !file) return;
    try {
      const source = await compressImage(file);
      const image = selectedImage.querySelector('img');
      if (!image) throw new Error('The selected image could not be replaced.');
      image.src = source;
      image.alt = file.name || 'Question paper diagram';
      markDirty();
      toast('Image replaced.');
    } catch (error) {
      toast(error.message || 'The image could not be replaced.', 'error');
    } finally {
      if (byId('replacePaperImageFile')) byId('replacePaperImageFile').value = '';
    }
  }

  function addCaption() {
    if (!selectedImage) return;
    let caption = selectedImage.querySelector('.diagram-caption');
    if (!caption) {
      caption = document.createElement('div');
      caption.className = 'diagram-caption';
      caption.setAttribute('contenteditable', 'true');
      caption.textContent = 'Figure caption';
      selectedImage.appendChild(caption);
      caption.addEventListener('input', markDirty);
    }
    caption.setAttribute('contenteditable', 'true');
    caption.focus();
    const range = document.createRange();
    range.selectNodeContents(caption);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    markDirty();
  }

  function deleteSelectedImage() {
    if (!selectedImage) return;
    const target = selectedImage;
    deselectImage();
    target.remove();
    markDirty(); updateChecks();
  }

  function removeDropMarker() {
    if (dropMarker) dropMarker.remove();
    dropMarker = null;
  }

  function dragTargetBlock(event) {
    const editor = byId('paperContentEditor');
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || !editor?.contains(element)) return null;
    const block = element.closest('p,h2,h3,table,.diagram-box,.page-break');
    return block && editor.contains(block) ? block : null;
  }

  function handleEditorDragOver(event) {
    if (!dragImage) return;
    event.preventDefault();
    const block = dragTargetBlock(event);
    if (!block || block === dragImage) return;
    if (!dropMarker) { dropMarker = document.createElement('div'); dropMarker.className = 'image-drop-marker'; }
    const rect = block.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) block.parentNode.insertBefore(dropMarker, block);
    else block.insertAdjacentElement('afterend', dropMarker);
  }

  function handleEditorDrop(event) {
    if (!dragImage) return;
    event.preventDefault();
    if (dropMarker?.parentNode) dropMarker.parentNode.insertBefore(dragImage, dropMarker);
    removeDropMarker();
    selectImage(dragImage);
    dragImage = null;
    markDirty();
  }

  async function insertImageFile(file) {
    try {
      const source = await compressImage(file);
      const html = `<div class="diagram-box has-image bgps-img-center" style="--bgps-image-width:100%;width:100%" contenteditable="false"><img class="diagram-image" src="${source}" alt="Question paper diagram"></div><p><br></p>`;
      insertHtml(html);
      hydrateImages();
      const boxes = byId('paperContentEditor')?.querySelectorAll('.diagram-box.has-image');
      if (boxes?.length) selectImage(boxes[boxes.length - 1]);
      toast('Image inserted. Resize or position it using Selected Image controls.');
    } catch (error) {
      toast(error.message || 'The image could not be inserted.', 'error');
    } finally {
      if (byId('paperImageFile')) byId('paperImageFile').value = '';
    }
  }

  async function handlePaste(event) {
    const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    for (const file of files.slice(0, 5)) await insertImageFile(file);
  }

  function initializeFormOptions() {
    populateSelect(byId('paperClassInput'), window.BGPS_DATA.CLASSES, 'Select class');
    populateSelect(byId('paperExamInput'), window.BGPS_DATA.EXAMS, 'Select exam / term');
    populateSelect(byId('teacherPaperClassFilter'), window.BGPS_DATA.CLASSES, 'All classes');
    populateSelect(byId('uploadPaperClass'), window.BGPS_DATA.CLASSES, 'Select class');
    populateSelect(byId('uploadPaperExam'), window.BGPS_DATA.EXAMS, 'Select exam / term');
  }

  function setUploadProgress(message, type = 'info') {
    const progress = byId('paperUploadProgress');
    if (!progress) return;
    progress.hidden = !message;
    progress.textContent = message || '';
    progress.classList.toggle('error', Boolean(message) && type === 'error');
  }

  function closeUploadModalSafely() {
    if (uploadInFlight) {
      toast('Upload is still in progress. Please wait until it finishes.');
      return;
    }
    uploadRevisionContext = null;
    pendingPdfUpload = null;
    setUploadProgress('');
    closeModal('paperUploadModal');
  }

  function openUploadModal(options) {
    if (settings?.permissions?.canUpload === false) {
      toast(settings?.settings?.adminNotice || 'Question-paper upload is currently unavailable.', 'error');
      return;
    }
    const correctionPaper = options?.correctionPaper || null;
    uploadRevisionContext = correctionPaper ? {
      originalPaperId: correctionPaper.originalPaperId || correctionPaper.paperId || '',
      parentPaperId: correctionPaper.parentPaperId || correctionPaper.paperId || '',
      previousVersion: Number(correctionPaper.previousVersion || correctionPaper.version || 0)
    } : null;
    byId('paperUploadForm')?.reset();
    setUploadProgress('');
    setText('paperUploadTitle', correctionPaper ? 'Upload Corrected DOCX' : 'Upload Existing Question Paper');
    setText('paperUploadDescription', correctionPaper
      ? 'Upload the corrected DOCX. The original file will be preserved exactly and resubmitted under the same Paper ID.'
      : 'Upload a completed DOCX or PDF. The original file is preserved exactly; images, equations, tables and layout are not rebuilt or resized.');
    const className = correctionPaper?.className || (session?.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0]);
    if (byId('uploadPaperClass')) byId('uploadPaperClass').value = className;
    populateSubjects('uploadPaperClass', 'uploadPaperSubject');
    if (byId('uploadPaperSubject')) byId('uploadPaperSubject').value = correctionPaper?.subject || '';
    if (byId('uploadPaperExam')) byId('uploadPaperExam').value = correctionPaper?.exam || window.BGPS_DATA.EXAMS[0];
    if (byId('uploadPaperMaxMarks')) byId('uploadPaperMaxMarks').value = correctionPaper?.maxMarks || '';
    if (byId('uploadPaperTime')) byId('uploadPaperTime').value = correctionPaper?.timeAllowed || '';
    if (byId('uploadPaperChapters')) byId('uploadPaperChapters').value = correctionPaper?.chapters || '';
    if (byId('uploadPaperNote')) byId('uploadPaperNote').value = correctionPaper?.adminNote ? `Correction completed: ${correctionPaper.adminNote}`.slice(0, 250) : '';
    const fileInput = byId('uploadPaperFile');
    if (fileInput) fileInput.accept = correctionPaper ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx' : 'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';
    const submitButton = byId('confirmPaperUpload');
    if (submitButton) submitButton.textContent = correctionPaper ? 'Review Corrected DOCX' : 'Review & Submit';
    openModal('paperUploadModal');
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('The selected file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (uploadInFlight) return;
    const file = byId('uploadPaperFile')?.files?.[0];
    if (!file) { toast('Select a PDF or DOCX file.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('The file exceeds the 8 MB upload limit.', 'error'); return; }
    const extension = String(file.name || '').toLowerCase().split('.').pop();
    if (!['docx', 'pdf'].includes(extension)) { toast('Select a DOCX file, or a PDF for reference-only submission.', 'error'); return; }
    if (uploadRevisionContext && extension !== 'docx') { toast('A returned uploaded paper must be replaced with a corrected DOCX so the original-format workflow stays intact.', 'error'); return; }
    const className = normalize(byId('uploadPaperClass')?.value);
    const subject = normalize(byId('uploadPaperSubject')?.value);
    const exam = normalize(byId('uploadPaperExam')?.value);
    const maxMarks = Number(byId('uploadPaperMaxMarks')?.value || 0);
    const timeAllowed = normalize(byId('uploadPaperTime')?.value) || inferTime(maxMarks);
    const chapters = normalize(byId('uploadPaperChapters')?.value) || (isPrePrimary(className) ? 'Class-level learning outcomes' : '');
    if (!className || !subject || !exam || !maxMarks || !timeAllowed || !chapters) { toast('Complete Class, Subject, Exam, Maximum Marks, Time Allowed and Chapters.', 'error'); return; }
    const button = byId('confirmPaperUpload');
    uploadInFlight = true;
    if (button) { button.disabled = true; button.textContent = extension === 'docx' ? 'Reading DOCX…' : 'Reading PDF…'; }
    try {
      setUploadProgress('Reading the selected file...');
      const fileBase64 = await fileToBase64(file);
      const payload = { className, subject, exam, chapters, maxMarks, timeAllowed, note: normalize(byId('uploadPaperNote')?.value), fileName: file.name, mimeType: file.type, fileSize: file.size, fileBase64, ...(uploadRevisionContext || {}) };
      if (extension === 'docx') {
        setUploadProgress('Preparing a safe DOCX review. The original file will not be converted or rebuilt...');
        closeModal('paperUploadModal');
        showPendingDocxUploadReview(file, payload);
        setUploadProgress('DOCX ready. The original file will be preserved exactly. Choose Continue to Submit.');
      } else {
        setUploadProgress('Preparing the PDF preview. Nothing has been submitted yet...');
        closeModal('paperUploadModal');
        await showPendingPdfUploadPreview(file, payload);
        setUploadProgress('PDF preview ready. Review it, then choose Continue to Submit.');
      }
    } catch (error) {
      const message = error.message || 'The paper could not be uploaded.';
      if (extension === 'pdf') {
        pendingPdfUpload = null;
        setHidden('submitFromTeacherPaperPreview', true);
        closeModal('teacherPaperPreviewModal');
        revokeObjectUrl();
        openModal('paperUploadModal');
      }
      setUploadProgress(message, 'error');
      toast(message, 'error');
    } finally {
      uploadInFlight = false;
      if (button) { button.disabled = false; button.textContent = uploadRevisionContext ? 'Import Corrected DOCX' : 'Import and Review'; }
    }
  }

  function bind() {
    if (initialized) return;
    initialized = true;
    initializeFormOptions();
    renderSymbolPalettes();

    byId('refreshTeacherPapers')?.addEventListener('click', () => loadData(true));
    byId('createNewPaper')?.addEventListener('click', openNewPaper);
    byId('openPaperUpload')?.addEventListener('click', () => openUploadModal());
    byId('closePaperEditor')?.addEventListener('click', closeEditor);
    byId('savePaperDraft')?.addEventListener('click', () => saveEditorChanges(true).catch((error) => toast(error.message, 'error')));
    byId('sidebarSaveDraft')?.addEventListener('click', () => saveEditorChanges(true).catch((error) => toast(error.message, 'error')));
    byId('deleteCurrentPaperDraft')?.addEventListener('click', () => deleteDraft(currentDraftId));
    byId('previewCurrentPaper')?.addEventListener('click', previewCurrent);
    byId('sidebarPreviewPaper')?.addEventListener('click', previewCurrent);
    byId('submitPaperForReview')?.addEventListener('click', prepareSubmit);
    byId('confirmPaperSubmit')?.addEventListener('click', submitPaper);
    byId('cancelPaperSubmit')?.addEventListener('click', cancelPaperSubmit);
    byId('closePaperSubmitSuccess')?.addEventListener('click', () => closeModal('paperSubmitSuccessModal'));
    byId('viewSubmittedPaper')?.addEventListener('click', async () => {
      closeModal('paperSubmitSuccessModal');
      if (byId('teacherPaperStatusFilter')) byId('teacherPaperStatusFilter').value = 'Submitted';
      try { await loadData(false); } catch (_) {}
      renderList();
    });

    byId('paperClassInput')?.addEventListener('change', () => { populateSubjects('paperClassInput', 'paperSubjectInput'); defaultTitle(); markDirty(); updateChecks(); });
    byId('paperSubjectInput')?.addEventListener('change', () => { defaultTitle(); markDirty(); updateChecks(); });
    byId('paperExamInput')?.addEventListener('change', () => { defaultTitle(); markDirty(); updateChecks(); });
    byId('paperMaxMarksInput')?.addEventListener('input', () => {
      const time = byId('paperTimeInput');
      if (time && (!time.value || time.dataset.autoTime === 'true')) { time.value = inferTime(byId('paperMaxMarksInput').value); time.dataset.autoTime = 'true'; }
      markDirty(); updateChecks();
    });
    byId('paperTimeInput')?.addEventListener('input', (event) => { event.target.dataset.autoTime = 'false'; markDirty(); updateChecks(); });
    ['paperTitleInput', 'paperDateInput', 'paperChaptersInput', 'paperInstructionsInput', 'paperLanguageInput'].forEach((id) => byId(id)?.addEventListener('input', () => { markDirty(); updateChecks(); }));

    const editor = byId('paperContentEditor');
    editor?.addEventListener('input', () => { saveRange(); markDirty(); updateChecks(); hydrateImages(); });
    editor?.addEventListener('keyup', saveRange);
    editor?.addEventListener('mouseup', saveRange);
    editor?.addEventListener('focus', saveRange);
    editor?.addEventListener('click', (event) => { if (!event.target.closest('.diagram-box.has-image')) deselectImage(); });
    editor?.addEventListener('paste', handlePaste);

    byId('paperEditorToolbar')?.addEventListener('mousedown', (event) => { if (event.target.closest('button')) event.preventDefault(); saveRange(); });
    byId('paperEditorToolbar')?.addEventListener('click', (event) => {
      const command = event.target.closest('[data-editor-command]');
      if (command) execCommand(command.dataset.editorCommand);
      const palette = event.target.closest('[data-symbol-palette]');
      if (palette) togglePalette(palette.dataset.symbolPalette);
      const symbol = event.target.closest('[data-insert-symbol]');
      if (symbol) insertText(symbol.dataset.insertSymbol);
    });
    byId('insertQuestionButton')?.addEventListener('click', insertQuestion);
    byId('insertSectionButton')?.addEventListener('click', insertSection);
    byId('insertOrButton')?.addEventListener('click', insertOr);
    byId('insertTableButton')?.addEventListener('click', insertTable);
    byId('insertPageBreakButton')?.addEventListener('click', insertPageBreak);
    byId('insertFractionButton')?.addEventListener('click', insertFraction);
    byId('insertRootButton')?.addEventListener('click', insertRoot);
    byId('paperFontSize')?.addEventListener('change', (event) => execCommand('fontSize', event.target.value));
    byId('insertPaperImageButton')?.addEventListener('click', () => byId('paperImageFile')?.click());
    byId('paperImageFile')?.addEventListener('change', (event) => { const file = event.target.files?.[0]; if (file) insertImageFile(file); });

    byId('paperImageWidth')?.addEventListener('input', (event) => { if (selectedImage) applyImageWidth(selectedImage, event.target.value); });
    document.querySelectorAll('[data-image-layout]').forEach((button) => button.addEventListener('click', () => setImageLayout(button.dataset.imageLayout)));
    byId('moveImageUp')?.addEventListener('click', () => moveSelected(-1));
    byId('moveImageDown')?.addEventListener('click', () => moveSelected(1));
    byId('duplicateImage')?.addEventListener('click', duplicateSelectedImage);
    byId('copyPaperImage')?.addEventListener('click', copySelectedImage);
    byId('cutPaperImage')?.addEventListener('click', cutSelectedImage);
    byId('pastePaperImage')?.addEventListener('click', pasteCopiedImage);
    byId('replacePaperImage')?.addEventListener('click', () => byId('replacePaperImageFile')?.click());
    byId('replacePaperImageFile')?.addEventListener('change', (event) => replaceSelectedImage(event.target.files?.[0]));
    byId('addImageCaption')?.addEventListener('click', addCaption);
    byId('deletePaperImage')?.addEventListener('click', deleteSelectedImage);

    byId('teacherPaperStatusFilter')?.addEventListener('change', renderList);
    byId('teacherPaperClassFilter')?.addEventListener('change', renderList);
    byId('teacherPaperSearch')?.addEventListener('input', renderList);
    document.querySelectorAll('[data-teacher-paper-filter]').forEach((button) => button.addEventListener('click', () => { byId('teacherPaperStatusFilter').value = button.dataset.teacherPaperFilter; renderList(); }));
    byId('teacherPaperList')?.addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-draft]'); if (edit) return openDraft(edit.dataset.editDraft);
      const previewDraftButton = event.target.closest('[data-preview-draft]'); if (previewDraftButton) return previewDraft(previewDraftButton.dataset.previewDraft);
      const deleteButton = event.target.closest('[data-delete-draft]'); if (deleteButton) return deleteDraft(deleteButton.dataset.deleteDraft);
      const editPaper = event.target.closest('[data-edit-paper]'); if (editPaper) return openExistingPaperForEdit(editPaper.dataset.editPaper);
      const preview = event.target.closest('[data-preview-paper]'); if (preview) return previewPaper(preview.dataset.previewPaper);
    });

    byId('closeTeacherPaperPreview')?.addEventListener('click', closePreview);
    byId('closeTeacherPaperPreviewFooter')?.addEventListener('click', closePreview);
    byId('submitFromTeacherPaperPreview')?.addEventListener('click', () => {
      if (pendingPdfUpload) {
        closePreview(true);
        closeModal('paperUploadModal');
        preparePendingPdfSubmit();
      } else {
        closePreview();
        prepareSubmit();
      }
    });
    byId('teacherPaperPreviewModal')?.addEventListener('click', (event) => { if (event.target === byId('teacherPaperPreviewModal')) closePreview(); });
    byId('printTeacherPaper')?.addEventListener('click', printPreview);
    byId('openTeacherPaperPreviewExternal')?.addEventListener('click', openPreviewExternally);
    byId('downloadTeacherPaper')?.addEventListener('click', downloadPreview);

    byId('cancelPaperUpload')?.addEventListener('click', closeUploadModalSafely);
    byId('paperUploadModal')?.addEventListener('click', (event) => { if (event.target === byId('paperUploadModal')) closeUploadModalSafely(); });
    byId('paperUploadForm')?.addEventListener('submit', submitUpload);
    byId('uploadPaperClass')?.addEventListener('change', () => populateSubjects('uploadPaperClass', 'uploadPaperSubject'));
    byId('uploadPaperMaxMarks')?.addEventListener('input', (event) => {
      const time = byId('uploadPaperTime');
      if (time && !time.value) time.value = inferTime(event.target.value);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (byId('teacherPaperPreviewModal')?.classList.contains('open')) closePreview();
        else if (byId('paperUploadModal')?.classList.contains('open')) closeUploadModalSafely();
        else if (byId('paperSubmitModal')?.classList.contains('open')) cancelPaperSubmit();
        else if (byId('paperSubmitSuccessModal')?.classList.contains('open')) closeModal('paperSubmitSuccessModal');
        else deselectImage();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !byId('paperEditorWorkspace')?.hidden) {
        event.preventDefault();
        saveEditorChanges(true).catch((error) => toast(error.message, 'error'));
      }
    });
  }

  async function onAuthenticated(user) {
    bind();
    session = user || null;
    reset();
    session = user || null;
    if (!session || session.isAdmin) return;
    const defaultClass = session.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0];
    if (byId('paperClassInput')) byId('paperClassInput').value = defaultClass;
    populateSubjects('paperClassInput', 'paperSubjectInput');
    if (byId('uploadPaperClass')) byId('uploadPaperClass').value = defaultClass;
    populateSubjects('uploadPaperClass', 'uploadPaperSubject');
    await loadData(false);
  }

  function reset() {
    drafts = [];
    papers = [];
    settings = null;
    currentDraftId = '';
    currentRevision = {};
    editorMode = 'teacher';
    adminEditingPaperId = '';
    syncDraftDeleteControl();
    selectedImage = null;
    editorRange = null;
    dirty = false;
    imageClipboard = null;
    saveInFlight = false;
    submitInFlight = false;
    previewInFlight = false;
    uploadInFlight = false;
    uploadRevisionContext = null;
    pendingPdfUpload = null;
    revokeObjectUrl();
    setEditorMode(false);
    const list = byId('teacherPaperList');
    if (list) list.innerHTML = '<div class="empty-state"><strong>Loading papers</strong>Please wait while your work is checked.</div>';
    setText('teacherPaperMetricDraft', '—');
    setText('teacherPaperMetricSubmitted', '—');
    setText('teacherPaperMetricCorrection', '—');
    setText('teacherPaperMetricApproved', '—');
    closeModal('teacherPaperPreviewModal');
    closeModal('paperUploadModal');
    closeModal('paperSubmitModal');
    closeModal('paperSubmitSuccessModal');
  }

  window.BGPS_PAPER_CREATOR = Object.freeze({ onAuthenticated, reset, loadData, renderList, openNewPaper, openAdminEdit });
})();


(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const PASS_PERCENT = 33;

  let session = null;
  let report = null;
  let selectedRoll = '';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function optionMarkup(values, placeholder) {
    const first = placeholder == null ? '' : `<option value="">${escapeHtml(placeholder)}</option>`;
    return first + (values || []).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  }

  function canonicalSubject(subject, className) {
    return window.BGPS_DATA.normalizeSubjectForStorage(subject, className).toUpperCase();
  }

  function displaySubject(subject, className, expectedSubjects = []) {
    const canonical = canonicalSubject(subject, className);
    const configured = Array.isArray(expectedSubjects) ? expectedSubjects : [];
    return configured.find((item) => canonicalSubject(item, className) === canonical) || window.BGPS_DATA.displaySubjectName?.(subject) || String(subject || 'Subject').trim();
  }

  function dedupeRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      const key = [row.className, canonicalSubject(row.subject, row.className), row.examType, row.component, window.BGPS_DATA.normalizeRoll(row.rollNo)]
        .map((value) => String(value || '').trim().toUpperCase()).join('|');
      const previous = map.get(key);
      const currentTime = new Date(row.timestamp || 0).getTime() || 0;
      const previousTime = previous ? (new Date(previous.timestamp || 0).getTime() || 0) : -1;
      if (!previous || currentTime >= previousTime) map.set(key, row);
    });
    return [...map.values()];
  }

  function componentKey(value) {
    const item = String(value || 'Written').toLowerCase();
    if (item.includes('oral')) return 'oral';
    if (item.includes('practical')) return 'practical';
    return 'written';
  }

  function componentLabel(data, key) {
    const item = data?.components?.[key];
    if (!item) return '—';
    return item.absent ? 'AB' : String(item.obtained);
  }

  function subjectDisplay(data) {
    if (!data || data.max <= 0) return 'MISSING';
    if (data.hasAbsent) return data.obtained > 0 ? `${data.obtained} + AB` : 'AB';
    return String(data.obtained);
  }

  function buildReport(rows, className, examType) {
    const allClassRows = Array.isArray(rows) ? rows : [];
    window.BGPS_DATA.setObservedMarksRows(allClassRows);
    const selectedRows = allClassRows.filter((row) => String(row.examType || '').trim().toUpperCase() === String(examType || '').trim().toUpperCase());
    const observedForExam = [...new Set(selectedRows.map((row) => displaySubject(row.subject, className)).filter(Boolean))];
    const expectedSubjects = [...new Set([...window.BGPS_DATA.subjectsForClass(className), ...observedForExam])];
    const uniqueRows = dedupeRows(selectedRows);
    const students = {};
    const foundSubjects = new Map();

    uniqueRows.forEach((row) => {
      const roll = window.BGPS_DATA.normalizeRoll(row.rollNo);
      if (!roll) return;
      const subject = displaySubject(row.subject, className, expectedSubjects);
      const subjectKey = canonicalSubject(subject, className);
      foundSubjects.set(subjectKey, subject);
      if (!students[roll]) students[roll] = { roll, subjects: {}, totalMax: 0, totalObtained: 0 };
      if (!students[roll].subjects[subjectKey]) {
        students[roll].subjects[subjectKey] = { name: subject, max: 0, obtained: 0, hasAbsent: false, components: {} };
      }
      const max = Number(row.maxMarks) || 0;
      const absent = window.BGPS_DATA.isAbsent(row.marks);
      const obtained = absent ? 0 : (Number(row.marks) || 0);
      const key = componentKey(row.component);
      const subjectData = students[roll].subjects[subjectKey];
      subjectData.max += max;
      subjectData.obtained += obtained;
      subjectData.hasAbsent = subjectData.hasAbsent || absent;
      subjectData.components[key] = { max, obtained, absent };
      students[roll].totalMax += max;
      students[roll].totalObtained += obtained;
    });

    const expected = expectedSubjects.map((name) => ({ key: canonicalSubject(name, className), name }));
    const extras = [...foundSubjects.entries()]
      .filter(([key]) => !expected.some((item) => item.key === key))
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const subjects = [...expected, ...extras];
    const studentList = Object.values(students).sort((a, b) => Number(a.roll) - Number(b.roll));

    studentList.forEach((student) => {
      student.missing = subjects.filter((subject) => !student.subjects[subject.key] || student.subjects[subject.key].max <= 0).map((subject) => subject.name);
      student.complete = student.missing.length === 0;
      student.percentage = student.totalMax > 0 ? (student.totalObtained / student.totalMax) * 100 : 0;
    });

    const ranked = [...studentList].sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained || Number(a.roll) - Number(b.roll));
    let lastPercentage = null;
    let currentRank = 0;
    ranked.forEach((student, index) => {
      if (lastPercentage === null || Math.abs(student.percentage - lastPercentage) > 0.000001) currentRank = index + 1;
      student.rank = currentRank;
      lastPercentage = student.percentage;
    });

    const highs = subjects.map((subject) => {
      let obtained = 0;
      let max = 0;
      studentList.forEach((student) => {
        const data = student.subjects[subject.key];
        if (!data) return;
        if (data.obtained > obtained || (data.obtained === obtained && data.max > max)) {
          obtained = data.obtained;
          max = data.max;
        }
      });
      return { name: subject.name, obtained, max };
    });

    return {
      className,
      examType,
      subjects,
      students: studentList,
      ranked,
      highs,
      complete: studentList.filter((student) => student.complete).length,
      incomplete: studentList.filter((student) => !student.complete).length,
      pass: studentList.filter((student) => student.percentage >= PASS_PERCENT).length,
      fail: studentList.filter((student) => student.percentage < PASS_PERCENT).length
    };
  }

  function renderEmpty(message) {
    const head = byId('teacherReportHead');
    const body = byId('teacherReportBody');
    if (head) head.innerHTML = '<tr><th>Roll</th><th>Report</th></tr>';
    if (body) body.innerHTML = `<tr><td colspan="2"><div class="empty-state"><strong>No report data</strong>${escapeHtml(message || 'No marks are available for this examination.')}</div></td></tr>`;
    ['teacherReportStudents','teacherReportSubjects','teacherReportComplete','teacherReportIncomplete'].forEach((id) => setText(id, '—'));
    setText('teacherReportOverall', 'No report loaded.');
    setText('teacherReportRankers', 'No rankers available.');
    setText('teacherReportHighs', 'No subject data available.');
    const print = byId('printTeacherReportButton');
    if (print) print.disabled = true;
  }

  function renderReport() {
    if (!report || !report.students.length) {
      renderEmpty('No saved marks were found for the selected examination.');
      return;
    }

    setText('teacherReportStudents', report.students.length);
    setText('teacherReportSubjects', report.subjects.length);
    setText('teacherReportComplete', report.complete);
    setText('teacherReportIncomplete', report.incomplete);
    setText('teacherReportTableTitle', `${report.className} · ${report.examType}`);
    byId('teacherReportOverall').innerHTML = `<strong>${report.students.length}</strong> students<br><span style="color:#147a4a;font-weight:800;">Pass: ${report.pass}</span><br><span style="color:#b42318;font-weight:800;">Needs Improvement: ${report.fail}</span>${report.incomplete ? `<br><span style="color:#9a6700;font-weight:800;">Incomplete data: ${report.incomplete}</span>` : ''}`;
    byId('teacherReportRankers').innerHTML = report.ranked.slice(0, 3).map((student) => `<div><strong>Rank ${student.rank}</strong> · Roll ${escapeHtml(student.roll)} · ${student.percentage.toFixed(1)}%</div>`).join('') || 'No rankers available.';
    byId('teacherReportHighs').innerHTML = report.highs.map((item) => `<div>${escapeHtml(item.name)}: <strong>${item.obtained} / ${item.max || '—'}</strong></div>`).join('') || 'No subject data available.';

    let header = '<tr><th class="roll-cell">Roll</th>';
    report.subjects.forEach((subject) => { header += `<th>${escapeHtml(subject.name)}</th>`; });
    header += '<th>Max</th><th>Obtained</th><th>Percentage</th><th>Rank</th><th class="report-action-cell">Report</th></tr>';
    byId('teacherReportHead').innerHTML = header;

    byId('teacherReportBody').innerHTML = report.students.map((student) => {
      const rowClass = !student.complete ? 'incomplete-row' : (student.percentage < PASS_PERCENT ? 'fail-row' : '');
      let cells = `<td class="roll-cell">${escapeHtml(student.roll)}</td>`;
      report.subjects.forEach((subject) => {
        const data = student.subjects[subject.key];
        if (!data || data.max <= 0) {
          cells += `<td class="missing-score" title="Marks not saved">MISSING</td>`;
          return;
        }
        const absentClass = data.hasAbsent ? ' absent-score' : '';
        cells += `<td class="subject-score${absentClass}" tabindex="0" role="button" data-breakdown-roll="${escapeHtml(student.roll)}" data-breakdown-subject="${escapeHtml(subject.key)}" title="View component breakup">${escapeHtml(subjectDisplay(data))}</td>`;
      });
      cells += `<td><strong>${student.totalMax}</strong></td><td><strong>${student.totalObtained}</strong></td><td>${student.percentage.toFixed(2)}%</td><td>#${student.rank}</td><td class="report-action-cell"><button class="report-view-btn" type="button" data-report-roll="${escapeHtml(student.roll)}">View</button></td>`;
      return `<tr class="${rowClass}">${cells}</tr>`;
    }).join('');

    const print = byId('printTeacherReportButton');
    if (print) print.disabled = false;
  }

  function setBusy(busy) {
    const button = byId('loadTeacherReportButton');
    if (button) { button.disabled = Boolean(busy); button.textContent = busy ? 'Loading…' : 'Load report'; }
  }

  async function loadReport() {
    if (!session || session.isAdmin) return;
    const examType = String(byId('teacherReportExam')?.value || '').trim();
    if (!examType) {
      window.BGPS_APP.toast('Select an examination first.', 'error');
      byId('teacherReportExam')?.focus();
      return;
    }
    setBusy(true);
    setText('teacherReportStatus', 'Loading consolidated marks report…');
    try {
      const result = await window.BGPS_API.getMarks({ className: session.assignedClass });
      report = buildReport(result.rows || [], session.assignedClass, examType);
      if (!report.students.length) {
        renderEmpty('No saved marks were found for this examination.');
        setText('teacherReportStatus', `${session.assignedClass} · ${examType} · No saved marks found`);
        return;
      }
      renderReport();
      setText('teacherReportStatus', `${session.assignedClass} · ${examType} · ${report.students.length} students`);
      window.BGPS_APP.toast('Consolidated report loaded.');
    } catch (error) {
      report = null;
      renderEmpty(error.message || 'Could not load the report.');
      setText('teacherReportStatus', error.message || 'Could not load the report.');
      window.BGPS_APP.toast(error.message || 'Could not load the report.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function studentByRoll(roll) {
    return report?.students.find((student) => String(student.roll) === String(roll));
  }

  function openIndividual(roll) {
    const student = studentByRoll(roll);
    if (!student || !report) return;
    selectedRoll = String(roll);
    setText('teacherIndividualRoll', student.roll);
    setText('teacherIndividualClass', report.className);
    setText('teacherIndividualExam', report.examType);
    byId('teacherIndividualBody').innerHTML = report.subjects.map((subject) => {
      const data = student.subjects[subject.key];
      const written = componentLabel(data, 'written');
      const oral = componentLabel(data, 'oral');
      const practical = componentLabel(data, 'practical');
      const total = data ? subjectDisplay(data) : 'MISSING';
      return `<tr><td><strong>${escapeHtml(subject.name)}</strong></td><td>${escapeHtml(written)}</td><td>${escapeHtml(oral)}</td><td>${escapeHtml(practical)}</td><td>${data?.max || '—'}</td><td>${escapeHtml(total)}</td></tr>`;
    }).join('');
    setText('teacherIndividualTotal', `Total: ${student.totalObtained} / ${student.totalMax}`);
    setText('teacherIndividualPercentage', `Percentage: ${student.percentage.toFixed(2)}%`);
    setText('teacherIndividualRank', `Class Rank: #${student.rank}`);
    setText('teacherIndividualResult', student.percentage >= PASS_PERCENT ? 'Result: PASSED' : 'Result: NEEDS IMPROVEMENT');
    byId('teacherIndividualResult').style.color = student.percentage >= PASS_PERCENT ? '#147a4a' : '#b42318';
    byId('teacherReportOverview').hidden = true;
    byId('teacherIndividualReport').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeIndividual() {
    byId('teacherIndividualReport').hidden = true;
    byId('teacherReportOverview').hidden = false;
    selectedRoll = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function breakdownItem(label, item) {
    if (!item) return `<div class="breakdown-item"><span>${escapeHtml(label)}</span><strong>Not entered</strong></div>`;
    return `<div class="breakdown-item"><span>${escapeHtml(label)}</span><strong>${item.absent ? 'AB' : escapeHtml(item.obtained)} / ${escapeHtml(item.max)}</strong></div>`;
  }

  function openBreakdown(roll, subjectKey) {
    const student = studentByRoll(roll);
    const subject = report?.subjects.find((item) => item.key === subjectKey);
    const data = student?.subjects?.[subjectKey];
    if (!student || !subject || !data) return;
    setText('teacherBreakdownTitle', `${subject.name} · Roll ${roll}`);
    setText('teacherBreakdownSubtitle', `${report.className} · ${report.examType}`);
    byId('teacherBreakdownItems').innerHTML = [
      breakdownItem('Written', data.components.written),
      breakdownItem('Oral', data.components.oral),
      breakdownItem('Practical', data.components.practical)
    ].join('');
    setText('teacherBreakdownTotal', `${subjectDisplay(data)} / ${data.max}`);
    const modal = byId('teacherBreakdownModal');
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
  }

  function closeBreakdown() {
    const modal = byId('teacherBreakdownModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
  }

  function printSubjectLabel(name) {
    const map = {
      'English Language':'Eng. Lang.','English Literature':'Eng. Lit.','History/Civics':'Hist./Civ.',
      'GK/Moral Science':'GK/Moral','Mathematics':'Maths','Computer Science':'Computer'
    };
    return map[name] || name;
  }

  function printDocument(title, bodyHtml, landscape, printCss = '') {
    const oldFrame = document.getElementById('bgpsPrintFrame');
    if (oldFrame) oldFrame.remove();
    const frame = document.createElement('iframe');
    frame.id = 'bgpsPrintFrame';
    frame.setAttribute('title', 'Print preview');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    document.body.appendChild(frame);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
      @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:4mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#111;background:#fff;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2,p{margin:0}.school{text-align:center;border-bottom:1.6px solid #111;padding-bottom:1.8mm;margin-bottom:2mm}.school h1{font-family:Georgia,serif;font-size:19px;line-height:1}.school p{font-size:8.5px;margin-top:1mm;text-transform:uppercase;font-weight:800;letter-spacing:.25px}.details{display:flex;justify-content:center;gap:9mm;font-size:8.5px;font-weight:800;margin-bottom:2mm}.analytics{display:grid;grid-template-columns:.75fr 1fr 1.45fr;gap:1.5mm;margin-bottom:1.8mm}.analytics>div{border:1px solid #555;padding:1.1mm 1.4mm;font-size:7.2px;line-height:1.2;min-height:11mm}.analytics strong{font-size:7.8px}.analytics .highs{columns:2;column-gap:4mm}table{width:100%;border-collapse:collapse;table-layout:fixed;border:1.3px solid #111}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #333;text-align:center;vertical-align:middle;padding:1px 1.5px;line-height:1.05;height:var(--row-height,4.3mm);font-size:var(--body-size,8.6px);white-space:nowrap;overflow:hidden;text-overflow:clip}th{height:auto;min-height:5mm;background:#e8eef5;font-size:var(--head-size,7.8px);font-weight:900;white-space:normal;overflow-wrap:anywhere}.roll{width:5.2%}.sum-max{width:5.6%}.sum-obt{width:5.8%}.sum-perc{width:6.2%}.sum-rank{width:4.8%}.summary{font-weight:900;background:#f4f7fa}.missing{font-size:6.6px;color:#8b5600;background:#fff7de}.signatures{display:flex;justify-content:space-between;margin-top:18mm}.signatures span{width:45mm;border-top:1px solid #222;text-align:center;padding-top:1.5mm;font-size:9px}.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:3mm}.summary-grid div{border:1px solid #555;padding:2.3mm;text-align:center;font-size:9px;font-weight:900}${printCss}
    </style></head><body>${bodyHtml}</body></html>`);
    doc.close();
    const runPrint = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch (error) { window.BGPS_APP.toast('Print preview could not be opened. Please try again.', 'error'); }
      window.setTimeout(() => frame.remove(), 1500);
    };
    if (frame.contentWindow.document.readyState === 'complete') window.setTimeout(runPrint, 180);
    else frame.onload = () => window.setTimeout(runPrint, 180);
  }

  function printConsolidated() {
    if (!report || !report.students.length) return;
    const rowCount = report.students.length;
    const subjectCount = report.subjects.length;
    const rowHeight = Math.max(3.15, Math.min(14, 168 / Math.max(1, rowCount + 1)));
    const bodySize = subjectCount >= 10 ? 7.2 : subjectCount >= 8 ? 7.8 : 8.8;
    const headSize = subjectCount >= 10 ? 6.7 : subjectCount >= 8 ? 7.1 : 8.0;
    const head = '<tr><th class="roll">Roll</th>' + report.subjects.map((subject) => `<th>${escapeHtml(printSubjectLabel(subject.name))}</th>`).join('') + '<th class="sum-max">Max</th><th class="sum-obt">Obt.</th><th class="sum-perc">%</th><th class="sum-rank">Rank</th></tr>';
    const body = report.students.map((student) => {
      const subjectCells = report.subjects.map((subject) => {
        const data = student.subjects[subject.key];
        return `<td class="${!data ? 'missing' : ''}">${data ? escapeHtml(subjectDisplay(data)) : 'MISSING'}</td>`;
      }).join('');
      return `<tr><td class="summary">${escapeHtml(student.roll)}</td>${subjectCells}<td class="summary">${student.totalMax}</td><td class="summary">${student.totalObtained}</td><td class="summary">${student.percentage.toFixed(2)}</td><td class="summary">#${student.rank}</td></tr>`;
    }).join('');
    const rankers = report.ranked.slice(0,3).map((student) => `Rank ${student.rank}: Roll ${escapeHtml(student.roll)} (${student.percentage.toFixed(1)}%)`).join('<br>') || '—';
    const highs = report.highs.map((item) => `${escapeHtml(printSubjectLabel(item.name))}: ${item.obtained}/${item.max || '—'}`).join('<br>') || '—';
    const analytics = `<div class="analytics"><div><strong>Overall Result</strong><br>Students: ${report.students.length}<br>Pass: ${report.pass}<br>Needs Improvement: ${report.fail}<br>Incomplete: ${report.incomplete}</div><div><strong>Top Three Rankers</strong><br>${rankers}</div><div class="highs"><strong>Highest in Subject</strong><br>${highs}</div></div>`;
    const css = `:root{--row-height:${rowHeight.toFixed(2)}mm;--body-size:${bodySize}px;--head-size:${headSize}px}`;
    printDocument(`BGPS ${report.className} ${report.examType}`, `<div class="school"><h1>BG PUBLIC SCHOOL</h1><p>Consolidated Report &amp; Analytics</p></div><div class="details"><span>Class: ${escapeHtml(report.className)}</span><span>Examination: ${escapeHtml(report.examType)}</span></div>${analytics}<table><thead>${head}</thead><tbody>${body}</tbody></table>`, true, css);
  }

  function printIndividual() {
    const student = studentByRoll(selectedRoll);
    if (!student || !report) return;
    const rows = report.subjects.map((subject) => {
      const data = student.subjects[subject.key];
      return `<tr><td><strong>${escapeHtml(subject.name)}</strong></td><td>${escapeHtml(componentLabel(data,'written'))}</td><td>${escapeHtml(componentLabel(data,'oral'))}</td><td>${escapeHtml(componentLabel(data,'practical'))}</td><td>${data?.max || '—'}</td><td>${data ? escapeHtml(subjectDisplay(data)) : 'MISSING'}</td></tr>`;
    }).join('');
    const summary = `<div class="summary-grid"><div>Total: ${student.totalObtained} / ${student.totalMax}</div><div>Percentage: ${student.percentage.toFixed(2)}%</div><div>Class Rank: #${student.rank}</div><div>${student.percentage >= PASS_PERCENT ? 'PASSED' : 'NEEDS IMPROVEMENT'}</div></div>`;
    printDocument(`BGPS Roll ${student.roll} Progress Report`, `<div class="school"><h1>BG PUBLIC SCHOOL</h1><p>Progress Report</p></div><div class="details"><span>Roll No: ${escapeHtml(student.roll)}</span><span>Class: ${escapeHtml(report.className)}</span><span>Examination: ${escapeHtml(report.examType)}</span></div><table><thead><tr><th>Subject</th><th>Written</th><th>Oral</th><th>Practical</th><th>Total Max</th><th>Total Obtained</th></tr></thead><tbody>${rows}</tbody></table>${summary}<div class="signatures"><span>Class Teacher</span><span>Principal</span></div>`, false, ':root{--row-height:8mm;--body-size:10px;--head-size:9px}');
  }

  function handleTableClick(event) {
    const viewButton = event.target.closest('[data-report-roll]');
    if (viewButton) { openIndividual(viewButton.dataset.reportRoll); return; }
    const cell = event.target.closest('[data-breakdown-roll]');
    if (cell) openBreakdown(cell.dataset.breakdownRoll, cell.dataset.breakdownSubject);
  }

  function handleTableKey(event) {
    const cell = event.target.closest('[data-breakdown-roll]');
    if (!cell || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    openBreakdown(cell.dataset.breakdownRoll, cell.dataset.breakdownSubject);
  }

  function bindEvents() {
    byId('loadTeacherReportButton')?.addEventListener('click', loadReport);
    byId('printTeacherReportButton')?.addEventListener('click', printConsolidated);
    byId('backToTeacherReport')?.addEventListener('click', closeIndividual);
    byId('printIndividualTeacherReport')?.addEventListener('click', printIndividual);
    byId('teacherReportBody')?.addEventListener('click', handleTableClick);
    byId('teacherReportBody')?.addEventListener('keydown', handleTableKey);
    byId('closeTeacherBreakdown')?.addEventListener('click', closeBreakdown);
    byId('teacherBreakdownModal')?.addEventListener('click', (event) => { if (event.target.id === 'teacherBreakdownModal') closeBreakdown(); });
  }

  async function onAuthenticated(user) {
    session = user;
    report = null;
    selectedRoll = '';
    if (user.isAdmin) return;
    if (byId('teacherReportClass')) byId('teacherReportClass').value = user.assignedClass || '';
    if (byId('teacherReportExam')) byId('teacherReportExam').innerHTML = optionMarkup(window.BGPS_DATA.EXAMS, 'Select examination');
    setText('teacherReportStatus', 'Select an examination to load the report.');
    renderEmpty('Select an examination and click Load report.');
    closeIndividual();
  }

  function onOpen() {
    if (!session || session.isAdmin) return;
    if (byId('teacherReportClass')) byId('teacherReportClass').value = session.assignedClass || '';
  }

  function reset() {
    session = null;
    report = null;
    selectedRoll = '';
    closeBreakdown();
    if (byId('teacherIndividualReport')) byId('teacherIndividualReport').hidden = true;
    if (byId('teacherReportOverview')) byId('teacherReportOverview').hidden = false;
  }

  bindEvents();
  window.BGPS_REPORTS = Object.freeze({ onAuthenticated, onOpen, reset, loadReport });
})();


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

    const role = user.isAdmin ? 'Principal / Admin' : 'Teacher';
    setText('userId', user.teacherId);
    setText('userRole', role);
    setText('userAvatar', user.isAdmin ? 'A' : 'T');

    const marksNav = byId('marksNav');
    const teacherReportNav = byId('teacherReportNav');
    const teacherPapersNav = byId('teacherPapersNav');
    const adminNav = byId('adminNav');
    const papersNav = byId('papersNav');
    const settingsNav = byId('settingsNav');
    if (marksNav) marksNav.classList.toggle('hidden', Boolean(user.isAdmin));
    if (teacherReportNav) teacherReportNav.classList.toggle('hidden', Boolean(user.isAdmin));
    if (teacherPapersNav) teacherPapersNav.classList.toggle('hidden', Boolean(user.isAdmin));
    if (adminNav) adminNav.classList.toggle('hidden', !user.isAdmin);
    if (papersNav) papersNav.classList.toggle('hidden', !user.isAdmin);
    if (settingsNav) settingsNav.classList.toggle('hidden', !user.isAdmin);

    const teacherHome = byId('teacherHomeContent');
    const adminHome = byId('adminHomeContent');
    if (teacherHome) teacherHome.hidden = Boolean(user.isAdmin);
    if (adminHome) adminHome.hidden = !user.isAdmin;

    document.title = `BG Public School | ${user.isAdmin ? 'Principal Dashboard' : 'Teacher Workspace'}`;
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
    openView('home');
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
