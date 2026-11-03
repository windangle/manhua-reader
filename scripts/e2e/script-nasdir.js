(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[NASD]', ...a);
  try {
    await sleep(1500);
    const app = window.__app;
    const sc = document.getElementById('scroller');
    const m = app.state.items.find((x) => (x.sourceLabel || '').indexOf('/Volumes/') === 0);
    log('NAS 漫画 =', m.name, '|', m.pageCount, '页 | 当前方向 =', m.direction);
    const t0 = performance.now();
    await app.openManga(m.id);
    log('打开耗时 =', Math.round(performance.now() - t0), 'ms');
    await sleep(1500);
    // 切到向右阅读
    document.querySelector('#r-dir button[data-dir="right"]').click();
    await sleep(3000);
    log('切换后方向 =', app.reader.direction, '| scrollWidth =', sc.scrollWidth, 'clientWidth =', sc.clientWidth);
    const r0 = document.querySelector('.page[data-i="0"]').getBoundingClientRect();
    const scRect = sc.getBoundingClientRect();
    log('第 1 页贴视口右侧 =', Math.abs(r0.right - scRect.right) < 4, '| 页宽', Math.round(r0.width), '页高', Math.round(r0.height));
    app.reader.gotoPage(3);
    await sleep(4000);
    const img = document.querySelector('.page[data-i="3"] img');
    log('第 4 页从 NAS 加载 =', img && img.naturalWidth > 0, '| naturalWidth =', img && img.naturalWidth);
    log('current =', app.reader.current);
    // 还原为竖排
    document.querySelector('#r-dir button[data-dir="down"]').click();
    await sleep(1500);
    log('已还原为向下阅读, current =', app.reader.current);
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message);
  }
})()
