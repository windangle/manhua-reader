(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DAV2]', ...a);
  await sleep(1500);
  const app = window.__app;
  const res = await window.api.library.addDav({ url: 'http://127.0.0.1:8899/dav/测试漫画', type: 'none' });
  if (res.error) { log('addDav failed', res.error); return; }
  await app.refreshLibrary();
  await app.openManga(res.entry.id);
  await sleep(2000);
  const total = app.reader.pages.length;
  for (let i = 0; i < total; i++) { app.reader.gotoPage(i); await sleep(250); }
  await sleep(1000);
  const usage = await window.api.cache.usage();
  log('内存图片缓存 =', (usage.mem / 1024 / 1024).toFixed(2), 'MB', '（网络资源，仅存内存）');
  const cleared = await window.api.cache.clear();
  log('清理释放 =', (cleared.freed / 1024 / 1024).toFixed(2), 'MB');
  const after = await window.api.cache.usage();
  log('清理后 =', (after.mem / 1024 / 1024).toFixed(2), 'MB');
  log('DONE');
})()
