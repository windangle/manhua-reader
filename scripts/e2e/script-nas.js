(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[NAS]', ...a);
  await sleep(1500);
  const app = window.__app;
  const m = app.state.items.find((x) => (x.sourceLabel || '').indexOf('/Volumes/') === 0);
  if (!m) { log('没有找到 NAS 漫画'); return; }
  log('打开:', m.name, '| 页数:', m.pageCount);
  const t0 = performance.now();
  await app.openManga(m.id);
  await sleep(500);
  log('打开耗时(ms):', Math.round(performance.now() - t0));
  app.reader.gotoPage(10);
  await sleep(6000);
  const img = document.querySelector('.page[data-i="10"] img');
  log('第 11 页加载 =', img && img.naturalWidth > 0, '| naturalWidth =', img && img.naturalWidth, '| naturalHeight =', img && img.naturalHeight);
  const t1 = performance.now();
  app.reader.gotoPage(11);
  await sleep(5000);
  const img2 = document.querySelector('.page[data-i="11"] img');
  log('第 12 页加载 =', img2 && img2.naturalWidth > 0, '| 耗时(ms) =', Math.round(performance.now() - t1));
  log('DONE');
})()
