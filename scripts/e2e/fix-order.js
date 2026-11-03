(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  const target = '44f5d0f8-ce74-42fb-bb18-314c8f3cca0d';   // 260503-金沙湾，恢复到最前
  await window.api.library.move({ id: target, type: 'book', targetFolderId: null, index: 0 });
  await app.refreshLibrary();
  console.log('[ORD] 根层首项 =', app.state.rootOrder[0]);
})()
