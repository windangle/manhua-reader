(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[Z]', ...a);
  await sleep(1500);
  const app = window.__app;
  const sc = document.getElementById('scroller');
  const strip = document.getElementById('strip');
  const label = document.getElementById('r-zoom-label');
  const m = app.state.items.find((x) => x.sourceType === 'folder' && x.pageCount > 100);
  const measure = (tag) => {
    const page = document.querySelector('.page');
    const pw = page ? page.offsetWidth : 0;
    log(`${tag}: 窗口=${window.innerWidth} 阅读区=${sc.clientWidth} 长卷=${strip.offsetWidth} 页面=${pw} 标签=${label.textContent}`,
        '| 铺满 =', Math.abs(pw - sc.clientWidth) <= 2);
  };
  await app.openManga(m.id);
  await sleep(2000);
  measure('打开后  ');
  // 模拟拖到副屏：窗口尺寸/缩放比例变化
  window.resizeTo(1600, 900);
  await sleep(1500);
  measure('改尺寸后');
  window.resizeTo(1100, 800);
  await sleep(1500);
  measure('再改尺寸');
  // 缩放到 80% 再回到 100%，标签与实际是否一致
  app.reader.setZoom(0.8);
  await sleep(600);
  log('缩放80%: 页面=' + document.querySelector('.page').offsetWidth + ' 阅读区=' + sc.clientWidth + ' 标签=' + label.textContent);
  app.reader.setZoom(1);
  await sleep(600);
  log('缩放100%: 页面=' + document.querySelector('.page').offsetWidth + ' 阅读区=' + sc.clientWidth + ' 标签=' + label.textContent);
  log('DONE');
})()
