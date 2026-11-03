(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  const m = app.state.items.find((x) => x.sourceType === 'folder' && x.pageCount >= 5 && x.pageCount <= 100);
  await app.openManga(m.id);
  await sleep(1200);
  document.querySelector('#r-dir button[data-dir="right"]').click();
  await sleep(2500);
})()
