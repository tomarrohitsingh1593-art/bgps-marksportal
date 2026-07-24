(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  let session = null;
  let marksRows = [];
  let papers = [];
  let classProgress = [];
  let teacherProgress = [];
  let initialized = false;
  let pendingSummaryRefreshing = false;
  let pendingSummaryMode = 'missing';
  let pendingSummaryExpandedClass = '';

  const PENDING_SUMMARY_IDS = Object.freeze({
    style: 'bgpsPendingSummaryStyle',
    button: 'bgpsPendingSummaryButton',
    overlay: 'bgpsPendingSummaryOverlay',
    drawer: 'bgpsPendingSummaryDrawer',
    content: 'bgpsPendingSummaryContent',
    context: 'bgpsPendingSummaryContext',
    refresh: 'bgpsPendingSummaryRefresh'
  });

  function ensurePendingSummaryUi() {
    if (!byId(PENDING_SUMMARY_IDS.style)) {
      const style = document.createElement('style');
      style.id = PENDING_SUMMARY_IDS.style;
      style.textContent = `
        .bgps-pending-summary-launcher{position:fixed;right:22px;bottom:22px;z-index:9990;min-height:48px;padding:0 18px;border:0;border-radius:999px;background:#123f70;color:#fff;font:inherit;font-size:14px;font-weight:800;line-height:1;box-shadow:0 10px 28px rgba(8,38,67,.28);cursor:pointer;display:none;align-items:center;gap:9px}
        .bgps-pending-summary-launcher:hover{background:#0b3159;transform:translateY(-1px)}
        .bgps-pending-summary-launcher:focus-visible{outline:3px solid #f2a900;outline-offset:3px}
        .bgps-pending-summary-launcher .summary-launcher-dot{width:9px;height:9px;border-radius:50%;background:#f2a900;box-shadow:0 0 0 4px rgba(242,169,0,.18)}
        .bgps-pending-summary-overlay{position:fixed;inset:0;z-index:12000;background:rgba(4,25,45,.54);opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease}
        .bgps-pending-summary-overlay.is-open{opacity:1;visibility:visible}
        .bgps-pending-summary-drawer{position:absolute;top:0;right:0;width:min(720px,100%);height:100%;height:100dvh;background:#f5f8fb;box-shadow:-16px 0 42px rgba(5,34,61,.22);transform:translateX(102%);transition:transform .24s ease;display:flex;flex-direction:column;overflow:hidden}
        .bgps-pending-summary-overlay.is-open .bgps-pending-summary-drawer{transform:translateX(0)}
        .bgps-pending-summary-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px 16px;background:#fff;border-bottom:1px solid #d7e1eb}
        .bgps-pending-summary-title{margin:0;color:#0c3560;font-size:24px;line-height:1.15}
        .bgps-pending-summary-context{display:block;margin-top:5px;color:#667b91;font-size:13px}
        .bgps-pending-summary-head-actions{display:flex;gap:8px;flex:0 0 auto}
        .bgps-pending-summary-icon-button{min-width:44px;height:44px;padding:0 12px;border:1px solid #c6d5e4;border-radius:12px;background:#fff;color:#123f70;font-weight:800;cursor:pointer}
        .bgps-pending-summary-icon-button:hover{background:#edf4fa}
        .bgps-pending-summary-icon-button:disabled{opacity:.55;cursor:wait}
        .bgps-pending-summary-body{padding:18px 22px calc(24px + env(safe-area-inset-bottom));overflow:auto;overscroll-behavior:contain}
        .bgps-pending-summary-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:16px}
        .bgps-pending-summary-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}
        .bgps-pending-summary-download{min-height:44px;padding:0 16px;border:1px solid #123f70;border-radius:11px;background:#123f70;color:#fff;font:inherit;font-weight:800;cursor:pointer}
        .bgps-pending-summary-download:hover{background:#0b3159}
        .bgps-pending-summary-kpi{width:100%;padding:15px 16px;border:1px solid #d6e1eb;border-radius:16px;background:#fff;box-shadow:0 5px 16px rgba(22,58,91,.06);text-align:left;font:inherit;cursor:pointer}
        .bgps-pending-summary-kpi:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(22,58,91,.1)}
        .bgps-pending-summary-kpi[aria-pressed="true"]{outline:3px solid rgba(18,63,112,.18);border-color:#123f70}
        .bgps-pending-summary-kpi.paper{border-top:4px solid #f2a900}
        .bgps-pending-summary-kpi.marks{border-top:4px solid #2c7b63}
        .bgps-pending-summary-kpi small{display:block;color:#6a7d91;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
        .bgps-pending-summary-kpi strong{display:block;margin-top:5px;color:#103c69;font-size:25px;line-height:1.1}
        .bgps-pending-summary-kpi span{display:block;margin-top:5px;color:#536b84;font-size:13px;line-height:1.4}
        .bgps-pending-summary-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:18px 2px 10px;color:#123f70}
        .bgps-pending-summary-section-title h3{margin:0;font-size:17px}
        .bgps-pending-summary-section-title span{color:#6a7d91;font-size:12px;font-weight:700}
        .bgps-pending-summary-list{display:grid;gap:11px}
        .bgps-pending-class-card{padding:15px;border:1px solid #d6e1eb;border-radius:16px;background:#fff;box-shadow:0 4px 14px rgba(22,58,91,.05);cursor:pointer}
        .bgps-pending-class-card:hover{border-color:#a9bfd3}
        .bgps-pending-class-card:focus-visible{outline:3px solid rgba(18,63,112,.22);outline-offset:2px}
        .bgps-pending-class-card.is-expanded{border-color:#123f70;box-shadow:0 7px 20px rgba(22,58,91,.1)}
        .bgps-pending-class-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
        .bgps-pending-class-head strong{display:block;color:#0d3966;font-size:17px}
        .bgps-pending-class-head small{display:block;margin-top:3px;color:#718397}
        .bgps-pending-badges{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}
        .bgps-pending-badge{padding:5px 8px;border-radius:999px;background:#fff1d1;color:#77520a;font-size:11px;font-weight:800;white-space:nowrap}
        .bgps-pending-badge.correction{background:#fde7e7;color:#9e2929}
        .bgps-pending-badge.marks{background:#e3f3ed;color:#216650}
        .bgps-pending-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .bgps-pending-detail{padding:11px 12px;border-radius:12px;background:#f5f8fb;color:#536b84;font-size:13px;line-height:1.45;min-width:0}
        .bgps-pending-detail b{display:block;margin-bottom:3px;color:#173f69;font-size:12px;text-transform:uppercase;letter-spacing:.03em}
        .bgps-pending-detail.is-off{color:#7d8792;background:#f1f2f4}
        .bgps-pending-class-details{display:grid;gap:9px;margin-top:12px}
        .bgps-pending-class-hint{margin-top:7px;color:#718397;font-size:12px;font-weight:700}
        .bgps-pending-class-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        .bgps-pending-class-actions button{min-height:44px;padding:0 14px;border:1px solid #bfd0e1;border-radius:11px;background:#fff;color:#123f70;font-weight:800;cursor:pointer}
        .bgps-pending-class-actions button.primary{border-color:#123f70;background:#123f70;color:#fff}
        .bgps-pending-summary-empty{padding:32px 20px;border:1px dashed #b9cbdc;border-radius:16px;background:#fff;text-align:center;color:#577088}
        .bgps-pending-summary-empty strong{display:block;margin-bottom:5px;color:#216650;font-size:18px}
        body.bgps-pending-summary-open{overflow:hidden}
        @media(max-width:640px){
          .bgps-pending-summary-launcher{right:12px;bottom:calc(82px + env(safe-area-inset-bottom));min-height:46px;padding:0 14px;font-size:13px}
          .bgps-pending-summary-drawer{width:100%;border-radius:0}
          .bgps-pending-summary-head{padding:15px 14px 12px;align-items:center}
          .bgps-pending-summary-title{font-size:20px}
          .bgps-pending-summary-head-actions{gap:6px}
          .bgps-pending-summary-icon-button{min-width:44px;padding:0 9px}
          .bgps-pending-summary-body{padding:14px 12px calc(20px + env(safe-area-inset-bottom))}
          .bgps-pending-summary-toolbar{display:grid}
          .bgps-pending-summary-download{width:100%}
          .bgps-pending-summary-kpis,.bgps-pending-detail-grid{grid-template-columns:1fr}
          .bgps-pending-class-head{display:block}
          .bgps-pending-badges{justify-content:flex-start;margin-top:9px}
          .bgps-pending-class-actions{display:grid;grid-template-columns:1fr 1fr}
          .bgps-pending-class-actions button{width:100%}
          .bgps-pending-class-actions button:only-child{grid-column:1/-1}
        }
      `;
      document.head.appendChild(style);
    }

    if (!byId(PENDING_SUMMARY_IDS.button)) {
      const button = document.createElement('button');
      button.id = PENDING_SUMMARY_IDS.button;
      button.className = 'bgps-pending-summary-launcher';
      button.type = 'button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', PENDING_SUMMARY_IDS.drawer);
      button.innerHTML = '<span class="summary-launcher-dot" aria-hidden="true"></span><span>Missing Papers</span>';
      button.addEventListener('click', openPendingSummary);
      document.body.appendChild(button);
    }

    if (!byId(PENDING_SUMMARY_IDS.overlay)) {
      const overlay = document.createElement('div');
      overlay.id = PENDING_SUMMARY_IDS.overlay;
      overlay.className = 'bgps-pending-summary-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = `
        <section id="${PENDING_SUMMARY_IDS.drawer}" class="bgps-pending-summary-drawer" role="dialog" aria-modal="true" aria-labelledby="bgpsPendingSummaryTitle" tabindex="-1">
          <header class="bgps-pending-summary-head">
            <div><h2 id="bgpsPendingSummaryTitle" class="bgps-pending-summary-title">Class-wise Missing Papers</h2><span id="${PENDING_SUMMARY_IDS.context}" class="bgps-pending-summary-context"></span></div>
            <div class="bgps-pending-summary-head-actions">
              <button id="${PENDING_SUMMARY_IDS.refresh}" class="bgps-pending-summary-icon-button" type="button" title="Refresh summary">Refresh</button>
              <button class="bgps-pending-summary-icon-button" type="button" data-close-pending-summary aria-label="Close pending summary">Close</button>
            </div>
          </header>
          <div id="${PENDING_SUMMARY_IDS.content}" class="bgps-pending-summary-body"></div>
        </section>`;
      overlay.addEventListener('click', handlePendingSummaryClick);
      overlay.addEventListener('keydown', handlePendingSummaryKeydown);
      document.body.appendChild(overlay);
    }
  }

  function closePendingSummary() {
    const overlay = byId(PENDING_SUMMARY_IDS.overlay);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('bgps-pending-summary-open');
    byId(PENDING_SUMMARY_IDS.button)?.focus({ preventScroll: true });
  }

  function uniquePaperSubjects(rows) {
    return [...new Set((rows || []).map((paper) => String(paper.subject || paper.title || 'Paper').trim()).filter(Boolean))];
  }

  function classReviewSummary(className) {
    const exam = normalize(selectedExam());
    const classPapers = papers.filter((paper) => normalize(paper.className) === normalize(className)
      && normalize(paper.exam) === exam && matchesSelectedAcademicYear(paper));
    const firstReview = classPapers.filter((paper) => normalize(paper.status) === 'SUBMITTED' && !isCorrectedSubmission(paper));
    const rereview = classPapers.filter(isCorrectedSubmission);
    return {
      firstReview: uniquePaperSubjects(firstReview),
      rereview: uniquePaperSubjects(rereview)
    };
  }

  function renderPendingSummary() {
    const content = byId(PENDING_SUMMARY_IDS.content);
    if (!content) return;
    const pendingRows = classProgress.filter((item) => item.pendingPaperSubjects.length > 0);
    const completedRows = classProgress.filter((item) => item.pendingPaperSubjects.length === 0);
    const visibleRows = pendingSummaryMode === 'complete' ? completedRows : pendingRows;
    const missingPapers = pendingRows.reduce((sum, item) => sum + item.pendingPaperSubjects.length, 0);
    setText(PENDING_SUMMARY_IDS.context, `${selectedExam()} · ${academicYearLabel(selectedAcademicYear())}`);

    const cards = visibleRows.map((item) => {
      const expanded = normalize(pendingSummaryExpandedClass) === normalize(item.className);
      const review = classReviewSummary(item.className);
      const firstReviewText = review.firstReview.length ? review.firstReview.join(', ') : 'None';
      const rereviewText = review.rereview.length ? review.rereview.join(', ') : 'None';
      const missingText = item.pendingPaperSubjects.length ? item.pendingPaperSubjects.join(', ') : 'All expected subject papers submitted';
      const badge = item.pendingPaperSubjects.length
        ? `${item.pendingPaperSubjects.length} paper${item.pendingPaperSubjects.length === 1 ? '' : 's'} missing`
        : 'Complete';
      return `
        <article class="bgps-pending-class-card ${expanded ? 'is-expanded' : ''}" role="button" tabindex="0" aria-expanded="${expanded}" data-summary-toggle-class="${escapeHtml(item.className)}">
          <div class="bgps-pending-class-head">
            <div><strong>${escapeHtml(item.className)}</strong><small>${escapeHtml(item.teacherId)}</small></div>
            <div class="bgps-pending-badges"><span class="bgps-pending-badge ${item.pendingPaperSubjects.length ? '' : 'marks'}">${escapeHtml(badge)}</span></div>
          </div>
          ${expanded ? `<div class="bgps-pending-class-details">
            <div class="bgps-pending-detail"><b>Not submitted yet</b>${escapeHtml(missingText)}</div>
            <div class="bgps-pending-detail"><b>Awaiting first review</b>${escapeHtml(firstReviewText)}</div>
            <div class="bgps-pending-detail"><b>Corrected papers for re-review</b>${escapeHtml(rereviewText)}</div>
            <div class="bgps-pending-class-actions"><button class="primary" type="button" data-summary-open-papers="${escapeHtml(item.className)}">Open Class Papers</button></div>
          </div>` : '<div class="bgps-pending-class-hint">Click to view missing and review-pending papers</div>'}
        </article>`;
    }).join('');

    const modeTitle = pendingSummaryMode === 'complete' ? 'Completed classes' : 'Missing papers by class';
    const emptyCopy = pendingSummaryMode === 'complete'
      ? '<div class="bgps-pending-summary-empty"><strong>No completed classes yet</strong>Every class currently has at least one expected subject paper missing.</div>'
      : '<div class="bgps-pending-summary-empty"><strong>All papers submitted</strong>Every expected subject paper is available for the selected exam and academic year.</div>';
    content.innerHTML = `
      <div class="bgps-pending-summary-toolbar"><button class="bgps-pending-summary-download" type="button" data-download-summary-pdf>Download PDF Report</button></div>
      <div class="bgps-pending-summary-kpis">
        <button class="bgps-pending-summary-kpi paper" type="button" data-summary-mode="missing" aria-pressed="${pendingSummaryMode === 'missing'}"><small>Classes with missing papers</small><strong>${pendingRows.length}</strong><span>${missingPapers} subject paper${missingPapers === 1 ? '' : 's'} not submitted yet.</span></button>
        <button class="bgps-pending-summary-kpi marks" type="button" data-summary-mode="complete" aria-pressed="${pendingSummaryMode === 'complete'}"><small>Classes complete</small><strong>${completedRows.length}</strong><span>All expected subject papers have been submitted.</span></button>
      </div>
      <div class="bgps-pending-summary-section-title"><h3>${modeTitle}</h3><span>${visibleRows.length} class${visibleRows.length === 1 ? '' : 'es'}</span></div>
      <div class="bgps-pending-summary-list">${cards || emptyCopy}</div>`;
  }

  function asciiPdfText(value) {
    return String(value == null ? '' : value)
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '-')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function wrapReportLine(value, maxLength) {
    const words = String(value || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxLength && line) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function buildSummaryPdfBlob(items) {
    const pages = [[]];
    let y = 800;
    (items || []).forEach((item) => {
      const leading = Number(item.leading || 14);
      if (y - leading < 48) {
        pages.push([]);
        y = 800;
      }
      pages[pages.length - 1].push({ ...item, y });
      y -= leading;
    });

    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const pageRefs = pages.map((_, index) => `${5 + (index * 2)} 0 R`).join(' ');
    objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    pages.forEach((page, index) => {
      const pageId = 5 + (index * 2);
      const contentId = pageId + 1;
      const stream = page.map((item) => {
        const font = item.bold ? 'FB' : 'FR';
        const size = Number(item.size || 10);
        const x = Number(item.x || 48);
        return `BT /${font} ${size} Tf ${x} ${item.y} Td (${asciiPdfText(item.text)}) Tj ET`;
      }).join('\n');
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /FR 3 0 R /FB 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let id = 1; id < objects.length; id += 1) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }

  function downloadPendingSummaryPdf() {
    const pendingRows = classProgress.filter((item) => item.pendingPaperSubjects.length > 0);
    const completedRows = classProgress.filter((item) => item.pendingPaperSubjects.length === 0);
    const items = [
      { text: 'BG PUBLIC SCHOOL', size: 17, bold: true, leading: 24 },
      { text: 'Paper Submission Status Report', size: 13, bold: true, leading: 20 },
      { text: `${selectedExam()} | ${academicYearLabel(selectedAcademicYear())}`, size: 10, leading: 16 },
      { text: `Generated: ${new Date().toLocaleString('en-IN')}`, size: 9, leading: 22 },
      { text: `Missing classes: ${pendingRows.length} | Completed classes: ${completedRows.length}`, size: 10, bold: true, leading: 22 }
    ];
    classProgress.forEach((item) => {
      const review = classReviewSummary(item.className);
      items.push({ text: `${item.className} (${item.teacherId})`, size: 11, bold: true, leading: 17 });
      [
        `Missing: ${item.pendingPaperSubjects.length ? item.pendingPaperSubjects.join(', ') : 'None - class complete'}`,
        `Awaiting first review: ${review.firstReview.length ? review.firstReview.join(', ') : 'None'}`,
        `Corrected for re-review: ${review.rereview.length ? review.rereview.join(', ') : 'None'}`
      ].forEach((line) => wrapReportLine(line, 88).forEach((wrapped) => items.push({ text: wrapped, size: 9, x: 58, leading: 13 })));
      items.push({ text: '', size: 7, leading: 8 });
    });
    const blob = buildSummaryPdfBlob(items);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BGPS-Paper-Status-${selectedExam().replace(/[^a-z0-9]+/gi, '-') || 'Report'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    window.BGPS_APP.toast('Paper status PDF downloaded.');
  }

  async function openPendingSummary() {
    if (!session?.isAdmin) return;
    ensurePendingSummaryUi();
    const overlay = byId(PENDING_SUMMARY_IDS.overlay);
    overlay?.classList.add('is-open');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('bgps-pending-summary-open');
    renderPendingSummary();
    byId(PENDING_SUMMARY_IDS.drawer)?.focus?.({ preventScroll: true });
    if (!classProgress.length && !pendingSummaryRefreshing) await refreshPendingSummary();
  }

  async function refreshPendingSummary() {
    if (pendingSummaryRefreshing || !session?.isAdmin) return;
    pendingSummaryRefreshing = true;
    const button = byId(PENDING_SUMMARY_IDS.refresh);
    if (button) { button.disabled = true; button.textContent = 'Loading...'; }
    try {
      await refresh(false);
      renderPendingSummary();
    } finally {
      pendingSummaryRefreshing = false;
      if (button) { button.disabled = false; button.textContent = 'Refresh'; }
    }
  }

  function openSummaryPapers(className) {
    closePendingSummary();
    window.BGPS_APP.openView('papers');
    const classFilter = byId('paperClassFilter');
    if (classFilter) classFilter.value = className;
    window.BGPS_PAPERS.setStatusFilter('');
    window.BGPS_PAPERS.render();
  }

  function handlePendingSummaryClick(event) {
    if (event.target === byId(PENDING_SUMMARY_IDS.overlay) || event.target.closest('[data-close-pending-summary]')) {
      closePendingSummary();
      return;
    }
    if (event.target.closest(`#${PENDING_SUMMARY_IDS.refresh}`)) {
      refreshPendingSummary();
      return;
    }
    if (event.target.closest('[data-download-summary-pdf]')) {
      downloadPendingSummaryPdf();
      return;
    }
    const modeButton = event.target.closest('[data-summary-mode]');
    if (modeButton) {
      pendingSummaryMode = modeButton.dataset.summaryMode === 'complete' ? 'complete' : 'missing';
      pendingSummaryExpandedClass = '';
      renderPendingSummary();
      return;
    }
    const paperButton = event.target.closest('[data-summary-open-papers]');
    if (paperButton) {
      openSummaryPapers(paperButton.dataset.summaryOpenPapers);
      return;
    }
    const classCard = event.target.closest('[data-summary-toggle-class]');
    if (classCard) {
      const className = classCard.dataset.summaryToggleClass || '';
      pendingSummaryExpandedClass = normalize(pendingSummaryExpandedClass) === normalize(className) ? '' : className;
      renderPendingSummary();
      if (pendingSummaryExpandedClass) {
        window.requestAnimationFrame(() => {
          const cards = [...(byId(PENDING_SUMMARY_IDS.content)?.querySelectorAll('[data-summary-toggle-class]') || [])];
          cards.find((card) => normalize(card.dataset.summaryToggleClass) === normalize(className))?.focus({ preventScroll: true });
        });
      }
    }
  }

  function handlePendingSummaryKeydown(event) {
    const classCard = event.target.closest('[data-summary-toggle-class]');
    if (!classCard || event.target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      classCard.click();
    }
  }

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

  function isCorrectedSubmission(paper) {
    return normalize(paper?.status) === 'SUBMITTED'
      && (paper?.resubmitted === true || Boolean(String(paper?.adminNote || '').trim()));
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
    // Corrected & Resubmitted is a global Principal action queue. Keep this
    // count identical to the Paper Approval board instead of limiting it to
    // the currently selected term/year.
    const resubmitted = papers.filter(isCorrectedSubmission).length;

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
      .filter(isCorrectedSubmission)
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
      .filter((paper) => normalize(paper.status) === 'SUBMITTED' && !isCorrectedSubmission(paper))
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
    if (byId(PENDING_SUMMARY_IDS.overlay)?.classList.contains('is-open')) renderPendingSummary();
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
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && byId(PENDING_SUMMARY_IDS.overlay)?.classList.contains('is-open')) closePendingSummary();
    });
  }

  async function onAuthenticated(user) {
    session = user;
    configureExamFilter();
    configureAcademicYearFilter();
    bind();
    ensurePendingSummaryUi();
    const summaryButton = byId(PENDING_SUMMARY_IDS.button);
    if (summaryButton) summaryButton.style.display = user.isAdmin ? 'flex' : 'none';
    if (user.isAdmin) await refresh(false);
    else closePendingSummary();
  }

  function reset() {
    session = null;
    marksRows = [];
    papers = [];
    classProgress = [];
    teacherProgress = [];
    pendingSummaryMode = 'missing';
    pendingSummaryExpandedClass = '';
    closePendingSummary();
    const summaryButton = byId(PENDING_SUMMARY_IDS.button);
    if (summaryButton) summaryButton.style.display = 'none';
    setText('dashPapersResubmitted', '—');
    setText('dashMarksPending', '—');
  }

  window.BGPS_DASHBOARD = Object.freeze({ onAuthenticated, refresh, reset, openClassReport, openPendingSummary });
})();
