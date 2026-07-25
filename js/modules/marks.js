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

  function renderTeacherNotifications(termLabel, pendingSubjects, reviewPapers, returnedPapers, approvedPapers) {
    const container = byId('recentMarksList');
    if (!container) return;
    const items = [];
    (returnedPapers || []).slice(0, 3).forEach((paper) => items.push(`<div class="teacher-notification danger"><div class="teacher-notification-copy"><strong>Correction required: ${escapeHtml(paper.subject || paper.title || 'Question Paper')}</strong>${escapeHtml(paper.exam || 'Exam')} · ${escapeHtml(paper.adminNote || 'Please review the Principal note and correct this paper.')}</div><button class="btn danger-outline" type="button" data-notification-action="corrections">Open</button></div>`));
    if ((pendingSubjects || []).length) items.push(`<div class="teacher-notification warning"><div class="teacher-notification-copy"><strong>${pendingSubjects.length} ${escapeHtml(termLabel)} subject${pendingSubjects.length === 1 ? '' : 's'} pending</strong>${escapeHtml(pendingSubjects.join(', '))}</div><button class="btn" type="button" data-notification-action="marks">Enter Marks</button></div>`);
    if ((reviewPapers || []).length) items.push(`<div class="teacher-notification"><div class="teacher-notification-copy"><strong>${reviewPapers.length} paper${reviewPapers.length === 1 ? '' : 's'} submitted and awaiting Principal review</strong>${escapeHtml(reviewPapers.map((paper) => paper.subject || paper.title || 'Paper').slice(0, 4).join(', '))} · Status only</div></div>`);
    (approvedPapers || []).slice(0, 3).forEach((paper) => items.push(`<div class="teacher-notification success"><div class="teacher-notification-copy"><strong>Approved: ${escapeHtml(paper.subject || paper.title || 'Question Paper')}</strong>${escapeHtml(paper.exam || termLabel || 'Exam')} · Final paper is with the Principal.</div></div>`));
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
    const approvedPapers = termPapers.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'APPROVED');
    const approved = approvedPapers.length;
    const returnedPapers = papersForYear.filter((paper) => String(paper.status || '').trim().toUpperCase() === 'CORRECTION REQUIRED');
    const latest = [...termRows].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
    const label = terms.get(selectedOverviewTerm) || selectedOverviewTerm;
    const readiness = expectedKeys.size ? Math.round((marksSubmitted / expectedKeys.size) * 100) : 0;
    renderTeacherNotifications(label, pendingSubjects, reviewPapers, returnedPapers, approvedPapers);
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
    if (teacherPanel) teacherPanel.hidden = Boolean(user.isAdmin || user.paperOnly);
    if (adminPanel) adminPanel.hidden = !user.isAdmin;

    if (user.paperOnly) return;

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
