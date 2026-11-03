(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DND]', ...a);
  await sleep(1500);
  const app = window.__app;
  const api = window.api;

  // 1) 建文件夹
  const f1 = await api.library.createFolder('漫画合集');
  const f2 = await api.library.createFolder('技术书');
  await app.refreshLibrary();
  log('文件夹数 =', app.state.folders.length, '| 根层顺序 =', app.state.rootOrder.join(','));

  // 2) 把一本书移进文件夹
  const book = app.state.items.find((m) => m.id === 'test-folder-1');
  await api.library.move({ id: book.id, type: 'book', targetFolderId: f1.id, index: 0 });
  await app.refreshLibrary();
  log('移动后 文件夹内数量 =', app.state.folders.find((f) => f.id === f1.id).count,
      '| 书的 folderId =', app.state.items.find((m) => m.id === book.id).folderId);
  log('DOM: 文件夹块数 =', document.querySelectorAll('.folder').length, '| 文件夹内卡片数 =', document.querySelectorAll('.folder-body .card').length);

  // 3) 模拟拖拽：把书拖到另一张书后面
  const grid = document.getElementById('lib-grid');
  const cards = [...grid.querySelectorAll('.card[data-drop-type="book"]')];
  if (cards.length >= 2) {
    const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: '', dropEffect: '' };
    const mk = (type, target, extra = {}) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      Object.assign(ev, extra);
      target.dispatchEvent(ev);
    };
    const before = app.state.rootOrder.join(',');
    mk('dragstart', cards[0]);
    const r = cards[1].getBoundingClientRect();
    mk('dragover', cards[1], { clientY: r.top + r.height * 0.8, clientX: r.left + 10 });
    mk('drop', cards[1], { clientY: r.top + r.height * 0.8, clientX: r.left + 10 });
    await sleep(600);
    log('拖拽前顺序 =', before);
    log('拖拽后顺序 =', app.state.rootOrder.join(','));
    log('顺序改变 =', before !== app.state.rootOrder.join(','));
  }
  log('DONE');
})()
