(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[L]', ...a);
  await sleep(1500);
  const app = window.__app;
  await app.refreshLibrary();
  await sleep(500);
  const grid = document.getElementById('lib-grid');
  log('grid class =', grid.className, '| display =', getComputedStyle(grid).display, '| columns =', getComputedStyle(grid).gridTemplateColumns);
  [...grid.children].slice(0, 4).forEach((n, i) => {
    const cov = n.querySelector('.cover');
    log(`子元素${i} <${n.tagName} class="${n.className}"> 尺寸=${n.offsetWidth}x${n.offsetHeight}`,
        cov ? `| cover=${cov.offsetWidth}x${cov.offsetHeight} aspect=${getComputedStyle(cov).aspectRatio}` : '');
  });
  const card = grid.querySelector('.card');
  if (card) {
    log('第一张卡 =', card.offsetWidth + 'x' + card.offsetHeight, '| 内部:', [...card.children].map((c) => c.className + ':' + c.offsetWidth + 'x' + c.offsetHeight).join(' '));
    const cov = card.querySelector('.cover');
    if (cov) log('  cover 计算样式: width=' + getComputedStyle(cov).width + ' height=' + getComputedStyle(cov).height + ' aspect=' + getComputedStyle(cov).aspectRatio);
  }
})()
