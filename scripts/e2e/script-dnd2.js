(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[D2]', ...a);
  await sleep(1500);
  const app = window.__app;
  const api = window.api;
  const grid = document.getElementById('lib-grid');

  const folder = await api.library.createFolder('测试收藏夹');
  await app.refreshLibrary();
  await sleep(300);

  const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '', dropEffect: '' };
  const mk = (type, target, extra = {}) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    Object.assign(ev, extra);
    target.dispatchEvent(ev);
  };

  // 找到根层的一张书卡与文件夹头
  const card = grid.querySelector('.card[data-drop-type="book"]');
  const head = grid.querySelector('.folder-head');
  log('根层卡片 =', card ? card.dataset.dropBook : '无', '| 文件夹 =', head ? head.dataset.dropFolder : '无');
  if (card && head) {
    const id = card.dataset.dropBook;
    mk('dragstart', card);
    mk('dragover', head, { clientY: head.getBoundingClientRect().top + 5, clientX: head.getBoundingClientRect().left + 20 });
    log('拖到文件夹上 高亮 =', head.classList.contains('drop-into'));
    mk('drop', head, { clientY: head.getBoundingClientRect().top + 5, clientX: head.getBoundingClientRect().left + 20 });
    await sleep(800);
    const m = app.state.items.find((x) => x.id === id);
    const f = app.state.folders.find((x) => x.id === folder.id);
    log('拖放后 folderId =', m.folderId, '| 文件夹数量 =', f.count, '| 一致 =', m.folderId === folder.id);
    log('DOM 文件夹内卡片 =', document.querySelectorAll('.folder-body .card').length);
  }
  log('DONE');
})()
