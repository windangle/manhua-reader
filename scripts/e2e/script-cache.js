(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[CACHE]', ...a);
  await sleep(1500);
  const app = window.__app;
  const id = app.state.items[0].id;
  await app.openManga(id);
  await sleep(1200);
  const total = app.reader.pages.length;
  for (let i = 0; i < total; i++) {
    app.reader.gotoPage(i);
    await sleep(220);
  }
  await sleep(1500);
  const imgs = [...document.querySelectorAll('.page img')].filter((i) => i.naturalWidth > 0).length;
  log('已加载图片数 =', imgs, '/', total);
  const usage = await window.api.cache.usage();
  log('内存图片缓存 =', (usage.mem / 1024 / 1024).toFixed(2), 'MB');
  log('DONE');
})()
