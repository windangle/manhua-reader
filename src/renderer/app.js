'use strict';
import { el, toast, openModal, confirmDialog } from './util.js';
import { Reader, pageUrl } from './reader.js';
import { initScanUI } from './scan.js';

const $ = (id) => document.getElementById(id);

const state = {
  items: [],
  folders: [],
  rootOrder: [],
  filter: '',
  settings: { zoom: 1, background: 'dark' },
  reader: null,
  busy: false,
  drag: null,
};

const reader = new Reader(() => {
  // 退出阅读器：必须把书架显示回来，否则会停在空白页
  $('reader-view').classList.add('hidden');
  $('library-view').classList.remove('hidden');
  refreshLibrary();
});
state.reader = reader;

/* ============================ 书架 ============================ */

async function refreshLibrary() {
  const data = await window.api.library.list();
  state.items = data.items || [];
  state.folders = data.folders || [];
  state.rootOrder = data.rootOrder || [];
  renderLibrary();
}

function renderLibrary() {
  const grid = $('lib-grid');
  grid.innerHTML = '';
  const q = state.filter.trim().toLowerCase();
  const match = (m) => !q || m.name.toLowerCase().includes(q);
  const matched = state.items.filter(match);
  const matchedIds = new Set(matched.map((m) => m.id));

  // 可见的文件夹：有匹配的书，或自身名字匹配
  const visibleFolders = state.folders.filter((f) => {
    if (!q) return true;
    if (f.name.toLowerCase().includes(q)) return true;
    return state.items.some((m) => m.folderId === f.id && matchedIds.has(m.id));
  });
  const visibleFolderIds = new Set(visibleFolders.map((f) => f.id));

  // 根层顺序
  const rootKeys = state.rootOrder.filter((k) => {
    if (k.startsWith('f:')) return visibleFolderIds.has(k.slice(2));
    return matchedIds.has(k.slice(2));
  });
  for (const m of matched) {
    if (!m.folderId && !rootKeys.includes('b:' + m.id)) rootKeys.push('b:' + m.id);
  }

  $('lib-count').textContent = state.items.length ? `${matched.length} / ${state.items.length} 本` : '';
  $('lib-empty').classList.toggle('hidden', matched.length > 0 || visibleFolders.length > 0);
  grid.classList.toggle('hidden', matched.length === 0 && visibleFolders.length === 0);

  const byId = new Map(state.items.map((m) => [m.id, m]));
  for (const key of rootKeys) {
    if (key.startsWith('f:')) {
      const f = visibleFolders.find((x) => x.id === key.slice(2));
      if (f) grid.appendChild(renderFolder(f, byId, matchedIds, q));
    } else {
      const m = byId.get(key.slice(2));
      if (m) grid.appendChild(renderCard(m));
    }
  }
}

/** 渲染一个收藏夹 */
function renderFolder(folder, byId, matchedIds, q) {
  const items = (folder.items || []).map((id) => byId.get(id)).filter(Boolean)
    .filter((m) => matchedIds.has(m.id) || !q);
  const wrap = el('section', {
    class: 'folder',
    'data-folder-id': folder.id,
  });
  const head = el('div', {
    class: 'folder-head',
    'data-drop-type': 'folder',
    'data-drop-folder': folder.id,
    'data-drag-type': 'folder',
    'data-drag-id': folder.id,
    draggable: 'true',
  }, [
    el('span', { class: 'folder-caret', text: folder.collapsed ? '▸' : '▾' }),
    el('span', { class: 'folder-ico', text: '📁' }),
    el('span', { class: 'folder-name', text: folder.name }),
    el('span', { class: 'folder-count', text: `${items.length} 本` }),
  ]);
  head.addEventListener('click', (e) => {
    if (e.target.closest('.folder-caret') || e.target.closest('.folder-name')) {
      window.api.library.updateFolder(folder.id, { collapsed: !folder.collapsed }).then(refreshLibrary);
    }
  });
  const menuBtn = el('button', { class: 'folder-menu', text: '⋯', title: '文件夹操作' });
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openFolderMenu(e.currentTarget, folder);
  });
  head.appendChild(menuBtn);
  wrap.appendChild(head);

  if (!folder.collapsed) {
    const body = el('div', {
      class: 'folder-body',
      'data-drop-type': 'folder',
      'data-drop-folder': folder.id,
    });
    if (!items.length) {
      body.appendChild(el('div', { class: 'folder-empty', text: '把书拖进来，或用卡片菜单「移动到文件夹」' }));
    }
    for (const m of items) body.appendChild(renderCard(m));
    wrap.appendChild(body);
  }
  return wrap;
}

/** 渲染一本书的卡片 */
function renderCard(m) {
  const pct = m.pageCount ? Math.min(100, Math.round(((m.progress.index || 0) + 1) / m.pageCount * 100)) : 0;
  const cover = el('div', { class: 'cover' });
  if (m.coverUrl) {
    cover.appendChild(el('img', { src: m.coverUrl + '?v=' + (m.updatedAt || 0), alt: m.name, loading: 'lazy' }));
  } else {
    cover.appendChild(el('div', { class: 'fallback', text: m.kind === 'doc' ? '📕' : '📗' }));
  }
  if (m.pageCount) {
    const unit = (m.kind === 'doc' && m.format !== 'pdf') ? '章' : '页';
    cover.appendChild(el('div', { class: 'badge', text: `${m.pageCount} ${unit}` }));
  }
  if (m.parts > 1) cover.appendChild(el('div', { class: 'badge parts', text: `${m.parts} 卷` }));

  const body = el('div', { class: 'card-body' }, [
    el('div', { class: 'card-title', text: m.name }),
    el('div', { class: 'card-meta' }, [
      el('span', { text: sourceLabel(m) }),
      el('span', { text: '·' }),
      el('span', { text: m.pageCount ? `读到第 ${(m.progress.index || 0) + 1} ${m.kind === 'doc' && m.format !== 'pdf' ? '章' : '页'}` : '未开始' }),
    ]),
    el('div', { class: 'progress-bar' }, [el('i', { style: { width: pct + '%' } })]),
  ]);

  const menuBtn = el('button', { class: 'card-menu', text: '⋯', title: '更多操作' });
  menuBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openCardMenu(ev.currentTarget, m);
  });

  const card = el('div', {
    class: 'card',
    title: m.name,
    'data-drag-type': 'book',
    'data-drag-id': m.id,
    'data-drop-type': 'book',
    'data-drop-book': m.id,
    draggable: 'true',
  }, [cover, body, menuBtn]);
  card.addEventListener('click', () => openManga(m.id));
  return card;
}

function sourceLabel(m) {
  if (m.sourceType === 'folder') return '本地文件夹';
  if (m.sourceType === 'zip') return '本地压缩包';
  if (m.sourceType === 'dav') return '网络存储';
  if (m.sourceType === 'doc') {
    const names = { pdf: 'PDF', epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3' };
    return '电子书 · ' + (names[m.format] || (m.format || '').toUpperCase());
  }
  return '';
}

/* ============================ 添加 ============================ */

function openAddMenu(anchor) {
  const menu = $('add-menu');
  menu.classList.toggle('hidden');
  if (!menu.classList.contains('hidden')) {
    const close = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        menu.classList.add('hidden');
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close));
  }
}

async function addFolder() {
  $('add-menu').classList.add('hidden');
  if (state.busy) return;
  state.busy = true;
  try {
    const res = await window.api.library.addFolder();
    if (res.canceled) return;
    if (res.error) { toast(res.error, 'err'); return; }
    await refreshLibrary();
    toast(res.entries && res.entries.length > 1 ? `已添加 ${res.entries.length} 本漫画` : '已添加：' + res.entry.name);
    if (res.error) toast(res.error, 'err');
  } finally { state.busy = false; }
}

async function addZip() {
  $('add-menu').classList.add('hidden');
  if (state.busy) return;
  state.busy = true;
  try {
    const res = await window.api.library.addZip();
    if (res.canceled) return;
    if (res.error) { toast(res.error, 'err'); return; }
    await refreshLibrary();
    toast(res.entries && res.entries.length > 1 ? `已添加 ${res.entries.length} 本漫画` : '已添加：' + res.entry.name);
    if (res.error) toast(res.error, 'err');
  } finally { state.busy = false; }
}

async function addDoc() {
  $('add-menu').classList.add('hidden');
  const res = await window.api.library.addDoc();
  if (res.canceled) return;
  if (res.error) { toast(res.error, 'err'); return; }
  await refreshLibrary();
  toast(res.entries && res.entries.length > 1 ? `已添加 ${res.entries.length} 本电子书` : '已添加：' + res.entry.name);
  if (res.error) toast(res.error, 'err');
}

async function addDocSeries(mode) {
  $('add-menu').classList.add('hidden');
  const res = await window.api.library.addDocSeries(mode);
  if (res.canceled) return;
  if (res.error) { toast(res.error, 'err'); return; }
  await refreshLibrary();
  toast('已添加合集：' + res.entry.name + '（' + res.entry.parts + ' 卷）');
}

function addDav() {
  $('add-menu').classList.add('hidden');
  const url = el('input', { type: 'text', placeholder: 'https://dav.example.com/remote.php/dav/files/user/书籍' });
  const authType = el('select', {}, [
    el('option', { value: 'none', text: '无认证' }),
    el('option', { value: 'basic', text: '用户名 / 密码' }),
    el('option', { value: 'bearer', text: 'Token (Bearer)' }),
  ]);
  const user = el('input', { type: 'text', placeholder: '用户名' });
  const pass = el('input', { type: 'password', placeholder: '密码' });
  const token = el('input', { type: 'password', placeholder: '访问令牌' });
  const userRow = el('div', { class: 'row', style: { display: 'none' } }, [user, pass]);
  const tokenRow = el('div', { class: 'row', style: { display: 'none' } }, [token]);

  authType.addEventListener('change', () => {
    userRow.style.display = authType.value === 'basic' ? 'flex' : 'none';
    tokenRow.style.display = authType.value === 'bearer' ? 'flex' : 'none';
  });

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
    el('div', { class: 'field' }, [el('label', { text: 'WebDAV 地址' }), url]),
    el('div', { class: 'field' }, [el('label', { text: '认证方式' }), authType]),
    userRow,
    tokenRow,
    el('div', { class: 'hint', text: '支持坚果云、Nextcloud、群晖等标准 WebDAV。目录下的图片（含子目录）会被识别为漫画页。' }),
  ]);

  openModal({
    title: '添加网络存储（WebDAV）',
    body,
    actions: [
      { label: '取消' },
      {
        label: '连接并添加',
        primary: true,
        onClick: async () => {
          const info = {
            url: url.value.trim(),
            type: authType.value,
            user: user.value,
            pass: pass.value,
            token: token.value,
          };
          if (!info.url) { toast('请填写地址', 'err'); return false; }
          toast('正在连接并扫描…');
          const res = await window.api.library.addDav(info);
          if (res.error) { toast(res.error, 'err'); return false; }
          await refreshLibrary();
          toast('已添加：' + res.entry.name);
          return true;
        },
      },
    ],
  });
}

/* ============================ 卡片菜单 ============================ */

function openCardMenu(anchor, m) {
  document.querySelectorAll('.popup-menu').forEach((n) => n.remove());
  const menu = el('div', { class: 'dropdown popup-menu', style: { position: 'fixed', display: 'block' } }, [
    el('button', { text: '📖  开始 / 继续阅读', onclick: () => { menu.remove(); openManga(m.id); } }),
    el('button', { text: '✏️  编辑名称与封面', onclick: () => { menu.remove(); openEditor(m.id); } }),
    el('button', { text: '📁  移动到文件夹', onclick: () => { menu.remove(); openMoveToFolder(m); } }),
    el('button', { text: '🔄  重新扫描资源', onclick: async () => { menu.remove(); await rescan(m.id); } }),
    m.sourceType !== 'dav' ? el('button', {
      text: '📂  在访达中显示',
      onclick: () => { menu.remove(); window.api.shell.showItem(m.sourceLabel); },
    }) : null,
    el('button', { text: '🗑  从书架移除', onclick: async () => { menu.remove(); await removeManga(m); } }),
  ]);
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
  menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 6) + 'px';

  const close = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); }
  };
  setTimeout(() => document.addEventListener('mousedown', close));
}

async function rescan(id) {
  toast('正在重新扫描…');
  const res = await window.api.library.rescan(id);
  if (res.error) { toast(res.error, 'err'); return; }
  await refreshLibrary();
  toast('扫描完成，共 ' + res.entry.pageCount + ' 页');
}

async function removeManga(m) {
  const ok = await confirmDialog('移除漫画', `确定把《${m.name}》从书架移除吗？（不会删除原始文件）`, '移除');
  if (!ok) return;
  await window.api.library.remove(m.id);
  await refreshLibrary();
  toast('已移除');
}

/* ============================ 文件夹 ============================ */

function openFolderMenu(anchor, folder) {
  document.querySelectorAll('.popup-menu').forEach((n) => n.remove());
  const menu = el('div', { class: 'dropdown popup-menu', style: { position: 'fixed', display: 'block' } }, [
    el('button', { text: '✏️  重命名', onclick: () => { menu.remove(); renameFolder(folder); } }),
    el('button', { text: '🗑  删除文件夹（书移到根目录）', onclick: async () => {
      menu.remove();
      const ok = await confirmDialog('删除文件夹', `删除「${folder.name}」？里面的书会回到书架根目录。`, '删除');
      if (!ok) return;
      await window.api.library.removeFolder(folder.id);
      await refreshLibrary();
      toast('已删除文件夹');
    } }),
  ]);
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px';
  menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 8, r.bottom + 6) + 'px';
  const close = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); }
  };
  setTimeout(() => document.addEventListener('mousedown', close));
}

async function renameFolder(folder) {
  const input = el('input', { type: 'text', value: folder.name });
  const m = openModal({
    title: '重命名文件夹',
    body: el('div', { class: 'field' }, [el('label', { text: '名称' }), input]),
    actions: [
      { label: '取消' },
      { label: '保存', primary: true, onClick: async () => {
        const name = input.value.trim();
        if (!name) { toast('名称不能为空', 'err'); return false; }
        await window.api.library.updateFolder(folder.id, { name });
        await refreshLibrary();
        return true;
      } },
    ],
  });
}

async function createFolder() {
  const input = el('input', { type: 'text', value: '新建文件夹' });
  openModal({
    title: '新建文件夹',
    body: el('div', { class: 'field' }, [el('label', { text: '名称' }), input]),
    actions: [
      { label: '取消' },
      { label: '创建', primary: true, onClick: async () => {
        const name = input.value.trim();
        if (!name) { toast('名称不能为空', 'err'); return false; }
        await window.api.library.createFolder(name);
        await refreshLibrary();
        toast('已创建文件夹');
        return true;
      } },
    ],
  });
}

/** 移动到指定文件夹 */
async function openMoveToFolder(m) {
  const list = el('div', { class: 'move-list' });
  for (const f of state.folders) {
    list.appendChild(el('button', {
      class: 'move-item', text: '📁 ' + f.name,
      onclick: async () => {
        await window.api.library.move({ id: m.id, type: 'book', targetFolderId: f.id, index: 9999 });
        await refreshLibrary();
        toast(`已移动到「${f.name}」`);
        close();
      },
    }));
  }
  list.appendChild(el('button', {
    class: 'move-item', text: '📚 移到书架根目录',
    onclick: async () => {
      await window.api.library.move({ id: m.id, type: 'book', targetFolderId: null, index: 9999 });
      await refreshLibrary();
      toast('已移到书架根目录');
      close();
    },
  }));
  const modal = openModal({ title: '移动到文件夹', body: list });
  const close = modal.close;
}

/* ============================ 拖拽排序 ============================ */

function levelKeys(folderId) {
  if (!folderId) return state.rootOrder.slice();
  const f = state.folders.find((x) => x.id === folderId);
  return (f && f.items ? f.items : []).map((id) => 'b:' + id);
}

function clearDropMarks() {
  document.querySelectorAll('.drop-before, .drop-after, .drop-into').forEach((n) => {
    n.classList.remove('drop-before', 'drop-after', 'drop-into');
  });
  $('lib-grid').classList.remove('drop-root');
}

function initDnD() {
  const grid = $('lib-grid');

  grid.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag-type]');
    if (!handle) return;
    state.drag = { type: handle.dataset.dragType, id: handle.dataset.dragId };
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(state.drag));
      e.dataTransfer.effectAllowed = 'move';
    } catch (_) { /* 某些浏览器限制 */ }
    handle.classList.add('dragging');
  });

  grid.addEventListener('dragend', () => {
    clearDropMarks();
    document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    state.drag = null;
  });

  grid.addEventListener('dragover', (e) => {
    if (!state.drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropMarks();
    const target = e.target.closest('[data-drop-type]');
    if (!target) {
      grid.classList.add('drop-root');
      return;
    }
    if (target.dataset.dropType === 'folder') {
      target.classList.add('drop-into');
      return;
    }
    // 书籍卡片：按中线判断插入前/后
    const r = target.getBoundingClientRect();
    const after = (e.clientY > r.top + r.height / 2) || (e.clientX > r.left + r.width / 2);
    target.classList.add(after ? 'drop-after' : 'drop-before');
  });

  grid.addEventListener('drop', async (e) => {
    if (!state.drag) return;
    e.preventDefault();
    const drag = state.drag;
    const target = e.target.closest('[data-drop-type]');
    clearDropMarks();
    document.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
    state.drag = null;

    let payload = null;
    if (!target) {
      // 拖到空白处 → 根目录末尾
      payload = { id: drag.id, type: drag.type, targetFolderId: null, index: 9999 };
    } else if (target.dataset.dropType === 'folder') {
      const fid = target.dataset.dropFolder;
      const f = state.folders.find((x) => x.id === fid);
      payload = { id: drag.id, type: drag.type, targetFolderId: fid, index: f ? (f.items || []).length : 0 };
    } else {
      const targetId = target.dataset.dropBook;
      const tm = state.items.find((x) => x.id === targetId);
      if (!tm) return;
      const level = tm.folderId || null;
      const keys = levelKeys(level);
      let idx = keys.indexOf('b:' + targetId);
      if (idx < 0) idx = 0;
      if (target.classList.contains('drop-after')) idx += 1;
      payload = { id: drag.id, type: drag.type, targetFolderId: level, index: idx };
    }
    if (!payload) return;
    // 文件夹只能在根层
    if (payload.type === 'folder') payload.targetFolderId = null;
    await window.api.library.move(payload);
    await refreshLibrary();
  });
}

/* ============================ 编辑 ============================ */

async function openEditor(id) {
  const full = await window.api.manga.get(id);
  if (!full) return;

  let cover = full.cover ? Object.assign({}, full.cover) : null;
  const nameInput = el('input', { type: 'text', value: full.name });
  const dirSelect = el('select', {}, [
    el('option', { value: 'down', text: '向下阅读（竖排长图，向下翻页）' }),
    el('option', { value: 'left', text: '向左阅读（横排，向左翻页，第 1 页在最右）' }),
    el('option', { value: 'right', text: '向右阅读（横排，向右翻页，第 1 页在最左）' }),
  ]);
  dirSelect.value = full.direction || 'down';

  const preview = el('div', { class: 'cover-preview' });
  const renderPreview = () => {
    preview.innerHTML = '';
    const url = coverUrlFor(full, cover);
    if (url) preview.appendChild(el('img', { src: url + '?v=' + Date.now(), alt: '封面' }));
  };
  renderPreview();

  const pickFromManga = async () => {
    await openPagePicker(full, cover, (sel) => { cover = sel; renderPreview(); });
  };
  const pickFromFile = async () => {
    const p = await window.api.dialog.pickImage();
    if (p) { cover = { type: 'file', path: p }; renderPreview(); }
  };
  const clearCover = () => { cover = null; renderPreview(); };

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, [
    el('div', { class: 'field' }, [el('label', { text: '漫画名称' }), nameInput]),
    el('div', { class: 'field' }, [el('label', { text: '默认阅读方向' }), dirSelect]),
    el('div', { class: 'field' }, [
      el('label', { text: '头图' }),
      el('div', { class: 'cover-picker' }, [
        preview,
        el('div', { class: 'cover-actions' }, [
          el('button', { class: 'btn small', text: '从漫画页中选择', onclick: pickFromManga }),
          el('button', { class: 'btn small', text: '从文件选择', onclick: pickFromFile }),
          el('button', { class: 'btn small', text: '恢复默认（第一页）', onclick: clearCover }),
        ]),
      ]),
    ]),
    el('div', { class: 'hint', text: '来源：' + full.source.label + '　·　共 ' + full.pages.length + ' 页' }),
  ]);

  openModal({
    title: '编辑漫画信息',
    body,
    actions: [
      { label: '取消' },
      {
        label: '保存',
        primary: true,
        onClick: async () => {
          const res = await window.api.library.update(id, {
            name: nameInput.value.trim() || full.name,
            cover,
            direction: dirSelect.value,
          });
          if (!res) { toast('保存失败', 'err'); return false; }
          await refreshLibrary();
          toast('已保存');
          return true;
        },
      },
    ],
  });
}

function coverUrlFor(full, cover) {
  if (!cover) {
    if (full.pages && full.pages[0]) return pageUrl(full, full.pages[0], 0);
    return '';
  }
  if (cover.type === 'file') return 'comic://local/' + encodeURIComponent(cover.path);
  if (cover.type === 'page') {
    const p = full.pages[cover.index];
    return p ? pageUrl(full, p, cover.index) : '';
  }
  return '';
}

async function openPagePicker(full, current, onPick) {
  const grid = el('div', { class: 'thumbs' });
  const pages = full.pages.slice(0, 150);
  const modalRef = { close: null };
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const thumb = el('div', { class: 'thumb' + (current && current.type === 'page' && current.index === i ? ' selected' : '') }, [
      el('img', { src: pageUrl(full, p, i) + '?v=' + (full.updatedAt || 0), loading: 'lazy', alt: String(i + 1) }),
    ]);
    thumb.addEventListener('click', () => {
      grid.querySelectorAll('.thumb').forEach((t) => t.classList.remove('selected'));
      thumb.classList.add('selected');
      onPick({ type: 'page', index: i });
      if (modalRef.close) modalRef.close();
    });
    grid.appendChild(thumb);
  }
  const m = openModal({
    title: '选择头图',
    wide: true,
    body: grid,
    actions: [{ label: '取消' }],
  });
  modalRef.close = m.close;
}

/* ============================ 阅读 ============================ */

async function openManga(id) {
  const full = await window.api.manga.get(id);
  if (!full) { toast('漫画不存在', 'err'); return; }
  const isDoc = full.source && full.source.type === 'doc';
  if (!isDoc && (!full.pages || !full.pages.length)) { toast('该漫画没有可读页面', 'err'); return; }
  $('library-view').classList.add('hidden');
  $('reader-view').classList.remove('hidden');
  try {
    await reader.open(full, state.settings);
  } catch (e) {
    console.error(e);
    toast('打开失败：' + (e && e.message ? e.message : e), 'err');
    $('reader-view').classList.add('hidden');
    $('library-view').classList.remove('hidden');
  }
}

/* ============================ 初始化 ============================ */

// 扫描进度（目录 / 压缩包 / 网络盘可能很慢，给出明确反馈）
const scanUI = initScanUI(async () => {
  await refreshLibrary();
});
window.__app = window.__app || {};
window.__app.scan = scanUI;

function bindUI() {
  $('btn-add').addEventListener('click', (e) => { e.stopPropagation(); openAddMenu(e.currentTarget); });
  $('btn-add-empty').addEventListener('click', (e) => { e.stopPropagation(); openAddMenu($('btn-add')); });
  $('add-menu').addEventListener('click', (e) => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'folder') addFolder();
    else if (act === 'zip') addZip();
    else if (act === 'dav') addDav();
    else if (act === 'doc') addDoc();
    else if (act === 'doc-series-files') addDocSeries('files');
    else if (act === 'doc-series-folder') addDocSeries('folder');
  });
  $('search').addEventListener('input', (e) => { state.filter = e.target.value; renderLibrary(); });

  $('btn-new-folder').addEventListener('click', createFolder);
  initDnD();

  // 版本号
  window.api.version().then((info) => {
    const chip = $('app-version');
    if (!chip) return;
    chip.textContent = 'v' + info.version;
    chip.title = `${info.name} v${info.version}\nElectron ${info.electron} · Chromium ${info.chrome}`;
  }).catch(() => {});

  $('btn-cache').addEventListener('click', async () => {
    const res = await window.api.cache.clear();
    const mb = (res.freed / 1024 / 1024).toFixed(1);
    toast(`缓存已清理（释放约 ${mb} MB 内存占用）`);
  });

  window.api.onMenu((action) => {
    if (action === 'add-folder') addFolder();
    else if (action === 'add-zip') addZip();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('reader-view').classList.contains('hidden')) return;
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddMenu($('btn-add')); }
  });
}

// 便于自动化测试/调试
window.__app = Object.assign(window.__app || {}, {
  state, reader, refreshLibrary, openManga, renderLibrary, openEditor, openPagePicker, addDav,
});

(async function init() {
  bindUI();
  state.settings = await window.api.settings.get();
  await refreshLibrary();
  const params = new URLSearchParams(location.search);
  const docId = params.get('doc');
  if (docId) {
    openManga(docId);
  } else if (params.get('autoopen') === '1' && state.items.length) {
    openManga(state.items[0].id);
  }
})();
