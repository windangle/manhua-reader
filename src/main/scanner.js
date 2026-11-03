'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { detectSize, isImageName } = require('./imagedim');
const zipreader = require('./zipreader');
const dav = require('./dav');

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const naturalCompare = (a, b) => collator.compare(a, b);

const DEFAULT_RATIO = 800 / 1200;          // 宽/高，作为未探测页面的估算比例
const PROBE_LIMIT = { local: 60, net: 24 }; // 扫描阶段最多探测多少页的尺寸
const WALK_CONCURRENCY = { local: 32, net: 12 };

/** 是否是网络挂载路径（SMB/AFP/NFS 等），决定并发与探测策略 */
function isNetworkPath(p) {
  if (!p) return false;
  return p.startsWith('/Volumes/') || p.startsWith('/mnt/') || p.startsWith('\\\\') || p.includes('://');
}

async function mapLimit(items, limit, fn, onEach) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length || 1))).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = await fn(items[i], i); }
      catch (_) { results[i] = null; }
      if (onEach) onEach(results[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function probeLocal(file) {
  let fd;
  try {
    fd = await fsp.open(file, 'r');
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fd.read(buf, 0, 65536, 0);
    return detectSize(buf.slice(0, bytesRead));
  } catch (_) {
    return null;
  } finally {
    if (fd) try { await fd.close(); } catch (_) {}
  }
}

function medianRatio(list) {
  const ratios = list.filter(Boolean).map((d) => d.w / d.h).sort((a, b) => a - b);
  if (!ratios.length) return DEFAULT_RATIO;
  const mid = ratios.length >> 1;
  return ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
}

/** 用比例估算出一页的宽高（保持宽 1000 的基准） */
function estimate(ratio) {
  return { w: Math.round(1000 * ratio), h: 1000 };
}

/* ------------------------------------------------------------------
 * 本地文件夹扫描
 * ------------------------------------------------------------------ */
async function scanFolder(root, opts = {}) {
  const network = opts.network !== undefined ? opts.network : isNetworkPath(root);
  const onProgress = opts.onProgress || (() => {});
  const files = [];
  let dirs = 0;

  onProgress({ phase: 'listing', files: 0, dirs: 0, target: root });

  // 并发遍历目录树
  const queue = [{ dir: root, rel: '' }];
  const workers = new Array(WALK_CONCURRENCY[network ? 'net' : 'local']).fill(0).map(async () => {
    while (queue.length) {
      const job = queue.pop();
      let entries;
      try { entries = await fsp.readdir(job.dir, { withFileTypes: true }); }
      catch (_) { continue; }
      dirs++;
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        const abs = path.join(job.dir, ent.name);
        const relPath = job.rel ? job.rel + '/' + ent.name : ent.name;
        let type = ent.isDirectory() ? 'dir' : ent.isFile() ? 'file' : 'unknown';
        if (type === 'unknown') {
          // 某些网络文件系统返回 DT_UNKNOWN，需要补一次 stat
          try {
            const st = await fsp.stat(abs);
            type = st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
          } catch (_) { continue; }
        }
        if (type === 'dir') queue.push({ dir: abs, rel: relPath });
        else if (type === 'file' && isImageName(ent.name)) files.push({ abs, relPath });
      }
      onProgress({ phase: 'listing', files: files.length, dirs, target: root });
    }
  });
  await Promise.all(workers);

  files.sort((a, b) => naturalCompare(a.relPath, b.relPath));

  // 只探测少量页面的真实尺寸，其余按中位比例估算（网络盘逐个读文件头非常慢）
  const limit = Math.min(PROBE_LIMIT[network ? 'net' : 'local'], files.length);
  onProgress({ phase: 'probing', files: files.length, dirs, probed: 0, total: limit, target: root });
  let dimsCount = 0;
  const dims = await mapLimit(
    files.slice(0, limit),
    network ? 4 : 8,
    async (f) => (await probeLocal(f.abs)) || null,
    () => {
      dimsCount++;
      onProgress({ phase: 'probing', files: files.length, dirs, probed: dimsCount, total: limit, target: root });
    },
  );
  const ratio = medianRatio(dims);

  return files.map((f, i) => {
    const d = dims[i];
    const e = d || estimate(ratio);
    return {
      name: path.basename(f.abs),
      path: f.abs,
      size: 0,
      w: e.w,
      h: e.h,
      est: !d,
    };
  });
}

/* ------------------------------------------------------------------
 * 后台补全尺寸（低优先级，不阻塞用户）
 * ------------------------------------------------------------------ */
async function refineFolderPages(manga, indices, concurrency, onEach) {
  const results = await mapLimit(indices, concurrency, async (i) => {
    const p = manga.pages[i];
    if (!p || !p.path) return null;
    const d = await probeLocal(p.path);
    return d ? { i, d } : null;
  }, onEach);
  for (const r of results) {
    if (!r) continue;
    const p = manga.pages[r.i];
    if (!p) continue;
    p.w = r.d.w;
    p.h = r.d.h;
    p.est = false;
  }
  return manga.pages;
}

/* ------------------------------------------------------------------
 * 压缩包扫描
 * ------------------------------------------------------------------ */
async function scanZip(zipPath, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  onProgress({ phase: 'listing', files: 0, dirs: 0, target: zipPath });
  const reader = zipreader.getReader(zipPath);
  const entries = await reader.list();
  const imgs = entries.filter((e) => !e.isDir && isImageName(e.name));
  imgs.sort((a, b) => naturalCompare(a.name, b.name));

  const limit = Math.min(PROBE_LIMIT.local, imgs.length);
  const dims = await mapLimit(imgs.slice(0, limit), 6, async (e) => {
    try {
      const head = await reader.readHead(e.name);
      return detectSize(head) || null;
    } catch (_) { return null; }
  }, (v, i) => onProgress({ phase: 'probing', files: imgs.length, probed: i + 1, total: limit, target: zipPath }));
  const ratio = medianRatio(dims);

  return imgs.map((e, i) => {
    const d = dims[i];
    const s = d || estimate(ratio);
    return { name: e.name, entry: e.name, size: e.size, w: s.w, h: s.h, est: !d };
  });
}

/* ------------------------------------------------------------------
 * WebDAV 扫描（并发列目录 + 少量尺寸探测）
 * ------------------------------------------------------------------ */
async function scanDav(baseUrl, auth, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const files = [];
  let dirs = 0;

  const queue = [{ url: baseUrl.replace(/\/+$/, '') + '/', rel: '' }];
  const workers = new Array(8).fill(0).map(async () => {
    while (queue.length) {
      const job = queue.pop();
      let items;
      try { items = await dav.listDir(job.url, auth); }
      catch (e) { throw e; }
      dirs++;
      for (const it of items) {
        if (!job.rel && it.isDir) continue; // 顶层目录自身
        const relPath = job.rel ? job.rel + '/' + it.name : it.name;
        if (it.isDir) queue.push({ url: it.href.replace(/\/$/, '') + '/', rel: relPath });
        else files.push({ href: it.href, name: it.name, relPath, size: it.size });
      }
      onProgress({ phase: 'listing', files: files.length, dirs, target: baseUrl });
    }
  });
  await Promise.all(workers);

  files.sort((a, b) => naturalCompare(a.relPath, b.relPath));

  const limit = Math.min(PROBE_LIMIT.net, files.length);
  const dims = await mapLimit(files.slice(0, limit), 6, async (f) => {
    try {
      const head = await dav.getHead(f.href, auth);
      return detectSize(head) || null;
    } catch (_) { return null; }
  }, (v, i) => onProgress({ phase: 'probing', files: files.length, probed: i + 1, total: limit, target: baseUrl }));
  const ratio = medianRatio(dims);

  return files.map((f, i) => {
    const d = dims[i];
    const s = d || estimate(ratio);
    return { name: f.name, href: f.href, relPath: f.relPath, size: f.size, w: s.w, h: s.h, est: !d };
  });
}

module.exports = {
  scanFolder,
  scanZip,
  scanDav,
  refineFolderPages,
  naturalCompare,
  isNetworkPath,
  DEFAULT_RATIO,
};
