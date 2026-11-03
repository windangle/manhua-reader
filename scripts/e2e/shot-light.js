(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  const local = app.state.items.find((m) => m.sourceType === 'folder');
  await app.openManga(local.id);
  await sleep(1500);
  document.getElementById('r-bg').click();
  await sleep(1200);
})()
