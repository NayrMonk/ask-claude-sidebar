// page-agent.js — runs on every page; extracts content for Claude.
// (Was content-page.js.) M0: identical extraction behavior, reorganized under src/ and
// using shared protocol/util globals (loaded before this file via manifest content_scripts).
// Supports: Google Slides (per-slide), Google Docs (per-page), Google Sheets,
//           PDFs (Chrome viewer), Google Drive previews, and generic web pages.

const { MSG } = globalThis.AskClaude;
const { cleanText, sleep } = globalThis.AskClaude.util;

let lastExtracted = '';

// Listen for extraction request from the side panel
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === MSG.EXTRACT_PAGE) {
    const mode = msg.mode || 'current';  // 'current' or 'all'
    // Async so slide extraction can wait for lazily-rendered content before
    // giving up (see extractPageContentWithRetry). The channel is kept open by
    // returning true below; the side panel awaits this response.
    extractPageContentWithRetry(mode).then(result => {
      lastExtracted = result.text;
      sendResponse(result);
    });
  }
  return true; // keep channel open for the async sendResponse above
});

// Slides (and some PDFs/Docs) render their content lazily, so a first pass right
// after the user clicks Read can find nothing even when the page is "loaded".
// For those types, if we come up empty, poll briefly and re-extract before
// surfacing a failure. Non-slide / already-populated results return immediately.
async function extractPageContentWithRetry(mode) {
  let result = extractPageContent(mode);
  if (result.type !== 'google_slides' || result.slideCount > 0) return result;

  for (let i = 0; i < 6 && result.slideCount === 0; i++) {
    await sleep(400);
    result = extractPageContent(mode);
  }
  return result;
}

// ── Main Extractor Router ──────────────────────────────────────────
function extractPageContent(mode) {
  const url   = location.href;
  const title = document.title;

  let result;
  if (url.includes('docs.google.com/presentation'))      result = extractSlides(title, url, mode);
  else if (url.includes('docs.google.com/document'))     result = extractDoc(title, url, mode);
  else if (url.includes('docs.google.com/spreadsheets')) result = extractSheet(title, url);
  else if (url.includes('drive.google.com/file'))        result = extractDriveFile(title, url);
  else if (isPDFPage())                                  result = extractPDF(title, url, mode);
  else                                                   result = extractGeneric(title, url);

  // For Google Drive–backed files, prepend a hint so Claude pulls the
  // authoritative copy through its OWN Google Drive connector (set up in
  // Claude's settings) rather than relying on our scraped text. The scraped
  // text stays as a fallback for when the connector isn't enabled.
  if (['google_slides', 'google_doc', 'google_sheet', 'google_drive'].includes(result.type)) {
    const driveUrl = canonicalDriveUrl(url, result.fileId);
    result.text =
      `I'm viewing this Google Drive file: "${result.title}"\n` +
      `Link: ${driveUrl}\n` +
      `If you have Google Drive connected, please open it directly from there ` +
      `to read the full, accurate content. Scraped text from the page is included ` +
      `below as a fallback.\n\n${result.text}`;
  }

  return result;
}

// Build a clean, shareable Drive/Docs link the connector can resolve.
function canonicalDriveUrl(url, fileId) {
  if (fileId) return `https://drive.google.com/file/d/${fileId}/view`;
  // Strip volatile fragments/query (e.g. #slide=..., ?usp=...) to the base doc URL.
  const m = url.match(/^(https:\/\/docs\.google\.com\/[^?#]+)/);
  return m ? m[1] : url;
}

// ── Google Slides ──────────────────────────────────────────────────
function extractSlides(title, url, mode) {
  // Detect current slide number from various indicators
  const currentSlideNum = detectCurrentSlide();
  const allSlides = extractAllSlides();

  if (mode === 'current' && currentSlideNum > 0 && currentSlideNum <= allSlides.length) {
    const slideText = allSlides[currentSlideNum - 1];
    return {
      type: 'google_slides',
      title,
      url,
      currentSlide: currentSlideNum,
      slideCount: allSlides.length,
      text: `[Google Slides: "${title}" — Slide ${currentSlideNum} of ${allSlides.length}]\n\n${slideText}`
    };
  }

  // All slides mode or fallback
  const text = allSlides.length
    ? allSlides.join('\n\n')
    : 'Could not extract slide text from the page. If you have Google Drive ' +
      'connected, Claude can still open this presentation from the link above.';

  return {
    type: 'google_slides',
    title,
    url,
    currentSlide: currentSlideNum || null,
    slideCount: allSlides.length,
    text: `[Google Slides: "${title}" — ${allSlides.length} slides]\n\n${text}`
  };
}

function detectCurrentSlide() {
  // Method 1: URL hash (e.g. #slide=3 or #slide=id.g1234abc)
  const hashMatch = location.hash.match(/slide=(?:id\.)?([\w-]+)/i);
  if (hashMatch) {
    const token = hashMatch[1];
    // Plain numeric hash → that's the slide number directly.
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n > 0) return n;
    }
    // Slide-id hash → find its index among the slide elements that carry it.
    const idEls = [...document.querySelectorAll('[data-slide-id], [id^="slide"]')];
    const idx = idEls.findIndex(el =>
      (el.getAttribute('data-slide-id') || el.id || '').includes(token)
    );
    if (idx >= 0) return idx + 1;
  }

  // Method 2: The slide number indicator in the UI
  const slideNumEl =
    document.querySelector('.punch-viewer-page-num-text-current') ||
    document.querySelector('[data-slide-id].punch-viewer-svgpage-a11yelement[aria-selected="true"]') ||
    document.querySelector('.docs-material-gm-slidenumber .goog-flat-menu-button-caption');

  if (slideNumEl) {
    const num = parseInt(slideNumEl.textContent.trim(), 10);
    if (num > 0) return num;
  }

  // Method 3: Selected thumbnail in the filmstrip. Index into the SAME list
  // extractAllSlides() builds, so "This slide" maps to the right entry.
  const allThumbs = getFilmstripThumbnails();
  const idx = allThumbs.findIndex(el =>
    el.getAttribute('aria-selected') === 'true' ||
    el.classList.contains('punch-filmstrip-thumbnail-selected')
  );
  if (idx >= 0) return idx + 1;

  // Method 4: Visible slide in the main viewport
  const visibleSlide = document.querySelector('.punch-viewer-svgpage-svgcontainer:not([style*="display: none"])');
  if (visibleSlide) {
    const allSvgPages = [...document.querySelectorAll('.punch-viewer-svgpage-svgcontainer')];
    const idx = allSvgPages.indexOf(visibleSlide);
    if (idx >= 0) return idx + 1;
  }

  // Method 5: Check aria-label patterns
  const ariaSlide = document.querySelector('[aria-current="page"], [aria-selected="true"][role="option"]');
  if (ariaSlide) {
    const label = ariaSlide.getAttribute('aria-label') || '';
    const match = label.match(/slide\s+(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }

  return 1; // Default to slide 1
}

// Left-hand filmstrip thumbnails. In the EDITOR these are inline <svg>s that hold
// every slide's text (the viewer-only `.punch-viewer-*` containers don't exist
// there), so they're our primary source for edit-mode extraction. Shared with
// detectCurrentSlide() so "This slide" mode indexes into the same list.
const FILMSTRIP_SELECTOR =
  '.punch-filmstrip-thumbnail, [class*="filmstrip-thumbnail"], ' +
  '[role="option"][aria-label*="slide" i]';

function getFilmstripThumbnails() {
  return [...document.querySelectorAll(FILMSTRIP_SELECTOR)];
}

function extractAllSlides() {
  // Ordered list of slide-page sources, broadest-fidelity first. We use the
  // first source that yields any text, so present/publish views and the editor
  // both flow through one code path.
  const sources = [
    // 1. Published viewer / present mode — one container per slide.
    () => [...document.querySelectorAll(
      '.punch-viewer-svgpage-svgcontainer, .punch-viewer-content [role="listitem"]'
    )],
    // 2. Editor filmstrip thumbnails — inline <svg> text for ALL slides.
    () => getFilmstripThumbnails(),
    // 3. Editor main canvas + legacy slide containers — full-fidelity current slide.
    () => [...document.querySelectorAll(
      '.punch-canvas-element, svg.sketchy-svg, .punch-slide, .sketchy-slide, ' +
      '[role="listitem"][aria-label]'
    )],
  ];

  for (const getEls of sources) {
    const slides = [];
    getEls().forEach((el, i) => {
      const texts = extractTextsFromElement(el);
      if (texts.length) slides.push(`Slide ${i + 1}:\n${texts.join('\n')}`);
    });
    if (slides.length) return slides;
  }

  // Last resort: gather every SVG <text>/<tspan> on the page (globally deduped,
  // in document order). We lose per-slide segmentation but Claude still gets the
  // deck's text instead of an empty "couldn't extract" stub.
  const seen = new Set();
  const allText = [];
  document.querySelectorAll('text, tspan').forEach(t => {
    const s = t.textContent.trim();
    if (s && !seen.has(s)) { seen.add(s); allText.push(s); }
  });
  return allText.length ? [allText.join('\n')] : [];
}

function extractTextsFromElement(el) {
  const texts = [];
  const seen = new Set();

  // SVG text elements (most reliable for Slides)
  el.querySelectorAll('text, tspan').forEach(t => {
    const s = t.textContent.trim();
    if (s && !seen.has(s)) { seen.add(s); texts.push(s); }
  });

  // If no SVG text, try regular text content
  if (!texts.length) {
    const raw = el.innerText || el.textContent || '';
    raw.split('\n').forEach(line => {
      const s = line.trim();
      if (s && !seen.has(s)) { seen.add(s); texts.push(s); }
    });
  }

  // Also check aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && !seen.has(ariaLabel.trim())) {
    texts.push(ariaLabel.trim());
  }

  return texts;
}

// ── Google Docs ────────────────────────────────────────────────────
function extractDoc(title, url, mode) {
  const pages = [...document.querySelectorAll('.kix-page')];

  if (mode === 'current' && pages.length > 1) {
    // Find the page most visible in the viewport
    const visiblePage = findVisiblePage(pages);
    const pageNum = pages.indexOf(visiblePage) + 1;
    const text = cleanText(visiblePage.innerText || visiblePage.textContent || '');

    return {
      type: 'google_doc',
      title,
      url,
      currentPage: pageNum,
      totalPages: pages.length,
      text: `[Google Doc: "${title}" — Page ${pageNum} of ${pages.length}]\n\n${text}`
    };
  }

  // Full document
  let text = '';
  if (pages.length) {
    pages.forEach((p, i) => {
      text += `--- Page ${i + 1} ---\n`;
      text += (p.innerText || p.textContent || '') + '\n\n';
    });
  } else {
    const editor = document.querySelector('[role="main"], .docs-editor, .kix-paginateddocumentplugin');
    text = editor ? (editor.innerText || editor.textContent || '') : document.body.innerText;
  }

  text = cleanText(text);
  return {
    type: 'google_doc',
    title,
    url,
    totalPages: pages.length || 1,
    text: `[Google Doc: "${title}"]\n\n${text}`
  };
}

function findVisiblePage(pages) {
  let bestPage = pages[0];
  let bestOverlap = 0;

  for (const page of pages) {
    const rect = page.getBoundingClientRect();
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const overlap = Math.max(0, bottom - top);

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestPage = page;
    }
  }
  return bestPage;
}

// ── Google Sheets ──────────────────────────────────────────────────
function extractSheet(title, url) {
  const activeSheet = document.querySelector(
    '.docs-sheet-tab-name.docs-sheet-active-tab, .docs-sheet-active-tab .docs-sheet-tab-caption'
  )?.textContent?.trim() || 'Sheet1';

  // Try to get cell data from the grid
  const cells = document.querySelectorAll('.cell-input, [role="gridcell"]');
  const rows = new Map();

  cells.forEach(cell => {
    const rowEl = cell.closest('[row-index], tr');
    const rowIdx = rowEl?.getAttribute('row-index') || '0';
    if (!rows.has(rowIdx)) rows.set(rowIdx, []);
    const val = (cell.innerText || cell.textContent || '').trim();
    if (val) rows.get(rowIdx).push(val);
  });

  let text = '';
  [...rows.entries()].sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([, cols]) => {
    text += cols.join('\t') + '\n';
  });

  if (!text.trim()) {
    const grid = document.querySelector('#waffle-grid-container, [role="grid"]');
    text = grid ? (grid.innerText || '') : 'Could not extract sheet data.';
  }

  return {
    type: 'google_sheet',
    title,
    url,
    sheet: activeSheet,
    text: `[Google Sheet: "${title}" — Sheet: ${activeSheet}]\n\n${cleanText(text)}`
  };
}

// ── PDF Detection & Extraction ─────────────────────────────────────
function isPDFPage() {
  // Chrome's built-in PDF viewer
  if (document.querySelector('embed[type="application/pdf"]')) return true;
  // URL ends with .pdf
  if (location.pathname.toLowerCase().endsWith('.pdf')) return true;
  // PDF.js viewer
  if (document.getElementById('viewer')?.classList.contains('pdfViewer')) return true;
  // Google Drive PDF preview
  if (location.href.includes('drive.google.com') && document.querySelector('.drive-viewer-paginated-page')) return true;
  return false;
}

function extractPDF(title, url, mode) {
  // Strategy 1: PDF.js viewer (used by many sites including Firefox's viewer)
  const pdfJsPages = document.querySelectorAll('.page[data-page-number], .pdfViewer .page');
  if (pdfJsPages.length > 0) {
    return extractPDFJsContent(pdfJsPages, title, url, mode);
  }

  // Strategy 2: Google Drive PDF preview
  const drivePages = document.querySelectorAll('.drive-viewer-paginated-page, .ndfHFb-c4YZDc-Wrber-LkdAo-e');
  if (drivePages.length > 0) {
    return extractDrivePDFContent(drivePages, title, url, mode);
  }

  // Strategy 3: Chrome's built-in embed viewer — limited extraction
  const embed = document.querySelector('embed[type="application/pdf"]');
  if (embed) {
    return {
      type: 'pdf',
      title: title || url.split('/').pop(),
      url,
      text: `[PDF: "${title || url.split('/').pop()}"]\n\nThis PDF is rendered by Chrome's built-in viewer. Connect Google Drive for full text extraction, or open it in a web-based PDF viewer.\n\nURL: ${url}`
    };
  }

  // Fallback: try to get any text on the page
  return {
    type: 'pdf',
    title,
    url,
    text: `[PDF: "${title}"]\n\n${cleanText(document.body.innerText || '')}`
  };
}

function extractPDFJsContent(pages, title, url, mode) {
  const allPages = [...pages];

  if (mode === 'current') {
    // Find the page currently most visible
    const visiblePage = findVisiblePage(allPages);
    const pageNum = parseInt(visiblePage.getAttribute('data-page-number') || '1', 10);
    const textLayer = visiblePage.querySelector('.textLayer, .text-layer');
    const text = textLayer ? cleanText(textLayer.innerText || '') : 'Text not yet rendered for this page.';

    return {
      type: 'pdf',
      title,
      url,
      currentPage: pageNum,
      totalPages: allPages.length,
      text: `[PDF: "${title}" — Page ${pageNum} of ${allPages.length}]\n\n${text}`
    };
  }

  // All pages
  let fullText = '';
  allPages.forEach(page => {
    const num = page.getAttribute('data-page-number') || '?';
    const textLayer = page.querySelector('.textLayer, .text-layer');
    const text = textLayer ? cleanText(textLayer.innerText || '') : '';
    if (text) fullText += `--- Page ${num} ---\n${text}\n\n`;
  });

  return {
    type: 'pdf',
    title,
    url,
    totalPages: allPages.length,
    text: `[PDF: "${title}" — ${allPages.length} pages]\n\n${fullText || 'Could not extract PDF text.'}`
  };
}

function extractDrivePDFContent(pages, title, url, mode) {
  const allPages = [...pages];

  if (mode === 'current') {
    const visiblePage = findVisiblePage(allPages);
    const pageNum = allPages.indexOf(visiblePage) + 1;
    const text = cleanText(visiblePage.innerText || visiblePage.textContent || '');

    return {
      type: 'pdf',
      title,
      url,
      currentPage: pageNum,
      totalPages: allPages.length,
      text: `[PDF: "${title}" — Page ${pageNum} of ${allPages.length}]\n\n${text}`
    };
  }

  let fullText = '';
  allPages.forEach((page, i) => {
    const text = cleanText(page.innerText || page.textContent || '');
    if (text) fullText += `--- Page ${i + 1} ---\n${text}\n\n`;
  });

  return {
    type: 'pdf',
    title,
    url,
    totalPages: allPages.length,
    text: `[PDF: "${title}" — ${allPages.length} pages]\n\n${fullText || 'Could not extract text.'}`
  };
}

// ── Google Drive File Preview ─────────────────────────────────────
function extractDriveFile(title, url) {
  // Try to get file ID from URL
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  const fileId = fileIdMatch ? fileIdMatch[1] : null;

  const text = document.querySelector('[role="main"]')?.innerText
    || document.body.innerText || '';

  return {
    type: 'google_drive',
    title,
    url,
    fileId,
    text: `[Google Drive: "${title}"]\n\n${cleanText(text)}`
  };
}

// ── Generic Web Page ──────────────────────────────────────────────
function extractGeneric(title, url) {
  const container =
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('main') ||
    document.querySelector('#content, #main, .content, .main') ||
    document.body;

  // Clone and remove noise
  const clone = container.cloneNode(true);
  ['nav','footer','aside','script','style','noscript','[role="navigation"]',
   '[role="banner"]','[aria-hidden="true"]','.ad','.ads','.advertisement',
   '#sidebar','#footer','#header','.cookie-banner','.popup'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  const text = cleanText(clone.innerText || clone.textContent || '');
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Truncate very long pages
  const maxLen = 12000;
  const truncated = text.length > maxLen;
  const finalText = truncated ? text.slice(0, maxLen) + '\n\n[...content truncated]' : text;

  return {
    type: 'webpage',
    title,
    url,
    wordCount,
    text: `[Page: "${title}"]\nURL: ${url}\n\n${finalText}`
  };
}
