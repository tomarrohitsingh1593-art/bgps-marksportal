(function () {
  'use strict';

  const PAGE_CLASS = 'bgps-a4-page';
  const DOCUMENT_CLASS = 'bgps-a4-document';
  const unsafeSelector = 'script,iframe,object,embed,form,input,button,textarea,select,option,link,meta,base';
  let renderSequence = 0;

  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const escapeAttribute = escapeHtml;
  const text = (value) => String(value == null ? '' : value).trim();

  function sourceChecksum(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (`00000000${(hash >>> 0).toString(16)}`).slice(-8);
  }

  function sanitizeLegacyHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '');
    wrapper.querySelectorAll(unsafeSelector).forEach((node) => node.remove());
    wrapper.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const raw = attribute.value || '';
        if (name.startsWith('on') || ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(raw))) {
          node.removeAttribute(attribute.name);
        }
        if (['contenteditable', 'draggable', 'tabindex'].includes(name)) node.removeAttribute(attribute.name);
      });
      node.classList.remove('is-image-selected', 'is-moving-image', 'bgps-edit-selected');
    });
    wrapper.querySelectorAll('[data-bgps-transient],.bgps-image-resize-handle,.bgps-image-drag-handle').forEach((node) => node.remove());
    return wrapper.innerHTML.trim();
  }

  function classNumber(value) {
    const raw = text(value);
    if (/^(playgroup|nursery|lkg|ukg)$/i.test(raw)) return 0;
    const match = raw.match(/(?:class|grade)\s*(\d+)/i);
    return match ? Number(match[1]) : 6;
  }

  function inferLayoutMode(source) {
    const explicit = text(source.layoutMode || source.printLayout).toLowerCase();
    if (['worksheet', 'formal'].includes(explicit)) return explicit;
    return classNumber(source.className) <= 5 ? 'worksheet' : 'formal';
  }

  function markValue(value) {
    const cleaned = text(value).replace(/<[^>]*>/g, ' ').replace(/^[\s[(]+|[\s)\]]+$/g, '').replace(/\s*(?:marks?|अंक)\s*$/i, '');
    if (!/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*$/.test(cleaned)) return 0;
    return cleaned.split('+').reduce((sum, part) => sum + (Number(part.trim()) || 0), 0);
  }

  function normalizedPaper(paper, contentHtml) {
    const source = paper && typeof paper === 'object' ? paper : {};
    const sanitizedContent = sanitizeLegacyHtml(contentHtml || source.editorHtml || '');
    return Object.freeze({
      paperId: text(source.paperId),
      teacherId: text(source.teacherId),
      teacherName: text(source.teacherName || source.teacherId || '—'),
      schoolName: text(source.schoolName || 'B. G. PUBLIC SCHOOL'),
      title: text(source.title || `${source.className || ''} ${source.subject || ''} ${source.exam || ''}`) || 'Question Paper',
      examName: text(source.examName || source.exam || 'EXAM / TERM'),
      className: text(source.className || '—'),
      subject: text(source.subject || '—'),
      duration: text(source.duration || source.timeAllowed || '—'),
      readingTime: text(source.readingTime || ''),
      maximumMarks: Number(source.maximumMarks || source.maxMarks || 0),
      date: text(source.date || source.examDate || '____________'),
      status: text(source.status || 'Submitted'),
      version: Number(source.version || 1),
      submittedAt: text(source.submittedAt || source.updatedAt || source.uploadedAt || ''),
      instructions: text(source.instructions),
      contentHtml: sanitizedContent,
      sourceType: text(source.sourceType || 'Legacy'),
      sourceDetectedMarks: Number(source.detectedMarks || source.a4PreviewDetectedMarks || source.standardPreviewDetectedMarks || 0),
      layoutMode: inferLayoutMode(source),
      sourceChecksum: sourceChecksum(sanitizedContent)
    });
  }

  function questionNumberFromNode(node) {
    const explicit = text(node?.dataset?.questionNumber);
    if (explicit) return explicit;
    const value = text(node?.textContent);
    const match = value.match(/^\s*(?:(?:Q|Question|प्रश्न)\s*\.?\s*)?(\d+)[.)-]?\s+/i);
    return match ? match[1] : '';
  }

  function isNamedQuestionText(value) {
    return /^\s*(?:(?:Q|Question|प्रश्न)\s*\.?\s*)\d+[.)-]?\s+/i.test(text(value));
  }

  function structuredQuestionNodes(sourceRoot) {
    const explicit = Array.from(sourceRoot.querySelectorAll('.question-line,[data-question-number]'));
    const namedExists = explicit.some((node) => isNamedQuestionText(node.textContent))
      || Array.from(sourceRoot.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')).some((node) => isNamedQuestionText(node.textContent));
    let candidates = explicit.filter((node) => {
      if (text(node?.dataset?.questionNumber)) return true;
      if (namedExists) return isNamedQuestionText(node.textContent);
      return Boolean(questionNumberFromNode(node) || node.querySelector('.mark-token'));
    });
    if (!candidates.length) {
      candidates = Array.from(sourceRoot.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li'))
        .filter((node) => isNamedQuestionText(node.textContent));
    }
    return candidates.filter((node) => !candidates.some((other) => other !== node && other.contains(node)));
  }

  function findTrailingMark(value) {
    const raw = String(value || '');
    const match = raw.match(/(?:\[|\()\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:marks?|अंक)?\s*(?:\]|\))\s*$/i);
    return match ? { token: match[0], value: match[1] } : null;
  }

  function ensureQuestionMarkTokens(root) {
    const candidates = Array.from(root.querySelectorAll('.question-line,[data-question-number],p,h1,h2,h3,h4,h5,h6'));
    const namedExists = candidates.some((node) => isNamedQuestionText(node.textContent));
    candidates.forEach((node) => {
      if (node.querySelector('.mark-token')) return;
      const value = text(node.textContent);
      const explicit = node.matches('.question-line,[data-question-number]');
      if (namedExists ? !isNamedQuestionText(value) : !(explicit && questionNumberFromNode(node))) return;
      const trailing = findTrailingMark(value);
      if (!trailing) return;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (let index = textNodes.length - 1; index >= 0; index -= 1) {
        const textNode = textNodes[index];
        const raw = String(textNode.nodeValue || '');
        const local = findTrailingMark(raw);
        if (!local) continue;
        textNode.nodeValue = raw.slice(0, raw.length - local.token.length).replace(/\s+$/, ' ');
        const mark = document.createElement('span');
        mark.className = 'mark-token';
        mark.textContent = `[${local.value}]`;
        textNode.parentNode.insertBefore(mark, textNode.nextSibling);
        break;
      }
    });
  }

  function nodeHasVisibleMarks(node) {
    if (!node) return false;
    if (node.querySelector('.mark-token')) return true;
    const value = text(node.textContent);
    return Boolean(findTrailingMark(value)
      || /\[\s*\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*\s*(?:marks?|अंक)?\s*\]/i.test(value)
      || /\(\s*\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*\s*(?:marks?|अंक)\s*\)/i.test(value));
  }

  function mainQuestionNodes(sourceRoot) {
    const nodes = structuredQuestionNodes(sourceRoot);
    const dataNumbered = nodes.filter((node) => text(node?.dataset?.questionNumber));
    if (dataNumbered.length) return dataNumbered;
    const named = nodes.filter((node) => isNamedQuestionText(node.textContent));
    if (named.length) return named;
    const marked = nodes.filter(nodeHasVisibleMarks);
    // Imported DOCX files often reset 1,2,3 for subparts. Lines carrying marks
    // are a much stronger signal for main questions than every numbered line.
    if (marked.length >= 2) return marked;
    return nodes;
  }

  function plainMarkValues(value, questionLike) {
    const raw = String(value || '');
    const found = [];
    const ranges = [];
    const add = (match, numberText) => {
      const start = Number(match.index || 0);
      const end = start + String(match[0] || '').length;
      if (ranges.some((range) => start < range.end && end > range.start)) return;
      const amount = markValue(numberText);
      if (!amount) return;
      ranges.push({ start, end });
      found.push(amount);
    };
    const square = /\[\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:marks?|अंक)?\s*\]/gi;
    let match;
    while ((match = square.exec(raw))) add(match, match[1]);
    const labelledParen = /\(\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*(?:marks?|अंक)\s*\)/gi;
    while ((match = labelledParen.exec(raw))) add(match, match[1]);
    if (questionLike) {
      const trailing = raw.match(/\(\s*(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*)\s*\)\s*$/i);
      if (trailing) {
        trailing.index = raw.lastIndexOf(trailing[0]);
        add(trailing, trailing[1]);
      }
    }
    return found;
  }

  function detectMarkAudit(paper, sourceRoot, questionNodes) {
    const explicitNodes = Array.from(sourceRoot.querySelectorAll('.mark-token'));
    const explicitTotal = explicitNodes.reduce((sum, node) => sum + markValue(node.textContent), 0);

    const clone = sourceRoot.cloneNode(true);
    clone.querySelectorAll('.mark-token').forEach((node) => node.remove());
    const blocks = Array.from(clone.querySelectorAll('.question-line,[data-question-number],p,h1,h2,h3,h4,h5,h6,li,td'))
      .filter((node) => !Array.from(node.children).some((child) => child.matches?.('.question-line,[data-question-number],p,h1,h2,h3,h4,h5,h6,li,td')));
    let supplementalTotal = 0;
    let supplementalCount = 0;
    blocks.forEach((node) => {
      const value = text(node.textContent);
      if (!value) return;
      const questionLike = node.matches('.question-line,[data-question-number]')
        || isNamedQuestionText(value)
        || Boolean(questionNumberFromNode(node));
      const values = plainMarkValues(value, questionLike);
      supplementalTotal += values.reduce((sum, amount) => sum + amount, 0);
      supplementalCount += values.length;
    });

    const domTotal = Number((explicitTotal + supplementalTotal).toFixed(2));
    const sourceTotal = Number(paper.sourceDetectedMarks || 0);
    const maximum = Number(paper.maximumMarks || 0);
    const candidates = [...new Set([domTotal, sourceTotal].filter((value) => Number.isFinite(value) && value > 0))];
    const exact = candidates.find((value) => maximum > 0 && Math.abs(value - maximum) <= 0.01);
    let detectedMarks = exact || 0;
    if (!detectedMarks && candidates.length) {
      const notOver = candidates.filter((value) => !maximum || value <= maximum + 0.01);
      detectedMarks = Math.max(...(notOver.length ? notOver : candidates));
    }
    detectedMarks = Number((detectedMarks || 0).toFixed(2));

    const markedQuestionCount = questionNodes.filter(nodeHasVisibleMarks).length;
    const highCoverage = questionNodes.length > 0 && markedQuestionCount >= questionNodes.length;
    const exactMatch = maximum > 0 && detectedMarks > 0 && Math.abs(detectedMarks - maximum) <= 0.01;
    return {
      detectedMarks,
      autoDetectedMarks: domTotal,
      sourceDetectedMarks: sourceTotal,
      explicitTotal: Number(explicitTotal.toFixed(2)),
      supplementalTotal: Number(supplementalTotal.toFixed(2)),
      explicitCount: explicitNodes.length,
      supplementalCount,
      markedQuestionCount,
      questionCount: questionNodes.length,
      exactMatch,
      confidence: exactMatch ? 'high' : (highCoverage ? 'medium' : 'low'),
      requiresAdminVerification: Boolean(maximum > 0 && (!exactMatch || detectedMarks === 0))
    };
  }

  function validatePaper(paper, sourceRoot) {
    const critical = [];
    const warnings = [];
    const bodyText = text(sourceRoot.textContent);
    if (!bodyText && !sourceRoot.querySelector('img,table')) critical.push('Paper content is empty.');
    if (!paper.className || paper.className === '—') critical.push('Class is missing.');
    if (!paper.subject || paper.subject === '—') critical.push('Subject is missing.');
    if (!paper.examName) critical.push('Exam name is missing.');
    if (!paper.duration || paper.duration === '—') critical.push('Time duration is missing.');
    if (!(paper.maximumMarks > 0)) critical.push('Maximum Marks must be greater than zero.');

    const questionNodes = mainQuestionNodes(sourceRoot);
    const numbers = questionNodes.map(questionNumberFromNode).filter(Boolean);
    const duplicates = numbers.filter((number, index) => numbers.indexOf(number) !== index);
    if (duplicates.length) {
      const explicitNumbering = questionNodes.some((node) => text(node?.dataset?.questionNumber) || isNamedQuestionText(node.textContent));
      const message = `Repeated main-question number${duplicates.length > 1 ? 's' : ''}: ${[...new Set(duplicates)].join(', ')}.`;
      if (explicitNumbering) critical.push(message);
      else warnings.push(`${message} Imported numbered subparts may be responsible; verify the sequence visually.`);
    }
    questionNodes.forEach((node, index) => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll('.mark-token').forEach((mark) => mark.remove());
      if (!text(clone.textContent) && !clone.querySelector('img,table')) critical.push(`Question ${numbers[index] || index + 1} is empty.`);
      if (!nodeHasVisibleMarks(node)) warnings.push(`Marks were not detected for main question ${numbers[index] || index + 1}.`);
    });

    const markAudit = detectMarkAudit(paper, sourceRoot, questionNodes);
    const detectedMarks = markAudit.detectedMarks;
    if (paper.maximumMarks > 0 && markAudit.exactMatch !== true) {
      const autoLabel = detectedMarks > 0 ? detectedMarks : 'no reliable total';
      warnings.push(`Automatic marks check found ${autoLabel} while Maximum Marks is ${paper.maximumMarks}. Verify the visible marks before saving; the Principal can confirm the declared total.`);
    }

    const images = Array.from(sourceRoot.querySelectorAll('img'));
    images.forEach((image, index) => {
      if (!text(image.getAttribute('src'))) critical.push(`Image ${index + 1} has no valid source.`);
    });
    if (!questionNodes.length) warnings.push('Legacy paper: main question blocks were not detected; content is preserved and requires visual review.');

    return {
      critical: [...new Set(critical)],
      warnings: [...new Set(warnings)],
      detectedMarks,
      declaredMarks: paper.maximumMarks,
      totalQuestions: questionNodes.length || (bodyText.match(/\b(?:(?:Q|Question|प्रश्न)\s*\.?\s*)\d+/gi) || []).length,
      imageCount: images.length,
      markAudit,
      valid: critical.length === 0
    };
  }

  function instructionMarkup(paper) {
    if (!paper.instructions) return '';
    const items = paper.instructions.split(/\n+/).map(text).filter(Boolean);
    if (!items.length) return '';
    return `<section class="bgps-a4-instructions"><strong>General Instructions</strong><ol>${items.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol></section>`;
  }

  function firstPageHeader(paper) {
    const readingTime = paper.readingTime ? `<span><b>Reading Time:</b> ${escapeHtml(paper.readingTime)}</span>` : '';
    return `<header class="bgps-a4-header bgps-a4-first-header">
      <h1>${escapeHtml(paper.schoolName)}</h1>
      <h2>${escapeHtml(paper.examName)}</h2>
      <div class="bgps-a4-header-rule"></div>
      <div class="bgps-a4-meta">
        <span><b>Subject:</b> ${escapeHtml(paper.subject)}</span><span><b>Class:</b> ${escapeHtml(paper.className)}</span>
        <span><b>Time:</b> ${escapeHtml(paper.duration)}</span><span><b>Maximum Marks:</b> ${escapeHtml(paper.maximumMarks)}</span>
        ${readingTime}<span><b>Date:</b> ${escapeHtml(paper.date)}</span>
      </div>
      <div class="bgps-a4-student-lines"><span><b>Name:</b> ______________________________</span><span><b>Roll No.:</b> ______________</span></div>
      ${instructionMarkup(paper)}
    </header>`;
  }

  function continuationHeader(paper) {
    return `<header class="bgps-a4-header bgps-a4-continuation-header"><strong>${escapeHtml(paper.schoolName)}</strong><span>${escapeHtml(paper.className)} · ${escapeHtml(paper.subject)} · ${escapeHtml(paper.examName)}</span></header>`;
  }

  function pageMarkup(paper, pageNumber, first) {
    const page = document.createElement('section');
    page.className = `${PAGE_CLASS} bgps-a4-layout-${paper.layoutMode}`;
    page.dataset.pageNumber = String(pageNumber);
    page.innerHTML = `${first ? firstPageHeader(paper) : continuationHeader(paper)}
      <main class="bgps-a4-page-body"></main>
      <footer class="bgps-a4-footer"><span>${escapeHtml(paper.schoolName)}</span><span>${escapeHtml(paper.examName)}</span><span class="bgps-a4-page-number">Page ${pageNumber}</span></footer>`;
    return page;
  }

  function rootContentNode(sourceRoot) {
    let root = sourceRoot.querySelector('.bgps-standardized-docx') || sourceRoot;
    while (root.children.length === 1 && root.firstElementChild?.tagName === 'DIV'
      && !root.firstElementChild.matches('.diagram-box,.question-line,.section-heading,.bgps-free-stage,[data-question-number],[data-question-type]')) {
      root = root.firstElementChild;
    }
    return root;
  }

  function normalizedChildElements(root) {
    return Array.from(root.childNodes).map((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) return node;
      if (node.nodeType === Node.TEXT_NODE && text(node.textContent)) {
        const paragraph = document.createElement('p');
        paragraph.textContent = node.textContent;
        return paragraph;
      }
      return null;
    }).filter(Boolean).filter((node) => {
      if (node.matches('script,style,.bgps-image-caret-paragraph')) return false;
      return text(node.textContent) || node.querySelector('img,table,.diagram-box') || node.matches('img,table,.diagram-box,.page-break');
    });
  }

  function isQuestionStart(node, allowBare) {
    if (node.matches('[data-question-number]')) return true;
    if (isNamedQuestionText(node.textContent)) return true;
    if (!allowBare) return false;
    return node.matches('.question-line') && Boolean(questionNumberFromNode(node) || node.querySelector('.mark-token'));
  }

  function contentBlocks(sourceRoot, paper) {
    const root = rootContentNode(sourceRoot);
    const children = normalizedChildElements(root);
    if (paper.layoutMode !== 'worksheet') return children;

    const grouped = [];
    const allowBareQuestionStarts = !children.some((node) => isNamedQuestionText(node.textContent));
    let card = null;
    const flush = () => {
      if (!card) return;
      grouped.push(card);
      card = null;
    };

    children.forEach((node) => {
      if (node.matches('.page-break') || node.dataset.manualPageBreakBefore === 'true') {
        flush();
        grouped.push(node);
        return;
      }
      if (node.matches('.section-heading')) {
        flush();
        grouped.push(node);
        return;
      }
      if (isQuestionStart(node, allowBareQuestionStarts)) {
        flush();
        card = document.createElement('section');
        card.className = 'bgps-a4-question-card';
        card.dataset.questionNumber = questionNumberFromNode(node) || '';
        card.appendChild(node.cloneNode(true));
        return;
      }
      if (card) {
        card.appendChild(node.cloneNode(true));
      } else {
        grouped.push(node);
      }
    });
    flush();
    return grouped;
  }

  function waitForImage(image, timeoutMs) {
    if (image.complete) return Promise.resolve(image.naturalWidth > 0);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), timeoutMs);
      image.addEventListener('load', () => { window.clearTimeout(timer); resolve(true); }, { once: true });
      image.addEventListener('error', () => { window.clearTimeout(timer); resolve(false); }, { once: true });
    });
  }

  async function waitForPreviewAssets(root) {
    try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}
    const results = await Promise.all(Array.from(root.querySelectorAll('img')).map((image) => waitForImage(image, 8000)));
    return results.filter((ready) => !ready).length;
  }

  function overflowing(body) {
    const bounds = body.getBoundingClientRect();
    const last = body.lastElementChild;
    const lastBottom = last ? last.getBoundingClientRect().bottom : bounds.top;
    return body.scrollHeight > body.clientHeight + 2 || lastBottom > bounds.bottom + 1;
  }

  async function nextFrame() {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  async function placeOversizeBlock(block, body, createPage) {
    const originalClass = block.className;
    const directChildren = Array.from(block.children);

    if (block.matches('table')) {
      const rows = Array.from(block.querySelectorAll('tr'));
      if (rows.length > 1) {
        const headerRows = rows.filter((row) => row.parentElement?.tagName === 'THEAD');
        const bodyRows = rows.filter((row) => row.parentElement?.tagName !== 'THEAD');
        let table = block.cloneNode(false);
        table.className = originalClass;
        let tbody = document.createElement('tbody');
        if (headerRows.length) {
          const thead = document.createElement('thead');
          headerRows.forEach((row) => thead.appendChild(row.cloneNode(true)));
          table.appendChild(thead);
        }
        table.appendChild(tbody);
        body.appendChild(table);
        for (const row of bodyRows) {
          const clone = row.cloneNode(true);
          tbody.appendChild(clone);
          await nextFrame();
          if (!overflowing(body)) continue;
          tbody.removeChild(clone);
          body = createPage();
          table = block.cloneNode(false);
          table.className = `${originalClass} bgps-a4-continued-block`.trim();
          if (headerRows.length) {
            const thead = document.createElement('thead');
            headerRows.forEach((header) => thead.appendChild(header.cloneNode(true)));
            table.appendChild(thead);
          }
          tbody = document.createElement('tbody');
          tbody.appendChild(clone);
          table.appendChild(tbody);
          body.appendChild(table);
        }
        return body;
      }
    }

    if (directChildren.length > 1) {
      let segment = block.cloneNode(false);
      segment.className = originalClass;
      body.appendChild(segment);
      for (const child of directChildren) {
        if (!segment || !segment.isConnected) {
          segment = block.cloneNode(false);
          segment.className = `${originalClass} bgps-a4-continued-block`.trim();
          body.appendChild(segment);
        }
        const clone = child.cloneNode(true);
        segment.appendChild(clone);
        await nextFrame();
        if (!overflowing(body)) continue;
        segment.removeChild(clone);
        body = createPage();
        segment = block.cloneNode(false);
        segment.className = `${originalClass} bgps-a4-continued-block`.trim();
        segment.appendChild(clone);
        body.appendChild(segment);
        await nextFrame();
        if (overflowing(body)) {
          segment.remove();
          body = await placeOversizeBlock(clone, body, createPage);
          segment = null;
        }
      }
      return body;
    }

    const words = text(block.textContent).split(/\s+/).filter(Boolean);
    if (words.length > 1 && !block.querySelector('img,table')) {
      let start = 0;
      while (start < words.length) {
        const segment = block.cloneNode(false);
        segment.className = `${originalClass}${start ? ' bgps-a4-continued-block' : ''}`.trim();
        body.appendChild(segment);
        let low = start + 1;
        let high = words.length;
        let best = start;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          segment.textContent = words.slice(start, middle).join(' ');
          await nextFrame();
          if (overflowing(body)) high = middle - 1;
          else { best = middle; low = middle + 1; }
        }
        if (best === start) best = start + 1;
        segment.textContent = words.slice(start, best).join(' ');
        start = best;
        if (start < words.length) body = createPage();
      }
      return body;
    }

    block.classList.add('bgps-a4-scale-to-page');
    body.appendChild(block);
    return body;
  }

  async function paginatePaper(paper, sourceRoot) {
    const measurement = document.createElement('div');
    measurement.className = `${DOCUMENT_CLASS} bgps-a4-measurement bgps-a4-document-${paper.layoutMode}`;
    document.body.appendChild(measurement);
    const blocks = contentBlocks(sourceRoot, paper);
    const pages = [];

    const createPage = () => {
      const page = pageMarkup(paper, pages.length + 1, pages.length === 0);
      measurement.appendChild(page);
      pages.push(page);
      return page.querySelector('.bgps-a4-page-body');
    };

    let body = createPage();
    for (const sourceBlock of blocks) {
      if (sourceBlock.classList.contains('page-break') || sourceBlock.dataset.manualPageBreakBefore === 'true') {
        if (body.children.length) body = createPage();
        continue;
      }
      const block = sourceBlock.cloneNode(true);
      block.classList.add('bgps-a4-content-block');
      body.appendChild(block);
      await nextFrame();
      if (!overflowing(body)) continue;

      body.removeChild(block);
      if (body.children.length) body = createPage();
      body.appendChild(block);
      await nextFrame();
      if (overflowing(body)) {
        body.removeChild(block);
        body = await placeOversizeBlock(block, body, createPage);
      }
    }

    const total = pages.length;
    pages.forEach((page, index) => {
      const number = page.querySelector('.bgps-a4-page-number');
      if (number) number.textContent = `Page ${index + 1} of ${total}`;
    });
    const scaleWarnings = measurement.querySelectorAll('.bgps-a4-scale-to-page').length;
    const html = measurement.innerHTML;
    measurement.remove();
    return { html, pageCount: total, scaleWarnings };
  }

  function documentStyles() {
    return `
      @page{size:A4;margin:0}*{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;color:#16283f;font-family:"Noto Sans Devanagari","Nirmala UI","Mangal","Segoe UI",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .${DOCUMENT_CLASS}{display:grid;justify-items:center;gap:10mm;background:#dfe6ed;padding:10mm}
      .${PAGE_CLASS}{display:flex;flex-direction:column;width:210mm;height:297mm;padding:11mm 13mm 9mm;background:#fff;overflow:hidden;page-break-after:always;break-after:page}
      .${PAGE_CLASS}:last-child{page-break-after:auto;break-after:auto}
      .bgps-a4-header{flex:0 0 auto;color:#142f52}.bgps-a4-first-header{padding:5mm 6mm 4mm;border:.55mm solid #173c67;border-radius:3mm;background:#f5f8fc;text-align:center;margin-bottom:4mm}
      .bgps-a4-first-header h1{margin:0;font-family:Georgia,"Noto Serif Devanagari",serif;font-size:19pt;line-height:1.05;letter-spacing:1pt}.bgps-a4-first-header h2{margin:2mm 0 1.8mm;color:#2868aa;font-size:12.5pt;line-height:1.2}
      .bgps-a4-header-rule{height:.2mm;margin:0 0 2mm;background:#c7d7e8}.bgps-a4-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1.7mm 5mm;text-align:left;font-size:9pt}.bgps-a4-meta span{white-space:normal}.bgps-a4-meta span:nth-child(4n+3),.bgps-a4-meta span:nth-child(4n+4){text-align:right}
      .bgps-a4-student-lines{display:flex;justify-content:space-between;gap:8mm;margin-top:2.5mm;font-size:9pt}.bgps-a4-instructions{margin-top:2.5mm;padding:1.8mm 2.5mm;border:.25mm solid #8da7c1;border-radius:1.5mm;background:#fff;text-align:left;font-size:8.5pt}.bgps-a4-instructions ol{margin:1mm 0 0 5mm;padding:0}
      .bgps-a4-continuation-header{display:flex;justify-content:space-between;gap:8mm;border-bottom:.35mm solid #173c67;padding-bottom:1.8mm;margin-bottom:3mm;color:#173c67;font-size:8.8pt}
      .bgps-a4-page-body{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;font-size:10.4pt;line-height:1.4}.bgps-a4-page-body p{margin:1.6mm 0;white-space:pre-wrap}.bgps-a4-content-block{max-width:100%}
      .bgps-a4-layout-worksheet .bgps-a4-page-body{font-size:10.6pt;line-height:1.42}.bgps-a4-question-card{margin:0 0 2.8mm;padding:0;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;break-inside:avoid;page-break-inside:avoid}.bgps-a4-question-card.bgps-a4-continued-block{padding-top:1mm}.bgps-a4-question-card>.question-line:first-child{margin-top:0;color:#173c67;font-weight:800}
      .bgps-a4-page-body .question-block,.bgps-a4-page-body .question-card,.bgps-a4-page-body .paper-question,.bgps-a4-page-body .bgps-question-block{border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;padding:0!important}
      .bgps-a4-page-body .question-line{display:block;position:relative;padding-right:13mm;font-weight:650;break-inside:avoid;page-break-inside:avoid}.bgps-a4-page-body .mark-token{float:right;min-width:10mm;margin-left:2mm;color:#526b86;text-align:right;font-weight:800;white-space:nowrap}
      .bgps-a4-page-body .section-heading{display:flex;justify-content:space-between;gap:5mm;margin:3mm 0 1.8mm;padding:1.8mm 2.5mm;border:.3mm solid #173c67;border-radius:1.4mm;background:#edf4fb;color:#173c67;font-weight:800}
      .bgps-a4-layout-formal .bgps-a4-page-body .question-line{border-bottom:.15mm solid #e0e6ec;padding-bottom:1mm;margin-top:2.2mm}.bgps-a4-layout-formal .bgps-a4-page-body .question-line:last-child{border-bottom:0}
      .bgps-a4-page-body table{width:100%;max-width:100%;border-collapse:collapse;margin:2mm 0;break-inside:avoid}.bgps-a4-page-body td,.bgps-a4-page-body th{border:.25mm solid #52677d;padding:1.6mm}.bgps-a4-page-body th{background:#f2f5f8}
      .bgps-a4-page-body img{display:block;max-width:100%;max-height:185mm;width:auto;height:auto;object-fit:contain}.bgps-a4-page-body .diagram-box.has-image,.bgps-a4-page-body figure{max-width:100%;break-inside:avoid;page-break-inside:avoid}.bgps-a4-page-body .bgps-img-center{margin:2mm auto;text-align:center}.bgps-a4-page-body .bgps-img-left{float:left;max-width:48%;margin:1mm 3mm 2mm 0}.bgps-a4-page-body .bgps-img-right{float:right;max-width:48%;margin:1mm 0 2mm 3mm}
      .bgps-a4-page-body .bgps-free-stage{position:relative;height:var(--bgps-free-print-height,var(--bgps-free-stage-height,24px));min-height:0;clear:both}.bgps-a4-page-body .bgps-free-stage>.bgps-img-free{position:absolute;left:var(--bgps-free-x,0);top:var(--bgps-free-y,0);max-width:100%}
      .bgps-a4-page-body ol.bgps-subparts-alpha,.bgps-a4-page-body ol.bgps-subparts-roman{list-style:none;counter-reset:bgps-subpart;margin:2mm 0 2mm 9mm;padding:0}.bgps-a4-page-body ol.bgps-subparts-alpha>li,.bgps-a4-page-body ol.bgps-subparts-roman>li{position:relative;counter-increment:bgps-subpart;padding-left:8mm;margin:1mm 0}.bgps-a4-page-body ol.bgps-subparts-alpha>li:before,.bgps-a4-page-body ol.bgps-subparts-roman>li:before{position:absolute;left:0;font-weight:700}.bgps-a4-page-body ol.bgps-subparts-alpha>li:before{content:"(" counter(bgps-subpart,lower-alpha) ")"}.bgps-a4-page-body ol.bgps-subparts-roman>li:before{content:"(" counter(bgps-subpart,lower-roman) ")"}
      .bgps-a4-page-body .answer-line{display:inline-block;min-width:32mm;border-bottom:.35mm solid #52677d}.bgps-a4-page-body .answer-box{display:inline-block;min-width:9mm;min-height:7mm;border:.25mm solid #52677d;border-radius:1mm}.bgps-a4-scale-to-page{max-height:100%;overflow:hidden;font-size:85%}
      .bgps-a4-footer{display:flex;justify-content:space-between;gap:5mm;flex:0 0 auto;border-top:.2mm solid #8fa1b2;padding-top:1.6mm;margin-top:2mm;color:#52677d;font-size:7.6pt}
      @media print{.${DOCUMENT_CLASS}{display:block;background:#fff;padding:0;gap:0}.${PAGE_CLASS}{margin:0;box-shadow:none}}
    `;
  }

  function serializeDocument(paper, pagesHtml) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(paper.title)}</title><style>${documentStyles()}</style></head><body><main class="${DOCUMENT_CLASS} bgps-a4-document-${escapeAttribute(paper.layoutMode)}" data-paper-id="${escapeAttribute(paper.paperId)}" data-paper-version="${escapeAttribute(paper.version)}" data-source-checksum="${escapeAttribute(paper.sourceChecksum)}">${pagesHtml}</main></body></html>`;
  }

  async function render(options) {
    const sequence = ++renderSequence;
    const mount = options?.mount;
    if (!mount) throw new Error('A4 preview mount is missing.');
    const paper = normalizedPaper(options.paper, options.contentHtml);
    mount.innerHTML = '<div class="bgps-a4-loading"><strong>Preparing paper preview…</strong><span>Loading fonts, images and page measurements.</span></div>';

    const sourceRoot = document.createElement('div');
    sourceRoot.className = 'bgps-a4-source';
    sourceRoot.innerHTML = paper.contentHtml;
    ensureQuestionMarkTokens(sourceRoot);
    sourceRoot.style.cssText = 'position:fixed;left:-100000px;top:0;width:184mm;visibility:hidden;pointer-events:none';
    document.body.appendChild(sourceRoot);
    const failedImages = await waitForPreviewAssets(sourceRoot);
    if (sequence !== renderSequence) { sourceRoot.remove(); throw new Error('A newer preview request replaced this one.'); }
    const validation = validatePaper(paper, sourceRoot);
    if (failedImages) validation.critical.push(`${failedImages} image${failedImages === 1 ? '' : 's'} could not be loaded.`);
    const paginated = await paginatePaper(paper, sourceRoot);
    sourceRoot.remove();
    if (paginated.scaleWarnings) validation.warnings.push(`${paginated.scaleWarnings} oversized block${paginated.scaleWarnings === 1 ? '' : 's'} had to be reduced to fit an A4 page. Verify readability.`);
    validation.critical = [...new Set(validation.critical)];
    validation.warnings = [...new Set(validation.warnings)];
    validation.valid = validation.critical.length === 0;

    mount.innerHTML = `<main class="${DOCUMENT_CLASS} bgps-a4-document-${escapeAttribute(paper.layoutMode)}">${paginated.html}</main>`;
    const state = {
      paper,
      sourceHtml: paper.contentHtml,
      sourceChecksum: paper.sourceChecksum,
      pagesHtml: paginated.html,
      pageCount: paginated.pageCount,
      validation,
      documentHtml: serializeDocument(paper, paginated.html)
    };
    return Object.freeze(state);
  }

  function print(state) {
    if (!state?.documentHtml) throw new Error('Prepare the A4 preview first.');
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'BGPS paper print');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;right:0;bottom:0;border:0;opacity:0';
    document.body.appendChild(frame);
    frame.onload = () => {
      window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => frame.remove(), 1500);
      }, 250);
    };
    frame.srcdoc = state.documentHtml;
  }

  window.BGPS_A4_RENDERER = Object.freeze({
    render,
    print,
    normalizePaperData: normalizedPaper,
    validatePaperForSubmission: validatePaper,
    waitForPreviewAssets,
    documentStyles,
    sourceChecksum
  });
})();
