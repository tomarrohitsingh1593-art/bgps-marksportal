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
  let standardPreviewUndoHtml = '';
  let deleteInFlight = false;
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
          ${revision ? `<div class="paper-row-note"><strong>${rereview ? 'Ready for re-review.' : 'Revision history retained.'}</strong>${paper.adminNote ? ` Previous Principal remark: ${escapeHtml(paper.adminNote)}` : ''}</div>` : ''}
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

  function openStandardPreviewModal() {
    const modal = byId('bgpsStandardPreviewModal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeStandardPreviewModal() {
    const modal = byId('bgpsStandardPreviewModal');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
    if (standardPreviewUrl) {
      URL.revokeObjectURL(standardPreviewUrl);
      standardPreviewUrl = '';
    }
    standardPreviewResult = null;
    standardPreviewEditableHtml = '';
    standardPreviewEditMode = false;
    standardPreviewSelectedBlock = null;
    standardPreviewPageCount = 0;
    standardPreviewUndoHtml = '';
    const deleteOriginal = byId('deleteOriginalAfterApproval');
    if (deleteOriginal) deleteOriginal.checked = false;
    const editButton = byId('editBgpsStandardPreview');
    if (editButton) editButton.textContent = 'Edit / Delete Content';
    setHidden('deleteBgpsSelectedContent', true);
    setHidden('undoBgpsStandardEdit', true);
    if (!document.querySelector('.modal-backdrop.open')) document.body.classList.remove('modal-open');
    const body = byId('bgpsStandardPreviewBody');
    if (body) body.innerHTML = '';
    const warnings = byId('bgpsStandardPreviewWarnings');
    if (warnings) { warnings.hidden = true; warnings.innerHTML = ''; }
    updateStandardPageFitControls();
  }

  function isDocxStandardCandidate(paper) {
    return Boolean(paper?.canStandardize === true);
  }

  function renderStandardWarnings(items) {
    const node = byId('bgpsStandardPreviewWarnings');
    if (!node) return;
    const warnings = Array.isArray(items) ? items.filter(Boolean) : [];
    node.hidden = warnings.length === 0;
    node.innerHTML = warnings.length
      ? `<strong>Review notes</strong><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
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

  function standardLayoutIsCompact(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(html || '');
    return Boolean(wrapper.querySelector('.bgps-layout-compact'));
  }

  function setStandardCompactLayout(html, compact) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = cleanStandardEditableHtml(html);
    let root = wrapper.querySelector('.bgps-standardized-docx');
    if (!root) {
      root = document.createElement('div');
      root.className = 'bgps-standardized-docx';
      while (wrapper.firstChild) root.appendChild(wrapper.firstChild);
      wrapper.appendChild(root);
    }
    root.classList.toggle('bgps-layout-compact', Boolean(compact));
    return wrapper.innerHTML.trim();
  }

  function updateStandardPageFitControls(message) {
    const pageText = byId('bgpsStandardPageCount');
    if (pageText) {
      pageText.textContent = standardPreviewPageCount > 0
        ? `${standardPreviewPageCount} page${standardPreviewPageCount === 1 ? '' : 's'}`
        : 'Calculating pages…';
    }
    const compact = standardLayoutIsCompact(standardPreviewEditableHtml);
    const fitButton = byId('bgpsAutoFitPages');
    if (fitButton) {
      fitButton.disabled = standardPreviewInFlight || standardPreviewPageCount <= 1 || compact;
      fitButton.textContent = compact
        ? 'Compact Layout Applied'
        : (standardPreviewPageCount > 1 ? `Fit ${standardPreviewPageCount} Pages → Fewer` : 'Auto-Fit Fewer Pages');
    }
    const undoButton = byId('bgpsUndoPageFit');
    if (undoButton) {
      undoButton.hidden = !standardPreviewUndoHtml;
      undoButton.disabled = standardPreviewInFlight;
    }
    const note = byId('bgpsPageFitMessage');
    if (note) {
      note.textContent = message || (compact
        ? 'Compact layout is active. Review readability before approval.'
        : 'BGPS alignment is applied when this preview opens. Before approval, use Fit Pages only if you want a shorter paper.');
    }
  }

  function ensureStandardPageFitControls() {
    if (byId('bgpsStandardPageFitControls')) return;
    const body = byId('bgpsStandardPreviewBody');
    if (!body) return;
    if (!byId('bgpsStandardPageFitStyles')) {
      const style = document.createElement('style');
      style.id = 'bgpsStandardPageFitStyles';
      style.textContent = `
        .bgps-page-fit-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0;padding:10px 12px;border:1px solid #c9d8e6;border-radius:12px;background:#f7fafc}
        .bgps-page-fit-count{display:flex;align-items:center;gap:7px;color:#123f70;font-weight:800}
        .bgps-page-fit-count strong{font-size:16px}
        .bgps-page-fit-controls button{min-height:42px;padding:8px 13px;border:1px solid #b7cadc;border-radius:10px;background:#fff;color:#123f70;font:inherit;font-weight:800;cursor:pointer}
        .bgps-page-fit-controls button.primary{border-color:#123f70;background:#123f70;color:#fff}
        .bgps-page-fit-controls button:disabled{opacity:.55;cursor:not-allowed}
        .bgps-page-fit-message{flex:1 1 240px;color:#5d7185;font-size:12px;line-height:1.35}
        @media(max-width:700px){.bgps-page-fit-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bgps-page-fit-count,.bgps-page-fit-message{grid-column:1/-1}.bgps-page-fit-controls button{width:100%;min-height:46px}}
      `;
      document.head.appendChild(style);
    }
    const controls = document.createElement('div');
    controls.id = 'bgpsStandardPageFitControls';
    controls.className = 'bgps-page-fit-controls';
    controls.innerHTML = `
      <div class="bgps-page-fit-count">Preview: <strong id="bgpsStandardPageCount">Calculating pages…</strong></div>
      <button class="primary" id="bgpsAutoFitPages" type="button">Auto-Fit Fewer Pages</button>
      <button id="bgpsUndoPageFit" type="button" hidden>Undo Page Fit</button>
      <div class="bgps-page-fit-message" id="bgpsPageFitMessage">BGPS alignment is applied when this preview opens. Before approval, use Fit Pages only if you want a shorter paper.</div>`;
    body.insertAdjacentElement('beforebegin', controls);
    byId('bgpsAutoFitPages')?.addEventListener('click', autoFitStandardPreviewPages);
    byId('bgpsUndoPageFit')?.addEventListener('click', undoStandardPreviewPageFit);
    updateStandardPageFitControls();
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
    byId('editBgpsStandardPreview').textContent = 'Show PDF Preview';
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
    byId('editBgpsStandardPreview').textContent = 'Edit / Delete Content';
    setHidden('deleteBgpsSelectedContent', true);
    setHidden('undoBgpsStandardEdit', true);
    setText('bgpsStandardEditHint', 'PDF view shows the last generated preview. Save the working copy to regenerate it with your edits.');
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
    const body = byId('bgpsStandardPreviewBody');
    if (!body) return;
    if (!result?.fileBase64) {
      body.innerHTML = '<div class="empty-state"><strong>BGPS preview is unavailable</strong>Please try again or return the paper for correction.</div>';
      return;
    }
    const blob = base64ToBlob(result.fileBase64, result.mimeType || 'application/pdf');
    if (standardPreviewUrl) URL.revokeObjectURL(standardPreviewUrl);
    standardPreviewUrl = URL.createObjectURL(blob);
    try {
      if (window.BGPS_PDF_PREVIEW.shouldUseCanvas()) {
        const rendered = await window.BGPS_PDF_PREVIEW.render(blob, body);
        standardPreviewPageCount = Number(rendered?.pageCount || 0);
      } else {
        body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="BGPS standardized question paper preview"></iframe>';
        body.querySelector('iframe').src = standardPreviewUrl;
        standardPreviewPageCount = await window.BGPS_PDF_PREVIEW.countPages(blob);
      }
    } catch (error) {
      standardPreviewPageCount = 0;
      if (!body.querySelector('iframe')) {
        body.innerHTML = '<iframe class="teacher-paper-preview-frame" title="BGPS standardized question paper preview"></iframe>';
        body.querySelector('iframe').src = standardPreviewUrl;
      }
      console.warn('Could not calculate BGPS preview page count.', error);
    }
    updateStandardPageFitControls();
  }

  async function autoFitStandardPreviewPages() {
    if (!currentPaper || standardPreviewInFlight) return;
    const previousHtml = standardPreviewEditMode ? currentStandardEditableHtml() : cleanStandardEditableHtml(standardPreviewEditableHtml);
    if (standardLayoutIsCompact(previousHtml)) {
      window.BGPS_APP.toast('Compact page layout is already active.');
      return;
    }
    const previousCount = standardPreviewPageCount;
    standardPreviewUndoHtml = previousHtml;
    standardPreviewEditableHtml = setStandardCompactLayout(previousHtml, true);
    standardPreviewEditMode = false;
    standardPreviewSelectedBlock = null;
    setHidden('deleteBgpsSelectedContent', true);
    setHidden('undoBgpsStandardEdit', true);
    const editButton = byId('editBgpsStandardPreview');
    if (editButton) editButton.textContent = 'Edit / Delete Content';
    updateStandardPageFitControls('Applying compact but readable A4 spacing…');
    const saved = await saveCurrentBgpsStandardPreview(false, { quiet: true });
    if (!saved) {
      standardPreviewEditableHtml = previousHtml;
      standardPreviewUndoHtml = '';
      updateStandardPageFitControls('Auto-Fit could not be applied. The previous layout is unchanged.');
      return;
    }
    const reduced = previousCount > 0 && standardPreviewPageCount > 0 && standardPreviewPageCount < previousCount;
    updateStandardPageFitControls(reduced
      ? `Optimized successfully: ${previousCount} → ${standardPreviewPageCount} pages. Review before approval.`
      : `Compact layout applied. It still requires ${standardPreviewPageCount || previousCount || 'the current number of'} pages for safe readability.`);
    window.BGPS_APP.toast(reduced
      ? `Paper optimized from ${previousCount} to ${standardPreviewPageCount} pages.`
      : 'Compact layout applied. Page count could not be reduced safely.');
  }

  async function undoStandardPreviewPageFit() {
    if (!standardPreviewUndoHtml || standardPreviewInFlight) return;
    const restoreHtml = standardPreviewUndoHtml;
    standardPreviewUndoHtml = '';
    standardPreviewEditableHtml = restoreHtml;
    standardPreviewEditMode = false;
    updateStandardPageFitControls('Restoring the previous BGPS working layout…');
    const saved = await saveCurrentBgpsStandardPreview(false, { quiet: true });
    updateStandardPageFitControls(saved
      ? 'Previous layout restored.'
      : 'The previous layout could not be restored. Retry before approval.');
    if (saved) window.BGPS_APP.toast('Previous page layout restored.');
  }

  async function openBgpsStandardPreview() {
    if (!currentPaper || !isDocxStandardCandidate(currentPaper) || standardPreviewInFlight) return;
    standardPreviewInFlight = true;
    setText('bgpsStandardPreviewTitle', currentPaper.title || 'BGPS Standard Preview');
    setText('bgpsStandardPreviewMeta', `${currentPaper.className} · ${currentPaper.subject} · ${currentPaper.exam} · Version ${currentPaper.version || 1}`);
    setText('bgpsStandardPreviewStatus', currentPaper.standardPreviewSaved ? 'Saved BGPS Format' : 'Preview');
    const body = byId('bgpsStandardPreviewBody');
    if (body) body.innerHTML = '<div class="empty-state"><strong>Preparing BGPS format</strong>Aligning numbering, font size, spacing and A4 layout.</div>';
    renderStandardWarnings([]);
    openStandardPreviewModal();
    const previewButton = byId('previewBgpsFormatButton');
    if (previewButton) { previewButton.disabled = true; previewButton.textContent = 'Preparing…'; }
    try {
      const result = await window.BGPS_API.getBgpsStandardPreview(currentPaper.paperId);
      standardPreviewResult = result;
      standardPreviewEditableHtml = String(result.editableContentHtml || '');
      standardPreviewEditMode = false;
      standardPreviewSelectedBlock = null;
      standardPreviewUndoHtml = '';
      const deleteOriginal = byId('deleteOriginalAfterApproval');
      if (deleteOriginal) deleteOriginal.checked = false;
      const editButton = byId('editBgpsStandardPreview');
      if (editButton) editButton.textContent = 'Edit / Delete Content';
      setHidden('deleteBgpsSelectedContent', true);
      setHidden('undoBgpsStandardEdit', true);
      setText('bgpsStandardPreviewStatus', result.saved ? 'Saved BGPS Working Copy' : 'Preview');
      renderStandardWarnings(result.warnings);
      await renderStandardPreviewPdf(result);
      const saveButton = byId('saveBgpsStandardPreview');
      if (saveButton) saveButton.textContent = result.saved ? 'Update BGPS Working Copy' : 'Save BGPS Working Copy';
    } catch (error) {
      if (body) body.innerHTML = `<div class="empty-state"><strong>BGPS format could not be prepared</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
      renderStandardWarnings([]);
    } finally {
      standardPreviewInFlight = false;
      if (previewButton) { previewButton.disabled = false; previewButton.textContent = 'Preview BGPS Format'; }
    }
  }

  async function saveCurrentBgpsStandardPreview(approveAfterSave, behavior = {}) {
    if (!currentPaper || !isDocxStandardCandidate(currentPaper) || standardPreviewInFlight) return;
    const deleteOriginalAfterApproval = approveAfterSave && byId('deleteOriginalAfterApproval')?.checked === true;
    if (deleteOriginalAfterApproval) {
      const confirmed = window.confirm('After the final approved PDF is created, move the teacher’s original DOCX to Drive Trash?\n\nThis does not delete the final approved PDF.');
      if (!confirmed) return;
    }
    standardPreviewInFlight = true;
    const saveButton = byId('saveBgpsStandardPreview');
    const saveApproveButton = byId('saveAndApproveBgpsStandardPreview');
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
    if (saveApproveButton) { saveApproveButton.disabled = true; saveApproveButton.textContent = approveAfterSave ? 'Saving & Approving…' : 'Please wait…'; }
    try {
      const editedContentHtml = standardPreviewEditMode ? currentStandardEditableHtml() : cleanStandardEditableHtml(standardPreviewEditableHtml);
      const result = await window.BGPS_API.saveBgpsStandardPreview(currentPaper.paperId, editedContentHtml);
      currentPaper.standardPreviewSaved = true;
      currentPaper.standardPreviewSavedAt = result.savedAt || new Date().toISOString();
      currentPaper.hasFinalPdf = false;
      const listPaper = papers.find((item) => String(item.paperId) === String(currentPaper.paperId));
      if (listPaper) Object.assign(listPaper, { standardPreviewSaved: true, standardPreviewSavedAt: currentPaper.standardPreviewSavedAt, hasFinalPdf: false });
      standardPreviewEditableHtml = String(result.editableContentHtml || editedContentHtml || '');
      standardPreviewEditMode = false;
      standardPreviewSelectedBlock = null;
      setReviewMeta(currentPaper);
      standardPreviewResult = result;
      setText('bgpsStandardPreviewStatus', 'Saved BGPS Working Copy');
      renderStandardWarnings(result.warnings);
      byId('editBgpsStandardPreview').textContent = 'Edit / Delete Content';
      setHidden('deleteBgpsSelectedContent', true);
      setHidden('undoBgpsStandardEdit', true);
      await renderStandardPreviewPdf(result);
      render();
      if (behavior.quiet !== true) window.BGPS_APP.toast('BGPS working copy saved. No permanent PDF has been added yet.');
      if (approveAfterSave) { closeStandardPreviewModal(); await updateStatus('Approved', { deleteOriginalAfterApproval }); }
      return true;
    } catch (error) {
      window.BGPS_APP.toast(error.message || 'Could not save the BGPS working copy.', 'error');
      return false;
    } finally {
      standardPreviewInFlight = false;
      if (saveButton) { saveButton.disabled = false; saveButton.textContent = currentPaper?.standardPreviewSaved ? 'Update BGPS Working Copy' : 'Save BGPS Working Copy'; }
      if (saveApproveButton) { saveApproveButton.disabled = false; saveApproveButton.textContent = 'Save & Approve'; }
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

    const canStandardize = isDocxStandardCandidate(paper);
    const standardSaved = canStandardize && paper.standardPreviewSaved === true;
    const standardStatus = byId('bgpsStandardReviewStatus');
    if (standardStatus) {
      standardStatus.hidden = !canStandardize;
      standardStatus.classList.toggle('saved', standardSaved);
    }
    setText('bgpsStandardReviewValue', standardSaved ? 'Working copy saved and ready' : 'Preview required');
    setText('bgpsStandardReviewHint', standardSaved
      ? 'The saved working copy will generate one final PDF during approval.'
      : 'Preview and save the BGPS working copy. Original deletion is optional at approval.');
    const standardButton = byId('previewBgpsFormatButton');
    if (standardButton) {
      standardButton.hidden = !canStandardize;
      standardButton.disabled = normalize(paper.status) !== 'SUBMITTED';
      standardButton.textContent = standardSaved ? 'Review Saved BGPS Format' : 'Preview BGPS Format';
    }

    const approve = byId('approvePaperButton');
    if (approve) {
      approve.disabled = normalize(paper.status) !== 'SUBMITTED' || (canStandardize && !standardSaved);
      approve.title = canStandardize && !standardSaved ? 'Preview and save the BGPS format before approval.' : '';
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
    // Always reconcile the selected row with the latest Sheet status before
    // enabling Approve/Return. This prevents an older tab/list snapshot from
    // offering review actions after the paper has already been approved.
    try {
      await load(false);
      if (requestId !== reviewOpenRequest) return;
      paper = paperById(paperId) || paper;
    } catch (refreshError) {
      console.warn('Using cached paper status because refresh failed:', refreshError);
    }
    if (requestId !== reviewOpenRequest) return;
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
        window.BGPS_API.getPaperOriginalFile(paper.paperId).catch(() => null)
      ]);
      if (requestId !== reviewOpenRequest) return;
      await renderUploadedPreview(previewResult, originalFile);
    } catch (error) {
      if (preview) preview.innerHTML = `<div class="empty-state"><strong>Paper could not be opened</strong>${escapeHtml(error.message || 'Please try again.')}</div>`;
    }
  }

  async function updateStatus(status, options = {}) {
    if (!currentPaper) return;
    if (status === 'Approved' && isDocxStandardCandidate(currentPaper) && currentPaper.standardPreviewSaved !== true) {
      window.BGPS_APP.toast('Preview and save the BGPS working copy before approval.', 'error');
      openBgpsStandardPreview();
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
    const button = status === 'Approved' ? byId('approvePaperButton') : byId('returnPaperButton');
    if (button) { button.disabled = true; button.textContent = status === 'Approved' ? 'Approving…' : 'Returning…'; }
    try {
      const result = await window.BGPS_API.updatePaperStatus(currentPaper.paperId, status, note, options);
      currentPaper.status = status;
      currentPaper.adminNote = note;
      if (result?.originalDeleted === true) { currentPaper.originalDeleted = true; currentPaper.originalAvailable = false; }
      if (status === 'Approved') currentPaper.hasFinalPdf = true;
      setReviewMeta(currentPaper);
      render();
      const approvedMessage = result?.originalDeleted
        ? 'Paper approved. Final PDF saved and original DOCX moved to Drive Trash.'
        : (result?.originalDeleteWarning ? `Paper approved. Final PDF saved, but the original DOCX could not be removed: ${result.originalDeleteWarning}` : 'Paper approved. Final PDF saved; original DOCX retained.');
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
      if (button) {
        button.textContent = status === 'Approved' ? 'Approve Paper' : 'Return for Correction';
        button.disabled = status === 'Approved' ? normalize(currentPaper?.status) === 'APPROVED' : normalize(currentPaper?.status) === 'CORRECTION REQUIRED';
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
    ensureStandardPageFitControls();
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
    byId('previewBgpsFormatButton')?.addEventListener('click', openBgpsStandardPreview);
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
    byId('closeBgpsStandardPreview')?.addEventListener('click', closeStandardPreviewModal);
    byId('backFromBgpsStandardPreview')?.addEventListener('click', closeStandardPreviewModal);
    byId('saveBgpsStandardPreview')?.addEventListener('click', () => saveCurrentBgpsStandardPreview(false));
    byId('saveAndApproveBgpsStandardPreview')?.addEventListener('click', () => saveCurrentBgpsStandardPreview(true));
    byId('bgpsStandardPreviewModal')?.addEventListener('click', (event) => {
      if (event.target === byId('bgpsStandardPreviewModal')) closeStandardPreviewModal();
    });
    byId('deleteReviewedPaperButton')?.addEventListener('click', () => { if (currentPaper) deleteAdminPaper(currentPaper.paperId); });
    byId('downloadPaperButton')?.addEventListener('click', downloadCurrentFile);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (byId('bgpsStandardPreviewModal')?.classList.contains('open')) {
        closeStandardPreviewModal();
        return;
      }
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
    standardPreviewUndoHtml = '';
    deleteInFlight = false;
    bulkOriginalDeleteInFlight = false;
    boardFilter = 'all';
    render();
  }

  window.BGPS_PAPERS = Object.freeze({ onAuthenticated, load, render, openReview, setStatusFilter, setResubmittedFilter, reset, getPapers: () => [...papers] });
})();
