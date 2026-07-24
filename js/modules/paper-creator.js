(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const normalize = (value) => String(value || '').trim();
  const statusKey = (value) => normalize(value).toLowerCase();

  const SYMBOLS = Object.freeze({
    maths: Object.freeze([
      'sin', 'cos', 'tan', 'cosec', 'sec', 'cot', 'log', 'ln', 'lim',
      '∫', '∬', '∮', '∑', '∏', '√', '∛', '∂', '∇',
      'π', 'θ', 'α', 'β', 'γ', 'δ', 'λ', 'μ', 'σ', 'φ', 'ω',
      '≤', '≥', '≠', '≈', '≡', '∝', '∴', '∵', '±', '×', '÷', '∞',
      '∈', '∉', '⊂', '⊆', '⊃', '⊇', '∪', '∩', '∅',
      'ℕ', 'ℤ', 'ℚ', 'ℝ', '⇒', '⇔', '↦', '⊥', '∥', '∠', '°',
      'x²', 'x³', 'xⁿ', 'x₁', 'x₂', 'aₙ', '½', '⅓', '¼',
      '|x|', 'dy/dx', 'd²y/dx²'
    ]),
    physics: Object.freeze(['λ', 'μ', 'Ω', 'ρ', 'ε', 'Δ', '∇', 'φ', 'ω', 'τ', 'η', 'm/s', 'm/s²', 'kg', 'N', 'J', 'W', 'V', 'A', 'Hz', 'Pa', '°C', '→v', '→F', 'q', 'E', 'B']),
    common: Object.freeze(['•', '→', '←', '↔', '↑', '↓', '✓', '✗', '§', '—', '–', '“ ”', '‘ ’', '…', '₹', '%', '°', ':', ';'])
  });

  let initialized = false;
  let session = null;
  let settings = null;

  function looksLikePortalApplicationSource(value) {
    const holder = document.createElement('div');
    holder.innerHTML = String(value || '');
    const text = String(holder.textContent || '').toLowerCase();
    const signatures = [
      'let settings = null',
      'function escapehtml(value)',
      "byid('settingsstatus')",
      'function applysettings(value)',
      'window.bgps_',
      'papercontenteditor',
      'function setstatus(message'
    ];
    let matches = 0;
    signatures.forEach((signature) => {
      if (text.includes(signature)) matches += 1;
    });
    return matches >= 3
      || (text.includes('let settings = null') && text.includes('function escapehtml(value)'));
  }

  const WORKSHEET_VECTORS = Object.freeze([
    { category: 'Animals', label: 'Cat', glyph: '🐱' },
    { category: 'Animals', label: 'Dog', glyph: '🐶' },
    { category: 'Animals', label: 'Fish', glyph: '🐟' },
    { category: 'Animals', label: 'Butterfly', glyph: '🦋' },
    { category: 'Animals', label: 'Elephant', glyph: '🐘' },
    { category: 'Animals', label: 'Ant', glyph: '🐜' },
    { category: 'Animals', label: 'Bird', glyph: '🐦' },
    { category: 'Animals', label: 'Hen', glyph: '🐔' },
    { category: 'Animals', label: 'Lion', glyph: '🦁' },
    { category: 'Animals', label: 'Cow', glyph: '🐄' },
    { category: 'Animals', label: 'Rabbit', glyph: '🐰' },
    { category: 'Animals', label: 'Bee', glyph: '🐝' },
    { category: 'Fruits & Food', label: 'Apple', glyph: '🍎' },
    { category: 'Fruits & Food', label: 'Grapes', glyph: '🍇' },
    { category: 'Fruits & Food', label: 'Mango', glyph: '🥭' },
    { category: 'Fruits & Food', label: 'Banana', glyph: '🍌' },
    { category: 'Fruits & Food', label: 'Orange', glyph: '🍊' },
    { category: 'Fruits & Food', label: 'Strawberry', glyph: '🍓' },
    { category: 'Fruits & Food', label: 'Egg', glyph: '🥚' },
    { category: 'Fruits & Food', label: 'Ice Cream', glyph: '🍦' },
    { category: 'Fruits & Food', label: 'Cake', glyph: '🍰' },
    { category: 'Objects', label: 'Ball', glyph: '⚽' },
    { category: 'Objects', label: 'Bat', glyph: '🏏' },
    { category: 'Objects', label: 'Hat', glyph: '👒' },
    { category: 'Objects', label: 'Book', glyph: '📘' },
    { category: 'Objects', label: 'Pencil', glyph: '✏️' },
    { category: 'Objects', label: 'Cup', glyph: '☕' },
    { category: 'Objects', label: 'Clock', glyph: '🕒' },
    { category: 'Objects', label: 'Key', glyph: '🔑' },
    { category: 'Objects', label: 'Umbrella', glyph: '☂️' },
    { category: 'Objects', label: 'School Bag', glyph: '🎒' },
    { category: 'Objects', label: 'Bell', glyph: '🔔' },
    { category: 'Transport', label: 'Car', glyph: '🚗' },
    { category: 'Transport', label: 'Bus', glyph: '🚌' },
    { category: 'Transport', label: 'Train', glyph: '🚂' },
    { category: 'Transport', label: 'Boat', glyph: '⛵' },
    { category: 'Transport', label: 'Bicycle', glyph: '🚲' },
    { category: 'Transport', label: 'Aeroplane', glyph: '✈️' },
    { category: 'Nature', label: 'Sun', glyph: '☀️' },
    { category: 'Nature', label: 'Moon', glyph: '🌙' },
    { category: 'Nature', label: 'Star', glyph: '⭐' },
    { category: 'Nature', label: 'Flower', glyph: '🌷' },
    { category: 'Nature', label: 'Tree', glyph: '🌳' },
    { category: 'Nature', label: 'Rain', glyph: '🌧️' },
    { category: 'Nature', label: 'Cloud', glyph: '☁️' },
    { category: 'Festivals', label: 'Diwali Diya', glyph: '🪔' },
    { category: 'Festivals', label: 'Holi Colours', glyph: '🎨' },
    { category: 'Festivals', label: 'Christmas Tree', glyph: '🎄' },
    { category: 'Festivals', label: 'Eid Moon', glyph: '🌙' },
    { category: 'Festivals', label: 'Indian Flag', glyph: '🇮🇳' },
    { category: 'Festivals', label: 'Festival Kite', glyph: '🪁' },
    { category: 'Festivals', label: 'Gift', glyph: '🎁' },
    { category: 'Festivals', label: 'Candle', glyph: '🕯️' },
    { category: 'Festivals', label: 'Fireworks', glyph: '🎆' },
    { category: 'Festivals', label: 'Celebration', glyph: '🎉' },
    { category: 'Shapes', label: 'Red Circle', glyph: '🔴' },
    { category: 'Shapes', label: 'Blue Square', glyph: '🟦' },
    { category: 'Shapes', label: 'Yellow Circle', glyph: '🟡' },
    { category: 'Shapes', label: 'Green Square', glyph: '🟩' },
    { category: 'Shapes', label: 'Heart', glyph: '❤️' },
    { category: 'Shapes', label: 'Diamond', glyph: '🔶' }
  ]);
  let drafts = [];
  let papers = [];
  let currentDraftId = '';
  let currentRevision = {};
  let selectedImage = null;
  let cropState = null;
  let editorRange = null;
  let dirty = false;
  let editRevision = 0;
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
  let recoveryWriteTimer = 0;
  let serverAutosaveTimer = 0;
  let mobilePaperBar = null;
  let imageGeometryObserver = null;
  let recoveryDbPromise = null;
  const promptedRecoveryKeys = new Set();
  const RECOVERY_DB_NAME = 'BGPSPaperRecovery';
  const RECOVERY_STORE_NAME = 'paperSnapshots';
  const RECOVERY_DB_VERSION = 1;

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
    const normalizedClass = String(className || '').trim();
    const subjects = [...window.BGPS_DATA.subjectsForClass(normalizedClass)];
    // Paper Creation and Upload use this shared list. Offer GK and Moral Science
    // separately for every class without changing the Marks portal's expected-
    // subject calculations or removing the legacy combined GK/Moral Science value.
    ['GK', 'Moral Science'].forEach((paperSubject) => {
      if (subjects.some((subject) => String(subject || '').trim().toUpperCase() === paperSubject.toUpperCase())) return;
      const computerIndex = subjects.findIndex((subject) => String(subject || '').trim().toUpperCase() === 'COMPUTER');
      subjects.splice(computerIndex >= 0 ? computerIndex : subjects.length, 0, paperSubject);
    });
    // Paper Creation and Upload may offer Entrepreneurship without changing
    // the marks portal's expected-subject calculations.
    if (/^Class\s+(11|12)$/i.test(normalizedClass)
        && !subjects.some((subject) => String(subject || '').trim().toUpperCase() === 'ENTREPRENEURSHIP')) {
      const businessIndex = subjects.findIndex((subject) => String(subject || '').trim().toUpperCase() === 'BUSINESS');
      subjects.splice(businessIndex >= 0 ? businessIndex + 1 : subjects.length, 0, 'Entrepreneurship');
    }
    return subjects;
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

  function renderWorksheetVectorItems() {
    const grid = byId('bgpsVectorGrid');
    if (!grid) return;
    const category = normalize(byId('bgpsVectorCategory')?.value);
    const query = normalize(byId('bgpsVectorSearch')?.value).toLowerCase();
    const rows = WORKSHEET_VECTORS.map((item, index) => ({ ...item, index })).filter((item) => {
      if (category && item.category !== category) return false;
      if (query && !`${item.label} ${item.category}`.toLowerCase().includes(query)) return false;
      return true;
    });
    grid.innerHTML = rows.length
      ? rows.map((item) => `<button type="button" class="bgps-vector-item" data-vector-index="${item.index}" title="Insert ${escapeHtml(item.label)}"><span aria-hidden="true">${item.glyph}</span><small>${escapeHtml(item.label)}</small></button>`).join('')
      : '<div class="bgps-vector-empty">No matching illustration. Try another search or category.</div>';
  }

  function openWorksheetVectorLibrary() {
    saveRange();
    const modal = byId('bgpsVectorLibraryModal');
    if (!modal) return;
    modal.hidden = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    renderWorksheetVectorItems();
    window.setTimeout(() => byId('bgpsVectorSearch')?.focus(), 50);
  }

  function closeWorksheetVectorLibrary() {
    const modal = byId('bgpsVectorLibraryModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-backdrop.open')) document.body.classList.remove('modal-open');
  }

  async function worksheetVectorPng(item) {
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('This browser could not prepare the illustration.');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '255px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    context.fillText(item.glyph, canvas.width / 2, canvas.height / 2 + 7);
    return canvas.toDataURL('image/png');
  }

  async function insertWorksheetVector(index) {
    const item = WORKSHEET_VECTORS[Number(index)];
    if (!item) return;
    const grid = byId('bgpsVectorGrid');
    if (grid) grid.setAttribute('aria-busy', 'true');
    try {
      const source = await worksheetVectorPng(item);
      closeWorksheetVectorLibrary();
      insertImageSource(source, `${item.label} worksheet illustration`, 32);
      toast(`${item.label} illustration inserted.`);
    } catch (error) {
      toast(error.message || 'The illustration could not be inserted.', 'error');
    } finally {
      if (grid) grid.removeAttribute('aria-busy');
    }
  }

  function ensureWorksheetVectorLibrary() {
    const imageButton = byId('insertPaperImageButton');
    if (imageButton && !byId('openWorksheetVectors')) {
      const button = document.createElement('button');
      button.id = 'openWorksheetVectors';
      button.type = 'button';
      button.className = 'editor-command';
      button.textContent = 'Illustrations';
      button.title = 'Insert a clean worksheet illustration';
      imageButton.insertAdjacentElement('afterend', button);
      button.addEventListener('click', openWorksheetVectorLibrary);
    }

    if (!byId('bgpsVectorLibraryStyles')) {
      const style = document.createElement('style');
      style.id = 'bgpsVectorLibraryStyles';
      style.textContent = `
        .bgps-vector-modal{position:fixed;inset:0;z-index:16000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(5,27,48,.62)}
        .bgps-vector-modal.open{display:flex}
        .bgps-vector-panel{width:min(860px,100%);max-height:min(84dvh,760px);display:flex;flex-direction:column;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3);overflow:hidden}
        .bgps-vector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #d5e0ea}
        .bgps-vector-head h2{margin:0;color:#103c69;font-size:22px}.bgps-vector-head p{margin:4px 0 0;color:#667b90;font-size:13px}
        .bgps-vector-close{width:44px;height:44px;border:1px solid #c3d2e0;border-radius:11px;background:#fff;color:#123f70;font-size:25px;cursor:pointer}
        .bgps-vector-filters{display:grid;grid-template-columns:1fr 220px;gap:10px;padding:12px 18px;background:#f7fafc;border-bottom:1px solid #dce5ed}
        .bgps-vector-filters input,.bgps-vector-filters select{width:100%;min-height:44px;padding:9px 11px;border:1px solid #b9cad9;border-radius:10px;background:#fff;color:#173f69;font:inherit;font-size:16px}
        .bgps-vector-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;padding:16px 18px 20px;overflow:auto;overscroll-behavior:contain}
        .bgps-vector-item{min-height:116px;padding:9px 6px;border:1px solid #d0dce7;border-radius:14px;background:#fff;color:#173f69;cursor:pointer;touch-action:manipulation}
        .bgps-vector-item:hover,.bgps-vector-item:focus-visible{border-color:#1686c4;box-shadow:0 5px 15px rgba(18,63,112,.12);outline:none}
        .bgps-vector-item span{display:block;font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif;font-size:48px;line-height:1.15}
        .bgps-vector-item small{display:block;margin-top:7px;font-size:11px;font-weight:800;line-height:1.2}
        .bgps-vector-grid[aria-busy="true"]{opacity:.6;pointer-events:none}
        .bgps-vector-empty{grid-column:1/-1;padding:34px;text-align:center;color:#667b90}
        @media(max-width:700px){.bgps-vector-modal{align-items:flex-end;padding:0}.bgps-vector-panel{width:100%;max-height:92dvh;border-radius:18px 18px 0 0}.bgps-vector-filters{grid-template-columns:1fr;padding:10px 12px}.bgps-vector-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px}.bgps-vector-item{min-height:104px}.bgps-vector-item span{font-size:43px}}
      `;
      document.head.appendChild(style);
    }

    if (!byId('bgpsVectorLibraryModal')) {
      const modal = document.createElement('div');
      modal.id = 'bgpsVectorLibraryModal';
      modal.className = 'bgps-vector-modal';
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <section class="bgps-vector-panel" role="dialog" aria-modal="true" aria-labelledby="bgpsVectorLibraryTitle">
          <header class="bgps-vector-head"><div><h2 id="bgpsVectorLibraryTitle">Worksheet Illustrations</h2><p>Clean print-ready pictures for question papers. Select one to insert.</p></div><button class="bgps-vector-close" id="closeWorksheetVectors" type="button" aria-label="Close">×</button></header>
          <div class="bgps-vector-filters"><input id="bgpsVectorSearch" type="search" placeholder="Search cat, fruit, Diwali, train…" autocomplete="off"><select id="bgpsVectorCategory" aria-label="Illustration category"></select></div>
          <div class="bgps-vector-grid" id="bgpsVectorGrid"></div>
        </section>`;
      document.body.appendChild(modal);
      const categories = [...new Set(WORKSHEET_VECTORS.map((item) => item.category))];
      byId('bgpsVectorCategory').innerHTML = '<option value="">All categories</option>' + categories.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
      byId('bgpsVectorSearch')?.addEventListener('input', renderWorksheetVectorItems);
      byId('bgpsVectorCategory')?.addEventListener('change', renderWorksheetVectorItems);
      byId('closeWorksheetVectors')?.addEventListener('click', closeWorksheetVectorLibrary);
      byId('bgpsVectorGrid')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-vector-index]');
        if (button) insertWorksheetVector(button.dataset.vectorIndex);
      });
      modal.addEventListener('click', (event) => { if (event.target === modal) closeWorksheetVectorLibrary(); });
      renderWorksheetVectorItems();
    }
  }

  function ensureSubpartControls() {
    const toolbar = byId('paperEditorToolbar');
    if (!toolbar) return;

    const alphaButton = toolbar.querySelector(
      '[data-editor-command="insertOrderedList"],[data-editor-command="subpartsAlpha"]'
    );
    if (!alphaButton) return;

    alphaButton.dataset.editorCommand = 'subpartsAlpha';
    alphaButton.textContent = '(a) Subparts';
    alphaButton.title = 'Insert alphabetic subparts: (a), (b), (c)';

    let romanButton = byId('insertRomanSubparts');
    if (!romanButton) {
      romanButton = document.createElement('button');
      romanButton.id = 'insertRomanSubparts';
      romanButton.type = 'button';
      romanButton.className = 'editor-command';
      romanButton.dataset.editorCommand = 'subpartsRoman';
      romanButton.title = 'Insert Roman subparts: (i), (ii), (iii)';
      romanButton.textContent = '(i) Subparts';
      alphaButton.insertAdjacentElement('afterend', romanButton);
    }

    if (!byId('bgpsSubpartStyles')) {
      const style = document.createElement('style');
      style.id = 'bgpsSubpartStyles';
      style.textContent = `
        #paperContentEditor ol.bgps-subparts-alpha,
        #paperContentEditor ol.bgps-subparts-roman{list-style:none;counter-reset:bgps-subpart;margin:4px 0 6px 28px;padding:0}
        #paperContentEditor ol.bgps-subparts-alpha>li,
        #paperContentEditor ol.bgps-subparts-roman>li{counter-increment:bgps-subpart;position:relative;padding-left:28px;margin:3px 0}
        #paperContentEditor ol.bgps-subparts-alpha>li::before,
        #paperContentEditor ol.bgps-subparts-roman>li::before{position:absolute;left:0;font-weight:700}
        #paperContentEditor ol.bgps-subparts-alpha>li::before{content:"(" counter(bgps-subpart, lower-alpha) ")"}
        #paperContentEditor ol.bgps-subparts-roman>li::before{content:"(" counter(bgps-subpart, lower-roman) ")"}
      `;
      document.head.appendChild(style);
    }
  }

  function selectedEditableList() {
    const editor = byId('paperContentEditor');
    const selection = window.getSelection();
    let node = selection?.anchorNode || null;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const list = node?.closest?.('ol');
    return list && editor?.contains(list) ? list : null;
  }

  function applySubpartList(style) {
    restoreRange();
    const editor = byId('paperContentEditor');
    if (!editor) return;

    document.execCommand('insertOrderedList', false, null);
    let list = selectedEditableList();
    if (!list) {
      const className = style === 'roman' ? 'bgps-subparts-roman' : 'bgps-subparts-alpha';
      insertHtml(`<ol class="${className}"><li><span class="q-placeholder">Type subpart here</span></li></ol><p><br></p>`);
      return;
    }

    list.classList.remove('bgps-subparts-alpha', 'bgps-subparts-roman');
    list.classList.add(style === 'roman' ? 'bgps-subparts-roman' : 'bgps-subparts-alpha');
    list.removeAttribute('type');
    list.style.removeProperty('list-style-type');
    saveRange();
    markDirty();
    updateChecks();
  }

  function currentQuestionCount() {
    const editor = byId('paperContentEditor');
    if (!editor) return 0;
    const structured = editor.querySelectorAll('.question-line').length;
    if (structured > 0) return structured;

    // Imported DOCX content does not always carry the portal's question-line
    // classes. Count explicit Q/Question prefixes for the on-screen summary,
    // without misclassifying numbered subparts as full questions.
    const text = String(editor.innerText || '').replace(/\u00a0/g, ' ');
    const imported = text.match(/^\s*(?:Q(?:uestion)?\s*\.?\s*)\d+[.)-]?\s+/gim);
    return imported ? imported.length : 0;
  }

  function markTokenValue(value) {
    const cleaned = String(value || '')
      .replace(/^[\s[(]+|[\s)\]]+$/g, '')
      .replace(/\s*marks?\s*$/i, '')
      .trim();
    if (!/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*$/.test(cleaned)) return 0;
    return cleaned.split('+').reduce((sum, part) => sum + (Number(part.trim()) || 0), 0);
  }

  function detectedMarks() {
    const editor = byId('paperContentEditor');
    if (!editor) return 0;

    // Portal-created questions carry an explicit mark-token class. Prefer those
    // tokens so bracketed question numbers/references elsewhere are not counted.
    const explicitTokens = [...editor.querySelectorAll('.mark-token')];
    if (explicitTokens.length) {
      const total = explicitTokens.reduce((sum, token) => sum + markTokenValue(token.textContent), 0);
      return Number(total.toFixed(2));
    }

    // Imported/legacy papers may not have mark-token classes.
    const text = editor.innerText || '';
    let total = 0;
    const regex = /\[\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:marks?)?\s*\]/gi;
    let match;
    while ((match = regex.exec(text))) total += markTokenValue(match[0]);
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

  function editorWorkspaceOpen() {
    const workspace = byId('paperEditorWorkspace');
    return Boolean(workspace && !workspace.hidden);
  }

  function formatClock(value = new Date()) {
    try {
      return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(value);
    } catch (_) {
      return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  function recoveryKey() {
    if (!session?.teacherId) return '';
    const identity = adminEditingPaperId || currentDraftId || currentRevision.parentPaperId || currentRevision.originalPaperId || 'new-paper';
    return `${session.teacherId}:${editorMode}:${identity}`;
  }

  function openRecoveryDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (recoveryDbPromise) return recoveryDbPromise;
    recoveryDbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(RECOVERY_STORE_NAME)) db.createObjectStore(RECOVERY_STORE_NAME, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return recoveryDbPromise;
  }

  async function writeRecoveryRecord(record) {
    const db = await openRecoveryDb();
    if (!db || !record?.key) return false;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(RECOVERY_STORE_NAME, 'readwrite');
        transaction.objectStore(RECOVERY_STORE_NAME).put(record);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function readRecoveryRecord(key) {
    const db = await openRecoveryDb();
    if (!db || !key) return null;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(RECOVERY_STORE_NAME, 'readonly');
        const request = transaction.objectStore(RECOVERY_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function deleteRecoveryRecord(key) {
    const db = await openRecoveryDb();
    if (!db || !key) return false;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(RECOVERY_STORE_NAME, 'readwrite');
        transaction.objectStore(RECOVERY_STORE_NAME).delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  function setAutosaveStatus(message, type = 'dirty') {
    const node = byId('paperSaveStatus');
    if (node && message) {
      node.textContent = message;
      node.className = `paper-save-status ${type}`;
    }
    const mobileState = byId('bgpsMobilePaperSaveState');
    if (mobileState && message) mobileState.textContent = message;
  }

  function collectRecoverySnapshot() {
    if (!editorWorkspaceOpen() || !session || session.isAdmin) return null;
    const key = recoveryKey();
    if (!key) return null;
    try {
      const draft = collectDraft();
      return {
        key,
        savedAt: Date.now(),
        draft,
        scrollTop: Math.max(0, window.scrollY || document.documentElement.scrollTop || 0)
      };
    } catch (_) {
      return null;
    }
  }

  async function persistLocalRecovery() {
    recoveryWriteTimer = 0;
    if (!dirty) return false;
    const snapshot = collectRecoverySnapshot();
    if (!snapshot) return false;
    const saved = await writeRecoveryRecord(snapshot);
    if (saved && dirty) {
      setAutosaveStatus(navigator.onLine ? 'Safe on this device · syncing…' : 'Offline · safe on this device', 'dirty');
    }
    return saved;
  }

  function scheduleLocalRecovery(delay = 1200) {
    if (!dirty || !session || session.isAdmin || !editorWorkspaceOpen()) return;
    if (recoveryWriteTimer) window.clearTimeout(recoveryWriteTimer);
    recoveryWriteTimer = window.setTimeout(() => persistLocalRecovery().catch(() => {}), delay);
  }

  function hasEnoughForServerAutosave(draft) {
    return Boolean(draft?.title && draft?.className && draft?.subject && draft?.exam
      && Number(draft.maxMarks) > 0 && draft.timeAllowed && draft.editorHtml && draft.bodyText?.length >= 5
      && (draft.chapters || isPrePrimary(draft.className)));
  }

  async function runServerAutosave() {
    serverAutosaveTimer = 0;
    if (!dirty || !editorWorkspaceOpen() || !session || session.isAdmin || editorMode === 'admin') return;
    if (saveInFlight || submitInFlight || uploadInFlight) {
      scheduleServerAutosave(12000);
      return;
    }
    if (!navigator.onLine) {
      setAutosaveStatus('Offline · safe on this device', 'dirty');
      return;
    }
    const draft = collectDraft();
    if (!hasEnoughForServerAutosave(draft)) {
      setAutosaveStatus('Safe on this device', 'dirty');
      return;
    }
    try {
      setAutosaveStatus('Saving…', 'dirty');
      await saveDraft(false);
    } catch (_) {
      setAutosaveStatus('Save pending · safe on this device', 'dirty');
      scheduleServerAutosave(20000);
    }
  }

  function scheduleServerAutosave(delay = 30000) {
    if (!session || session.isAdmin || editorMode === 'admin' || !editorWorkspaceOpen()) return;
    if (serverAutosaveTimer) window.clearTimeout(serverAutosaveTimer);
    serverAutosaveTimer = window.setTimeout(() => runServerAutosave().catch(() => {}), delay);
  }

  function clearAutosaveTimers() {
    if (recoveryWriteTimer) window.clearTimeout(recoveryWriteTimer);
    if (serverAutosaveTimer) window.clearTimeout(serverAutosaveTimer);
    recoveryWriteTimer = 0;
    serverAutosaveTimer = 0;
  }

  function applyRecoverySnapshot(record) {
    const draft = record?.draft;
    if (!draft || typeof draft !== 'object') return false;
    if (draft.draftId) currentDraftId = draft.draftId;
    currentRevision = {
      ...currentRevision,
      originalPaperId: draft.originalPaperId || currentRevision.originalPaperId || '',
      parentPaperId: draft.parentPaperId || currentRevision.parentPaperId || '',
      previousVersion: Number(draft.previousVersion || currentRevision.previousVersion || 0),
      sourceType: draft.sourceType || currentRevision.sourceType || 'Manual',
      originalFileName: draft.originalFileName || currentRevision.originalFileName || '',
      sourceFileId: draft.sourceFileId || currentRevision.sourceFileId || '',
      importWarnings: Array.isArray(draft.importWarnings) ? draft.importWarnings : (currentRevision.importWarnings || [])
    };
    const values = {
      paperTitleInput: draft.title || '', paperMaxMarksInput: draft.maxMarks || '', paperTimeInput: draft.timeAllowed || '',
      paperDateInput: draft.examDate || '', paperChaptersInput: draft.chapters || '', paperInstructionsInput: draft.instructions || '',
      paperLanguageInput: draft.languageMode || 'english'
    };
    Object.entries(values).forEach(([id, value]) => { const node = byId(id); if (node) node.value = value; });
    if (byId('paperClassInput')) byId('paperClassInput').value = draft.className || window.BGPS_DATA.CLASSES[0];
    populateSubjects('paperClassInput', 'paperSubjectInput');
    if (byId('paperSubjectInput')) byId('paperSubjectInput').value = draft.subject || '';
    if (byId('paperExamInput')) byId('paperExamInput').value = draft.exam || window.BGPS_DATA.EXAMS[0];
    const editor = byId('paperContentEditor');
    if (editor) editor.innerHTML = draft.editorHtml || '';
    hydrateImages();
    editor?.querySelectorAll('.diagram-box.has-image').forEach(ensureParagraphAfterImage);
    requestAnimationFrame(syncEditorFreeMoveHeight);
    syncDraftDeleteControl();
    markDirty();
    updateChecks();
    if (Number.isFinite(Number(record.scrollTop))) requestAnimationFrame(() => window.scrollTo({ top: Number(record.scrollTop), behavior: 'auto' }));
    return true;
  }

  async function offerRecovery(serverUpdatedAt = '') {
    if (!session || session.isAdmin || editorMode === 'admin') return;
    const key = recoveryKey();
    if (!key || promptedRecoveryKeys.has(key)) return;
    promptedRecoveryKeys.add(key);
    const record = await readRecoveryRecord(key);
    if (!record?.draft) return;
    const serverTime = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;
    if (serverTime && Number(record.savedAt || 0) <= serverTime + 1500) {
      deleteRecoveryRecord(key).catch(() => {});
      return;
    }
    const restored = window.confirm('Unsaved mobile work was found for this paper. Restore it now?');
    if (restored) {
      applyRecoverySnapshot(record);
      toast('Unsaved work restored from this device.');
    } else {
      deleteRecoveryRecord(key).catch(() => {});
    }
  }

  function ensureMobilePaperExperience() {
    if (!document.getElementById('bgps-mobile-paper-style')) {
      const style = document.createElement('style');
      style.id = 'bgps-mobile-paper-style';
      style.textContent = `
        #bgpsMobilePaperBar{display:none}
        @media(max-width:820px){
          body.bgps-paper-editor-active{overflow-x:hidden}
          body.bgps-paper-editor-active #bgpsMobilePaperBar:not([hidden]){display:block;position:fixed;left:0;right:0;bottom:0;z-index:5000;background:#fff;border-top:1px solid #c8d5e2;box-shadow:0 -8px 26px rgba(15,42,76,.16);padding:7px 8px calc(7px + env(safe-area-inset-bottom))}
          #bgpsMobilePaperBar .bgps-mobile-actions{display:flex;gap:7px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding-bottom:2px}
          #bgpsMobilePaperBar .bgps-mobile-actions::-webkit-scrollbar{display:none}
          #bgpsMobilePaperBar button{flex:0 0 auto;min-width:64px;min-height:44px;border:1px solid #b9cad9;border-radius:10px;background:#fff;color:#123e6c;font:700 12px/1.1 inherit;padding:6px 8px;touch-action:manipulation}
          #bgpsMobilePaperBar button.primary{background:#123e6c;color:#fff;border-color:#123e6c}
          #bgpsMobilePaperBar button.success{background:#176f3e;color:#fff;border-color:#176f3e}
          #bgpsMobilePaperBar button.danger{color:#a52323;border-color:#efb8b8;background:#fff5f5}
          #bgpsMobilePaperSaveState{display:block;margin:4px 2px 0;color:#5d7185;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          #paperEditorWorkspace{padding-bottom:96px}
          #paperEditorWorkspace .paper-editor-heading{gap:8px;margin-bottom:8px}
          #paperEditorWorkspace .paper-editor-heading .view-actions #previewCurrentPaper,
          #paperEditorWorkspace .paper-editor-heading .view-actions #savePaperDraft,
          #paperEditorWorkspace .paper-editor-heading .view-actions #deleteCurrentPaperDraft{display:none!important}
          #paperEditorWorkspace .paper-setup-card{padding:10px;border-radius:10px}
          #paperEditorWorkspace .paper-setup-grid{grid-template-columns:1fr!important;gap:9px}
          #paperEditorWorkspace .paper-title-field,#paperEditorWorkspace .paper-chapters-field,#paperEditorWorkspace .paper-instructions-field{grid-column:auto!important}
          #paperEditorWorkspace .paper-editor-layout{display:block!important}
          #paperEditorWorkspace .paper-editor-sidebar{display:none!important}
          #paperEditorWorkspace .paper-composer-card{border-radius:10px;overflow:visible}
          #paperEditorToolbar{position:sticky;top:0;z-index:60;box-shadow:0 4px 13px rgba(15,42,76,.08)}
          #paperEditorToolbar .toolbar-row{flex-wrap:nowrap!important;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;padding:7px!important}
          #paperEditorToolbar .toolbar-row::-webkit-scrollbar{display:none}
          #paperEditorToolbar .editor-command,#paperEditorToolbar .question-marks-control{flex:0 0 auto;min-height:42px}
          #paperEditorToolbar .editor-command{font-size:12px;padding:7px 10px}
          #paperEditorWorkspace .paper-ruler{display:none!important}
          #paperEditorWorkspace .paper-canvas-wrap{padding:0!important;overflow:visible!important;max-height:none!important;background:#fff}
          #paperEditorWorkspace .paper-sheet{width:100%!important;min-height:calc(100dvh - 160px)!important;margin:0!important;padding:20px 14px 120px!important;box-shadow:none!important}
          #paperEditorWorkspace .paper-sheet-header h2{font-size:22px}
          #paperEditorWorkspace .paper-sheet-meta{grid-template-columns:1fr!important;font-size:12px}
          #paperEditorWorkspace .paper-sheet-meta>span:nth-child(even){justify-content:flex-start;text-align:left}
          #paperContentEditor{min-height:58dvh!important;padding-bottom:120px!important;font-size:16px!important;line-height:1.48!important;overflow-wrap:anywhere}
          #paperContentEditor .diagram-box.has-image{max-width:100%!important;touch-action:none}
          #paperContentEditor .bgps-image-resize-handle{width:30px!important;height:30px!important;right:-12px!important;bottom:-12px!important;border-radius:50%!important;touch-action:none!important}
          #paperContentEditor .bgps-image-drag-handle{width:34px!important;height:34px!important;touch-action:none!important}
          .teacher-paper-item{padding:12px!important;gap:10px!important}
          .teacher-paper-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
          .teacher-paper-actions .btn{width:100%;min-height:46px}
          .teacher-paper-meta{gap:5px 9px!important}
          .teacher-paper-filters{grid-template-columns:1fr!important}
          .paper-upload-form{grid-template-columns:1fr!important}
          .paper-upload-form .upload-wide{grid-column:auto!important}
        }
        @media(max-width:420px){
          #paperEditorWorkspace .view-heading h1{font-size:23px}
          #paperEditorWorkspace .paper-sheet{padding-left:11px!important;padding-right:11px!important}
          #paperContentEditor{font-size:15.5px!important}
        }
      `;
      document.head.appendChild(style);
    }
    if (!mobilePaperBar) {
      mobilePaperBar = document.createElement('div');
      mobilePaperBar.id = 'bgpsMobilePaperBar';
      mobilePaperBar.hidden = true;
      mobilePaperBar.innerHTML = `
        <div class="bgps-mobile-actions" data-mobile-mode="normal">
          <button type="button" data-mobile-paper-action="undo">Undo</button>
          <button type="button" data-mobile-paper-action="question">+ Question</button>
          <button type="button" data-mobile-paper-action="image">Image</button>
          <button type="button" data-mobile-paper-action="paste" hidden>Paste Image</button>
          <button type="button" data-mobile-paper-action="vectors">Illustrations</button>
          <button type="button" data-mobile-paper-action="preview">Preview</button>
          <button class="primary" type="button" data-mobile-paper-action="save">Save</button>
          <button class="success" type="button" data-mobile-paper-action="submit">Submit</button>
        </div>
        <div class="bgps-mobile-actions" data-mobile-mode="image" hidden>
          <button type="button" data-mobile-paper-action="smaller">Size −</button>
          <button type="button" data-mobile-paper-action="larger">Size +</button>
          <button type="button" data-mobile-paper-action="move">Move</button>
          <button type="button" data-mobile-paper-action="rotate">Rotate</button>
          <button type="button" data-mobile-paper-action="crop">Crop</button>
          <button type="button" data-mobile-paper-action="centre">Centre</button>
          <button type="button" data-mobile-paper-action="replace">Replace</button>
          <button class="danger" type="button" data-mobile-paper-action="delete">Delete</button>
          <button class="primary" type="button" data-mobile-paper-action="done">Done</button>
        </div>
        <small id="bgpsMobilePaperSaveState">Ready</small>`;
      document.body.appendChild(mobilePaperBar);
      mobilePaperBar.addEventListener('click', (event) => {
        const button = event.target.closest('[data-mobile-paper-action]');
        if (!button) return;
        const action = button.dataset.mobilePaperAction;
        if (action === 'undo') execCommand('undo');
        else if (action === 'question') insertQuestion();
        else if (action === 'image') byId('paperImageFile')?.click();
        else if (action === 'paste') pasteCopiedImage();
        else if (action === 'vectors') openWorksheetVectorLibrary();
        else if (action === 'preview') previewCurrent();
        else if (action === 'save') saveEditorChanges(true).catch((error) => toast(error.message, 'error'));
        else if (action === 'submit') prepareSubmit();
        else if (action === 'smaller' && selectedImage) applyImageWidth(selectedImage, imageWidth(selectedImage) - 5);
        else if (action === 'larger' && selectedImage) applyImageWidth(selectedImage, imageWidth(selectedImage) + 5);
        else if (action === 'move' && selectedImage) { setImageLayout('free'); toast('Drag the image to place it.'); }
        else if (action === 'rotate') rotateSelectedImage();
        else if (action === 'crop') openImageCropper();
        else if (action === 'centre') setImageLayout('center');
        else if (action === 'replace') byId('replacePaperImageFile')?.click();
        else if (action === 'delete') deleteSelectedImage();
        else if (action === 'done') { if (selectedImage) placeCaretAfterImage(selectedImage); deselectImage(); }
        syncMobilePaperBar();
      });
    }
    if (window.visualViewport && !window.__BGPS_MOBILE_KEYBOARD_BOUND__) {
      window.__BGPS_MOBILE_KEYBOARD_BOUND__ = true;
      const syncKeyboard = () => {
        const keyboardOpen = window.innerHeight - window.visualViewport.height > 180;
        mobilePaperBar?.classList.toggle('keyboard-open', keyboardOpen);
        if (mobilePaperBar) mobilePaperBar.style.display = keyboardOpen ? 'none' : '';
      };
      window.visualViewport.addEventListener('resize', syncKeyboard, { passive: true });
      window.visualViewport.addEventListener('scroll', syncKeyboard, { passive: true });
    }
    syncMobilePaperBar();
  }

  function syncMobilePaperBar() {
    if (!mobilePaperBar) return;
    const mobile = window.matchMedia('(max-width:820px)').matches;
    const active = mobile && editorWorkspaceOpen();
    mobilePaperBar.hidden = !active;
    document.body.classList.toggle('bgps-paper-editor-active', active);
    if (!active) return;
    const imageMode = Boolean(selectedImage && selectedImage.isConnected);
    mobilePaperBar.querySelector('[data-mobile-mode="normal"]')?.toggleAttribute('hidden', imageMode);
    mobilePaperBar.querySelector('[data-mobile-mode="image"]')?.toggleAttribute('hidden', !imageMode);
    const submit = mobilePaperBar.querySelector('[data-mobile-paper-action="submit"]');
    if (submit) {
      const desktopSubmit = byId('submitPaperForReview');
      submit.hidden = editorMode === 'admin' || Boolean(desktopSubmit?.hidden);
      submit.disabled = submitInFlight || saveInFlight || Boolean(desktopSubmit?.disabled);
      submit.textContent = currentRevision.parentPaperId ? 'Resubmit' : 'Submit';
    }
    const save = mobilePaperBar.querySelector('[data-mobile-paper-action="save"]');
    if (save) {
      save.disabled = saveInFlight || submitInFlight;
      save.textContent = editorMode === 'admin' ? 'Save Changes' : 'Save';
    }
    const paste = mobilePaperBar.querySelector('[data-mobile-paper-action="paste"]');
    if (paste) paste.hidden = !imageClipboard;
    const status = byId('paperSaveStatus')?.textContent || (navigator.onLine ? 'Ready' : 'Offline');
    const mobileState = byId('bgpsMobilePaperSaveState');
    if (mobileState) mobileState.textContent = status;
  }

  function ensureImageGeometryObserver() {
    if (!('ResizeObserver' in window)) return;
    if (!imageGeometryObserver) {
      let raf = 0;
      imageGeometryObserver = new ResizeObserver(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => { raf = 0; syncEditorFreeMoveHeight(); });
      });
    }
    const editor = byId('paperContentEditor');
    if (editor) imageGeometryObserver.observe(editor);
    editor?.querySelectorAll('.diagram-box.has-image,.bgps-free-stage').forEach((node) => imageGeometryObserver.observe(node));
  }

  function imageLayoutIssues() {
    const editor = byId('paperContentEditor');
    if (!editor) return [];
    syncEditorFreeMoveHeight();
    const issues = [];
    const editorRect = editor.getBoundingClientRect();
    const boxes = Array.from(editor.querySelectorAll('.diagram-box.has-image'));
    boxes.forEach((box, index) => {
      const image = box.querySelector('img');
      if (!image || !String(image.getAttribute('src') || '').trim() || (image.complete && image.naturalWidth === 0)) {
        issues.push({ message: `Image ${index + 1} is broken or missing.`, node: box });
        return;
      }
      const rect = box.getBoundingClientRect();
      if (rect.left < editorRect.left - 3 || rect.right > editorRect.right + 3) {
        issues.push({ message: `Image ${index + 1} is outside the page width.`, node: box });
      }
      if (box.classList.contains('bgps-img-free')) {
        const stage = freeStageForBox(box);
        const stageHeight = parseFloat(stage?.style.getPropertyValue('--bgps-free-print-height') || 0) || 0;
        const offset = freeImageOffset(box);
        const required = offset.y + Math.max(1, rect.height) + 8;
        if (!stage || required > stageHeight + 3) issues.push({ message: `Image ${index + 1} needs layout recalculation.`, node: box });
      }
    });
    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i];
      if (!a.classList.contains('bgps-img-free')) continue;
      const ar = a.getBoundingClientRect();
      for (let j = i + 1; j < boxes.length; j += 1) {
        const b = boxes[j];
        if (!b.classList.contains('bgps-img-free') || freeStageForBox(a) !== freeStageForBox(b)) continue;
        const br = b.getBoundingClientRect();
        const overlapW = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
        const overlapH = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
        if (overlapW * overlapH > 300) {
          issues.push({ message: `Images ${i + 1} and ${j + 1} overlap.`, node: b });
        }
      }
    }
    return issues;
  }

  function paperSubmitIssues(draft) {
    const issues = [];
    if (!draft.title || !draft.className || !draft.subject || !draft.exam) issues.push({ message: 'Paper Title, Class, Subject and Exam / Term are required.', node: byId('paperTitleInput') });
    if (!draft.maxMarks || draft.maxMarks <= 0) issues.push({ message: 'Enter valid Maximum Marks.', node: byId('paperMaxMarksInput') });
    if (!draft.timeAllowed) issues.push({ message: 'Enter Time Allowed.', node: byId('paperTimeInput') });
    if (!draft.chapters && !isPrePrimary(draft.className)) issues.push({ message: 'Enter Chapters / Portion.', node: byId('paperChaptersInput') });
    if (!draft.editorHtml || draft.bodyText.length < 5) issues.push({ message: 'Write the question paper before submission.', node: byId('paperContentEditor') });
    if (draft.bodyText.toLowerCase().includes('type question here')) issues.push({ message: 'Replace every “Type question here” placeholder.', node: byId('paperContentEditor')?.querySelector('.q-placeholder') || byId('paperContentEditor') });
    if (!isDocxBasedDraft(draft) && draft.totalQuestions <= 0) {
      issues.push({ message: 'Add at least one question.', node: byId('paperContentEditor') });
    }
    // Imported DOCX papers can contain marks in tables, drawings or Word fields that
    // the browser cannot count reliably. Keep the live marks gauge as a review aid,
    // but do not falsely block a DOCX correction/resubmission. Portal-created papers
    // still require an exact detected total.
    if (!isDocxBasedDraft(draft) && Math.abs(draft.detectedMarks - draft.maxMarks) > 0.01) {
      issues.push({ message: `Detected marks (${draft.detectedMarks}) must match Maximum Marks (${draft.maxMarks}).`, node: byId('paperMarksGauge') || byId('paperMaxMarksInput') });
    }
    issues.push(...imageLayoutIssues());
    return issues;
  }

  function isDocxBasedDraft(draft) {
    const sourceType = normalize(draft?.sourceType).toLowerCase();
    const fileName = normalize(draft?.originalFileName).toLowerCase();
    return sourceType.includes('docx')
      || ((sourceType === 'upload' || sourceType === 'import') && fileName.endsWith('.docx'));
  }

  function focusPaperIssue(issue) {
    const node = issue?.node;
    if (!node?.scrollIntoView) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof node.focus === 'function') window.setTimeout(() => node.focus({ preventScroll: true }), 300);
  }

  function markDirty() {
    dirty = true;
    editRevision += 1;
    const message = currentDraftId ? 'Changes not saved' : 'Draft not saved';
    setAutosaveStatus(message, 'dirty');
    scheduleLocalRecovery();
    scheduleServerAutosave();
    syncMobilePaperBar();
  }

  function markSaved(message) {
    dirty = false;
    setAutosaveStatus(message || 'Draft saved', 'saved');
    syncMobilePaperBar();
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
    const docxMarksAdvisory = isDocxBasedDraft({
      sourceType: currentRevision.sourceType,
      originalFileName: currentRevision.originalFileName
    });
    setText('paperDetectedMarks', used);
    setText('paperTargetMarks', target || 0);
    setText('paperRemainingMarks', remaining);
    setText('paperQuestionCount', count);
    const progress = byId('paperMarksProgress');
    if (progress) progress.style.width = `${target > 0 ? Math.min(100, Math.max(0, (used / target) * 100)) : 0}%`;
    const card = byId('paperMarksGauge')?.closest('.marks-check-card');
    if (card) {
      card.classList.toggle('mismatch', !docxMarksAdvisory && target > 0 && used < target);
      card.classList.toggle('over', !docxMarksAdvisory && target > 0 && used > target);
    }
    const message = byId('paperMarksMessage');
    if (message) {
      if (!target) message.textContent = 'Enter maximum marks and add questions.';
      else if (!count && docxMarksAdvisory) message.textContent = `Imported DOCX: verify question numbering and the ${target}-mark total visually. Word question blocks may not be counted automatically; this will not block resubmission.`;
      else if (!count) message.textContent = 'Add at least one question.';
      else if (remaining === 0) message.textContent = 'Marks total is correct. The paper is ready for final checking.';
      else if (docxMarksAdvisory) message.textContent = `Imported DOCX: verify the ${target}-mark total visually. Word tables or text boxes may not be counted automatically; this will not block resubmission.`;
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
    clone.querySelectorAll('[data-bgps-geometry-bound]').forEach((node) => node.removeAttribute('data-bgps-geometry-bound'));
    clone.querySelectorAll('[data-rotation-busy],[data-rotation-upgrade-started],[data-bgps-insert-token]').forEach((node) => {
      node.removeAttribute('data-rotation-busy');
      node.removeAttribute('data-rotation-upgrade-started');
      node.removeAttribute('data-bgps-insert-token');
    });
    clone.querySelectorAll('[contenteditable],[draggable],[tabindex]').forEach((node) => {
      node.removeAttribute('contenteditable');
      node.removeAttribute('draggable');
      node.removeAttribute('tabindex');
    });
    return clone.innerHTML.trim();
  }

  function collectDraft() {
    syncEditorFreeMoveHeight();
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
    const issues = paperSubmitIssues(draft);
    if (!issues.length) return;
    focusPaperIssue(issues[0]);
    const summary = issues.slice(0, 4).map((issue) => `• ${issue.message}`).join('\n');
    const remaining = issues.length > 4 ? `\n• ${issues.length - 4} more item${issues.length - 4 === 1 ? '' : 's'} need attention.` : '';
    throw new Error(`${issues.length} item${issues.length === 1 ? '' : 's'} need attention before submission:\n${summary}${remaining}`);
  }

  async function saveDraft(showToast = true) {
    // Safety router: Principal/Admin editing an already-submitted manual paper must NEVER
    // go through savePaperDraft(), because that endpoint intentionally rejects Admin.
    // Route any legacy/duplicate Save handler to the admin update endpoint instead.
    if ((editorMode === 'admin' || session?.isAdmin) && adminEditingPaperId) {
      return saveEditorChanges(showToast);
    }
    if (saveInFlight) return currentDraftId;
    const previousRecoveryKey = recoveryKey();
    const draft = collectDraft();
    const saveRevision = editRevision;
    validateBasic(draft);
    saveInFlight = true;
    syncMobilePaperBar();
    const buttons = [byId('savePaperDraft'), byId('sidebarSaveDraft')].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; button.textContent = 'Saving…'; });
    try {
      const result = await window.BGPS_API.savePaperDraft(draft);
      currentDraftId = result.draftId || currentDraftId;
      syncDraftDeleteControl();
      if (editRevision === saveRevision) {
        if (recoveryWriteTimer) { window.clearTimeout(recoveryWriteTimer); recoveryWriteTimer = 0; }
        markSaved(`Draft saved · ${formatClock()}`);
        deleteRecoveryRecord(previousRecoveryKey).catch(() => {});
        deleteRecoveryRecord(recoveryKey()).catch(() => {});
        if (showToast) toast('Question paper draft saved.');
      } else {
        dirty = true;
        setAutosaveStatus('New changes pending · syncing…', 'dirty');
        scheduleLocalRecovery(200);
        scheduleServerAutosave(2500);
        if (showToast) toast('Draft saved. Newer changes are still being synced.');
      }
      return currentDraftId;
    } catch (error) {
      const node = byId('paperSaveStatus');
      if (node) { node.textContent = 'Save failed — retry'; node.className = 'paper-save-status dirty'; }
      throw error;
    } finally {
      saveInFlight = false;
      buttons.forEach((button) => { button.disabled = false; button.textContent = button.id === 'savePaperDraft' ? 'Save Draft' : 'Save Draft'; });
      syncMobilePaperBar();
    }
  }

  async function saveEditorChanges(showToast = true) {
    if (editorMode !== 'admin') return saveDraft(showToast);
    if (!adminEditingPaperId) throw new Error('No Admin paper is open for editing.');
    const draft = collectDraft();
    const saveRevision = editRevision;
    validateBasic(draft);
    const buttons = [byId('savePaperDraft'), byId('sidebarSaveDraft')].filter(Boolean);
    buttons.forEach((button) => { button.disabled = true; button.textContent = 'Saving…'; });
    try {
      const paperId = adminEditingPaperId;
      const result = await window.BGPS_API.updatePaperContentAdmin(paperId, draft);
      if (editRevision !== saveRevision) {
        dirty = true;
        setAutosaveStatus('New changes not included in the saved version', 'dirty');
        if (showToast) toast('Saved, but newer edits remain. Save again before leaving.', 'error');
        return result;
      }
      markSaved(`Changes saved · ${formatClock()}`);
      await window.BGPS_PAPERS.load(false).catch(() => {});
      if (showToast) {
        toast('Question paper updated successfully.');
        setEditorMode(false);
        deselectImage();
        editorMode = 'teacher';
        adminEditingPaperId = '';
        window.BGPS_APP.openView('papers');
        window.setTimeout(() => window.BGPS_PAPERS.openReview(paperId), 80);
      }
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
    const correctionResubmission = Boolean(currentRevision.parentPaperId)
      && byId('paperCorrectionBanner')?.hidden === false;
    const submitAllowed = correctionResubmission
      || (['docx upload', 'docx import', 'upload'].includes(sourceType) ? uploadAllowed : createAllowed);
    byId('createNewPaper').disabled = !createAllowed;
    byId('openPaperUpload').disabled = !uploadAllowed;
    byId('submitPaperForReview').disabled = !submitAllowed;
    if (notice) {
      const message = settings?.settings?.adminNotice || '';
      const bothClosed = !createAllowed && !uploadAllowed;
      const repeatsVisibleAccessState = /upload\s+is\s+open|manual\s+creator\s+can\s+be\s+enabled/i.test(message);
      notice.hidden = !bothClosed && (!message || repeatsVisibleAccessState);
      notice.textContent = bothClosed
        ? (message || 'Question-paper creation and upload are currently unavailable.')
        : (repeatsVisibleAccessState ? '' : message);
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
    const currentItems = combinedItems(true);
    const currentPapers = currentItems.filter((item) => item.kind === 'paper');
    const currentDrafts = currentItems.filter((item) => item.kind === 'draft');
    setText('teacherPaperMetricDraft', currentDrafts.length);
    setText('teacherPaperMetricSubmitted', currentPapers.filter((paper) => statusKey(paper.status) === 'submitted').length);
    setText('teacherPaperMetricCorrection', currentPapers.filter((paper) => statusKey(paper.status) === 'correction required').length);
    setText('teacherPaperMetricApproved', currentPapers.filter((paper) => statusKey(paper.status) === 'approved').length);
  }

  function combinedItems(includeApproved = false) {
    const linkedPaperIds = new Set(drafts.map((draft) => String(draft.parentPaperId || '')).filter(Boolean));
    const draftItems = drafts.map((draft) => ({ ...draft, kind: 'draft', status: 'Draft', updatedSort: draft.updatedAt || draft.createdAt || '' }));
    const paperItems = papers
      .filter((paper) => !linkedPaperIds.has(String(paper.paperId || '')))
      .filter((paper) => includeApproved || statusKey(paper.status) !== 'approved')
      .map((paper) => ({ ...paper, kind: 'paper', updatedSort: paper.updatedAt || paper.uploadedAt || '' }));
    return [...draftItems, ...paperItems].sort((a, b) => String(b.updatedSort).localeCompare(String(a.updatedSort)));
  }

  function renderList() {
    renderMetrics();
    const list = byId('teacherPaperList');
    if (!list) return;
    const status = normalize(byId('teacherPaperStatusFilter')?.value);
    const statusKeyValue = statusKey(status);
    const className = normalize(byId('teacherPaperClassFilter')?.value);
    const search = normalize(byId('teacherPaperSearch')?.value).toLowerCase();
    const listCopy = statusKeyValue === 'approved'
      ? ['Approved Papers', 'Final papers are read-only. Open Preview to view or download the approved copy.']
      : statusKeyValue === 'submitted'
        ? ['Submitted Papers', 'Papers waiting for the Principal’s first review or re-review.']
        : statusKeyValue === 'correction required'
          ? ['Correction Required', 'Open a returned paper, follow the Principal note and resubmit it.']
          : statusKeyValue === 'draft'
            ? ['My Drafts', 'Continue preparing, previewing or deleting unfinished papers.']
            : ['Active Papers', 'Track drafts, submissions and papers returned for correction.'];
    setText('teacherPaperListTitle', listCopy[0]);
    setText('teacherPaperListSubtitle', listCopy[1]);

    const items = combinedItems(statusKeyValue === 'approved').filter((item) => {
      if (status && normalize(item.status) !== status) return false;
      if (className && normalize(item.className) !== className) return false;
      if (search) {
        const haystack = [item.title, item.subject, item.exam, item.className, item.chapters].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    if (!items.length) {
      list.innerHTML = statusKeyValue === 'approved'
        ? '<div class="empty-state"><strong>No approved papers yet</strong>Approved papers will appear here automatically after the Principal’s decision.</div>'
        : '<div class="empty-state"><strong>No active papers</strong>Create a paper or wait for a correction request.</div>';
      return;
    }
    list.innerHTML = items.map((item) => {
      const isDraft = item.kind === 'draft';
      const correction = statusKey(item.status) === 'correction required';
      const approved = statusKey(item.status) === 'approved';
      const submitted = statusKey(item.status) === 'submitted';
      const resubmitted = submitted && (item.resubmitted === true || Boolean(String(item.adminNote || '').trim()));
      const title = item.title || `${item.className || ''} ${item.subject || ''} ${item.exam || ''}`.trim() || 'Question Paper';
      let actions = '';
      if (isDraft) actions = `<button class="btn primary" type="button" data-edit-draft="${escapeHtml(item.draftId)}">Continue Editing</button><button class="btn" type="button" data-preview-draft="${escapeHtml(item.draftId)}">Preview</button><button class="btn danger-outline" type="button" data-delete-draft="${escapeHtml(item.draftId)}">Delete Draft</button>`;
      else if (correction) actions = `<button class="btn primary" type="button" data-edit-paper="${escapeHtml(item.paperId)}">Edit &amp; Resubmit</button><button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>`;
      else if (submitted) actions = `<button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>${resubmitted ? '' : '<span class="teacher-paper-readonly-note">Awaiting Principal review</span>'}`;
      else actions = `<button class="btn" type="button" data-preview-paper="${escapeHtml(item.paperId)}">Preview</button>`;
      const statusChip = resubmitted
        ? '<span class="status-chip resubmitted">Corrected &amp; Resubmitted</span>'
        : `<span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status || 'Submitted')}</span>`;
      return `<article class="teacher-paper-item"><div class="teacher-paper-main"><div class="teacher-paper-title-row"><h3>${escapeHtml(title)}</h3>${statusChip}${item.version ? `<span class="status-chip">Version ${escapeHtml(item.version)}</span>` : ''}</div><div class="teacher-paper-meta"><span>${escapeHtml(item.className || '—')}</span><span>${escapeHtml(item.subject || '—')}</span><span>${escapeHtml(item.exam || '—')}</span><span>${escapeHtml(item.maxMarks || '—')} marks</span><span>Updated ${escapeHtml(safeDate(item.updatedAt || item.updatedSort))}</span></div>${correction && item.adminNote ? `<div class="teacher-paper-note"><strong>Principal note:</strong> ${escapeHtml(item.adminNote)}</div>` : ''}${submitted && !resubmitted ? '<div class="teacher-paper-note" style="border-left-color:#cf8a13;background:#fff8e8;color:#72520d"><strong>Submitted:</strong> Locked while awaiting Principal review.</div>' : ''}${resubmitted ? `<div class="teacher-paper-note" style="border-left-color:#5b4bb7;background:#faf9ff;color:#46378f"><strong>Correction sent:</strong> Awaiting Principal re-review.${item.adminNote ? ` Previous note: ${escapeHtml(item.adminNote)}` : ''}</div>` : ''}${approved ? '<div class="teacher-paper-note" style="border-left-color:#188f4d;background:#f1faf4;color:#245f3c"><strong>Approved:</strong> Final paper is ready to view or download.</div>' : ''}</div><div class="teacher-paper-actions">${actions}</div></article>`;
    }).join('');
  }

  function setEditorMode(show) {
    setHidden('paperCentreHome', Boolean(show));
    setHidden('paperEditorWorkspace', !show);
    document.body.classList.toggle('bgps-paper-editor-active', Boolean(show) && window.matchMedia('(max-width:820px)').matches);
    syncMobilePaperBar();
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
    editRevision = 0;
    selectedImage = null;
    editorRange = null;
    ['paperTitleInput', 'paperMaxMarksInput', 'paperTimeInput', 'paperDateInput', 'paperChaptersInput', 'paperInstructionsInput'].forEach((id) => { const node = byId(id); if (node) node.value = ''; });
    if (byId('paperLanguageInput')) byId('paperLanguageInput').value = 'english';
    if (byId('paperContentEditor')) {
      byId('paperContentEditor').innerHTML = '';
      byId('paperContentEditor').style.removeProperty('min-height');
      delete byId('paperContentEditor').dataset.bgpsBaseMinHeight;
    }
    const defaultClass = session?.paperOnly ? '' : (session?.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0]);
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
    offerRecovery('').catch(() => {});
  }

  function loadDraftIntoEditor(draft, correctionMode, options = {}) {
    if (looksLikePortalApplicationSource(draft?.editorHtml || '')) {
      toast('Unsafe portal source was blocked. Reopen the paper after the backend update to recover its real content.', 'error');
      return false;
    }
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
    if (byId('paperContentEditor')) {
      byId('paperContentEditor').innerHTML = draft.editorHtml || '';
      byId('paperContentEditor').style.removeProperty('min-height');
      delete byId('paperContentEditor').dataset.bgpsBaseMinHeight;
    }
    hydrateImages();
    byId('paperContentEditor')?.querySelectorAll('.diagram-box.has-image').forEach(ensureParagraphAfterImage);
    requestAnimationFrame(syncEditorFreeMoveHeight);

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
      setText('submitPaperForReview', 'Resubmit Corrected Paper');
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
      setText('submitPaperForReview', 'Submit Updated Paper');
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
      setText('submitPaperForReview', 'Submit for Review');
      setHidden('submitPaperForReview', false);
      markSaved(`Draft loaded · ${safeDate(draft.updatedAt)}`);
    }

    syncDraftDeleteControl();
    updateChecks();
    updatePaperAccess();
    setEditorMode(true);
    syncMobilePaperBar();
    offerRecovery(draft.updatedAt || '').catch(() => {});
    return true;
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
      const paper = result.paper || {};
      if (!String(paper.editorHtml || '').trim()) throw new Error('Editable paper content is unavailable. Refresh Paper Approval and try again.');
      if (looksLikePortalApplicationSource(paper.editorHtml)) throw new Error('Unsafe stored content was blocked. Refresh after deploying the matching backend fix.');
      window.BGPS_APP.openView('teacher-papers');
      loadDraftIntoEditor(paper, false, { admin: true });
    } catch (error) {
      toast(error.message || 'Could not open Admin paper edit mode.', 'error');
    }
  }

  function closeEditor() {
    if (dirty && !window.confirm('This paper has unsaved changes. They are safe on this device, but not yet synced. Leave the editor?')) return;
    const wasAdmin = editorMode === 'admin';
    clearAutosaveTimers();
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
    draft = Object.assign({}, draft, {
      editorHtml: window.BGPS_PRINT_LAYOUT.prepareFreeMoveHtml(draft?.editorHtml)
    });
    const instructions = normalize(draft.instructions).split(/\n+/).map(normalize).filter(Boolean);
    const instructionsHtml = instructions.length ? `<div class="instructions"><strong>General Instructions</strong><ol>${instructions.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol></div>` : '';
    const date = draft.examDate || '____________';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4 portrait;margin:11mm 13mm}*{box-sizing:border-box}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}body{margin:0;background:#dde5ed;color:#111;font-family:Georgia,"Noto Serif Devanagari","Mangal",serif;font-size:10.8pt;line-height:1.34}.print{position:sticky;top:0;z-index:3;text-align:center;padding:8px;background:#dde5ed}.print button{padding:8px 14px;font-weight:700}.paper{width:184mm;min-height:270mm;max-width:calc(100% - 22px);margin:0 auto 20px;padding:0;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.16)}.header{text-align:center;border-bottom:1.4px solid #111;padding:0 0 4px;margin-bottom:5px}.header h1{font-size:18pt;margin:0}.exam{font-size:12pt;font-weight:900;text-transform:uppercase}.meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;border-bottom:1px solid #555;padding:4px 0 6px;margin-bottom:7px;font-weight:800;font-size:9.8pt}.meta div:nth-child(even){text-align:right}.instructions{border:1px solid #777;padding:5px 9px;margin-bottom:7px;font-size:9.5pt}.instructions ol{margin:3px 0 0 18px;padding:0}.content{position:relative;min-height:220mm}.content::after{content:"";display:block;clear:both}.content p{margin:3px 0;white-space:pre-wrap;tab-size:4}.content .section-heading{clear:both;display:flex;justify-content:space-between;margin:8px 0 4px;padding:3px 6px;border:1px solid #222;background:#f1f1f1;font-size:10.2pt}.question-line{position:relative;padding-right:12mm;break-inside:avoid}.mark-token{float:right;display:inline-flex;align-items:center;justify-content:center;min-width:11mm;min-height:6mm;margin:-.5mm 0 .5mm 2.5mm;padding:.5mm 1.6mm;border:1px solid #555;border-radius:1.2mm;background:#fff;font-weight:900;line-height:1;white-space:nowrap}.or-line{text-align:center;font-weight:900}.content ol.bgps-subparts-alpha,.content ol.bgps-subparts-roman{list-style:none;counter-reset:bgps-subpart;margin:4px 0 6px 28px;padding:0}.content ol.bgps-subparts-alpha>li,.content ol.bgps-subparts-roman>li{counter-increment:bgps-subpart;position:relative;padding-left:28px;margin:3px 0}.content ol.bgps-subparts-alpha>li::before,.content ol.bgps-subparts-roman>li::before{position:absolute;left:0;font-weight:700}.content ol.bgps-subparts-alpha>li::before{content:"(" counter(bgps-subpart,lower-alpha) ")"}.content ol.bgps-subparts-roman>li::before{content:"(" counter(bgps-subpart,lower-roman) ")"}.content table{clear:both;width:100%;border-collapse:collapse;margin:4px 0}.content td,.content th{border:1px solid #333;padding:3px 4px}.page-break{clear:both;page-break-after:always;height:0;margin:0;border:0}.diagram-box.has-image{box-sizing:border-box;width:var(--bgps-image-width,100%);max-width:100%;padding:1mm;border:0;background:#fff;text-align:center;break-inside:avoid}.diagram-box.has-image>img{display:block;width:100%;height:auto;max-width:100%;max-height:none;margin:auto;object-fit:contain}.diagram-box.bgps-img-center{float:none;clear:both;margin:2mm auto 2.6mm}.diagram-box.bgps-img-left{float:left;clear:none;max-width:48%;margin:1mm 3mm 2mm 0}.diagram-box.bgps-img-right{float:right;clear:none;max-width:48%;margin:1mm 0 2mm 3mm}.diagram-box.bgps-img-inline{display:inline-block;float:none;clear:none;vertical-align:middle;max-width:80%;margin:0 2mm 1mm}.bgps-free-stage{position:relative;display:block;width:100%;height:var(--bgps-free-stage-height,0px);min-height:0;margin:0;padding:0;border:0;clear:both}.bgps-free-stage>.diagram-box.bgps-img-free{position:absolute;left:var(--bgps-free-x,0px);top:var(--bgps-free-y,0px);float:none;clear:none;margin:0;transform:none;z-index:4}.content>.diagram-box.bgps-img-free{position:absolute;left:var(--bgps-free-x,0px);top:var(--bgps-free-y,0px);float:none;clear:none;margin:0;transform:none;z-index:4}.diagram-caption{font-size:7.8pt;margin-top:.5mm;text-align:center;font-style:italic}.bgps-image-resize-handle,.q-placeholder{display:none}@media print{html,body,.paper,.paper *{color:#000!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.header,.meta,.instructions,.content .section-heading,.mark-token,.content td,.content th{border-color:#000!important}body{background:#fff}.print{display:none}.paper{width:auto;max-width:none;min-height:0;margin:0;box-shadow:none}}@media(max-width:700px){.paper{max-width:100%;padding:0 12px;min-height:0}.meta{grid-template-columns:1fr}.meta div:nth-child(even){text-align:left}}</style></head><body><main class="paper"><div class="header"><h1>BG PUBLIC SCHOOL</h1><div class="exam">${escapeHtml(draft.exam || 'EXAM / TERM')}</div></div><div class="meta"><div>Class: ${escapeHtml(draft.className)}</div><div>Subject: ${escapeHtml(draft.subject)}</div><div>Time Allotted: ${escapeHtml(draft.timeAllowed || inferTime(draft.maxMarks))}</div><div>Maximum Marks: ${escapeHtml(draft.maxMarks)}</div><div>Reading Time: ${escapeHtml(readingTime(draft.className, draft.maxMarks))}</div><div>Date: ${escapeHtml(date)}</div></div>${instructionsHtml}<div class="content">${draft.editorHtml || ''}</div></main></body></html>`;
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
      const resubmitting = Boolean(currentRevision.parentPaperId);
      setText('paperSubmitTitle', resubmitting ? 'Resubmit Corrected Question Paper' : 'Submit Question Paper');
      const draft = collectDraft();
      validateForSubmit(draft);
      setText('submitPaperClass', draft.className);
      setText('submitPaperSubject', draft.subject);
      setText('submitPaperExam', draft.exam);
      setText('submitPaperQuestions', draft.totalQuestions);
      setText('submitPaperMarks', draft.detectedMarks);
      setText('submitPaperMaxMarks', draft.maxMarks);
      const confirm = byId('confirmPaperSubmit');
      if (confirm) confirm.textContent = resubmitting ? 'Resubmit for Approval' : 'Submit for Approval';
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
    syncMobilePaperBar();
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
      const submittedRecoveryKey = recoveryKey();
      closeModal('paperSubmitModal');
      closeModal('paperUploadModal');
      setEditorMode(false);
      clearAutosaveTimers();
      deleteRecoveryRecord(submittedRecoveryKey).catch(() => {});
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
      const message = error.message || 'Could not submit the paper.';
      const status = byId('paperSaveStatus');
      if (status) {
        status.textContent = `Submission failed: ${message}`;
        status.className = 'paper-save-status dirty';
      }
      toast(message, 'error');
    } finally {
      submitInFlight = false;
      if (button) {
        button.disabled = false;
        button.textContent = currentRevision.parentPaperId ? 'Resubmit for Approval' : 'Submit for Approval';
      }
      syncMobilePaperBar();
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

  function ensureImageGeometryStyles() {
    if (document.getElementById('bgps-image-geometry-style')) return;
    const style = document.createElement('style');
    style.id = 'bgps-image-geometry-style';
    style.textContent = `
      #paperContentEditor { position:relative !important; }
      #paperContentEditor .bgps-free-stage {
        position:relative !important;
        display:block !important;
        width:100% !important;
        height:0 !important;
        min-height:0 !important;
        margin:0 !important;
        padding:0 !important;
        border:0 !important;
        clear:both !important;
        overflow:visible !important;
        pointer-events:none;
      }
      #paperContentEditor .bgps-free-stage > .diagram-box.bgps-img-free {
        position:absolute !important;
        left:var(--bgps-free-x,0px) !important;
        top:var(--bgps-free-y,0px) !important;
        transform:none !important;
        margin:0 !important;
        float:none !important;
        clear:none !important;
        z-index:4;
        pointer-events:auto;
      }
      #paperContentEditor > .diagram-box.bgps-img-free {
        position:absolute !important;
        left:var(--bgps-free-x,0px) !important;
        top:var(--bgps-free-y,0px) !important;
        transform:none !important;
        margin:0 !important;
        float:none !important;
        clear:none !important;
        z-index:4;
      }
      #paperContentEditor .bgps-image-caret-paragraph {
        min-height:1.35em;
        margin:3px 0;
      }
      @media (max-width:700px) {
        #paperContentEditor {
          min-width:0 !important;
          max-width:100% !important;
          overflow-x:hidden !important;
        }
        #paperContentEditor .diagram-box.has-image {
          max-width:100% !important;
          touch-action:pan-y;
        }
        #paperContentEditor .diagram-box.has-image.is-image-selected,
        #paperContentEditor .diagram-box.has-image.bgps-img-free {
          touch-action:none;
        }
        #paperContentEditor .bgps-image-resize-handle,
        #paperContentEditor .bgps-image-drag-handle {
          min-width:24px !important;
          min-height:24px !important;
          touch-action:none !important;
        }
        #paperImageControls .image-action-grid {
          grid-template-columns:repeat(2,minmax(0,1fr)) !important;
          gap:8px !important;
        }
        #paperImageControls button {
          min-height:42px !important;
          white-space:normal !important;
        }
        #paperImageControls input[type="range"] {
          width:100% !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isEmptyEditorParagraph(node) {
    return Boolean(node?.tagName === 'P'
      && !node.classList.contains('question-line')
      && !String(node.textContent || '').replace(/\u00a0/g, ' ').trim());
  }

  function freeStageForBox(box) {
    const parent = box?.parentElement;
    return parent?.classList?.contains('bgps-free-stage') ? parent : null;
  }

  function ensureParagraphAfterImage(box) {
    if (!box?.parentNode) return null;
    const anchor = freeStageForBox(box) || box;
    const next = anchor.nextElementSibling;
    if (isEmptyEditorParagraph(next)) {
      next.classList.add('bgps-image-caret-paragraph');
      return next;
    }
    const paragraph = document.createElement('p');
    paragraph.className = 'bgps-image-caret-paragraph';
    paragraph.appendChild(document.createElement('br'));
    anchor.insertAdjacentElement('afterend', paragraph);
    return paragraph;
  }

  function placeCaretAfterImage(box, options = {}) {
    const editor = byId('paperContentEditor');
    if (!editor || !box || !editor.contains(box)) return false;
    const paragraph = ensureParagraphAfterImage(box);
    if (!paragraph) return false;
    if (options.focus !== false) {
      try { editor.focus({ preventScroll: true }); }
      catch (_) { editor.focus(); }
    }
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editorRange = range.cloneRange();
    if (options.scroll !== false) paragraph.scrollIntoView?.({ block: 'nearest' });
    return true;
  }

  function freeStageHostForBox(box, editor) {
    if (!box || !editor) return editor || null;
    const standardized = box.closest('.bgps-standardized-docx');
    return standardized && editor.contains(standardized) ? standardized : editor;
  }

  function nearbyFreeStage(anchor, host) {
    const scan = (start, direction) => {
      let node = start;
      while (node && node.parentElement === host) {
        if (node.classList?.contains('bgps-free-stage')) return node;
        if (!isEmptyEditorParagraph(node)) return null;
        node = direction < 0 ? node.previousElementSibling : node.nextElementSibling;
      }
      return null;
    };
    return scan(anchor.previousElementSibling, -1) || scan(anchor.nextElementSibling, 1);
  }

  function directChildWithin(node, host) {
    let current = node;
    while (current?.parentElement && current.parentElement !== host) current = current.parentElement;
    return current?.parentElement === host ? current : null;
  }

  function removeEmptyImagePlaceholder(node) {
    if (isEmptyEditorParagraph(node) && !node.classList.contains('question-line')) node.remove();
  }

  function removeEmptyImageParent(node, host) {
    if (!node || node === host || node.classList?.contains('bgps-standardized-docx')) return;
    if (node.tagName === 'P' && !String(node.textContent || '').replace(/\u00a0/g, ' ').trim()
      && !node.querySelector('img,table,.diagram-box,.page-break')) node.remove();
  }

  function ensureFreeStageForBox(box) {
    const editor = byId('paperContentEditor');
    if (!editor || !box || !editor.contains(box)) return null;
    const currentStage = freeStageForBox(box);
    if (currentStage) return currentStage;

    const host = freeStageHostForBox(box, editor);
    const anchor = directChildWithin(box, host);
    if (!host || !anchor) return null;

    const hostRect = host.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const absoluteX = boxRect.left - hostRect.left + host.scrollLeft;
    const absoluteY = boxRect.top - hostRect.top + host.scrollTop;
    const oldParent = box.parentElement;
    const oldPlaceholder = box.nextElementSibling;

    let stage = nearbyFreeStage(anchor, host);
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'bgps-free-stage';
      stage.setAttribute('contenteditable', 'false');
      stage.setAttribute('aria-hidden', 'true');
      stage.style.setProperty('--bgps-free-stage-height', '0px');
      stage.style.setProperty('--bgps-free-print-height', '24px');
      stage.style.height = 'var(--bgps-free-stage-height)';
      host.insertBefore(stage, anchor);
    }

    const stageRect = stage.getBoundingClientRect();
    const stageX = stageRect.left - hostRect.left + host.scrollLeft;
    const stageY = stageRect.top - hostRect.top + host.scrollTop;
    stage.appendChild(box);
    removeEmptyImagePlaceholder(oldPlaceholder);
    removeEmptyImageParent(oldParent, host);

    box.classList.remove('bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-floating', 'bgps-img-compact');
    box.classList.add('bgps-img-free');
    applyFreeImageOffset(box, Math.max(0, absoluteX - stageX), Math.max(0, absoluteY - stageY));
    return stage;
  }

  function syncFreeStagesWithinHost(host) {
    if (!host) return;
    Array.from(host.children)
      .filter((child) => child.classList?.contains('bgps-free-stage'))
      .forEach((stage) => {
        const boxes = Array.from(stage.children)
          .filter((child) => child.classList?.contains('diagram-box') && child.classList.contains('bgps-img-free'));
        if (!boxes.length) {
          stage.remove();
          return;
        }

        let printHeight = 24;
        boxes.forEach((box) => {
          const offset = freeImageOffset(box);
          const height = Math.max(1, box.getBoundingClientRect().height || box.offsetHeight || 1);
          printHeight = Math.max(printHeight, offset.y + height + 12);
        });
        // Editor stays zero-height so typing is never blocked. The separate
        // print envelope is used only by preview/PDF pagination.
        stage.style.setProperty('--bgps-free-stage-height', '0px');
        stage.style.setProperty('--bgps-free-print-height', `${Math.ceil(printHeight)}px`);
        stage.style.height = '0px';
        ensureParagraphAfterImage(boxes[boxes.length - 1]);
      });
  }

  function syncEditorFreeMoveHeight() {
    const editor = byId('paperContentEditor');
    if (!editor) return;
    ensureImageGeometryStyles();
    if (!editor.dataset.bgpsBaseMinHeight) {
      const computed = parseFloat(getComputedStyle(editor).minHeight || 0);
      editor.dataset.bgpsBaseMinHeight = String(Math.max(0, Number.isFinite(computed) ? computed : 0));
    }

    // Support both normal teacher-created papers and imported DOCX content.
    // A zero-height anchor keeps Free Move images out of document flow.
    Array.from(editor.querySelectorAll('.diagram-box.has-image.bgps-img-free'))
      .filter((box) => !freeStageForBox(box))
      .forEach((box) => ensureFreeStageForBox(box));

    const hosts = new Set([editor]);
    editor.querySelectorAll('.bgps-standardized-docx').forEach((host) => hosts.add(host));
    editor.querySelectorAll('.bgps-free-stage').forEach((stage) => {
      if (stage.parentElement) hosts.add(stage.parentElement);
    });
    hosts.forEach(syncFreeStagesWithinHost);

    const baseMinHeight = parseFloat(editor.dataset.bgpsBaseMinHeight || 0) || 0;
    const editorRect = editor.getBoundingClientRect();
    let visualBottom = 0;
    editor.querySelectorAll('.diagram-box.has-image').forEach((box) => {
      const rect = box.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      visualBottom = Math.max(visualBottom, rect.bottom - editorRect.top + 28);
    });

    // Absolutely-positioned Free Move images do not contribute to normal DOM
    // height. Extend the editable white paper to their real visual bottom so an
    // image can never hang over the grey canvas or disappear beyond the sheet.
    editor.style.minHeight = `${Math.ceil(Math.max(baseMinHeight, visualBottom, 120))}px`;
  }

  function legacyImageRotation(box) {
    if (!box) return 0;
    if (box.classList.contains('bgps-img-rotate-90')) return 90;
    if (box.classList.contains('bgps-img-rotate-180')) return 180;
    if (box.classList.contains('bgps-img-rotate-270')) return 270;
    return 0;
  }

  function clearLegacyImageRotation(box) {
    box?.classList.remove('bgps-img-rotate-90', 'bgps-img-rotate-180', 'bgps-img-rotate-270');
  }

  function imageMimeFromSource(source) {
    const match = String(source || '').match(/^data:(image\/(?:png|jpeg|webp));/i);
    return match ? match[1].toLowerCase() : 'image/png';
  }

  function waitForImageReady(image) {
    if (!image) return Promise.reject(new Error('The selected image is unavailable.'));
    if (image.complete && image.naturalWidth > 0) return Promise.resolve(image);
    return new Promise((resolve, reject) => {
      const onLoad = () => { cleanup(); resolve(image); };
      const onError = () => { cleanup(); reject(new Error('The image could not be opened for rotation.')); };
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
    });
  }

  function rotatedImageDataUrl(image, angle) {
    const normalized = ((Number(angle) || 0) % 360 + 360) % 360;
    const quarterTurn = normalized === 90 || normalized === 270;
    const canvas = document.createElement('canvas');
    canvas.width = quarterTurn ? image.naturalHeight : image.naturalWidth;
    canvas.height = quarterTurn ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Image rotation is not supported by this browser.');

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(normalized * Math.PI / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    context.restore();

    const mime = imageMimeFromSource(image.currentSrc || image.src);
    const outputMime = ['image/png', 'image/jpeg', 'image/webp'].includes(mime) ? mime : 'image/png';
    return canvas.toDataURL(outputMime, outputMime === 'image/jpeg' ? 0.92 : undefined);
  }

  function normalizeImageBoxGeometry(box) {
    if (!box) return;
    box.style.removeProperty('height');
    box.style.removeProperty('min-height');
    box.style.removeProperty('max-height');
    box.style.removeProperty('overflow');
    box.style.removeProperty('transition');
    const image = box.querySelector('img');
    if (image) {
      image.style.removeProperty('transform');
      image.style.removeProperty('width');
      image.style.removeProperty('height');
      image.style.removeProperty('max-height');
      image.style.display = 'block';
      image.style.width = '100%';
      image.style.height = 'auto';
      image.style.maxWidth = '100%';
      image.style.objectFit = 'contain';
    }
  }

  function imageTargetBoxHeight(box, image) {
    const computed = getComputedStyle(box);
    const horizontal = parseFloat(computed.paddingLeft || 0) + parseFloat(computed.paddingRight || 0)
      + parseFloat(computed.borderLeftWidth || 0) + parseFloat(computed.borderRightWidth || 0);
    const vertical = parseFloat(computed.paddingTop || 0) + parseFloat(computed.paddingBottom || 0)
      + parseFloat(computed.borderTopWidth || 0) + parseFloat(computed.borderBottomWidth || 0);
    const contentWidth = Math.max(1, box.getBoundingClientRect().width - horizontal);
    const imageHeight = contentWidth * image.naturalHeight / Math.max(1, image.naturalWidth);
    const caption = box.querySelector('.diagram-caption');
    const captionHeight = caption ? caption.getBoundingClientRect().height + 4 : 0;
    return Math.max(24, imageHeight + vertical + captionHeight);
  }

  async function rotateImagePixels(box, angle, options = {}) {
    if (!box || box.dataset.rotationBusy === 'true') return false;
    const image = box.querySelector('img');
    if (!image) throw new Error('Select an image first.');

    box.dataset.rotationBusy = 'true';
    const button = byId('rotatePaperImage');
    if (button && selectedImage === box) {
      button.disabled = true;
      button.textContent = 'Rotating…';
    }

    try {
      await waitForImageReady(image);
      const beforeHeight = box.getBoundingClientRect().height;
      const animation = options.animate !== false && typeof image.animate === 'function'
        ? image.animate([
            { transform: 'rotate(0deg)', opacity: 1 },
            { transform: `rotate(${Number(angle) || 90}deg)`, opacity: .78 }
          ], { duration: 170, easing: 'ease-in-out', fill: 'forwards' })
        : null;

      if (animation) {
        try { await animation.finished; } catch (_) {}
      }

      const rotatedSource = rotatedImageDataUrl(image, angle);
      box.style.height = `${Math.max(24, beforeHeight)}px`;
      box.style.overflow = 'visible';
      box.style.transition = 'height 190ms ease';

      image.getAnimations?.().forEach((item) => item.cancel());
      image.style.removeProperty('transform');
      image.src = rotatedSource;
      await waitForImageReady(image);

      clearLegacyImageRotation(box);
      normalizeImageBoxGeometry(box);

      // Animate the wrapper to its true post-rotation dimensions, then return
      // to automatic height so resize and following text use the real footprint.
      const targetHeight = imageTargetBoxHeight(box, image);
      box.style.height = `${Math.max(24, beforeHeight)}px`;
      box.style.overflow = 'visible';
      box.style.transition = 'height 190ms ease';
      requestAnimationFrame(() => { box.style.height = `${targetHeight}px`; });
      await new Promise((resolve) => window.setTimeout(resolve, 210));
      normalizeImageBoxGeometry(box);
      syncEditorFreeMoveHeight();

      if (box.classList.contains('bgps-img-free')) {
        requestAnimationFrame(() => {
          clampFreeImageOffset(box);
          syncEditorFreeMoveHeight();
        });
      }
      if (options.markDirty !== false) {
        markDirty();
        updateChecks();
        saveRange();
      }
      updateImageInspector();
      return true;
    } finally {
      delete box.dataset.rotationBusy;
      if (button && selectedImage === box) {
        button.disabled = false;
        button.textContent = 'Rotate 90°';
      }
    }
  }

  async function rotateSelectedImage() {
    if (!selectedImage) return;
    try {
      await rotateImagePixels(selectedImage, 90);
    } catch (error) {
      toast(error.message || 'The image could not be rotated.', 'error');
    }
  }

  function upgradeLegacyRotatedImage(box) {
    const legacyAngle = legacyImageRotation(box);
    if (!legacyAngle || box.dataset.rotationUpgradeStarted === 'true') return;
    box.dataset.rotationUpgradeStarted = 'true';
    rotateImagePixels(box, legacyAngle, { animate: false }).catch((error) => {
      delete box.dataset.rotationUpgradeStarted;
      console.warn('Legacy image rotation could not be upgraded.', error);
    });
  }

  function ensureImageRotateControl() {
    const controls = byId('paperImageControls');
    const grid = controls?.querySelector('.image-action-grid');
    if (!grid) return null;
    let button = byId('rotatePaperImage');
    if (!button) {
      button = document.createElement('button');
      button.id = 'rotatePaperImage';
      button.type = 'button';
      button.title = 'Rotate the selected image clockwise by 90 degrees';
      button.textContent = 'Rotate 90°';
      button.addEventListener('click', rotateSelectedImage);
      const replaceButton = byId('replacePaperImage');
      if (replaceButton && replaceButton.parentElement === grid) grid.insertBefore(button, replaceButton);
      else grid.appendChild(button);
    }
    return button;
  }

  function ensureImageCropUi() {
    if (!byId('bgpsImageCropStyle')) {
      const style = document.createElement('style');
      style.id = 'bgpsImageCropStyle';
      style.textContent = `
        #bgpsImageCropModal{position:fixed;inset:0;z-index:10050;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(7,24,42,.78)}
        #bgpsImageCropModal.open{display:flex}
        #bgpsImageCropModal .bgps-crop-dialog{width:min(960px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.35)}
        #bgpsImageCropModal .bgps-crop-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid #d8e1e9}
        #bgpsImageCropModal .bgps-crop-head strong{font-size:16px;color:#123e6c}
        #bgpsImageCropModal .bgps-crop-head small{display:block;margin-top:2px;color:#64788b}
        #bgpsImageCropModal .bgps-crop-close{width:42px;height:42px;border:1px solid #c8d5e2;border-radius:10px;background:#fff;font-size:22px;line-height:1;cursor:pointer}
        #bgpsImageCropModal .bgps-crop-work{min-height:0;overflow:auto;padding:18px;background:#e8eef3;text-align:center;overscroll-behavior:contain}
        #bgpsImageCropModal .bgps-crop-stage{position:relative;display:inline-block;line-height:0;touch-action:none;user-select:none;box-shadow:0 5px 22px rgba(20,43,65,.2)}
        #bgpsImageCropCanvas{display:block;background:#fff;max-width:none}
        #bgpsImageCropSelection{position:absolute;border:2px solid #fff;outline:1px solid #123e6c;background:rgba(18,62,108,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.42);cursor:move;touch-action:none}
        #bgpsImageCropSelection .bgps-crop-handle{position:absolute;width:32px;height:32px;border:3px solid #fff;border-radius:50%;background:#123e6c;box-shadow:0 1px 5px rgba(0,0,0,.35);touch-action:none}
        #bgpsImageCropSelection [data-crop-handle="nw"]{left:-17px;top:-17px;cursor:nwse-resize}
        #bgpsImageCropSelection [data-crop-handle="ne"]{right:-17px;top:-17px;cursor:nesw-resize}
        #bgpsImageCropSelection [data-crop-handle="sw"]{left:-17px;bottom:-17px;cursor:nesw-resize}
        #bgpsImageCropSelection [data-crop-handle="se"]{right:-17px;bottom:-17px;cursor:nwse-resize}
        #bgpsImageCropModal .bgps-crop-actions{display:flex;justify-content:flex-end;gap:9px;padding:12px 16px;border-top:1px solid #d8e1e9;background:#fff}
        #bgpsImageCropModal .bgps-crop-actions button{min-height:44px;padding:8px 15px;border:1px solid #b9cad9;border-radius:10px;background:#fff;color:#123e6c;font-weight:800;cursor:pointer}
        #bgpsImageCropModal .bgps-crop-actions .primary{background:#123e6c;color:#fff;border-color:#123e6c}
        @media(max-width:700px){
          #bgpsImageCropModal{padding:0;align-items:stretch}
          #bgpsImageCropModal .bgps-crop-dialog{width:100%;max-height:100vh;max-height:100dvh;height:100vh;height:100dvh;border-radius:0}
          #bgpsImageCropModal .bgps-crop-head{padding:10px 12px}
          #bgpsImageCropModal .bgps-crop-work{display:flex;align-items:center;justify-content:center;padding:18px 14px}
          #bgpsImageCropModal .bgps-crop-actions{display:grid;grid-template-columns:1fr 1fr 1.25fr;padding:10px 12px calc(10px + env(safe-area-inset-bottom))}
          #bgpsImageCropModal .bgps-crop-actions button{padding:7px 8px}
          #bgpsImageCropSelection .bgps-crop-handle{width:38px;height:38px}
          #bgpsImageCropSelection [data-crop-handle="nw"]{left:-20px;top:-20px}
          #bgpsImageCropSelection [data-crop-handle="ne"]{right:-20px;top:-20px}
          #bgpsImageCropSelection [data-crop-handle="sw"]{left:-20px;bottom:-20px}
          #bgpsImageCropSelection [data-crop-handle="se"]{right:-20px;bottom:-20px}
        }
      `;
      document.head.appendChild(style);
    }

    let modal = byId('bgpsImageCropModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'bgpsImageCropModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="bgps-crop-dialog">
        <div class="bgps-crop-head"><div><strong>Crop Image</strong><small>Drag inside to move. Drag a corner to crop.</small></div><button class="bgps-crop-close" type="button" aria-label="Close crop tool">Ã—</button></div>
        <div class="bgps-crop-work"><div class="bgps-crop-stage"><canvas id="bgpsImageCropCanvas"></canvas><div id="bgpsImageCropSelection"><i class="bgps-crop-handle" data-crop-handle="nw"></i><i class="bgps-crop-handle" data-crop-handle="ne"></i><i class="bgps-crop-handle" data-crop-handle="sw"></i><i class="bgps-crop-handle" data-crop-handle="se"></i></div></div></div>
        <div class="bgps-crop-actions"><button type="button" data-crop-action="reset">Reset</button><button type="button" data-crop-action="cancel">Cancel</button><button class="primary" type="button" data-crop-action="apply">Apply Crop</button></div>
      </div>`;
    document.body.appendChild(modal);

    const closeButton = modal.querySelector('.bgps-crop-close');
    if (closeButton) closeButton.textContent = 'X';
    closeButton?.addEventListener('click', closeImageCropper);
    modal.querySelector('[data-crop-action="cancel"]')?.addEventListener('click', closeImageCropper);
    modal.querySelector('[data-crop-action="reset"]')?.addEventListener('click', resetImageCropSelection);
    modal.querySelector('[data-crop-action="apply"]')?.addEventListener('click', applyImageCrop);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeImageCropper(); });
    byId('bgpsImageCropSelection')?.addEventListener('pointerdown', startImageCropGesture);
    return modal;
  }

  function renderImageCropSelection() {
    const selection = byId('bgpsImageCropSelection');
    if (!selection || !cropState) return;
    const rect = cropState.rect;
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
  }

  function defaultImageCropRect(canvas) {
    const width = Math.max(1, Number(canvas?.width) || 1);
    const height = Math.max(1, Number(canvas?.height) || 1);
    const inset = Math.min(width / 4, height / 4, Math.max(16, Math.min(width, height) * .06));
    return {
      x: inset,
      y: inset,
      width: Math.max(24, width - inset * 2),
      height: Math.max(24, height - inset * 2)
    };
  }

  function resetImageCropSelection() {
    if (!cropState) return;
    cropState.rect = defaultImageCropRect(cropState.canvas);
    renderImageCropSelection();
  }

  function closeImageCropper() {
    const modal = byId('bgpsImageCropModal');
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    cropState = null;
    if (!document.querySelector('.modal-backdrop.open,#bgpsImageCropModal.open')) document.body.classList.remove('modal-open');
    syncMobilePaperBar();
  }

  function startImageCropGesture(event) {
    if (!cropState || event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = byId('bgpsImageCropSelection');
    const canvas = cropState.canvas;
    if (!selection || !canvas) return;
    selection.setPointerCapture?.(event.pointerId);
    const handle = event.target.closest('[data-crop-handle]')?.dataset.cropHandle || 'move';
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: cropState.rect.x,
      top: cropState.rect.y,
      width: cropState.rect.width,
      height: cropState.rect.height
    };
    const canvasRect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / Math.max(1, canvasRect.width);
    const ratioY = canvas.height / Math.max(1, canvasRect.height);
    const minimum = Math.max(24, Math.min(canvas.width, canvas.height) * .06);

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.pointerX) * ratioX;
      const dy = (moveEvent.clientY - start.pointerY) * ratioY;
      let left = start.left;
      let top = start.top;
      let right = start.left + start.width;
      let bottom = start.top + start.height;
      if (handle === 'move') {
        left = Math.max(0, Math.min(canvas.width - start.width, start.left + dx));
        top = Math.max(0, Math.min(canvas.height - start.height, start.top + dy));
        right = left + start.width;
        bottom = top + start.height;
      } else {
        if (handle.includes('w')) left = Math.max(0, Math.min(right - minimum, start.left + dx));
        if (handle.includes('e')) right = Math.min(canvas.width, Math.max(left + minimum, start.left + start.width + dx));
        if (handle.includes('n')) top = Math.max(0, Math.min(bottom - minimum, start.top + dy));
        if (handle.includes('s')) bottom = Math.min(canvas.height, Math.max(top + minimum, start.top + start.height + dy));
      }
      cropState.rect = { x: left, y: top, width: right - left, height: bottom - top };
      renderImageCropSelection();
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  }

  async function openImageCropper() {
    const box = selectedImage;
    const image = box?.querySelector('img');
    if (!box || !image) { toast('Select an image first.', 'error'); return; }
    if (box.dataset.rotationBusy === 'true') { toast('Wait for image rotation to finish.', 'error'); return; }
    try {
      await waitForImageReady(image);
      const sourceImage = new Image();
      sourceImage.src = image.currentSrc || image.src;
      await waitForImageReady(sourceImage);
      const viewport = window.visualViewport;
      const availableWidth = Math.max(220, Math.min(900, (viewport?.width || window.innerWidth) - (window.innerWidth <= 700 ? 28 : 80)));
      const availableHeight = Math.max(180, Math.min(650, (viewport?.height || window.innerHeight) - (window.innerWidth <= 700 ? 190 : 250)));
      const scale = Math.min(1, availableWidth / sourceImage.naturalWidth, availableHeight / sourceImage.naturalHeight);
      const canvas = ensureImageCropUi().querySelector('#bgpsImageCropCanvas');
      canvas.width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
      canvas.style.width = `${canvas.width}px`;
      canvas.style.height = `${canvas.height}px`;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('Image crop is not supported by this browser.');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
      cropState = {
        box, image, sourceImage, canvas, scale,
        rect: defaultImageCropRect(canvas)
      };
      renderImageCropSelection();
      const modal = byId('bgpsImageCropModal');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      syncMobilePaperBar();
    } catch (error) {
      closeImageCropper();
      toast(error.message || 'The image could not be opened for cropping.', 'error');
    }
  }

  async function applyImageCrop() {
    if (!cropState) return;
    const state = cropState;
    const applyButton = byId('bgpsImageCropModal')?.querySelector('[data-crop-action="apply"]');
    if (applyButton) { applyButton.disabled = true; applyButton.textContent = 'Croppingâ€¦'; }
    try {
      if (!state.box.isConnected) throw new Error('The selected image is no longer available.');
      const sourceX = Math.max(0, Math.min(state.sourceImage.naturalWidth - 1, Math.round(state.rect.x / state.scale)));
      const sourceY = Math.max(0, Math.min(state.sourceImage.naturalHeight - 1, Math.round(state.rect.y / state.scale)));
      const sourceWidth = Math.min(state.sourceImage.naturalWidth - sourceX, Math.max(1, Math.round(state.rect.width / state.scale)));
      const sourceHeight = Math.min(state.sourceImage.naturalHeight - sourceY, Math.max(1, Math.round(state.rect.height / state.scale)));
      if (sourceWidth < 10 || sourceHeight < 10) throw new Error('Crop area is too small.');
      const output = document.createElement('canvas');
      const outputScale = Math.min(1, 2400 / sourceWidth, 2400 / sourceHeight);
      output.width = Math.max(1, Math.round(sourceWidth * outputScale));
      output.height = Math.max(1, Math.round(sourceHeight * outputScale));
      const context = output.getContext('2d', { alpha: true });
      if (!context) throw new Error('Image crop is not supported by this browser.');
      context.drawImage(state.sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, output.width, output.height);
      const mime = imageMimeFromSource(state.image.currentSrc || state.image.src);
      const outputMime = ['image/png', 'image/jpeg', 'image/webp'].includes(mime) ? mime : 'image/png';
      const croppedSource = output.toDataURL(outputMime, outputMime === 'image/jpeg' ? 0.9 : undefined);
      state.image.src = croppedSource;
      await waitForImageReady(state.image);
      normalizeImageBoxGeometry(state.box);
      syncEditorFreeMoveHeight();
      if (state.box.classList.contains('bgps-img-free')) requestAnimationFrame(() => clampFreeImageOffset(state.box));
      ensureParagraphAfterImage(state.box);
      placeCaretAfterImage(state.box, { scroll: false });
      closeImageCropper();
      selectImage(state.box);
      markDirty();
      updateChecks();
      saveRange();
      toast('Image cropped. Save the paper to keep this change.');
    } catch (error) {
      toast(error.message || 'The image could not be cropped.', 'error');
    } finally {
      if (applyButton) { applyButton.disabled = false; applyButton.textContent = 'Apply Crop'; }
    }
  }

  function ensureImageCropControl() {
    const controls = byId('paperImageControls');
    const grid = controls?.querySelector('.image-action-grid');
    if (!grid) return null;
    ensureImageCropUi();
    let button = byId('cropPaperImage');
    if (!button) {
      button = document.createElement('button');
      button.id = 'cropPaperImage';
      button.type = 'button';
      button.title = 'Crop the selected image';
      button.textContent = 'Crop Image';
      button.addEventListener('click', openImageCropper);
      const rotateButton = ensureImageRotateControl();
      if (rotateButton?.parentElement === grid) rotateButton.insertAdjacentElement('afterend', button);
      else grid.appendChild(button);
    }
    return button;
  }


  function applyImageWidth(box, width) {
    // One sizing authority only: the Scale slider / resize handle.
    // Height stays automatic so the image never retains its old footprint.
    const value = Math.min(100, Math.max(20, Number(width) || 100));
    normalizeImageBoxGeometry(box);
    box.style.setProperty('--bgps-image-width', `${value}%`);
    box.style.width = `${value}%`;
    if (selectedImage === box) {
      if (byId('paperImageWidth')) byId('paperImageWidth').value = String(value);
      setText('paperImageWidthValue', `${Math.round(value)}%`);
    }
    if (box.classList.contains('bgps-img-free')) {
      requestAnimationFrame(() => {
        clampFreeImageOffset(box);
        syncEditorFreeMoveHeight();
      });
    } else {
      requestAnimationFrame(syncEditorFreeMoveHeight);
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
    ensureImageGeometryStyles();
    const safeX = Number.isFinite(Number(x)) ? Math.round(Number(x) * 10) / 10 : 0;
    const safeY = Number.isFinite(Number(y)) ? Math.round(Number(y) * 10) / 10 : 0;
    box.style.setProperty('--bgps-free-x', `${safeX}px`);
    box.style.setProperty('--bgps-free-y', `${safeY}px`);
    box.style.position = 'absolute';
    box.style.left = 'var(--bgps-free-x)';
    box.style.top = 'var(--bgps-free-y)';
    box.style.transform = 'none';
    box.style.margin = '0';
  }

  function enterAbsoluteFreeMode(box) {
    const editor = byId('paperContentEditor');
    if (!box || !editor) return { x: 0, y: 0 };
    ensureImageGeometryStyles();
    const alreadyStaged = Boolean(freeStageForBox(box));
    if (!alreadyStaged) ensureFreeStageForBox(box);
    const current = freeImageOffset(box);
    box.classList.remove('bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-floating', 'bgps-img-compact');
    box.classList.add('bgps-img-free');
    applyFreeImageOffset(box, current.x, current.y);
    syncEditorFreeMoveHeight();
    return freeImageOffset(box);
  }

  function resetFreeImageOffset(box) {
    if (!box) return;
    const stage = freeStageForBox(box);
    if (stage) {
      if (stage.children.length <= 1) {
        stage.parentNode?.insertBefore(box, stage);
        stage.remove();
      } else {
        stage.insertAdjacentElement('afterend', box);
      }
    }
    box.style.removeProperty('--bgps-free-x');
    box.style.removeProperty('--bgps-free-y');
    box.style.removeProperty('position');
    box.style.removeProperty('left');
    box.style.removeProperty('top');
    box.style.removeProperty('transform');
    box.style.removeProperty('margin');
    box.style.removeProperty('z-index');
    requestAnimationFrame(syncEditorFreeMoveHeight);
  }

  function clampFreeImageOffset(box) {
    const editor = byId('paperContentEditor');
    const stage = freeStageForBox(box);
    if (!box || !editor || !stage || !box.classList.contains('bgps-img-free')) return;
    const current = freeImageOffset(box);
    const boxRect = box.getBoundingClientRect();
    const stageWidth = Math.max(1, stage.clientWidth || editor.clientWidth);
    const maxX = Math.max(0, stageWidth - boxRect.width);
    const maxY = 2400;
    applyFreeImageOffset(
      box,
      Math.max(0, Math.min(maxX, current.x)),
      Math.max(0, Math.min(maxY, current.y))
    );
    syncEditorFreeMoveHeight();
  }

  function setImageLayout(layout) {
    if (!selectedImage) return;
    if (layout === 'free') {
      enterAbsoluteFreeMode(selectedImage);
      requestAnimationFrame(() => clampFreeImageOffset(selectedImage));
    } else {
      selectedImage.classList.remove('bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-floating', 'bgps-img-free', 'bgps-img-compact');
      resetFreeImageOffset(selectedImage);
      selectedImage.classList.add(`bgps-img-${layout}`);
    }
    applyImageWidth(selectedImage, imageWidth(selectedImage));
    updateImageInspector();
    markDirty();
    placeCaretAfterImage(selectedImage, { scroll: false });
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
    syncMobilePaperBar();
  }

  function deselectImage() {
    if (selectedImage) selectedImage.classList.remove('is-image-selected');
    selectedImage = null;
    updateImageInspector();
    syncMobilePaperBar();
  }

  function ensureImageClipboardPasteControl() {
    let button = byId('pastePaperImageGlobal');
    if (button) return button;
    const imageButton = byId('insertPaperImageButton');
    if (!imageButton?.parentElement) return null;
    button = document.createElement('button');
    button.id = 'pastePaperImageGlobal';
    button.type = 'button';
    button.className = imageButton.className;
    button.textContent = 'Paste Image';
    button.title = 'Paste the image that was copied or cut';
    button.hidden = true;
    button.addEventListener('click', pasteCopiedImage);
    imageButton.insertAdjacentElement('afterend', button);
    return button;
  }

  function syncImageClipboardControls() {
    const button = ensureImageClipboardPasteControl();
    if (button) button.hidden = !imageClipboard;
    const inspectorPaste = byId('pastePaperImage');
    if (inspectorPaste) inspectorPaste.disabled = !imageClipboard;
    const mobilePaste = mobilePaperBar?.querySelector('[data-mobile-paper-action="paste"]');
    if (mobilePaste) mobilePaste.hidden = !imageClipboard;
  }

  function updateImageInspector() {
    const active = Boolean(selectedImage && selectedImage.isConnected);
    setHidden('paperImageEmpty', active);
    setHidden('paperImageControls', !active);
    const rotateButton = ensureImageRotateControl();
    if (rotateButton) {
      rotateButton.disabled = !active || selectedImage?.dataset.rotationBusy === 'true';
      rotateButton.textContent = selectedImage?.dataset.rotationBusy === 'true' ? 'Rotating…' : 'Rotate 90°';
    }
    const cropButton = ensureImageCropControl();
    if (cropButton) cropButton.disabled = !active || selectedImage?.dataset.rotationBusy === 'true';
    if (!active) return;
    const width = imageWidth(selectedImage);
    if (byId('paperImageWidth')) byId('paperImageWidth').value = String(width);
    setText('paperImageWidthValue', `${Math.round(width)}%`);
    const layout = layoutForBox(selectedImage);
    document.querySelectorAll('[data-image-layout]').forEach((button) => button.classList.toggle('active', button.dataset.imageLayout === layout));
  }

  function bindImageBox(box) {
    if (!box) return;
    ensureImageGeometryStyles();
    if (!box.classList.contains('has-image')) box.classList.add('has-image');
    normalizeImageBoxGeometry(box);
    upgradeLegacyRotatedImage(box);
    if (!['bgps-img-left', 'bgps-img-center', 'bgps-img-right', 'bgps-img-inline', 'bgps-img-free'].some((name) => box.classList.contains(name))) box.classList.add('bgps-img-center');
    const width = imageWidth(box);
    box.style.setProperty('--bgps-image-width', `${width}%`);
    box.style.width = `${width}%`;
    if (box.classList.contains('bgps-img-free')) enterAbsoluteFreeMode(box);
    box.setAttribute('contenteditable', 'false');
    box.removeAttribute('draggable');
    ensureImageControls(box);
    const geometryImage = box.querySelector('img');
    if (geometryImage && geometryImage.dataset.bgpsGeometryBound !== 'true') {
      geometryImage.dataset.bgpsGeometryBound = 'true';
      geometryImage.addEventListener('load', () => requestAnimationFrame(syncEditorFreeMoveHeight));
    }
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
    ensureImageGeometryStyles();
    editor.querySelectorAll('.diagram-box.has-image').forEach(bindImageBox);
    ensureImageGeometryObserver();
    requestAnimationFrame(syncEditorFreeMoveHeight);
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
      normalizeImageBoxGeometry(box);
      requestAnimationFrame(() => {
        clampFreeImageOffset(box);
        syncEditorFreeMoveHeight();
      });
      placeCaretAfterImage(box, { scroll: false });
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
    const current = enterAbsoluteFreeMode(box);
    const stage = freeStageForBox(box);
    if (!stage) return;
    box.classList.add('is-moving-image');

    const boxRect = box.getBoundingClientRect();
    const stageWidth = Math.max(1, stage.clientWidth || editor.clientWidth);
    const maxX = Math.max(0, stageWidth - boxRect.width);
    const maxY = 2400;
    const startX = event.clientX;
    const startY = event.clientY;

    handle.setPointerCapture?.(event.pointerId);
    let nextX = current.x;
    let nextY = current.y;
    let raf = 0;

    const snapX = (value) => {
      const left = 0;
      const centre = Math.max(0, (stageWidth - boxRect.width) / 2);
      const right = maxX;
      for (const target of [left, centre, right]) {
        if (Math.abs(value - target) <= 9) return target;
      }
      return value;
    };

    const paint = () => {
      raf = 0;
      applyFreeImageOffset(box, nextX, nextY);
      syncEditorFreeMoveHeight();
    };

    const move = (moveEvent) => {
      nextX = snapX(Math.max(0, Math.min(maxX, current.x + moveEvent.clientX - startX)));
      nextY = Math.max(0, Math.min(maxY, current.y + moveEvent.clientY - startY));
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      paint();
      box.classList.remove('is-moving-image');
      clampFreeImageOffset(box);
      syncEditorFreeMoveHeight();
      placeCaretAfterImage(box, { scroll: false });
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
    ensureParagraphAfterImage(clone);
    placeCaretAfterImage(clone);
    syncEditorFreeMoveHeight();
    markDirty();
  }

  function copySelectedImage() {
    if (!selectedImage) return;
    imageClipboard = selectedImage.cloneNode(true);
    imageClipboard.removeAttribute('data-editor-bound');
    imageClipboard.classList.remove('is-image-selected');
    imageClipboard.querySelectorAll('.bgps-image-resize-handle,.bgps-image-drag-handle').forEach((node) => node.remove());
    syncImageClipboardControls();
    toast('Image copied.');
  }

  function cutSelectedImage() {
    if (!selectedImage) return;
    copySelectedImage();
    const target = selectedImage;
    placeCaretAfterImage(target, { scroll: false });
    deselectImage();
    target.remove();
    syncEditorFreeMoveHeight();
    syncImageClipboardControls();
    markDirty();
  }

  function pasteCopiedImage() {
    if (!imageClipboard) { toast('Copy or cut an image first.', 'error'); return; }
    let clone = imageClipboard.cloneNode(true);
    clone.removeAttribute('data-editor-bound');
    const editor = byId('paperContentEditor');
    if (!editor) return;
    if (selectedImage?.isConnected) {
      selectedImage.insertAdjacentElement('afterend', clone);
    } else {
      const token = `bgps-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      clone.dataset.bgpsPasteToken = token;
      insertHtml(clone.outerHTML);
      clone = editor.querySelector(`[data-bgps-paste-token="${token}"]`) || clone;
      clone.removeAttribute('data-bgps-paste-token');
      if (!clone.isConnected) editor.appendChild(clone);
    }
    bindImageBox(clone);
    selectImage(clone);
    ensureParagraphAfterImage(clone);
    placeCaretAfterImage(clone);
    syncEditorFreeMoveHeight();
    syncImageClipboardControls();
    markDirty();
    toast('Image pasted. You can paste it again if needed.');
  }

  async function replaceSelectedImage(file) {
    if (!selectedImage || !file) return;
    try {
      const source = await compressImage(file);
      const image = selectedImage.querySelector('img');
      if (!image) throw new Error('The selected image could not be replaced.');
      image.src = source;
      image.alt = file.name || 'Question paper diagram';
      await waitForImageReady(image);
      normalizeImageBoxGeometry(selectedImage);
      syncEditorFreeMoveHeight();
      placeCaretAfterImage(selectedImage, { scroll: false });
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
    syncEditorFreeMoveHeight();
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
    ensureParagraphAfterImage(dragImage);
    placeCaretAfterImage(dragImage);
    syncEditorFreeMoveHeight();
    dragImage = null;
    markDirty();
  }

  function insertImageSource(source, altText, widthPercent = 100) {
    const width = Math.min(100, Math.max(20, Number(widthPercent) || 100));
    const token = `bgps-image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const html = `<div class="diagram-box has-image bgps-img-center" data-bgps-insert-token="${token}" style="--bgps-image-width:${width}%;width:${width}%" contenteditable="false"><img class="diagram-image" src="${source}" alt="${escapeHtml(altText || 'Question paper diagram')}"></div><p><br></p>`;
    insertHtml(html);
    const editor = byId('paperContentEditor');
    const box = editor?.querySelector(`[data-bgps-insert-token="${token}"]`);
    box?.removeAttribute('data-bgps-insert-token');
    hydrateImages();
    if (box) {
      selectImage(box);
      ensureParagraphAfterImage(box);
      placeCaretAfterImage(box);
    }
    syncEditorFreeMoveHeight();
    return box;
  }

  async function insertImageFile(file) {
    try {
      const source = await compressImage(file);
      insertImageSource(source, 'Question paper diagram', 100);
      toast('Image inserted. Resize or position it using Selected Image controls.');
    } catch (error) {
      toast(error.message || 'The image could not be inserted.', 'error');
    } finally {
      if (byId('paperImageFile')) byId('paperImageFile').value = '';
    }
  }

  async function handlePaste(event) {
    const files = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length) {
      const hasClipboardText = Boolean(event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text/html'));
      if (imageClipboard && !hasClipboardText) {
        event.preventDefault();
        pasteCopiedImage();
      }
      return;
    }
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
      ? 'Upload the corrected DOCX. It will open in the full Paper Editor for final checking; the original file remains safely preserved.'
      : 'Upload a DOCX to import it into the full Paper Editor, or upload a PDF as reference-only. The original DOCX remains safely preserved.');
    const className = correctionPaper?.className || (session?.paperOnly ? '' : (session?.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0]));
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
    if (submitButton) submitButton.textContent = correctionPaper ? 'Import Corrected DOCX' : 'Continue';
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
        setUploadProgress('Importing the DOCX into the full paper editor. Images and the original file are being preserved...');
        const imported = await window.BGPS_API.importDocxPaper(payload);
        closeModal('paperUploadModal');
        byId('paperUploadForm')?.reset();
        uploadRevisionContext = null;
        await loadData(false);
        await openDraft(imported.draftId);
        toast(imported.message || 'DOCX imported. Verify images and marks before submission.');
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
    ensureSubpartControls();
    ensureMobilePaperExperience();
    ensureWorksheetVectorLibrary();
    ensureImageClipboardPasteControl();
    syncImageClipboardControls();

    window.addEventListener('online', () => {
      if (dirty && editorWorkspaceOpen()) {
        setAutosaveStatus('Internet restored · syncing…', 'dirty');
        scheduleServerAutosave(1200);
      }
      syncMobilePaperBar();
    });
    window.addEventListener('offline', () => {
      if (dirty && editorWorkspaceOpen()) setAutosaveStatus('Offline · safe on this device', 'dirty');
      scheduleLocalRecovery(0);
      syncMobilePaperBar();
    });
    window.addEventListener('beforeunload', (event) => {
      if (!dirty || !editorWorkspaceOpen()) return;
      scheduleLocalRecovery(0);
      event.preventDefault();
      event.returnValue = '';
    });

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
      if (command) {
        const action = command.dataset.editorCommand;
        if (action === 'subpartsAlpha') applySubpartList('alpha');
        else if (action === 'subpartsRoman') applySubpartList('roman');
        else execCommand(action);
      }
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

    let editorViewportRaf = 0;
    window.addEventListener('resize', () => {
      if (editorViewportRaf) cancelAnimationFrame(editorViewportRaf);
      editorViewportRaf = requestAnimationFrame(() => {
        editorViewportRaf = 0;
        const workspace = byId('paperEditorWorkspace');
        if (!workspace || workspace.hidden) return;
        byId('paperContentEditor')?.querySelectorAll('.diagram-box.has-image.bgps-img-free').forEach(clampFreeImageOffset);
        syncEditorFreeMoveHeight();
      });
    }, { passive: true });

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
        if (byId('bgpsVectorLibraryModal')?.classList.contains('open')) closeWorksheetVectorLibrary();
        else if (byId('bgpsImageCropModal')?.classList.contains('open')) closeImageCropper();
        else if (byId('teacherPaperPreviewModal')?.classList.contains('open')) closePreview();
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
    const defaultClass = session.paperOnly ? '' : (session.assignedClass && window.BGPS_DATA.CLASSES.includes(session.assignedClass) ? session.assignedClass : window.BGPS_DATA.CLASSES[0]);
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
    editRevision = 0;
    imageClipboard = null;
    syncImageClipboardControls();
    saveInFlight = false;
    submitInFlight = false;
    previewInFlight = false;
    uploadInFlight = false;
    uploadRevisionContext = null;
    pendingPdfUpload = null;
    clearAutosaveTimers();
    promptedRecoveryKeys.clear();
    if (imageGeometryObserver) { imageGeometryObserver.disconnect(); imageGeometryObserver = null; }
    document.body.classList.remove('bgps-paper-editor-active');
    if (mobilePaperBar) mobilePaperBar.hidden = true;
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
    closeWorksheetVectorLibrary();
  }

  window.BGPS_PAPER_CREATOR = Object.freeze({ onAuthenticated, reset, loadData, renderList, openNewPaper, openAdminEdit });
})();
