(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DAV]', ...a);
  await sleep(1500);
  const app = window.__app;
  const res = await window.api.library.addDav({ url: 'http://127.0.0.1:8899/dav/测试漫画', type: 'none' });
  log('addDav result =', JSON.stringify(res).slice(0, 200));
  if (res.error) return;
  await app.refreshLibrary();
  const id = res.entry.id;
  await app.openManga(id);
  await sleep(2500);
  const img = document.querySelector('.page[data-i="0"] img');
  log('dav page1 loaded =', img && img.naturalWidth > 0, 'w=', img && img.naturalWidth);
  log('dav pages =', app.reader.pages.length);
  app.reader.gotoPage(6);
  await sleep(2500);
  const img6 = document.querySelector('.page[data-i="6"] img');
  log('dav page7 loaded =', img6 && img6.naturalWidth > 0);
  log('DONE');
})()
