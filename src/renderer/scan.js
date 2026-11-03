'use strict';
import { toast } from './util.js';

/** 扫描进度弹窗：让长时间的目录/网络盘扫描有明确反馈 */
export function initScanUI(onFinished) {
  const root = document.getElementById('scan-modal');
  const els = {
    title: document.getElementById('scan-title'),
    target: document.getElementById('scan-target'),
    phase: document.getElementById('scan-phase'),
    count: document.getElementById('scan-count'),
    sub: document.getElementById('scan-sub'),
    tip: document.getElementById('scan-tip'),
    bg: document.getElementById('scan-bg'),
    close: document.getElementById('scan-close'),
  };

  let startedAt = Date.now();
  let timer = null;
  let cur = { phase: 'listing', files: 0, dirs: 0, probed: 0, total: 0, label: '' };
  let backgrounded = false;

  const fmt = (sec) => (sec < 60 ? `${sec} 秒` : `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`);

  function tick() {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    const parts = [];
    if (cur.dirs) parts.push(`已扫描 ${cur.dirs} 个目录`);
    if (cur.total) parts.push(`尺寸 ${cur.probed}/${cur.total}`);
    parts.push(`已用时 ${fmt(sec)}`);
    els.sub.textContent = parts.join(' · ');
  }

  function render() {
    if (cur.phase === 'probing') {
      els.phase.textContent = `正在读取图片尺寸 ${cur.probed}/${cur.total}`;
      els.tip.textContent = '只需读取少量图片的尺寸，其余按比例估算，所以这一步很快。';
    } else {
      els.phase.textContent = '正在读取目录…';
      els.tip.textContent = '网络盘 / 海量文件时这一步最慢，可点「放到后台继续」，期间 APP 依然可用。';
    }
    els.count.textContent = String(cur.files || 0);
    els.target.textContent = cur.label || cur.target || '';
    tick();
  }

  function open(evt) {
    startedAt = Date.now();
    cur = { phase: 'listing', files: 0, dirs: 0, probed: 0, total: 0, label: evt.label || '' };
    backgrounded = false;
    els.title.textContent = evt.kind === 'rescan' ? '正在重新扫描' : '正在添加漫画';
    els.close.classList.add('hidden');
    els.bg.classList.remove('hidden');
    root.classList.remove('hidden');
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function update(evt) {
    cur = Object.assign({}, cur, evt);
    if (backgrounded) return;
    render();
  }

  function finish(evt, ok, message) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!ok) {
      backgrounded = false;
      root.classList.remove('hidden');
      els.title.textContent = '扫描失败';
      els.phase.textContent = message || '未知错误';
      els.count.textContent = '—';
      els.sub.textContent = `已用时 ${fmt(Math.floor((Date.now() - startedAt) / 1000))}`;
      els.bg.classList.add('hidden');
      els.close.classList.remove('hidden');
      return;
    }
    if (backgrounded) {
      toast(`扫描完成，用时 ${fmt(Math.floor((Date.now() - startedAt) / 1000))}`, '');
    } else {
      // 扫描太快时不要让弹窗一闪而过
      const shown = Date.now() - startedAt;
      if (shown < 600) setTimeout(() => root.classList.add('hidden'), 600 - shown);
      else root.classList.add('hidden');
    }
    if (onFinished) onFinished(evt);
  }

  els.bg.addEventListener('click', () => {
    backgrounded = true;
    root.classList.add('hidden');
    toast('已放到后台继续扫描，完成后会提示你');
  });
  els.close.addEventListener('click', () => {
    root.classList.add('hidden');
    if (timer) { clearInterval(timer); timer = null; }
  });

  window.api.onScan((evt) => {
    if (!evt) return;
    if (evt.type === 'start') open(evt);
    else if (evt.type === 'progress') update(evt);
    else if (evt.type === 'done') finish(evt, true);
    else if (evt.type === 'error') finish(evt, false, evt.message);
  });

  return { open, update };
}
