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

  async function countPages(blob) {
    if (!(blob instanceof Blob)) throw new Error('The PDF data is unavailable.');
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
    const pageCount = Number(pdf.numPages || 0);
    if (typeof pdf.destroy === 'function') await pdf.destroy();
    return pageCount;
  }

  window.BGPS_PDF_PREVIEW = Object.freeze({ shouldUseCanvas, render, countPages });
})();
