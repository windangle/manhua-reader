'use strict';
/**
 * 电子书（PDF / EPUB / MOBI / AZW3）解析与渲染
 * - PDF：pdf.js（pdfjs-dist，Apache-2.0）
 * - EPUB / MOBI / AZW3：foliate-js（MIT，见 vendor/foliate/LICENSE）
 */

const SCHEME = 'comic';
const localUrl = (p) => SCHEME + '://local/' + encodeURIComponent(p);
const zipUrl = (p, e) => SCHEME + '://zip/' + encodeURIComponent(p) + '/' + encodeURIComponent(e);

const unzlib = async (data) => {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
};

const READ_CSS = [
  'html, body { margin: 0; padding: 0; background: transparent; }',
  'body { font-family: "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif;',
  '  font-size: 17px; line-height: 1.85; color: #1b1b1b; text-align: justify;',
  '  padding: 18px 20px 30px; word-break: break-word; -webkit-font-smoothing: antialiased; }',
  'p { margin: 0 0 .85em; text-indent: 2em; }',
  'h1, h2, h3, h4 { text-indent: 0; margin: 1.2em 0 .6em; line-height: 1.4; }',
  'h1 { font-size: 1.5em; text-align: center; }',
  'img { max-width: 100%; height: auto; }',
  'blockquote { margin: 1em 2em; color: #555; }',
  'table { border-collapse: collapse; } td, th { border: 1px solid #bbb; padding: 4px 8px; }',
  'hr { border: 0; border-top: 1px solid #ccc; margin: 1.6em 0; }',
  'a { pointer-events: none; color: inherit; text-decoration: none; }',
  'img { background: #f2f2f2; }',
  'body.img-only img, body.img-only svg image { width: 100% !important; height: auto !important; }',
  'body.img-only { padding: 0; text-align: left; }',
].join('\n');

/* ---------------------------- PDF ---------------------------- */
let pdfWorkerReady = null;

/** 用 blob 方式启动真正的 worker（file:// 无法直接 new Worker(file://)） */
async function setupPdfWorker(pdfjs) {
  if (pdfWorkerReady) return pdfWorkerReady;
  pdfWorkerReady = (async () => {
    try {
      const src = await (await fetch('./vendor/pdf.worker.min.mjs')).text();
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const worker = new Worker(url, { type: 'module' });
      pdfjs.GlobalWorkerOptions.workerPort = worker;
      return 'worker';
    } catch (e) {
      // 退化方案：pdf.js 在主线程解析
      pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
      return 'main';
    }
  })();
  return pdfWorkerReady;
}

async function openPdf(source) {
  const pdfjs = await import('./vendor/pdf.min.mjs');
  const mode = await setupPdfWorker(pdfjs);

  const res = await fetch(localUrl(source.path));
  if (!res.ok) throw new Error('无法读取 PDF 文件');
  const data = new Uint8Array(await res.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  let title = '';
  let author = '';
  try {
    const meta = await doc.getMetadata();
    const info = (meta && meta.info) || {};
    title = info.Title || '';
    author = info.Author || '';
  } catch (_) { /* 元数据可缺失 */ }

  return {
    kind: 'pdf',
    workerMode: mode,
    title,
    author,
    pageCount: doc.numPages,
    toc: null,
    doc,

    async pageSize(i) {
      try {
        const p = await doc.getPage(i + 1);
        const vp = p.getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height };
      } catch (_) { return null; }
    },

    async renderPage(i, box, zoom) {
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const ratio = base.width / base.height;
      box.style.aspectRatio = base.width + ' / ' + base.height;

      const cssW = box.clientWidth || 800;
      const cssH = box.clientHeight || Math.round(cssW / ratio);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = Math.max(cssW / base.width, cssH / base.height) * zoom * dpr;
      const vp = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(vp.width));
      canvas.height = Math.max(1, Math.ceil(vp.height));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';

      box.innerHTML = '';
      box.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return { width: base.width, height: base.height };
    },
  };
}

/* ---------------------------- EPUB ---------------------------- */
async function openEpub(source) {
  const { EPUB } = await import('../vendor/foliate/epub.js');
  const sha1 = async (data) => {
    const d = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const fs = {
    loadText: async (uri) => {
      const r = await fetch(zipUrl(source.path, uri));
      return r.ok ? await r.text() : null;
    },
    loadBlob: async (uri) => {
      const r = await fetch(zipUrl(source.path, uri));
      return r.ok ? await r.blob() : null;
    },
    getSize: async (uri) => {
      const r = await fetch(zipUrl(source.path, uri), { method: 'HEAD' });
      return r.ok ? Number(r.headers.get('content-length') || 0) : 0;
    },
    sha1,
  };
  const epub = new EPUB(fs);
  await epub.init();
  const sections = (epub.sections || []).filter(Boolean);
  const meta = epub.metadata || {};
  const pick = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
  const zipBase = 'comic://zip/' + encodeURIComponent(source.path) + '/';
  return makeTextBook({
    sections,
    kind: 'epub',
    title: pick(meta.title),
    author: pick(meta.creator),
    toc: epub.toc || null,
    baseFor: (section) => {
      const id = section.id || '';
      const i = id.lastIndexOf('/');
      const dir = i >= 0 ? id.slice(0, i + 1) : '';
      if (!dir) return zipBase;                       // 根目录
      const enc = dir.split('/').filter(Boolean).map(encodeURIComponent).join('/');
      return zipBase + enc + '/';                    // 必须带结尾斜杠，否则相对路径会少一层
    },
    matchToc: (href) => {
      const clean = String(href || '').split('#')[0];
      if (!clean) return -1;
      return sections.findIndex((s) => s.id === clean
        || s.id.endsWith('/' + clean) || clean.endsWith('/' + s.id));
    },
  });
}

/* ------------------------- MOBI / AZW3 ------------------------- */
async function openMobi(source) {
  const { MOBI } = await import('../vendor/foliate/mobi.js');
  const res = await fetch(localUrl(source.path));
  if (!res.ok) throw new Error('无法读取 MOBI 文件');
  const buf = await res.arrayBuffer();
  const file = new File([buf], source.name || 'book');
  const parser = new MOBI({ unzlib });
  const book = await parser.open(file);        // 返回的是书籍对象（MOBI6 / KF8）
  // DRM 检查（PalmDOC 头的 encryption 字段非 0 即为加密书）
  const enc = parser.headers && parser.headers.palmdoc ? parser.headers.palmdoc.encryption : 0;
  if (enc) throw new Error('该 MOBI/AZW3 带 DRM 保护，无法读取（请换用无 DRM 的版本）');
  const sections = (book && book.sections || []).filter(Boolean);
  const meta = (book && book.metadata) || {};
  const starts = [];
  let acc = 0;
  for (const s of sections) { starts.push(acc); acc += s.size || 0; }
  return makeTextBook({
    sections,
    kind: 'mobi',
    title: meta.title || '',
    author: meta.author || '',
    toc: (book && book.toc) || null,
    matchToc: (href) => {
      const m = /filepos:(\d+)/.exec(String(href || ''));
      if (!m) return -1;
      const pos = Number(m[1]);
      let idx = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i] <= pos) idx = i;
      return idx;
    },
  });
}

/* --------------------- 文本类书籍（章节=页面） --------------------- */
function makeTextBook({ sections, title, author, toc, matchToc, baseFor, kind }) {
  const flat = [];
  const walk = (items, depth) => {
    for (const it of items || []) {
      let idx = -1;
      try { idx = matchToc ? matchToc(it.href) : -1; } catch (_) { idx = -1; }
      flat.push({ label: it.label || '', href: it.href, depth, index: idx });
      if (it.subitems) walk(it.subitems, depth + 1);
    }
  };
  walk(toc, 0);

  return {
    kind: 'text',
    bookKind: kind || 'text',
    title: title || '',
    author: author || '',
    pageCount: sections.length,
    sections,
    toc: flat,

    async renderPage(i, box, zoom) {
      const section = this.sections[i];
      if (!section) return null;

      let inner = '<p>（本章内容无法解析）</p>';
      let styles = '';
      let base = '';
      if (this.bookKind === 'mobi') {
        // MOBI：用 load() 取已把资源内联（kindle:embed → blob）的完整文档
        try {
          const blobUrl = await section.load();
          inner = await (await fetch(blobUrl)).text();
        } catch (e) {
          console.warn('[doc] MOBI 章节加载失败', e);
          try {
            const doc = await section.createDocument();
            inner = doc && doc.body ? doc.body.innerHTML : inner;
          } catch (_) { /* 忽略 */ }
        }
      } else {
        // EPUB：createDocument 会内联书籍自带 CSS；图片靠 <base> 相对定位
        let doc = null;
        try { doc = await section.createDocument(); } catch (_) { doc = null; }
        styles = doc ? Array.from(doc.querySelectorAll('style')).map((s) => s.textContent || '').join('\n') : '';
        inner = doc && doc.body ? doc.body.innerHTML : inner;
        base = baseFor ? baseFor(section) : '';
      }

      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.setAttribute('scrolling', 'no');
      iframe.style.border = 'none';
      iframe.style.display = 'block';
      iframe.style.background = 'transparent';
      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8">'
        + (base ? '<base href="' + base + '">' : '')
        + '<style>' + READ_CSS + '</style><style>' + styles + '</style></head><body>' + inner + '</body></html>';

      box.innerHTML = '';
      box.appendChild(iframe);

      await new Promise((resolve) => {
        let done = false;
        const fin = () => { if (!done) { done = true; resolve(); } };
        iframe.addEventListener('load', fin, { once: true });
        setTimeout(fin, 5000);
      });

      // 纯图片章节（漫画/画册）自动铺满宽度；图文混排保持原尺寸
      let imgOnly = false;
      try {
        const d = iframe.contentDocument;
        if (d) {
          const imgs = d.querySelectorAll('img,svg image').length;
          const txt = (d.body.textContent || '').trim().length;
          imgOnly = imgs > 0 && txt < 60;
          if (imgOnly) d.body.classList.add('img-only');
        }
      } catch (_) { /* 忽略 */ }

      const z = Math.max(0.3, Math.min(3, zoom || 1));
      const boxW = box.clientWidth || 800;
      iframe.style.width = Math.round(boxW / z) + 'px';
      // 先给一个很矮的高度，scrollHeight 才是真实内容高度
      iframe.style.height = '80px';
      let h = 80;
      try {
        const d = iframe.contentDocument;
        if (d) h = Math.max(120, d.documentElement.scrollHeight || (d.body && d.body.scrollHeight) || 80);
      } catch (_) { /* 跨域等异常时用默认值 */ }
      iframe.style.height = h + 'px';
      iframe.style.transform = 'scale(' + z + ')';
      iframe.style.transformOrigin = '0 0';

      box.style.aspectRatio = 'auto';
      box.style.height = Math.round(h * z) + 'px';
      return { width: boxW, height: Math.round(h * z) };
    },
  };
}

function openSingle(source) {
  const fmt = String(source.format || '').toLowerCase();
  if (fmt === 'pdf') return openPdf(source);
  if (fmt === 'epub') return openEpub(source);
  if (fmt === 'mobi' || fmt === 'azw3') return openMobi(source);
  throw new Error('暂不支持的文档格式：' + fmt);
}

/** 多卷合一的书：把多个文件当成一本连续的电子书 */
function mergeBooks(books) {
  const offsets = [];
  let acc = 0;
  for (const b of books) { offsets.push(acc); acc += b.pageCount; }
  const partOf = (i) => {
    let k = 0;
    while (k + 1 < books.length && i >= offsets[k + 1]) k++;
    return k;
  };
  // 目录：每卷作为一个顶层条目，卷内是各卷自己的目录
  const toc = [];
  books.forEach((b, bi) => {
    if (bi > 0 && b.title) toc.push({ label: b.title, index: offsets[bi], depth: 0, volume: true });
    for (const t of (b.toc || [])) {
      toc.push(Object.assign({}, t, { index: t.index >= 0 ? offsets[bi] + t.index : -1 }));
    }
  });
  return {
    kind: books[0].kind,
    title: books[0].title,
    author: books[0].author,
    pageCount: acc,
    toc,
    volumes: books.map((b, i) => ({ title: b.title, start: offsets[i], count: b.pageCount })),
    async pageSize(i) {
      const k = partOf(i);
      return books[k].pageSize ? books[k].pageSize(i - offsets[k]) : null;
    },
    async renderPage(i, box, zoom) {
      const k = partOf(i);
      return books[k].renderPage(i - offsets[k], box, zoom);
    },
  };
}

export async function openDocument(source) {
  const parts = source.parts && source.parts.length ? source.parts : null;
  if (!parts) return openSingle(source);
  const books = [];
  for (const part of parts) {
    books.push(await openSingle({
      path: part.path,
      format: part.format,
      name: part.name || part.path,
    }));
  }
  return mergeBooks(books);
}
