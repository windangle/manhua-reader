(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[S]', ...a);
  await sleep(1500);
  const app = window.__app;
  const t0 = performance.now();
  await app.openManga('series-1');
  log('打开耗时 =', Math.round(performance.now() - t0), 'ms');
  const R = app.reader;
  log('类型 =', R.doc.kind, '| 总页数 =', R.pages.length, '| 卷数 =', (R.doc.volumes || []).length);
  log('各卷页数 =', (R.doc.volumes || []).map((v) => v.count).join(' + '));
  log('目录条目 =', R.doc.toc.length, '| 前 5 条 =', R.doc.toc.slice(0, 5).map((t) => t.label + '@' + t.index).join(' | '));
  // 跳到第 2 卷的第 1 页
  const v2 = (R.doc.volumes || [])[1];
  if (v2) {
    R.gotoPage(v2.start);
    await sleep(6000);
    const box = document.querySelector('.page[data-i="' + v2.start + '"]');
    const iframe = box && box.querySelector('iframe');
    const img = iframe && iframe.contentDocument && iframe.contentDocument.querySelector('img');
    log('第 2 卷首页 图片加载 =', img ? (img.naturalWidth > 0) : '无图', '| current =', R.current);
  }
  log('DONE');
})()
