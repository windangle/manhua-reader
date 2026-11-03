(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[W]', ...a);
  await sleep(1200);
  const manifest = await (await fetch('comic://local/' + encodeURIComponent(new URLSearchParams(location.search).get('manifest') || ''))).json();
  const item = manifest.find((m) => m.format === 'pdf' && m.size > 10 * 1048576);
  const { openDocument } = await import('./doc.js');
  const t0 = performance.now();
  const book = await openDocument({ type: 'doc', format: 'pdf', path: item.path, name: 'x.pdf' });
  log('打开耗时', Math.round(performance.now() - t0), 'ms | 页数 =', book.pageCount, '| worker 模式 =', book.workerMode);
  const box = document.createElement('div');
  box.style.width = '900px'; box.style.position = 'absolute'; box.style.left = '-9999px';
  document.body.appendChild(box);
  const t1 = performance.now();
  await book.renderPage(0, box, 1);
  log('首页渲染', Math.round(performance.now() - t1), 'ms | 画布 =', box.querySelector('canvas').width + 'x' + box.querySelector('canvas').height);
  // 连续渲染 5 页，测吞吐
  const t2 = performance.now();
  for (let i = 1; i <= 5; i++) await book.renderPage(i, box, 1);
  log('再渲染 5 页', Math.round(performance.now() - t2), 'ms');
  box.remove();
  log('DONE');
})()
