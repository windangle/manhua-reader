'use strict';
import { el, toast, openModal } from './util.js';
import { openDocument } from './doc.js';

const SCHEME = 'comic';

// 图标 = 翻页推进的方向（与「向下阅读」的 ↓ 语义一致）
export const DIRECTIONS = {
  down: { key: 'down', label: '向下阅读', icon: '↓', desc: '竖排长图，向下翻页' },
  left: { key: 'left', label: '向左阅读', icon: '←', desc: '横排，向左翻页（第 1 页在最右侧）' },
  right: { key: 'right', label: '向右阅读', icon: '→', desc: '横排，向右翻页（第 1 页在最左侧）' },
};

/** 生成某一页的可加载 URL */
export function pageUrl(manga, page, index) {
  switch (manga.source.type) {
    case 'folder':
      return `${SCHEME}://local/${encodeURIComponent(page.path)}`;
    case 'zip':
      return `${SCHEME}://zip/${encodeURIComponent(manga.source.path)}/${encodeURIComponent(page.entry)}`;
    case 'dav':
      return `${SCHEME}://dav/${encodeURIComponent(manga.id)}/${index}`;
    default:
      return '';
  }
}

export class Reader {
  constructor(onExit) {
    this.onExit = onExit;
    this.els = {
      view: document.getElementById('reader-view'),
      top: document.getElementById('reader-top'),
      bottom: document.getElementById('reader-bottom'),
      scroller: document.getElementById('scroller'),
      strip: document.getElementById('strip'),
      loading: document.getElementById('reader-loading'),
      name: document.getElementById('r-name'),
      page: document.getElementById('r-page'),
      zoomRange: document.getElementById('r-zoom-range'),
      zoomLabel: document.getElementById('r-zoom-label'),
      slider: document.getElementById('r-slider'),
      pageInput: document.getElementById('r-page-input'),
      pageTotal: document.getElementById('r-page-total'),
      prev: document.getElementById('r-prev'),
      next: document.getElementById('r-next'),
      back: document.getElementById('r-back'),
      bg: document.getElementById('r-bg'),
      full: document.getElementById('r-full'),
      dirCtl: document.getElementById('r-dir'),
      toc: document.getElementById('r-toc'),
    };

    this.manga = null;
    this.pages = [];
    this.pageEls = [];
    this.offsets = [];       // 每页的 { top, left, width, height }
    this.sortedOffsets = []; // 按 left 排序，用于二分查找
    this.zoom = 1;
    this.direction = 'down';
    this.current = 0;
    this.offset = 0;
    this.loaded = new Set();
    this.doc = null;          // 电子书对象（PDF / EPUB / MOBI）
    this._renderedH = new Map();
    this._textEst = 600;
    this._pendingJump = null;
    this.immersive = false;
    this.lightBg = false;
    this._saveTimer = null;
    this._scrollRaf = 0;
    this._lastScrollTop = 0;
    this._renderedH = new Map();   // 已渲染页的真实高度
    this._textEst = 600;           // 未渲染文本页的高度估计
    this._pendingJump = null;

    this._bind();
  }

  /* ------------------------- 事件绑定 ------------------------- */
  _bind() {
    const e = this.els;
    e.back.addEventListener('click', () => this.close());
    e.prev.addEventListener('click', () => this.gotoPage(this.current - 1));
    e.next.addEventListener('click', () => this.gotoPage(this.current + 1));

    e.zoomRange.addEventListener('input', () => {
      this.setZoom(Number(e.zoomRange.value) / 100, true);
    });
    e.zoomLabel.addEventListener('click', () => this.setZoom(1, true));
    document.getElementById('r-zoom-in').addEventListener('click', () => this.setZoom(this.zoom + 0.1));
    document.getElementById('r-zoom-out').addEventListener('click', () => this.setZoom(this.zoom - 0.1));

    e.bg.addEventListener('click', () => this.toggleBackground());
    e.full.addEventListener('click', () => this.toggleImmersive());

    // 阅读方向
    if (e.dirCtl) {
      e.dirCtl.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-dir]');
        if (!btn) return;
        this.setDirection(btn.dataset.dir, true);
      });
    }

    if (e.toc) e.toc.addEventListener('click', () => this.openToc());

    // 沉浸模式下的退出按钮
    this.exitBtn = document.getElementById('r-immersive-exit');
    if (this.exitBtn) this.exitBtn.addEventListener('click', () => this.toggleImmersive());

    e.slider.addEventListener('input', () => this.gotoPage(Number(e.slider.value) - 1, true));
    e.pageInput.addEventListener('change', () => {
      const n = Number(e.pageInput.value);
      if (n >= 1) this.gotoPage(n - 1);
    });

    e.scroller.addEventListener('scroll', () => this._onScroll(), { passive: true });

    // 横向阅读时，用滚轮横向滚动
    e.scroller.addEventListener('wheel', (ev) => {
      if (this.direction === 'down') return;
      if (this.els.scroller.scrollWidth <= this.els.scroller.clientWidth + 1) return;
      const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      if (!delta) return;
      ev.preventDefault();
      this.els.scroller.scrollLeft += delta;
    }, { passive: false });

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (ev) => this._onMouseMove(ev));
    document.addEventListener('keydown', (ev) => this._onKey(ev));

    // 触摸：左右滑动翻页
    let tx = 0, ty = 0;
    e.scroller.addEventListener('touchstart', (ev) => {
      tx = ev.touches[0].clientX; ty = ev.touches[0].clientY;
    }, { passive: true });
    e.scroller.addEventListener('touchend', (ev) => {
      const dx = ev.changedTouches[0].clientX - tx;
      const dy = ev.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const forward = this.direction === 'left' ? dx > 0 : dx < 0;
        this.gotoPage(this.current + (forward ? 1 : -1));
      }
    }, { passive: true });
  }

  _onKey(ev) {
    if (this.els.view.classList.contains('hidden')) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (ev.key === 'Enter') ev.target.blur();
      return;
    }
    // 翻页方向与阅读方向一致：← 模式用左键翻页，→ 模式用右键翻页
    const advanceRight = this.direction !== 'left';
    switch (ev.key) {
      case ' ':
        ev.preventDefault(); this.gotoPage(this.current + 1); break;
      case 'ArrowRight':
        ev.preventDefault(); this.gotoPage(this.current + (advanceRight ? 1 : -1)); break;
      case 'ArrowLeft':
        ev.preventDefault(); this.gotoPage(this.current + (advanceRight ? -1 : 1)); break;
      case 'PageDown':
        ev.preventDefault(); this.gotoPage(this.current + 1); break;
      case 'PageUp':
        ev.preventDefault(); this.gotoPage(this.current - 1); break;
      case 'ArrowDown':
        ev.preventDefault(); this.gotoPage(this.current + 1); break;
      case 'ArrowUp':
        ev.preventDefault(); this.gotoPage(this.current - 1); break;
      case '+': case '=': ev.preventDefault(); this.setZoom(this.zoom + 0.1); break;
      case '-': case '_': ev.preventDefault(); this.setZoom(this.zoom - 0.1); break;
      case '0': case 'f': this.setZoom(1); break;
      case 'h': case 'H': this.toggleImmersive(); break;
      case 'Escape': this.close(); break;
      default: break;
    }
  }

  /* ------------------------- 打开 / 关闭 ------------------------- */
  async open(manga, settings) {
    this.manga = manga;
    this.pages = manga.pages || [];
    this.zoom = (settings && settings.zoom) || 1;
    this.direction = DIRECTIONS[manga.direction] ? manga.direction : 'down';
    this.current = 0;
    this.offset = 0;
    this.loaded.clear();

    const e = this.els;
    e.name.textContent = manga.name;
    e.pageTotal.textContent = '/ ' + this.pages.length;
    e.slider.max = String(Math.max(1, this.pages.length));
    e.pageInput.max = String(Math.max(1, this.pages.length));
    e.zoomRange.value = String(Math.round(this.zoom * 100));
    const lt = document.getElementById('reader-loading-text');
    if (lt) lt.textContent = `正在准备 ${this.pages.length} 页…`;
    e.loading.classList.remove('hidden');
    e.strip.classList.add('loading');
    e.strip.innerHTML = '';
    e.view.classList.remove('hidden');

    // 源目录不可用（NAS 掉线等）时给出明确提示
    const notice = document.getElementById('reader-notice');
    if (manga.sourceAvailable === false) {
      notice.textContent = '源目录当前不可用，请检查磁盘 / NAS 是否已连接（可在书架中点「重新扫描资源」）';
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }

    // 电子书：先解析文档，再按页/章建立长卷
    if (manga.source && manga.source.type === 'doc') {
      const lt = document.getElementById('reader-loading-text');
      if (lt) lt.textContent = '正在解析文档…';
      e.loading.classList.remove('hidden');
      try {
        this.doc = await openDocument(manga.source);
      } catch (err) {
        console.error(err);
        toast('打开失败：' + (err && err.message ? err.message : err), 'err');
        e.loading.classList.add('hidden');
        this.els.view.classList.add('hidden');
        if (this.onExit) this.onExit();
        return;
      }
      this.pages = await this._buildDocPages(this.doc);
      e.pageTotal.textContent = '/ ' + this.pages.length;
      // 记录页/章数，书架上可以显示
      try { await window.api.library.update(manga.id, { pageCount: this.pages.length }); } catch (_) { /* 忽略 */ }
      e.slider.max = String(Math.max(1, this.pages.length));
      e.pageInput.max = String(Math.max(1, this.pages.length));
      if (this.els.toc) {
        const hasToc = this.doc.toc && this.doc.toc.some((t) => t.index >= 0);
        this.els.toc.classList.toggle('hidden', !hasToc);
      }
      // 用书籍元数据补全书名（仅当还是默认文件名时）
      if (this.doc.title && /\.[a-z0-9]+$/i.test(manga.name)) {
        try {
          await window.api.library.update(manga.id, { name: this.doc.title });
          manga.name = this.doc.title;
          e.name.textContent = this.doc.title;
        } catch (_) { /* 忽略 */ }
      }
    }

    this._buildStrip();
    // 等待布局稳定（窗口最小化/后台时 rAF 可能不触发，故加超时兜底）
    await new Promise((r) => {
      let done = false;
      const fin = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 150);
    });
    this._applyLayout();
    this._restore(manga.progress);
    this._updateIndicator();
    this._updateDirButtons();

    this._loadAround(this.current);
    e.loading.classList.add('hidden');
    e.strip.classList.remove('loading');
    this._observe();
  }

  /** 电子书页面占位信息（真实尺寸在渲染时校正） */
  async _buildDocPages(doc) {
    const n = doc.pageCount;
    const pages = new Array(n).fill(null).map((_, i) => ({ name: '第 ' + (i + 1) + ' 页', w: 800, h: 1200 }));
    if (doc.kind === 'pdf') {
      // 取前若干页的真实比例作为估算值，避免渲染后整条长卷跳动
      const limit = Math.min(24, n);
      const sizes = await Promise.all(Array.from({ length: limit }, (_, i) => doc.pageSize(i)));
      const valid = sizes.filter(Boolean);
      if (valid.length) {
        const ratios = valid.map((s) => s.width / s.height).sort((a, b) => a - b);
        const mid = ratios.length >> 1;
        const r = ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
        for (const p of pages) { p.w = Math.round(1000 * r); p.h = 1000; }
      }
    }
    return pages;
  }

  close() {
    this.saveProgress(true);
    this._teardown();
    this.els.view.classList.add('hidden');
    if (this.onExit) this.onExit();
  }

  _teardown() {
    if (this._io) { this._io.disconnect(); this._io = null; }
    if (this.els.toc) this.els.toc.classList.add('hidden');
    this.doc = null;
    this.els.strip.innerHTML = '';
    this.pageEls = [];
    this.offsets = [];
    this.sortedOffsets = [];
  }

  /* ------------------------- 长图构建 ------------------------- */
  _buildStrip() {
    const frag = document.createDocumentFragment();
    this.pageEls = [];
    this.pages.forEach((p, i) => {
      const ratio = p.w && p.h ? `${p.w} / ${p.h}` : '3 / 4';
      const box = el('div', { class: 'page', 'data-i': String(i), style: { aspectRatio: ratio } });
      const img = el('img', { alt: `第 ${i + 1} 页`, decoding: 'async' });
      img.dataset.idx = String(i);
      box.appendChild(img);
      frag.appendChild(box);
      this.pageEls.push(box);
    });
    this.els.strip.appendChild(frag);
  }

  _observe() {
    if (this._io) this._io.disconnect();
    const horizontal = this.direction !== 'down';
    this._io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) this._loadPage(Number(en.target.dataset.i));
      }
    }, {
      root: this.els.scroller,
      rootMargin: horizontal ? '0px 160%' : '160% 0px',
      threshold: 0,
    });
    for (const box of this.pageEls) this._io.observe(box);
  }

  _loadPage(i) {
    if (i < 0 || i >= this.pages.length) return;
    if (this.loaded.has(i)) return;
    this.loaded.add(i);
    const box = this.pageEls[i];

    // 电子书：由文档渲染器接管
    if (this.doc) {
      const before = this.offsets[i] ? Object.assign({}, this.offsets[i]) : null;
      this.doc.renderPage(i, box, this.zoom)
        .then(() => {
          box.classList.remove('failed');
          this._recomputeOffsets();
          // 文本页渲染后高度会变，修正滚动位置，避免阅读位置漂移
          const after = this.offsets[i];
          if (before && after && this._pendingJump === null) {
            const dy = after.top - before.top;
            const dx = after.left - before.left;
            if (this.direction === 'down') {
              if (dy) this.els.scroller.scrollTop += dy;
            } else if (dx) {
              this.els.scroller.scrollLeft += dx;
            }
          }
          // 记录真实高度，必要时统一更新未渲染页的高度估计（保证偏移量一致，跳页才准）
          const realH = box.offsetHeight;
          if (realH > 0) {
            this._renderedH.set(i, realH);
            const prevEst = this._textEst;
            this._textEst = prevEst ? prevEst * 0.65 + realH * 0.35 : realH;
            if (Math.abs(this._textEst - prevEst) > prevEst * 0.12) {
              this._applyTextEstimate(Math.round(this._textEst));
            }
          }
          // 跳页后重新对齐到目标页
          if (this._pendingJump === i) {
            this._pendingJump = null;
            const top = this._scrollTargetFor(i);
            if (this.direction === 'down') this.els.scroller.scrollTop = Math.max(0, top);
            else this.els.scroller.scrollLeft = Math.max(0, top);
            this.current = i;
            this._updateIndicator();
          }
        })
        .catch((err) => { console.error(err); box.classList.add('failed'); });
      return;
    }

    const img = box.querySelector('img');
    const page = this.pages[i];
    img.onload = () => {
      box.classList.remove('failed');
      if (img.naturalWidth && img.naturalHeight) {
        const r = `${img.naturalWidth} / ${img.naturalHeight}`;
        if (this.direction === 'down' && box.style.aspectRatio !== r) {
          box.style.aspectRatio = r;
          this._recomputeOffsets();
        }
      }
    };
    img.onerror = () => { box.classList.add('failed'); };
    img.src = pageUrl(this.manga, page, i);
  }

  _loadAround(i) {
    for (let k = i - 2; k <= i + 3; k++) this._loadPage(k);
  }

  /** 释放远离视口的大图，避免内存膨胀 */
  _unloadFar() {
    const cur = this.current;
    for (const i of Array.from(this.loaded)) {
      if (Math.abs(i - cur) > 6) {
        const img = this.pageEls[i] && this.pageEls[i].querySelector('img');
        if (img && img.getAttribute('src')) { img.removeAttribute('src'); }
        this.loaded.delete(i);
      }
    }
  }

  /* ------------------------- 布局：竖排 / 横排 ------------------------- */
  _applyLayout() {
    const sc = this.els.scroller;
    const strip = this.els.strip;
    const horizontal = this.direction !== 'down';

    sc.classList.toggle('h', horizontal);
    sc.classList.toggle('v', !horizontal);
    strip.classList.toggle('horizontal', horizontal);

    if (!horizontal) {
      strip.style.width = '';
      strip.style.height = '';
      const w = Math.max(200, Math.round(sc.clientWidth * this.zoom));
      strip.style.width = w + 'px';
      for (const box of this.pageEls) {
        const p = this.pages[Number(box.dataset.i)];
        box.style.width = '100%';
        if (this.doc && this.doc.kind === 'text') {
          // 文本页高度由内容决定，保留已测量的高度
          box.style.aspectRatio = 'auto';
          if (!box.style.height) box.style.height = '600px';
        } else {
          box.style.height = '';
          box.style.aspectRatio = p && p.w && p.h ? `${p.w} / ${p.h}` : '3 / 4';
        }
      }
    } else {
      // 向左翻页（右起）：第一页排在最右侧
      strip.style.flexDirection = this.direction === 'left' ? 'row-reverse' : 'row';
      const h = Math.max(200, Math.round(sc.clientHeight * this.zoom));
      const availW = Math.max(200, Math.round(sc.clientWidth * this.zoom));
      // 显式算总宽：避免 max-content 让 flex 反复重算（页数多时是 O(n^2)）
      let total = 0;
      let maxH = 0;
      for (const box of this.pageEls) {
        const p = this.pages[Number(box.dataset.i)];
        const ratio = p && p.w && p.h ? p.w / p.h : 800 / 1200;
        let ph = h;
        let pw = Math.round(ph * ratio);
        if (pw > availW) {         // 超宽跨页：改为按宽度适配，避免超出窗口
          pw = availW;
          ph = Math.round(pw / ratio);
        }
        box.style.height = ph + 'px';
        box.style.width = pw + 'px';
        box.style.aspectRatio = 'auto';
        total += pw;
        if (ph > maxH) maxH = ph;
      }
      strip.style.width = total + 'px';
      strip.style.height = maxH + 'px';
    }
    this._recomputeOffsets();

    // 缩放基准随方向变化：竖排按窗口宽度，横排按窗口高度
    const zl = this.els.zoomLabel;
    if (zl) {
      zl.title = horizontal
        ? '缩放基准：窗口高度（100% = 页面高度刚好铺满窗口）'
        : '缩放基准：窗口宽度（100% = 页面宽度刚好铺满窗口）';
    }
  }

  /** 把未渲染的文本页高度统一成估计值，并保持当前阅读位置不变 */
  _applyTextEstimate(h) {
    const sc = this.els.scroller;
    const anchor = this.current;
    const beforeTop = this.offsets[anchor] ? this.offsets[anchor].top : 0;
    const beforeLeft = this.offsets[anchor] ? this.offsets[anchor].left : 0;
    let changed = 0;
    for (const box of this.pageEls) {
      const i = Number(box.dataset.i);
      if (this._renderedH.has(i)) continue;
      if (box.style.height !== h + 'px') { box.style.height = h + 'px'; changed++; }
    }
    if (!changed) return;
    this._recomputeOffsets();
    const afterTop = this.offsets[anchor] ? this.offsets[anchor].top : 0;
    const afterLeft = this.offsets[anchor] ? this.offsets[anchor].left : 0;
    if (this.direction === 'down') sc.scrollTop += (afterTop - beforeTop);
    else sc.scrollLeft += (afterLeft - beforeLeft);
    if (this._pendingJump !== null) {
      const t = this._scrollTargetFor(this._pendingJump);
      if (this.direction === 'down') sc.scrollTop = Math.max(0, t);
      else sc.scrollLeft = Math.max(0, t);
    }
  }

  _recomputeOffsets() {
    this.offsets = this.pageEls.map((b) => ({
      top: b.offsetTop,
      left: b.offsetLeft,
      width: b.offsetWidth,
      height: b.offsetHeight,
    }));
    this.sortedOffsets = this.offsets
      .map((o, i) => ({ i, left: o.left, width: o.width }))
      .sort((a, b) => a.left - b.left);
  }

  /** 二分查找：视口坐标 x 所落在的页 */
  _pageAtX(x) {
    const arr = this.sortedOffsets;
    if (!arr.length) return 0;
    let lo = 0, hi = arr.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const e = arr[mid];
      if (x < e.left) hi = mid - 1;
      else if (x >= e.left + e.width) lo = mid + 1;
      else { best = e.i; lo = hi + 1; }
    }
    return best;
  }

  /* ------------------------- 位置与进度 ------------------------- */
  _computeCurrent() {
    const sc = this.els.scroller;
    if (this.direction === 'down') {
      const top = sc.scrollTop + 1;
      let idx = 0;
      for (let i = 0; i < this.pageEls.length; i++) {
        const box = this.pageEls[i];
        if (box.offsetTop <= top) idx = i; else break;
      }
      const box = this.pageEls[idx];
      const h = box ? box.offsetHeight : 1;
      const meta = this.offsets[idx];
      const off = h > 0 && meta ? Math.min(1, Math.max(0, (top - meta.top) / h)) : 0;
      return { index: idx, offset: off };
    }
    // 横向：起始边在左（向右翻页）或在右（向左翻页/右起）
    const rtl = this.direction === 'left';
    const edge = rtl ? sc.scrollLeft + sc.clientWidth - 1 : sc.scrollLeft + 1;
    return { index: this._pageAtX(edge), offset: 0 };
  }

  _onScroll() {
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = 0;
      if (this.immersive) {
        // 向上滚动时把顶部工具栏叫回来
        const sc = this.els.scroller;
        const delta = sc.scrollTop - (this._lastScrollTop || 0);
        this._lastScrollTop = sc.scrollTop;
        if (delta < -4) this.els.view.classList.add('show-top');
        else if (delta > 40) this.els.view.classList.remove('show-top');
      }
      const pos = this._computeCurrent();
      if (pos.index !== this.current) {
        this.current = pos.index;
        this.offset = pos.offset;
        this._loadAround(pos.index);
        this._unloadFar();
        this._updateIndicator();
      } else {
        this.offset = pos.offset;
      }
      this.saveProgress();
    });
  }

  _updateIndicator() {
    const e = this.els;
    const n = this.current + 1;
    // 按钮箭头表示翻页移动方向
    if (e.prev && e.next) {
      if (this.direction === 'left') {
        e.prev.innerHTML = '上一页 ›';
        e.next.innerHTML = '‹ 下一页';
      } else {
        e.prev.innerHTML = '‹ 上一页';
        e.next.innerHTML = '下一页 ›';
      }
    }
    const unit = (this.doc && this.doc.kind === 'text') ? '章' : '页';
    e.page.textContent = `第 ${n} / ${this.pages.length} ${unit}`;
    if (document.activeElement !== e.slider) e.slider.value = String(n);
    if (document.activeElement !== e.pageInput) e.pageInput.value = String(n);
  }

  _updateDirButtons() {
    const ctl = this.els.dirCtl;
    if (!ctl) return;
    ctl.querySelectorAll('button[data-dir]').forEach((b) => {
      b.classList.toggle('active', b.dataset.dir === this.direction);
    });
  }

  /** 计算滚动到第 i 页时的目标滚动位置 */
  _scrollTargetFor(i) {
    const sc = this.els.scroller;
    const o = this.offsets[i];
    if (!o) return 0;
    if (this.direction === 'down') return Math.max(0, o.top - 1);
    if (this.direction === 'right') return Math.max(0, o.left - 1);
    // 向左翻页（右起）：把这一页对齐到视口右侧
    return Math.max(0, o.left + o.width - sc.clientWidth);
  }

  /** 跳到文档某页前：先把目标页渲染出来量出真实高度，统一估算值，位置才准 */
  async _prepareDocJump(idx) {
    const box = this.pageEls[idx];
    if (!box) return;
    if (!this._renderedH.has(idx)) {
      try {
        await this.doc.renderPage(idx, box, this.zoom);
        box.classList.remove('failed');
        this._renderedH.set(idx, box.offsetHeight);
      } catch (e) { /* 忽略 */ }
    }
    const h = this._renderedH.get(idx);
    if (h) {
      this._textEst = h;
      this._applyTextEstimate(Math.round(h));
    }
  }

  gotoPage(i, keepRatio) {
    const idx = Math.max(0, Math.min(this.pages.length - 1, i));
    this.current = idx;
    this.offset = 0;
    const behavior = this.doc ? 'auto' : 'smooth';
    if (this.doc) {
      this._pendingJump = idx;
      this._prepareDocJump(idx).then(() => {
        const t = this._scrollTargetFor(idx);
        if (this.direction === 'down') this.els.scroller.scrollTop = Math.max(0, t);
        else this.els.scroller.scrollLeft = Math.max(0, t);
        this._pendingJump = null;
        this.current = idx;
        this._updateIndicator();
        this.saveProgress();
      });
    }
    const target = this._scrollTargetFor(idx);
    this.els.scroller.scrollTo({ top: this.direction === 'down' ? target : 0, left: this.direction === 'down' ? 0 : target, behavior });
    this._loadAround(idx);
    this._updateIndicator();
    this.saveProgress();
    if (keepRatio) { /* 滑块拖动时无需额外处理 */ }
  }

  _restore(progress) {
    const p = progress || { index: 0, offset: 0 };
    const idx = Math.max(0, Math.min(this.pages.length - 1, p.index | 0));
    this.current = idx;
    this.offset = this.direction === 'down' ? (p.offset || 0) : 0;
    if (!this.offsets[idx]) return;
    let target = this._scrollTargetFor(idx);
    if (this.direction === 'down') {
      const box = this.pageEls[idx];
      target = this.offsets[idx].top + (box.offsetHeight || 0) * this.offset;
      this.els.scroller.scrollTop = Math.max(0, target);
    } else {
      this.els.scroller.scrollLeft = Math.max(0, target);
    }
    this._updateIndicator();
  }

  _onResize() {
    if (this.els.view.classList.contains('hidden')) return;
    this._applyLayout();
    this._restore({ index: this.current, offset: this.offset });
  }

  /* ------------------------- 目录（电子书） ------------------------- */
  openToc() {
    if (!this.doc || !this.doc.toc || !this.doc.toc.length) return;
    const list = el('div', { class: 'toc-list' });
    for (const item of this.doc.toc) {
      if (item.index < 0) continue;
      const row = el('button', {
        class: 'toc-item',
        style: { paddingLeft: (12 + item.depth * 16) + 'px' },
        text: item.label || ('第 ' + (item.index + 1) + ' 章'),
        onclick: () => { this.gotoPage(item.index); close(); },
      });
      list.appendChild(row);
    }
    if (!list.children.length) {
      list.appendChild(el('div', { class: 'hint', text: '这本书没有可用的目录' }));
    }
    const m = openModal({ title: '目录', body: list, wide: true });
    const close = m.close;
  }

  /* ------------------------- 阅读方向 ------------------------- */
  async setDirection(dir, persist) {
    if (!DIRECTIONS[dir] || dir === this.direction) return;
    const keep = this.current;
    this.direction = dir;
    this._applyLayout();
    this._observe();
    this._restore({ index: keep, offset: 0 });
    this._updateIndicator();
    this._updateDirButtons();
    toast('已切换为「' + DIRECTIONS[dir].label + '」：' + DIRECTIONS[dir].desc);
    if (persist && this.manga) {
      try {
        await window.api.library.update(this.manga.id, { direction: dir });
        this.manga.direction = dir;
      } catch (e) { /* 忽略保存失败 */ }
    }
  }

  /* ------------------------- 缩放 ------------------------- */
  setZoom(z, fromSlider) {
    this.zoom = Math.min(3, Math.max(0.3, Math.round(z * 100) / 100));
    if (!fromSlider) this.els.zoomRange.value = String(Math.round(this.zoom * 100));
    this.els.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
    this._applyLayout();
    if (this.doc) {
      // 文档页需要按新缩放比重绘
      for (const i of Array.from(this.loaded)) {
        const b = this.pageEls[i];
        if (b) b.innerHTML = '';
        this.loaded.delete(i);
      }
      this._loadAround(this.current);
    }
    if (this.manga) {
      // 缩放后保持当前阅读位置
      this._restore({ index: this.current, offset: this.offset });
    }
    if (window.api && window.api.settings) window.api.settings.set({ zoom: this.zoom });
  }

  /* ------------------------- 背景 / 沉浸 ------------------------- */
  toggleBackground() {
    this.lightBg = !this.lightBg;
    document.body.classList.toggle('light-reader', this.lightBg);
    const btn = this.els.bg;
    if (btn) {
      btn.textContent = this.lightBg ? '◑' : '◐';
      btn.title = this.lightBg ? '切换为深色背景' : '切换为浅色背景';
    }
    toast(this.lightBg ? '已切换为浅色背景' : '已切换为深色背景');
  }

  toggleImmersive() {
    this.immersive = !this.immersive;
    const v = this.els.view;
    v.classList.toggle('immersive', this.immersive);
    const fullBtn = this.els.full;
    if (fullBtn) {
      fullBtn.title = this.immersive ? '退出沉浸模式 (H)' : '沉浸模式：隐藏工具栏 (H)';
      fullBtn.textContent = this.immersive ? '⤡' : '⤢';
    }
    if (this.immersive) {
      this._showExitHint(true);
      toast('沉浸模式：按 H 退出，或把鼠标移到屏幕顶部');
    } else {
      v.classList.remove('show-top', 'show-bottom');
      this._showExitHint(false);
    }
  }

  _showExitHint(show) {
    if (!this.exitBtn) return;
    this.exitBtn.classList.toggle('show', !!show);
    if (this._exitTimer) { clearTimeout(this._exitTimer); this._exitTimer = null; }
    if (show) {
      this._exitTimer = setTimeout(() => {
        this._exitTimer = null;
        if (this.immersive) this.exitBtn.classList.remove('show');
      }, 4000);
    }
  }

  /** 鼠标移到上下边缘时，工具栏与退出提示重新出现 */
  _onMouseMove(ev) {
    if (!this.immersive) return;
    const h = window.innerHeight || 800;
    const nearTop = ev.clientY <= 90;
    const nearBottom = ev.clientY >= h - 90;
    this.els.view.classList.toggle('show-top', nearTop);
    this.els.view.classList.toggle('show-bottom', nearBottom);
    if (nearTop) this._showExitHint(true);
  }

  saveProgress(immediate) {
    if (!this.manga) return;
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    const payload = { index: this.current, offset: this.offset };
    if (immediate) {
      window.api.reader.saveProgress(this.manga.id, payload);
    } else {
      // 页数越多，元数据越大，写盘间隔相应放宽
      const delay = this.pages.length > 3000 ? 3000 : this.pages.length > 800 ? 1500 : 700;
      this._saveTimer = setTimeout(() => {
        this._saveTimer = null;
        window.api.reader.saveProgress(this.manga.id, payload);
      }, delay);
    }
  }
}
