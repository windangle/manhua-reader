'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'library.json');

const DEFAULTS = () => ({
  version: 3,
  manga: [],
  folders: [],          // 手工创建的收藏夹，items 为其中的书籍 id 顺序
  rootOrder: [],        // 根层顺序，元素为 'b:<id>' 或 'f:<id>'
  settings: {
    zoom: 1,
    background: 'dark',
    lastOpened: null,
  },
});

/** 迁移到 v3：统一根层顺序 + 文件夹内 items */
function migrate(data) {
  data.folders = data.folders || [];
  (data.manga || []).forEach((m) => { if (m.folderId === undefined) m.folderId = null; });
  data.folders.forEach((f) => { if (!Array.isArray(f.items)) f.items = []; });
  if (!Array.isArray(data.rootOrder) || !data.rootOrder.length) {
    const roots = data.manga.filter((m) => !m.folderId);
    const known = new Set(data.folders.map((f) => 'f:' + f.id));
    const rootFolders = data.folders.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const order = rootFolders.map((f) => 'f:' + f.id);
    for (const m of roots) order.push('b:' + m.id);
    data.rootOrder = order;
  }
  // 清理失效引用
  const mangaIds = new Set(data.manga.map((m) => m.id));
  const folderIds = new Set(data.folders.map((f) => f.id));
  data.rootOrder = data.rootOrder.filter((it) => {
    if (it.startsWith('b:')) return mangaIds.has(it.slice(2));
    if (it.startsWith('f:')) return folderIds.has(it.slice(2));
    return false;
  });
  for (const m of data.manga) {
    if (!mangaIds.has(m.id)) continue;
    if (m.folderId && !folderIds.has(m.folderId)) m.folderId = null;
  }
  data.folders.forEach((f) => { f.items = f.items.filter((id) => mangaIds.has(id)); });
  data.version = 3;
  return data;
}

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const data = JSON.parse(raw);
    cache = Object.assign(DEFAULTS(), data);
    cache.settings = Object.assign(DEFAULTS().settings, data.settings || {});
    if (!Array.isArray(cache.manga)) cache.manga = [];
    if (!Array.isArray(cache.folders)) cache.folders = [];
    migrate(cache);
  } catch (_) {
    cache = DEFAULTS();
  }
  return cache;
}

let pendingTimer = null;

function writeNow(data) {
  const file = FILE();
  const tmp = file + '.tmp';
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('[store] 保存失败', e);
  }
}

/**
 * 保存书架数据。
 * 大漫画动辄上万页，元数据文件会到 MB 级，
 * 因此默认做 1.2 秒防抖合并写入，避免每次滚动都重写整个文件。
 */
function save(immediate) {
  const data = load();
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  if (immediate) {
    writeNow(data);
  } else {
    pendingTimer = setTimeout(() => { pendingTimer = null; writeNow(load()); }, 1200);
  }
  return data;
}

/** 退出前强制落盘 */
function flush() {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  writeNow(load());
}

function getManga(id) {
  return load().manga.find((m) => m.id === id) || null;
}

function upsertManga(entry) {
  const data = load();
  const idx = data.manga.findIndex((m) => m.id === entry.id);
  if (idx >= 0) data.manga[idx] = Object.assign(data.manga[idx], entry);
  else data.manga.unshift(entry);
  save();
  return data;
}

/* ------------------------- 收藏夹 ------------------------- */

function addFolder(name) {
  const data = load();
  const folder = {
    id: require('crypto').randomUUID(),
    name: String(name || '新建文件夹'),
    items: [],
    collapsed: false,
    createdAt: Date.now(),
  };
  data.folders.push(folder);
  data.rootOrder.push('f:' + folder.id);
  save();
  return folder;
}

function updateFolder(id, patch) {
  const data = load();
  const f = data.folders.find((x) => x.id === id);
  if (!f) return null;
  if (patch && patch.name !== undefined) f.name = String(patch.name);
  if (patch && patch.collapsed !== undefined) f.collapsed = !!patch.collapsed;
  save();
  return f;
}

function removeFolder(id) {
  const data = load();
  const i = data.folders.findIndex((f) => f.id === id);
  if (i < 0) return false;
  const folder = data.folders[i];
  data.folders.splice(i, 1);
  // 里面的书回到根目录末尾
  for (const bid of folder.items || []) {
    const m = data.manga.find((x) => x.id === bid);
    if (m) m.folderId = null;
  }
  data.rootOrder = data.rootOrder.filter((it) => it !== 'f:' + id);
  for (const bid of folder.items || []) data.rootOrder.push('b:' + bid);
  save();
  return true;
}

/**
 * 移动条目
 * @param {{id:string,type:'book'|'folder',targetFolderId:string|null,index:number}} p
 */
function moveItem(p) {
  const data = load();
  const index = Math.max(0, p.index | 0);
  if (p.type === 'folder') {
    // 文件夹只存在于根层
    const key = 'f:' + p.id;
    const i = data.rootOrder.indexOf(key);
    if (i >= 0) data.rootOrder.splice(i, 1);
    data.rootOrder.splice(Math.min(index, data.rootOrder.length), 0, key);
    save();
    return true;
  }
  const m = data.manga.find((x) => x.id === p.id);
  if (!m) return false;
  // 从原位置摘掉
  if (!m.folderId) {
    const i = data.rootOrder.indexOf('b:' + p.id);
    if (i >= 0) data.rootOrder.splice(i, 1);
  } else {
    const f = data.folders.find((x) => x.id === m.folderId);
    if (f && Array.isArray(f.items)) {
      const i = f.items.indexOf(p.id);
      if (i >= 0) f.items.splice(i, 1);
    }
  }
  // 放到新位置
  m.folderId = p.targetFolderId || null;
  if (!m.folderId) {
    data.rootOrder.splice(Math.min(index, data.rootOrder.length), 0, 'b:' + p.id);
  } else {
    const f = data.folders.find((x) => x.id === p.targetFolderId);
    if (!f) { m.folderId = null; data.rootOrder.splice(Math.min(index, data.rootOrder.length), 0, 'b:' + p.id); }
    else {
      if (!Array.isArray(f.items)) f.items = [];
      f.items.splice(Math.min(index, f.items.length), 0, p.id);
    }
  }
  save();
  return true;
}

function removeManga(id) {
  const data = load();
  const i = data.manga.findIndex((m) => m.id === id);
  if (i >= 0) { data.manga.splice(i, 1); save(); }
  return data;
}

function setSetting(k, v) {
  const data = load();
  data.settings[k] = v;
  save();
  return data.settings;
}

module.exports = {
  load, save, flush, getManga, upsertManga, removeManga, setSetting, FILE,
  addFolder, updateFolder, removeFolder, moveItem,
};
