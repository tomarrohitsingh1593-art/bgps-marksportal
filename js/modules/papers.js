(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  let session = null;
  let papers = [];
  let currentPaper = null;
  let currentObjectUrl = '';
  let currentPreviewUrl = '';
  let standardPreviewUrl = '';
  let standardPreviewResult = null;
  let standardPreviewEditableHtml = '';
  let standardPreviewEditMode = false;
  let standardPreviewSelectedBlock = null;
  let standardPreviewInFlight = false;
  let standardPreviewPageCount = 0;
  let standardPreviewPaperData = null;
  let a4PreviewState = null;
  let a4PreviewZoom = 1;
  let a4IssuesExpanded = false;
  let standardPreviewBaseWarnings = [];
  let deleteInFlight = false;
  let statusUpdateInFlight = false;
  let bulkOriginalDeleteInFlight = false;
  let initialized = false;
  let boardFilter = 'all';
  let reviewOpenRequest = 0;

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

  function setHidden(id, hidden) {
    const node = byId(id);
    if (node) node.hidden = Boolean(hidden);
  }

  function statusClass(status) {
    const value = normalize(status);
    if (value === 'APPROVED') return 'success';
    if (value === 'CORRECTION REQUIRED') return 'danger';
    if (value === 'SUBMITTED') return 'warning';
    return '';
  }

  function isRevision(paper) {
    return paper?.resubmitted === true
      || (normalize(paper?.status) === 'SUBMITTED' && Boolean(String(paper?.adminNote || '').trim()));
  }

  function isReadyForRereview(paper) {
    return isRevision(paper) && normalize(paper.status) === 'SUBMITTED';
  }

  function isAwaitingFirstReview(paper) {
    return !isRevision(paper) && normalize(paper.status) === 'SUBMITTED';
  }

  function correctionRemarks(paper) {
    const source = Array.isArray(paper?.correctionHistory) ? paper.correctionHistory : [];
    const remarks = [];
    source.forEach((entry) => {
      const value = entry && typeof entry === 'object' ? entry : { note: entry };
      const note = String(value.note || value.message || '').trim();
      if (!note) return;
      const version = Number(value.version || 0);
      if (remarks.some((item) => item.note === note && Number(item.version || 0) === version)) return;
      remarks.push({
        note,
        version,
        returnedAt: String(value.returnedAt || value.timestamp || '').trim(),
        returnedBy: String(value.returnedBy || value.adminId || '').trim()
      });
    });
    const latest = String(paper?.adminNote || '').trim();
    if (latest && !remarks.some((item) => item.note === latest)) {
      remarks.push({ note: latest, version: Number(paper?.version || 0), returnedAt: '', returnedBy: '' });
    }
    return remarks;
  }

  function renderCorrectionRemarks(paper, open = false) {
    const remarks = correctionRemarks(paper);
    if (!remarks.length) return '';
    const items = remarks.slice().reverse().map((entry) => {
      const meta = [
        entry.version ? `Version ${entry.version}` : '',
        entry.returnedAt ? window.BGPS_DATA.safeDate(entry.returnedAt) : '',
        entry.returnedBy && normalize(entry.returnedBy) !== 'ADMIN' ? entry.returnedBy : ''
      ].filter(Boolean).join(' · ');
      return `<li><div>${escapeHtml(entry.note)}</div>${meta ? `<small>${escapeHtml(meta)}</small>` : ''}</li>`;
    }).join('');
    return `<details class="teacher-paper-remarks admin-paper-remarks"${open ? ' open' : ''}><summary>Principal remarks (${remarks.length})</summary><ol>${items}</ol></details>`;
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

  function approvedOriginalCandidates() {
    return papers.filter((paper) => normalize(paper.status) === 'APPROVED'
      && paper.canStandardize === true
      && paper.originalAvailable !== false
      && paper.hasFinalPdf === true);
  }

  function syncBulkOriginalDeleteButton() {
    const button = byId('deleteAllApprovedOriginalsButton');
    if (!button) return;
    const count = approvedOriginalCandidates().length;
    button.disabled = bulkOriginalDeleteInFlight || count === 0;
    button.textContent = bulkOriginalDeleteInFlight
      ? 'Deleting originals…'
      : (count ? `Delete Approved Originals (${count})` : 'No Approved Originals');
    button.title = count
      ? 'Move original DOCX files of approved papers to Drive Trash. Final approved PDFs and paper records remain.'
      : 'No approved DOCX originals are currently eligible for cleanup.';
  }

  async function bulkDeleteApprovedOriginals() {
    if (bulkOriginalDeleteInFlight) return;
    const candidates = approvedOriginalCandidates();
    if (!candidates.length) {
      window.BGPS_APP.toast('No approved DOCX originals are available for cleanup.');
      syncBulkOriginalDeleteButton();
      return;
    }

    const confirmed = window.confirm(
      `Move ${candidates.length} original DOCX file${candidates.length === 1 ? '' : 's'} of approved papers to Drive Trash?\n\n`
      + 'Final approved PDFs, spreadsheet records, approval status and audit history will remain. '
      + 'This action does not affect submitted or correction-pending papers.'
    );
    if (!confirmed) return;

    bulkOriginalDeleteInFlight = true;
    syncBulkOriginalDeleteButton();
    try {
      const result = await window.BGPS_API.bulkDeleteApprovedOriginals();
      await load(false);
      window.BGPS_DASHBOARD.refresh(false).catch(() => {});
      const deleted = Number(result.deleted || 0);
      const alreadyRemoved = Number(result.alreadyRemoved || 0);
      const skipped = Number(result.skipped || 0);
      const failed = Number(result.failed || 0);
      const parts = [`${deleted} original DOCX file${deleted === 1 ? '' : 's'} moved to Trash`];
      if (alreadyRemoved) parts.push(`${alreadyRemoved} already removed`);
      if (skipped) parts.push(`${skipped} skipped`);
      if (failed) parts.push(`${failed} failed`);
      window.BGPS_APP.toast(parts.join(' · '), failed ? 'error' : undefined);
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not clean approved original DOCX files.', 'error');
    } finally {
      bulkOriginalDeleteInFlight = false;
      syncBulkOriginalDeleteButton();
    }
  }

  function renderMetrics() {
    setText('papersMetricSubmitted', papers.filter(isAwaitingFirstReview).length);
    setText('papersMetricResubmitted', papers.filter(isReadyForRereview).length);
    setText('papersMetricApproved', papers.filter((p) => normalize(p.status) === 'APPROVED').length);
    setText('papersMetricCorrection', papers.filter((p) => normalize(p.status) === 'CORRECTION REQUIRED').length);
    setText('papersMetricTotal', papers.length);
    syncBulkOriginalDeleteButton();
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
          ${revision ? `<div class="paper-row-note"><strong>${rereview ? 'Ready for re-review.' : 'Revision history retained.'}</strong></div>${renderCorrectionRemarks(paper, rereview)}` : ''}
        </div>
        <div class="paper-facts">
          <span><small>Marks</small><strong>${escapeHtml(paper.maxMarks || '—')}</strong></span>
          <span><small>Version</small><strong>${escapeHtml(paper.version || 1)}</strong></span>
          <span><small>Updated</small><strong>${escapeHtml(window.BGPS_DATA.safeDate(paper.updatedAt) || '—')}</strong></span>
        </div>
        <div class="paper-row-actions"><button class="btn primary compact" type="button" data-open-paper="${escapeHtml(paper.paperId)}">${escapeHtml(actionLabel)}</button>${paper.editable === true ? `<button class="btn compact" type="button" data-edit-admin-paper="${escapeHtml(paper.paperId)}">Edit</button>` : ''}<button class="btn danger-outline compact" type="button" data-delete-paper="${escapeHtml(paper.paperId)}">Delete</button></div>
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
    if (standardPreviewUrl) {
      URL.revokeObjectURL(standardPreviewUrl);
      standardPreviewUrl = '';
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
    reviewOpenRequest += 1;
    revokeObjectUrl();
    resetUnifiedA4Preview();
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

  function setUnifiedPreviewMode(mode) {
    const a4 = byId('bgpsUnifiedA4Shell');
    const file = byId('paperPreviewArea');
    const useA4 = mode === 'a4';
    if (a4) a4.hidden = !useA4;
    if (file) file.hidden = useA4;
  }

  function resetUnifiedA4Preview() {
    if (standardPreviewUrl) {
      URL.revokeObjectURL(standardPreviewUrl);
      standardPreviewUrl = '';
    }
    standardPreviewResult = null;
    standardPreviewEditableHtml = '';
    standardPreviewEditMode = false;
    standardPreviewSelectedBlock = null;
    standardPreviewPageCount = 0;
    standardPreviewPaperData = null;
    standardPreviewBaseWarnings = [];
    a4PreviewState = null;
    a4PreviewZoom = 1;
    a4IssuesExpanded = false;
    const body = byId('bgpsStandardPreviewBody');
    if (body) body.innerHTML = '';
    const warnings = byId('bgpsStandardPreviewWarnings');
    if (warnings) { warnings.hidden = true; warnings.innerHTML = ''; }
    const card = byId('a4PreviewValidationCard');
    if (card) card.setAttribute('aria-expanded', 'false');
    const deleteOriginal = byId('deleteOriginalAfterApproval');
    if (deleteOriginal) deleteOriginal.checked = false;
    const editButton = byId('editBgpsStandardPreview');
    if (editButton) editButton.textContent = 'Edit Content';
    setHidden('deleteBgpsSelectedContent', true);
    setHidden('undoBgpsStandardEdit', true);
    setText('bgpsStandardEditHint', 'Edit only the admin working copy. The teacher source remains unchanged.');
    updateA4Summary();
  }


  function isDocxStandardCandidate(paper) {
    return Boolean(paper?.canStandardize === true);
  }

  function canOpenProfessionalA4(paper) {
    return Boolean(paper && (isDocxStandardCandidate(paper) || paper.editable === true));
  }

  function updateA4Summary() {
    const validation = a4PreviewState?.validation;
    setText('a4PreviewTeacher', currentPaper?.teacherName || currentPaper?.teacherId || '—');
    setText('a4PreviewQuestions', validation ? validation.totalQuestions : (currentPaper?.a4PreviewTotalQuestions || currentPaper?.totalQuestions || '—'));
    setText('a4PreviewMarks', validation
      ? `${validation.detectedMarks || '—'} / ${currentPaper?.maxMarks || '—'}`
      : `${currentPaper?.a4PreviewDetectedMarks || '—'} / ${currentPaper?.maxMarks || '—'}`);
    setText('a4PreviewPages', a4PreviewState?.pageCount || currentPaper?.a4PreviewPageCount || '—');
    setText('a4PreviewVersion', currentPaper?.version || 1);
    setText('a4PreviewSubmitted', currentPaper?.updatedAt ? window.BGPS_DATA.safeDate(currentPaper.updatedAt) : (currentPaper?.uploadedAt ? window.BGPS_DATA.safeDate(currentPaper.uploadedAt) : '—'));
    setText('a4PreviewWorkflowStatus', currentPaper?.status || '—');
    const status = byId('a4PreviewValidation');
    const card = byId('a4PreviewValidationCard');
    const hint = byId('a4PreviewValidationHint');
    const errors = validation?.critical?.length || 0;
    const warnings = (validation?.warnings?.length || 0) + standardPreviewBaseWarnings.length;
    if (status) {
      status.textContent = !validation
        ? (currentPaper?.a4PreviewSaved === true ? 'Saved - verify' : 'Preparing…')
        : (errors ? `${errors} critical issue${errors === 1 ? '' : 's'}` : (warnings ? `Ready · ${warnings} note${warnings === 1 ? '' : 's'}` : 'Ready'));
      status.className = errors ? 'has-errors' : (validation ? 'is-valid' : '');
    }
    if (hint) hint.textContent = !validation ? 'Validation is running' : (errors || warnings ? 'Tap to view details' : 'No issues found');
    if (card) {
      card.classList.toggle('has-errors', errors > 0);
      card.classList.toggle('is-valid', Boolean(validation) && errors === 0);
      card.disabled = !validation || (errors === 0 && warnings === 0);
      card.setAttribute('aria-expanded', String(a4IssuesExpanded && !card.disabled));
    }
  }

  function setA4Zoom(value) {
    a4PreviewZoom = Math.max(0.35, Math.min(1.4, Number(value) || 1));
    const documentNode = byId('bgpsStandardPreviewBody')?.querySelector('.bgps-a4-document');
    if (documentNode) documentNode.style.zoom = String(a4PreviewZoom);
    setText('bgpsA4ZoomValue', `${Math.round(a4PreviewZoom * 100)}%`);
  }

  function fitA4Preview() {
    const body = byId('bgpsStandardPreviewBody');
    if (!body) return;
    const available = Math.max(260, body.clientWidth - 24);
    setA4Zoom(Math.min(1, available / 794));
  }

  function printA4Preview() {
    try { window.BGPS_A4_RENDERER?.print(a4PreviewState); }
    catch (error) { window.BGPS_APP.toast(error.message || 'Prepare the A4 preview first.', 'error'); }
  }

  async function renderProfessionalA4() {
    const body = byId('bgpsStandardPreviewBody');
    if (!body || !standardPreviewPaperData || !standardPreviewEditableHtml.trim()) return null;
    if (!window.BGPS_A4_RENDERER?.render) throw new Error('Final A4 renderer is unavailable. Refresh the portal.');
    a4PreviewState = await window.BGPS_A4_RENDERER.render({
      mount: body,
      paper: { ...currentPaper, ...standardPreviewPaperData },
      contentHtml: standardPreviewEditableHtml
    });
    standardPreviewPageCount = a4PreviewState.pageCount;
    updateA4Summary();
    renderStandardWarnings();
    fitA4Preview();
    return a4PreviewState;
  }

  function renderStandardWarnings(items) {
    if (Array.isArray(items)) standardPreviewBaseWarnings = [...new Set(items.filter(Boolean).map(String))];
    const node = byId('bgpsStandardPreviewWarnings');
    if (!node) return;
    const critical = Array.isArray(a4PreviewState?.validation?.critical) ? a4PreviewState.validation.critical : [];
    const warnings = [...new Set([
      ...standardPreviewBaseWarnings,
      ...(Array.isArray(a4PreviewState?.validation?.warnings) ? a4PreviewState.validation.warnings : [])
    ].filter(Boolean).map(String))];
    const hasDetails = critical.length > 0 || warnings.length > 0;
    node.hidden = !hasDetails || !a4IssuesExpanded;
    if (!hasDetails) {
      node.innerHTML = '';
      updateA4Summary();
      return;
    }
    node.innerHTML = `<div class="bgps-issues-head"><strong>Validation details</strong><button class="bgps-issues-close" data-close-a4-issues type="button">Close</button></div>`
      + (critical.length
        ? `<h4>Critical - fix before saving</h4><ul>${critical.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<div class="bgps-no-critical">No critical issue. This preview can be saved.</div>')
      + (warnings.length ? `<div class="warning-group"><h4>Review notes</h4><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : '');
    updateA4Summary();
  }

  function toggleA4Issues(force) {
    const validation = a4PreviewState?.validation;
    const hasDetails = Boolean((validation?.critical?.length || 0) || (validation?.warnings?.length || 0) || standardPreviewBaseWarnings.length);
    if (!hasDetails) return;
    a4IssuesExpanded = typeof force === 'boolean' ? force : !a4IssuesExpanded;
    renderStandardWarnings();
    if (a4IssuesExpanded) byId('bgpsStandardPreviewWarnings')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }


  function cleanStandardEditableHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '');
    wrapper.querySelectorAll('.bgps-edit-selected,[contenteditable]').forEach((node) => {
      node.classList.remove('bgps-edit-selected');
      node.removeAttribute('contenteditable');
    });
    wrapper.querySelectorAll('script,style,iframe,object,embed').forEach((node) => node.remove());
    return wrapper.innerHTML.trim();
  }

  function currentStandardEditableHtml() {
    const surface = byId('bgpsStandardEditSurface');
    return surface ? cleanStandardEditableHtml(surface.innerHTML) : cleanStandardEditableHtml(standardPreviewEditableHtml);
  }

  function selectStandardEditableBlock(target) {
    const surface = byId('bgpsStandardEditSurface');
    if (!surface || !target) return;
    const block = target.closest('table,figure,.diagram-box,li,p,h1,h2,h3,h4,h5,h6,div');
    if (!block || block === surface || !surface.contains(block)) return;
    standardPreviewSelectedBlock?.classList.remove('bgps-edit-selected');
    standardPreviewSelectedBlock = block;
    block.classList.add('bgps-edit-selected');
  }

  function renderStandardEditablePreview() {
    const body = byId('bgpsStandardPreviewBody');
    if (!body) return;
    standardPreviewEditMode = true;
    if (standardPreviewUrl) { URL.revokeObjectURL(standardPreviewUrl); standardPreviewUrl = ''; }
    body.innerHTML = '<div class="bgps-standard-edit-surface" id="bgpsStandardEditSurface" contenteditable="true" spellcheck="true"></div>';
    const surface = byId('bgpsStandardEditSurface');
    surface.innerHTML = standardPreviewEditableHtml || '<p>BGPS content is unavailable for editing.</p>';
    surface.addEventListener('click', (event) => selectStandardEditableBlock(event.target));
    surface.addEventListener('input', () => {
      standardPreviewEditableHtml = currentStandardEditableHtml();
      setText('bgpsStandardPreviewStatus', 'Unsaved edits');
    });
    byId('editBgpsStandardPreview').textContent = 'Regenerate A4 Preview';
    setHidden('deleteBgpsSelectedContent', false);
    setHidden('undoBgpsStandardEdit', false);
    setText('bgpsStandardEditHint', 'Select text or tap a question, image or table, then use Delete Selected. Changes affect only the BGPS working copy.');
    surface.focus();
  }

  async function toggleStandardPreviewEditMode() {
    if (!standardPreviewResult) return;
    if (!standardPreviewEditMode) { renderStandardEditablePreview(); return; }
    standardPreviewEditableHtml = currentStandardEditableHtml();
    standardPreviewEditMode = false;
    standardPreviewSelectedBlock = null;
    byId('editBgpsStandardPreview').textContent = 'Edit Content';
    setHidden('deleteBgpsSelectedContent', true);
    setHidden('undoBgpsStandardEdit', true);
    setText('bgpsStandardEditHint', 'The A4 preview has been regenerated from your working-copy edits.');
    await renderStandardPreviewPdf(standardPreviewResult);
  }

  function deleteSelectedStandardContent() {
    const surface = byId('bgpsStandardEditSurface');
    if (!surface) return;
    const selection = window.getSelection();
    const hasTextSelection = selection && !selection.isCollapsed && selection.rangeCount
      && surface.contains(selection.anchorNode) && surface.contains(selection.focusNode);
    if (hasTextSelection) {
      selection.deleteFromDocument();
    } else if (standardPreviewSelectedBlock && surface.contains(standardPreviewSelectedBlock)) {
      const label = standardPreviewSelectedBlock.matches('table') ? 'table'
        : standardPreviewSelectedBlock.matches('img,.diagram-box,figure') ? 'image'
        : 'selected question/content block';
      if (!window.confirm(`Delete this ${label} from the BGPS working copy?`)) return;
      standardPreviewSelectedBlock.remove();
      standardPreviewSelectedBlock = null;
    } else {
      window.BGPS_APP.toast('Select text or tap a question, image or table first.', 'error');
      return;
    }
    standardPreviewEditableHtml = currentStandardEditableHtml();
    setText('bgpsStandardPreviewStatus', 'Unsaved edits');
  }

  function undoStandardEdit() {
    const surface = byId('bgpsStandardEditSurface');
    if (!surface) return;
    surface.focus();
    document.execCommand('undo');
    standardPreviewEditableHtml = currentStandardEditableHtml();
    setText('bgpsStandardPreviewStatus', 'Unsaved edits');
  }

  async function renderStandardPreviewPdf(result) {
    if (standardPreviewEditableHtml.trim() && standardPreviewPaperData) {
      await renderProfessionalA4();
      return;
    }
    const body = byId('bgpsStandardPreviewBody');
    if (!body) return;
    if (!result?.fileBase64) {
      body.innerHTML = '<div class="empty-state"><strong>A4 preview is unavailable</strong>Please refresh or return the paper for correction.</div>';
      return;
    }
    const blob = base64ToBlob(result.fileBase64, result.mimeType || 'application/pdf');
    if (standardPreviewUrl) URL.revokeObjectURL(standardPreviewUrl);
    standardPreviewUrl = URL.createObjectURL(blob);
    body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="BGPS standardized question paper preview"></iframe>';
    body.querySelector('iframe').src = standardPreviewUrl;
    try { standardPreviewPageCount = await window.BGPS_PDF_PREVIEW.countPages(blob); }
    catch (error) { standardPreviewPageCount = 0; console.warn('Could not calculate fallback preview page count.', error); }
    updateA4Summary();
  }

  async function openBgpsStandardPreview() {
    if (!currentPaper || !canOpenProfessionalA4(currentPaper) || standardPreviewInFlight) return;
    standardPreviewInFlight = true;
    setUnifiedPreviewMode('a4');
    setText('bgpsStandardPreviewTitle', currentPaper.title || 'Final A4 Preview');
    setText('bgpsStandardPreviewMeta', `${currentPaper.className} · ${currentPaper.subject} · ${currentPaper.exam} · Version ${currentPaper.version || 1}`);
    setText('bgpsStandardPreviewStatus', currentPaper.a4PreviewSaved ? 'Saved Final Preview' : 'Preparing Final Preview');
    const body = byId('bgpsStandardPreviewBody');
    if (body) body.innerHTML = '<div class="empty-state"><strong>Preparing final A4 preview</strong>Checking questions, marks, images, page breaks and print layout.</div>';
    standardPreviewBaseWarnings = [];
    a4IssuesExpanded = false;
    renderStandardWarnings();
    updateA4Summary();
    const saveButton = byId('saveBgpsStandardPreview');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Preparing…'; }
    try {
      const result = isDocxStandardCandidate(currentPaper)
        ? await window.BGPS_API.getBgpsStandardPreview(currentPaper.paperId)
        : await window.BGPS_API.getPaperContent(currentPaper.paperId);
      standardPreviewResult = result;
      standardPreviewPaperData = { ...currentPaper, ...(result.paper || {}) };
      standardPreviewEditableHtml = String(result.editableContentHtml || result.paper?.editorHtml || '');
      if (!standardPreviewEditableHtml.trim()) throw new Error('Editable paper content is unavailable. Return this paper for correction or review the uploaded reference file.');
      standardPreviewEditMode = false;
      standardPreviewSelectedBlock = null;
      const deleteOriginalWrap = byId('deleteOriginalAfterApproval')?.closest('label');
      if (deleteOriginalWrap) deleteOriginalWrap.hidden = !isDocxStandardCandidate(currentPaper);
      const deleteOriginal = byId('deleteOriginalAfterApproval');
      if (deleteOriginal) deleteOriginal.checked = false;
      const editButton = byId('editBgpsStandardPreview');
      if (editButton) editButton.textContent = 'Edit Content';
      setHidden('deleteBgpsSelectedContent', true);
      setHidden('undoBgpsStandardEdit', true);
      setText('bgpsStandardPreviewStatus', currentPaper.a4PreviewSaved ? 'Saved Final Preview · verify before approval' : 'Final Preview · not yet saved');
      standardPreviewBaseWarnings = [...new Set([...(result.warnings || []), ...(result.paper?.importWarnings || [])].filter(Boolean).map(String))];
      await renderProfessionalA4();
      if (saveButton) saveButton.textContent = currentPaper.a4PreviewSaved ? 'Update Final Preview' : 'Save Final Preview';
    } catch (error) {
      if (body) body.innerHTML = `<div class="empty-state"><strong>A4 preview could not be prepared</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      standardPreviewBaseWarnings = [error.message || 'The preview could not be prepared.'];
      a4IssuesExpanded = true;
      renderStandardWarnings();
      updateA4Summary();
    } finally {
      standardPreviewInFlight = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = currentPaper?.a4PreviewSaved ? 'Update Final Preview' : 'Save Final Preview'; }
    }
  }

  async function saveCurrentBgpsStandardPreview(approveAfterSave, behavior = {}) {
    if (!currentPaper || !canOpenProfessionalA4(currentPaper) || standardPreviewInFlight) return false;
    const deleteOriginalAfterApproval = approveAfterSave && isDocxStandardCandidate(currentPaper)
      && byId('deleteOriginalAfterApproval')?.checked === true;
    if (deleteOriginalAfterApproval) {
      const confirmed = window.confirm('After the final approved PDF is created, move the teacher’s original DOCX to Drive Trash?\n\nThis does not delete the final approved PDF.');
      if (!confirmed) return false;
    }
    standardPreviewInFlight = true;
    const saveButton = byId('saveBgpsStandardPreview');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Validating & Saving…'; }
    try {
      standardPreviewEditableHtml = standardPreviewEditMode
        ? currentStandardEditableHtml()
        : cleanStandardEditableHtml(standardPreviewEditableHtml);
      standardPreviewEditMode = false;
      standardPreviewSelectedBlock = null;
      const state = await renderProfessionalA4();
      if (!state) throw new Error('A4 preview could not be generated.');
      if (state.validation.critical.length) {
        toggleA4Issues(true);
        throw new Error('Fix the critical validation issues shown above before saving.');
      }
      standardPreviewEditableHtml = state.sourceHtml;
      const result = await window.BGPS_API.saveAdminA4Preview(currentPaper.paperId, {
        renderedHtml: state.documentHtml,
        sourceContentHtml: state.sourceHtml,
        pageCount: state.pageCount,
        detectedMarks: state.validation.detectedMarks,
        totalQuestions: state.validation.totalQuestions,
        warnings: [...state.validation.warnings, ...(Array.isArray(standardPreviewResult?.warnings) ? standardPreviewResult.warnings : [])],
        sourceChecksum: state.sourceChecksum
      });
      const savedAt = result.savedAt || new Date().toISOString();
      const savedMetrics = {
        a4PreviewSaved: true,
        a4PreviewSavedAt: savedAt,
        a4PreviewPageCount: Number(result.pageCount || state.pageCount || 0),
        a4PreviewDetectedMarks: Number(result.detectedMarks || state.validation.detectedMarks || 0),
        a4PreviewTotalQuestions: Number(result.totalQuestions || state.validation.totalQuestions || 0),
        standardPreviewSaved: true,
        standardPreviewSavedAt: savedAt,
        hasFinalPdf: false
      };
      Object.assign(currentPaper, savedMetrics);
      const listPaper = papers.find((item) => String(item.paperId) === String(currentPaper.paperId));
      if (listPaper) Object.assign(listPaper, savedMetrics);
      standardPreviewResult = { ...standardPreviewResult, ...result, saved: true };
      setReviewMeta(currentPaper);
      setText('bgpsStandardPreviewStatus', 'Saved A4 Preview · ready for approval');
      updateA4Summary();
      render();
      if (behavior.quiet !== true) window.BGPS_APP.toast(`Final A4 preview saved (${state.pageCount} page${state.pageCount === 1 ? '' : 's'}).`);
      if (approveAfterSave) {
        await updateStatus('Approved', { deleteOriginalAfterApproval });
      }
      return true;
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not save the final A4 preview.', 'error');
      return false;
    } finally {
      standardPreviewInFlight = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = currentPaper?.a4PreviewSaved ? 'Update Final Preview' : 'Save Final Preview'; }
    }
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
    setText('reviewTeacher', paper.teacherName || paper.teacherId || '—');
    setText('reviewClass', paper.className || '—');
    setText('reviewSubject', paper.subject || '—');
    setText('reviewExam', paper.exam || '—');
    setText('reviewMaxMarks', paper.maxMarks || '—');
    setText('reviewVersion', paper.version || 1);
    const history = byId('paperCorrectionHistory');
    if (history) {
      const remarksHtml = renderCorrectionRemarks(paper, true);
      history.hidden = !revision && !remarksHtml;
      history.innerHTML = remarksHtml || (revision
        ? escapeHtml(resubmitted ? 'Corrected version received for re-review.' : 'This paper belongs to a corrected revision workflow.')
        : '');
    }
    const note = byId('paperReviewNote');
    if (note) note.value = paper.adminNote || '';

    const canStandardize = canOpenProfessionalA4(paper);
    const standardSaved = canStandardize && paper.a4PreviewSaved === true;
    const standardStatus = byId('bgpsStandardReviewStatus');
    if (standardStatus) {
      standardStatus.hidden = !canStandardize;
      standardStatus.classList.toggle('saved', standardSaved);
    }
    setText('bgpsStandardReviewValue', standardSaved
      ? `Final preview saved · ${paper.a4PreviewPageCount || '—'} page${Number(paper.a4PreviewPageCount || 0) === 1 ? '' : 's'}`
      : 'Final A4 preview required');
    setText('bgpsStandardReviewHint', standardSaved
      ? 'Approval will generate one final PDF from this exact saved A4 layout.'
      : 'Open, validate and save the print-ready A4 preview before approval.');
    const savePreview = byId('saveBgpsStandardPreview');
    if (savePreview) {
      savePreview.hidden = !canStandardize || normalize(paper.status) !== 'SUBMITTED';
      savePreview.disabled = standardPreviewInFlight;
      savePreview.textContent = standardSaved ? 'Update Final Preview' : 'Save Final Preview';
    }

    const deleteOriginalWrap = byId('deleteOriginalAfterApproval')?.closest('label');
    if (deleteOriginalWrap) deleteOriginalWrap.hidden = !canStandardize || !isDocxStandardCandidate(paper) || normalize(paper.status) !== 'SUBMITTED';

    const approve = byId('approvePaperButton');
    if (approve) {
      approve.disabled = normalize(paper.status) !== 'SUBMITTED' || (canStandardize && !standardSaved);
      approve.title = canStandardize && !standardSaved ? 'Save the final A4 preview before approval.' : '';
    }
    const edit = byId('editReviewedPaperButton');
    if (edit) edit.hidden = paper.editable !== true;
    const returned = byId('returnPaperButton');
    if (returned) returned.disabled = normalize(paper.status) !== 'SUBMITTED';
  }

  function renderManualPreview(content) {
    const preview = byId('paperPreviewArea');
    if (!preview) return;
    const paper = content.paper || {};
    const html = window.BGPS_PRINT_LAYOUT.prepareFreeMoveHtml(paper.editorHtml).trim();
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
    const requestId = ++reviewOpenRequest;
    let paper = paperById(paperId);
    if (!paper) {
      window.BGPS_APP.toast('Paper record was not found.', 'error');
      return;
    }
    try {
      await load(false);
      if (requestId !== reviewOpenRequest) return;
      paper = paperById(paperId) || paper;
    } catch (refreshError) {
      console.warn('Using cached paper status because refresh failed:', refreshError);
    }
    if (requestId !== reviewOpenRequest) return;
    resetUnifiedA4Preview();
    currentPaper = paper;
    setReviewMeta(paper);
    const download = byId('downloadPaperButton');
    if (download) download.hidden = true;
    const preview = byId('paperPreviewArea');
    if (preview) preview.innerHTML = '<div class="empty-state"><strong>Opening paper</strong>Please wait while the paper is prepared for review.</div>';
    openModal();

    const useA4 = canOpenProfessionalA4(paper) && normalize(paper.status) === 'SUBMITTED';
    setUnifiedPreviewMode(useA4 ? 'a4' : 'file');
    if (useA4) {
      try {
        const originalFilePromise = window.BGPS_API.getPaperOriginalFile(paper.paperId).catch(() => null);
        await openBgpsStandardPreview();
        const originalFile = await originalFilePromise;
        if (requestId !== reviewOpenRequest) return;
        if (originalFile?.fileBase64) {
          const originalBlob = base64ToBlob(originalFile.fileBase64, originalFile.mimeType || 'application/octet-stream');
          prepareDownload(originalBlob, originalFile.fileName || 'question-paper.docx');
        }
      } catch (error) {
        const body = byId('bgpsStandardPreviewBody');
        if (body) body.innerHTML = `<div class="empty-state"><strong>Paper could not be opened</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      }
      return;
    }

    try {
      const [previewResult, originalFile] = await Promise.all([
        window.BGPS_API.getPaperPreview(paper.paperId),
        window.BGPS_API.getPaperOriginalFile(paper.paperId).catch(() => null)
      ]);
      if (requestId !== reviewOpenRequest) return;
      await renderUploadedPreview(previewResult, originalFile);
    } catch (error) {
      if (preview) preview.innerHTML = `<div class="empty-state"><strong>Paper could not be opened</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
    }
  }

  async function updateStatus(status, options = {}) {
    if (!currentPaper || statusUpdateInFlight) return;
    const professionalA4Required = canOpenProfessionalA4(currentPaper);
    if (status === 'Approved' && professionalA4Required && currentPaper.a4PreviewSaved !== true) {
      window.BGPS_APP.toast('Save the final A4 preview before approval.', 'error');
      setUnifiedPreviewMode('a4');
      return;
    }
    if (normalize(currentPaper.status) !== 'SUBMITTED') {
      window.BGPS_APP.toast(currentPaper.status === 'Approved' ? 'Approved papers are final.' : 'Wait for the teacher to correct and resubmit this paper.', 'error');
      return;
    }
    const note = String(byId('paperReviewNote')?.value || '').trim();
    if (status === 'Correction Required' && !note) {
      window.BGPS_APP.toast('Enter a clear correction note before returning the paper.', 'error');
      byId('paperReviewNote')?.focus();
      return;
    }
    if (status === 'Approved') {
      const marks = currentPaper.a4PreviewDetectedMarks || currentPaper.maxMarks || '—';
      const questions = currentPaper.a4PreviewTotalQuestions || currentPaper.totalQuestions || '—';
      const pagesCount = currentPaper.a4PreviewPageCount || '—';
      const confirmed = window.confirm(
        `Approve this final paper?\n\nTeacher: ${currentPaper.teacherName || currentPaper.teacherId || '—'}\nClass: ${currentPaper.className || '—'}\nSubject: ${currentPaper.subject || '—'}\nExam: ${currentPaper.exam || '—'}\nMarks: ${marks} / ${currentPaper.maxMarks || '—'}\nQuestions: ${questions}\nA4 pages: ${pagesCount}\n\nThe approved paper will be locked and the final PDF will be created from the saved A4 preview.`
      );
      if (!confirmed) return;
    }
    const button = status === 'Approved' ? byId('approvePaperButton') : byId('returnPaperButton');
    statusUpdateInFlight = true;
    if (button) { button.disabled = true; button.textContent = status === 'Approved' ? 'Approving…' : 'Returning…'; }
    try {
      const result = await window.BGPS_API.updatePaperStatus(currentPaper.paperId, status, note, options);
      currentPaper.status = status;
      currentPaper.adminNote = note;
      if (Array.isArray(result?.correctionHistory)) {
        currentPaper.correctionHistory = result.correctionHistory;
        currentPaper.correctionCount = result.correctionHistory.length;
      }
      if (result?.originalDeleted === true) { currentPaper.originalDeleted = true; currentPaper.originalAvailable = false; }
      if (status === 'Approved') currentPaper.hasFinalPdf = true;
      setReviewMeta(currentPaper);
      render();
      const approvedMessage = result?.originalDeleted
        ? 'Paper approved. Final A4 PDF saved and original DOCX moved to Drive Trash.'
        : (result?.originalDeleteWarning ? `Paper approved. Final A4 PDF saved, but the original DOCX could not be removed: ${result.originalDeleteWarning}` : 'Paper approved. Final A4 PDF saved; original source retained.');
      window.BGPS_APP.toast(status === 'Approved' ? approvedMessage : (result?.requiresReplacement
        ? 'Paper returned. Teacher will upload a corrected DOCX replacement under the same Paper ID.'
        : 'Paper returned. Teacher can correct and resubmit it under the same Paper ID.'));
      await window.BGPS_DASHBOARD.refresh(false);
    } catch (error) {
      const message = error.message || 'Could not update paper status.';
      if (/approved papers are final/i.test(message)) {
        try {
          await load(false);
          const freshPaper = paperById(currentPaper.paperId);
          if (freshPaper) {
            currentPaper = freshPaper;
            setReviewMeta(currentPaper);
            render();
          }
        } catch (refreshError) {
          console.warn('Could not refresh the already-approved paper:', refreshError);
        }
        window.BGPS_APP.toast('This paper is already approved. The latest status has been refreshed.');
      } else {
        window.BGPS_APP.toast(message, 'error');
      }
    } finally {
      statusUpdateInFlight = false;
      if (button) {
        button.textContent = status === 'Approved' ? 'Approve Paper' : 'Return for Correction';
        button.disabled = status === 'Approved'
          ? normalize(currentPaper?.status) === 'APPROVED' || (canOpenProfessionalA4(currentPaper) && currentPaper?.a4PreviewSaved !== true)
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
    byId('bgpsA4ZoomOut')?.addEventListener('click', () => setA4Zoom(a4PreviewZoom - 0.1));
    byId('bgpsA4FitPage')?.addEventListener('click', fitA4Preview);
    byId('bgpsA4ZoomIn')?.addEventListener('click', () => setA4Zoom(a4PreviewZoom + 0.1));
    byId('printBgpsA4Preview')?.addEventListener('click', printA4Preview);
    byId('refreshPapersButton')?.addEventListener('click', () => load(true));
    byId('deleteAllApprovedOriginalsButton')?.addEventListener('click', bulkDeleteApprovedOriginals);
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
    byId('editBgpsStandardPreview')?.addEventListener('click', toggleStandardPreviewEditMode);
    byId('deleteBgpsSelectedContent')?.addEventListener('click', deleteSelectedStandardContent);
    byId('undoBgpsStandardEdit')?.addEventListener('click', undoStandardEdit);
    byId('approvePaperButton')?.addEventListener('click', () => updateStatus('Approved'));
    byId('editReviewedPaperButton')?.addEventListener('click', () => {
      if (!currentPaper) return;
      const paperId = currentPaper.paperId;
      closeReview();
      window.BGPS_PAPER_CREATOR.openAdminEdit(paperId);
    });
    byId('returnPaperButton')?.addEventListener('click', () => updateStatus('Correction Required'));
    byId('saveBgpsStandardPreview')?.addEventListener('click', () => saveCurrentBgpsStandardPreview(false));
    byId('a4PreviewValidationCard')?.addEventListener('click', () => toggleA4Issues());
    byId('bgpsStandardPreviewWarnings')?.addEventListener('click', (event) => { if (event.target.closest('[data-close-a4-issues]')) toggleA4Issues(false); });
    byId('deleteReviewedPaperButton')?.addEventListener('click', () => { if (currentPaper) deleteAdminPaper(currentPaper.paperId); });
    byId('downloadPaperButton')?.addEventListener('click', downloadCurrentFile);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (byId('paperReviewModal')?.classList.contains('open')) closeReview();
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
    standardPreviewResult = null;
    standardPreviewInFlight = false;
    standardPreviewPageCount = 0;
    standardPreviewPaperData = null;
    a4PreviewState = null;
    a4PreviewZoom = 1;
    deleteInFlight = false;
    bulkOriginalDeleteInFlight = false;
    boardFilter = 'all';
    render();
  }

  window.BGPS_PAPERS = Object.freeze({ onAuthenticated, load, render, openReview, setStatusFilter, setResubmittedFilter, reset, getPapers: () => [...papers] });
})();
