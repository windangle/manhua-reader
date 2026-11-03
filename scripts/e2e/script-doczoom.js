(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DZ]', ...a);
  await sleep(1500);
  const app = window.__app;
  const R = app.reader;
  await app.openManga('doc-epub');
  await sleep(2500);
  const box0 = document.querySelector('.page[data-i="0"]');
  const h0 = box0.offsetHeight;
  const iframe = box0.querySelector('iframe');
  log('章0 高度 =', h0, '| iframe transform =', iframe && iframe.style.transform);
  R.setZoom(1.5);
  await sleep(2500);
  const box1 = document.querySelector('.page[data-i="0"]');
  log('缩放 150% 后 章0 高度 =', box1.offsetHeight, '| transform =', box1.querySelector('iframe') && box1.querySelector('iframe').style.transform);
  log('缩放比例 =', R.zoom, '| 指示器 =', document.getElementById('r-page').textContent);
  log('目录按钮可见 =', !document.getElementById('r-toc').classList.contains('hidden'));
  document.getElementById('r-toc').click();
  await sleep(800);
  log('目录弹窗条目 =', document.querySelectorAll('.toc-item').length);
  log('DONE');
})()
