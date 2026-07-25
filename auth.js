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
    if (user.isAdmin || user.paperOnly) return;
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
