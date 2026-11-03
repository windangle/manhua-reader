(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[I2]', ...a);
  await sleep(1200);
  const manifest = await (await fetch('comic://local/' + encodeURIComponent(new URLSearchParams(location.search).get('manifest') || ''))).json();
  const item = manifest.find((m) => m.format === 'epub' && m.size < 5 * 1048576);
  const { openDocument } = await import('./doc.js');
  const book = await openDocument({ type: 'doc', format: 'epub', path: item.path, name: 'x.epub' });
  // 找出所有含图片的章节
  for (let i = 0; i < Math.min(12, book.sections.length); i++) {
    const doc = await book.sections[i].createDocument();
    const imgs = [...doc.querySelectorAll('img')];
    const svgs = [...doc.querySelectorAll('svg image')];
    if (imgs.length || svgs.length) {
      log('章节', i, book.sections[i].id, '| img:', imgs.map((x) => x.getAttribute('src')).join(','), '| svg:', svgs.map((x) => x.getAttribute('href') || x.getAttribute('xlink:href')).join(','));
    }
  }
  log('DONE');
})()
