(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[MG]', ...a);
  await sleep(1800);
  const app = window.__app;
  log('书 =', app.state.items.length, '| 文件夹 =', app.state.folders.length, '| 根层顺序 =', app.state.rootOrder.join(','));
  log('DOM 卡片 =', document.querySelectorAll('.card').length, '| 文件夹块 =', document.querySelectorAll('.folder').length);
  // 建一个文件夹并拖一本书进去，验证迁移后的数据可用
  const f = await window.api.library.createFolder('我的收藏');
  await app.refreshLibrary();
  const id = app.state.items[0].id;
  await window.api.library.move({ id, type: 'book', targetFolderId: f.id, index: 0 });
  await app.refreshLibrary();
  log('移动后 文件夹内 =', document.querySelectorAll('.folder-body .card').length, '本');
  await window.api.library.removeFolder(f.id);
  await app.refreshLibrary();
  log('删除文件夹后 卡片 =', document.querySelectorAll('.card').length, '| 书的 folderId =', app.state.items[0].folderId);
  log('DONE');
})()
