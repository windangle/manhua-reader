(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[TEST]', ...a);
  await sleep(1500);
  const app = window.__app;

  // 1) 文件夹漫画：跳转 -> 关闭 -> 重新打开，检查进度记忆
  await app.openManga('test-folder-1');
  await sleep(1200);
  app.reader.gotoPage(9);
  await sleep(1200);
  const before = app.reader.current;
  app.reader.close();
  await sleep(900);
  const saved = (await window.api.manga.get('test-folder-1')).progress;
  log('saved progress =', JSON.stringify(saved), 'expected index 9');

  await app.openManga('test-folder-1');
  await sleep(1500);
  log('resumed index =', app.reader.current, 'expected 9');
  const img = document.querySelector('.page[data-i="9"] img');
  log('page10 img loaded =', img && img.naturalWidth > 0, 'naturalWidth=', img && img.naturalWidth);

  // 2) 缩放
  app.reader.setZoom(0.5);
  await sleep(400);
  log('zoom 50% strip width =', document.getElementById('strip').style.width, 'scroller =', document.getElementById('scroller').clientWidth);
  app.reader.setZoom(1);
  await sleep(400);

  // 3) 压缩包漫画
  app.reader.close();
  await sleep(600);
  await app.openManga('test-zip-1');
  await sleep(1500);
  app.reader.gotoPage(0);      // 跳到首页，确保它进入懒加载范围
  await sleep(2000);
  const zimg = document.querySelector('.page[data-i="0"] img');
  log('zip page1 loaded =', zimg && zimg.naturalWidth > 0, 'naturalWidth=', zimg && zimg.naturalWidth);
  log('zip total pages =', app.reader.pages.length);
  app.reader.gotoPage(3);
  await sleep(1500);
  const zimg3 = document.querySelector('.page[data-i="3"] img');
  log('zip page4 loaded =', zimg3 && zimg3.naturalWidth > 0);
  log('DONE');
})()
