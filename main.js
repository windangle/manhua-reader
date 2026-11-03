'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fsp = require('fs').promises;

const store = require('./src/main/store');
const scanner = require('./src/main/scanner');
const zipreader = require('./src/main/zipreader');
const protocol = require('./src/main/protocol');

protocol.registerScheme();

// 允许用 COMIC_USER_DATA 指定数据目录（便于开发/测试/多套书库）
if (process.env.COMIC_USER_DATA) {
  app.setPath('userData', process.env.COMIC_USER_DATA);
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 520,
    minHeight: 420,
    backgroundColor: '#14161c',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const query = {};
  if (process.argv.some((a) => a.startsWith('--autoopen'))) query.autoopen = '1';
  const docArg = process.argv.find((a) => a.startsWith('--doc='));
  if (docArg) query.doc = docArg.split('=')[1];
  const manifestArg = process.argv.find((a) => a.startsWith('--manifest='));
  if (manifestArg) query.manifest = manifestArg.split('=')[1];
  win.loadFile(path.join(__dirname, 'src/renderer/index.html'), { query });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  const scriptArg = process.argv.find((a) => a.startsWith('--script='));
  if (scriptArg) {
    const scriptPath = scriptArg.split('=').slice(1).join('=');
    win.webContents.on('did-finish-load', () => {
      const code = fs.readFileSync(scriptPath, 'utf8');
      win.webContents.executeJavaScript(code, true).catch((e) => console.error('[script]', e));
    });
  }

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (process.argv.includes('--dev')) {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        {
          label: '添加本地文件夹…',
          accelerator: 'CmdOrCtrl+O',
          click: () => win && win.webContents.send('menu:action', 'add-folder'),
        },
        {
          label: '添加压缩包…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => win && win.webContents.send('menu:action', 'add-zip'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------ IPC ------------------------------ */

let scanSeq = 0;

function emitScan(evt) {
  if (win && !win.isDestroyed()) win.webContents.send('scan:event', evt);
}

/** 包装一次扫描任务：向前端推送 start / progress / done / error 事件 */
async function withScan(kind, label, fn) {
  const jobId = 'scan-' + (++scanSeq);
  const t0 = Date.now();
  emitScan({ type: 'start', jobId, kind, label });

  // 心跳：即使某个目录读取很慢，也持续刷新界面，避免看起来像卡死
  let last = { phase: 'listing', files: 0, dirs: 0 };
  const heartbeat = setInterval(() => {
    emitScan(Object.assign({ type: 'progress', jobId }, last, { elapsed: Date.now() - t0 }));
  }, 700);

  try {
    const result = await fn((p) => {
      last = Object.assign({}, last, p);
      emitScan(Object.assign({ type: 'progress', jobId }, p, { elapsed: Date.now() - t0 }));
    });
    clearInterval(heartbeat);
    emitScan(Object.assign({ type: 'done', jobId }, result || {}, { elapsed: Date.now() - t0 }));
    return result;
  } catch (e) {
    clearInterval(heartbeat);
    emitScan({ type: 'error', jobId, kind, label, message: e && e.message ? e.message : String(e), elapsed: Date.now() - t0 });
    throw e;
  }
}

/**
 * 后台补全图片真实尺寸。
 * 网络盘逐个读文件头很慢，只补前面一小部分，其余在阅读时随图片加载自动校正。
 */
function scheduleRefine(entry) {
  const m = store.getManga(entry.id);
  if (!m || m.source.type !== 'folder') return;
  const pending = [];
  for (let i = 0; i < m.pages.length; i++) if (m.pages[i] && m.pages[i].est) pending.push(i);
  if (!pending.length) return;
  const net = scanner.isNetworkPath(m.source.path);
  const todo = pending.slice(0, net ? 200 : pending.length);
  setTimeout(async () => {
    try {
      await scanner.refineFolderPages(m, todo, net ? 2 : 6, (_r, i) => {
        if (i % 40 === 0 && store.getManga(m.id)) store.upsertManga({ id: m.id, pages: m.pages });
      });
      if (store.getManga(m.id)) store.upsertManga({ id: m.id, pages: m.pages });
      console.log(`[refine] ${m.name} 补全 ${todo.length} 页尺寸`);
    } catch (e) {
      console.error('[refine]', e);
    }
  }, 1500);
}

function coverUrlOf(m) {
  const c = m.cover;
  const pick = (idx) => {
    const p = m.pages && m.pages[idx];
    if (!p) return '';
    if (m.source.type === 'folder') return 'comic://local/' + encodeURIComponent(p.path);
    if (m.source.type === 'zip') return 'comic://zip/' + encodeURIComponent(m.source.path) + '/' + encodeURIComponent(p.entry);
    if (m.source.type === 'dav') return 'comic://dav/' + encodeURIComponent(m.id) + '/' + idx;
    return '';
  };
  if (c && c.type === 'file' && c.path) return 'comic://local/' + encodeURIComponent(c.path);
  if (c && c.type === 'page') return pick(c.index);
  return pick(0);
}

function summarize(m) {
  return {
    coverUrl: coverUrlOf(m),
    id: m.id,
    name: m.name,
    cover: m.cover || null,
    sourceType: m.source.type,
    sourceLabel: m.source.label || '',
    pageCount: (m.pages && m.pages.length) || m.pageCount || 0,
    kind: m.source && m.source.type === 'doc' ? 'doc' : 'image',
    format: (m.source && m.source.format) || '',
    folderId: m.folderId || null,
    parts: m.source && m.source.parts ? m.source.parts.length : 0,
    progress: m.progress || { index: 0, offset: 0 },
    createdAt: m.createdAt,
    lastReadAt: m.lastReadAt || 0,
    updatedAt: m.updatedAt || 0,
  };
}

function buildEntry({ name, source, pages, cover }) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: name || '未命名漫画',
    cover: cover || null,
    source,
    pages,
    progress: { index: 0, offset: 0 },
    createdAt: now,
    updatedAt: now,
    lastReadAt: 0,
  };
}

ipcMain.handle('app:version', () => ({
  version: app.getVersion(),
  name: app.getName(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
}));

ipcMain.handle('library:list', () => {
  const data = store.load();
  const items = data.manga.map(summarize);
  const folders = data.folders.map((f) => ({
    id: f.id,
    name: f.name,
    collapsed: !!f.collapsed,
    count: (f.items || []).length,
    items: (f.items || []).slice(),
  }));
  return { items, folders, rootOrder: data.rootOrder || [] };
});

ipcMain.handle('library:summary', (e, id) => {
  const m = store.getManga(id);
  return m ? summarize(m) : null;
});

ipcMain.handle('library:addFolder', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择漫画文件夹',
    properties: ['openDirectory', 'multiSelections', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const dirs = res.filePaths;
  const entries = [];
  const errors = [];
  await withScan('folder', dirs.length === 1 ? dirs[0] : `${dirs.length} 个文件夹`, async (report) => {
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const name = path.basename(dir);
      const pages = await scanner.scanFolder(dir, {
        onProgress: (p) => report(Object.assign({}, p, {
          label: dirs.length > 1 ? `${i + 1}/${dirs.length} · ${name}` : name,
        })),
      });
      if (!pages.length) { errors.push(`${name}：没有图片文件`); continue; }
      const entry = buildEntry({
        name: name || '未命名漫画',
        source: { type: 'folder', path: dir, label: dir },
        pages,
      });
      store.upsertManga(entry);
      entries.push(summarize(entry));
      scheduleRefine(entry);
    }
    return { entries };
  }).catch((e) => { errors.push(e.message || String(e)); });
  if (!entries.length) return { canceled: false, error: errors.join('；') || '没有可添加的文件夹' };
  return { entry: entries[0], entries, error: errors.join('；') || undefined };
});

ipcMain.handle('library:addZip', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择漫画压缩包',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '漫画压缩包', extensions: ['zip', 'cbz'] }],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const entries = [];
  const errors = [];
  await withScan('zip', res.filePaths.length === 1 ? path.basename(res.filePaths[0]) : `${res.filePaths.length} 个压缩包`, async (report) => {
  for (const zipPath of res.filePaths) {
    let pages = [];
    try {
      pages = await scanner.scanZip(zipPath, {
        onProgress: (p) => report(Object.assign({}, p, { label: path.basename(zipPath) })),
      });
    } catch (e) { errors.push(`${path.basename(zipPath)}：无法读取`); continue; }
    if (!pages.length) { errors.push(`${path.basename(zipPath)}：没有图片文件`); continue; }
    const entry = buildEntry({
      name: path.basename(zipPath).replace(/\.(zip|cbz)$/i, ''),
      source: { type: 'zip', path: zipPath, label: zipPath },
      pages,
    });
    store.upsertManga(entry);
    entries.push(summarize(entry));
  }
  return { entries };
  }).catch((e) => { errors.push(e.message || String(e)); });
  if (!entries.length) return { canceled: false, error: errors.join('；') || '没有可添加的压缩包' };
  return { entry: entries[0], entries, error: errors.join('；') || undefined };
});

ipcMain.handle('library:addDoc', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择电子书',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '电子书', extensions: ['pdf', 'epub', 'mobi', 'azw3', 'fb2'] }],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const entries = [];
  const errors = [];
  for (const file of res.filePaths) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!['pdf', 'epub', 'mobi', 'azw3'].includes(ext)) {
      errors.push(`${path.basename(file)}：暂不支持该格式`);
      continue;
    }
    const entry = buildEntry({
      name: path.basename(file, path.extname(file)),
      source: { type: 'doc', format: ext, path: file, label: file },
      pages: [],
    });
    store.upsertManga(entry);
    entries.push(summarize(entry));
  }
  if (!entries.length) return { canceled: false, error: errors.join('；') || '没有可添加的文件' };
  return { entry: entries[0], entries, error: errors.join('；') || undefined };
});

const DOC_EXTS = ['pdf', 'epub', 'mobi', 'azw3'];

function docParts(files) {
  return files.map((f) => ({
    path: f,
    format: path.extname(f).slice(1).toLowerCase(),
    name: path.basename(f, path.extname(f)),
  }));
}

/** 从一组文件名推断合集名（取公共前缀，去掉末尾的分隔符） */
function seriesName(files) {
  const names = files.map((f) => path.basename(f, path.extname(f)));
  if (names.length === 1) return names[0];
  let prefix = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i] === n[i]) i++;
    prefix = prefix.slice(0, i);
  }
  prefix = prefix.replace(/[\s._\-－—(（\[【]*$/, '').trim();
  return prefix.length >= 2 ? prefix : names[0];
}

ipcMain.handle('library:addDocSeries', async (e, mode) => {
  let files = [];
  let name = '';
  if (mode === 'folder') {
    const res = await dialog.showOpenDialog(win, {
      title: '选择包含多卷的文件夹',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const dir = res.filePaths[0];
    let entries = [];
    try { entries = await fsp.readdir(dir); } catch (err) { return { canceled: false, error: '无法读取文件夹' }; }
    files = entries
      .filter((f) => DOC_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
      .map((f) => path.join(dir, f))
      .sort(scanner.naturalCompare);
    name = path.basename(dir) || seriesName(files);
  } else {
    const res = await dialog.showOpenDialog(win, {
      title: '选择多个电子书文件（合成一本）',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '电子书', extensions: DOC_EXTS }],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    files = res.filePaths.slice().sort(scanner.naturalCompare);
    name = seriesName(files);
  }
  if (!files.length) return { canceled: false, error: '没有找到可用的电子书文件' };
  const parts = docParts(files);
  const entry = buildEntry({
    name,
    source: {
      type: 'doc',
      format: parts[0].format,
      path: parts[0].path,
      label: parts.map((p) => p.name).join(' + '),
      parts,
    },
    pages: [],
  });
  store.upsertManga(entry);
  return { entry: summarize(entry) };
});

ipcMain.handle('library:addDav', async (e, info) => {
  const { url, user, pass, token, type } = info || {};
  if (!url) return { canceled: false, error: '请填写 WebDAV 地址' };
  const normalized = url.trim().replace(/\/+$/, '');
  const auth = type === 'bearer'
    ? { type: 'bearer', token: token || '' }
    : (user ? { type: 'basic', user, pass: pass || '' } : { type: 'none' });
  let pages;
  try {
    pages = await withScan('dav', normalized, async (report) => {
      return scanner.scanDav(normalized, auth, {
        onProgress: (p) => report(Object.assign({}, p, { label: '网络存储' })),
      });
    });
  } catch (err) {
    return { canceled: false, error: '连接失败：' + (err && err.message ? err.message : String(err)) };
  }
  if (!pages.length) return { canceled: false, error: '该目录下没有找到图片文件' };
  const label = normalized.split('/').filter(Boolean).pop() || normalized;
  const entry = buildEntry({
    name: label,
    source: { type: 'dav', url: normalized, auth, label: normalized },
    pages,
  });
  store.upsertManga(entry);
  return { entry: summarize(entry) };
});

ipcMain.handle('library:createFolder', (e, name) => {
  const f = store.addFolder(name);
  return { id: f.id, name: f.name, collapsed: false, count: 0 };
});

ipcMain.handle('library:updateFolder', (e, id, patch) => {
  const f = store.updateFolder(id, patch);
  return f ? { id: f.id, name: f.name, collapsed: !!f.collapsed, count: (f.items || []).length } : null;
});

ipcMain.handle('library:removeFolder', (e, id) => store.removeFolder(id));

ipcMain.handle('library:move', (e, payload) => store.moveItem(payload));

ipcMain.handle('library:update', (e, id, patch) => {
  const m = store.getManga(id);
  if (!m) return null;
  if (patch && patch.name !== undefined) m.name = String(patch.name);
  if (patch && patch.cover !== undefined) m.cover = patch.cover;
  if (patch && patch.direction !== undefined) m.direction = patch.direction;
  if (patch && patch.pageCount !== undefined) m.pageCount = patch.pageCount;
  m.updatedAt = Date.now();
  store.upsertManga(m);
  return summarize(m);
});

ipcMain.handle('library:remove', (e, id) => {
  store.removeManga(id);
  return true;
});

ipcMain.handle('library:rescan', async (e, id) => {
  const m = store.getManga(id);
  if (!m) return { error: '条目不存在' };
  let pages = [];
  try {
    pages = await withScan('rescan', m.name, async (report) => {
      if (m.source.type === 'folder') return scanner.scanFolder(m.source.path, { onProgress: report });
      if (m.source.type === 'zip') return scanner.scanZip(m.source.path, { onProgress: report });
      if (m.source.type === 'dav') return scanner.scanDav(m.source.url, m.source.auth, { onProgress: report });
      return [];
    });
  } catch (err) {
    return { error: '扫描失败：' + (err && err.message ? err.message : String(err)) };
  }
  m.pages = pages;
  m.updatedAt = Date.now();
  if (m.progress.index > pages.length) m.progress = { index: 0, offset: 0 };
  store.upsertManga(m);
  scheduleRefine(m);
  return { entry: summarize(m) };
});

ipcMain.handle('manga:get', (e, id) => {
  const m = store.getManga(id);
  if (!m) return null;
  // 源是否还在（NAS 可能掉线）
  let sourceAvailable = true;
  if (m.source.type === 'folder' || m.source.type === 'zip') {
    try { sourceAvailable = fs.existsSync(m.source.path); } catch (_) { sourceAvailable = false; }
  }
  return Object.assign({}, m, { summary: summarize(m), sourceAvailable });
});

ipcMain.handle('reader:saveProgress', (e, id, progress) => {
  const m = store.getManga(id);
  if (!m) return null;
  m.progress = { index: progress.index | 0, offset: progress.offset || 0 };
  m.lastReadAt = Date.now();
  store.upsertManga(m);
  return summarize(m);
});

ipcMain.handle('settings:get', () => store.load().settings);

ipcMain.handle('settings:set', (e, patch) => {
  Object.assign(store.load().settings, patch || {});
  store.save();
  return store.load().settings;
});

ipcMain.handle('dialog:pickImage', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: '选择封面图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('shell:openPath', async (e, p) => shell.openPath(p));

// 清理缓存：Chromium 磁盘缓存 + 内存图片缓存
ipcMain.handle('cache:clear', async () => {
  const freed = protocol.memUsage();
  protocol.clearMemCache();
  try {
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData({ storages: ['cachestorage', 'diskcache'] });
  } catch (e) {
    console.error('[cache] 清理失败', e);
  }
  return { freed };
});

ipcMain.handle('cache:usage', () => ({ mem: protocol.memUsage() }));

ipcMain.handle('shell:showItem', (e, p) => {
  if (!p) return false;
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p);
    else shell.showItemInFolder(p);
    return true;
  } catch (_) { return false; }
});

/* --------------------------- 生命周期 --------------------------- */

app.whenReady().then(() => {
  buildMenu();
  protocol.registerHandler();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  zipreader.closeAll();
  store.flush();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  zipreader.closeAll();
  store.flush();
});

// 开发期自动截图：npm run dev -- --capture=/path/out.png
const captureArg = process.argv.find((a) => a.startsWith('--capture='));
if (captureArg) {
  const out = captureArg.split('=').slice(1).join('=');
  setTimeout(() => {
    if (!win) return;
    win.webContents.capturePage().then((img) => {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, img.toPNG());
      console.log('captured ->', out);
      app.quit();
    }).catch((e) => { console.error(e); app.quit(); });
  }, Number((process.argv.find((a) => a.startsWith('--capture-delay=')) || '').split('=')[1] || 4000));
}
