(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[I]', ...a);
  await sleep(1200);
  const { openDocument } = await import('./doc.js');
  const manifest = await (await fetch('comic://local/' + encodeURIComponent(new URLSearchParams(location.search).get('manifest') || ''))).json();

  // --- EPUB ---
  const epubItem = manifest.find((m) => m.format === 'epub');
  const epub = await openDocument({ type: 'doc', format: 'epub', path: epubItem.path, name: 'x.epub' });
  const sec = epub.sections[0];
  const doc = await sec.createDocument();
  const imgs = [...doc.querySelectorAll('img')];
  log('EPUB 章节0 id =', sec.id, '| img 数 =', imgs.length);
  for (const img of imgs.slice(0, 3)) {
    const src = img.getAttribute('src');
    log('   img src =', src);
    const abs = new URL(src, 'comic://zip/' + encodeURIComponent(epubItem.path) + '/').toString();
    log('   解析后 =', abs);
    const r = await fetch(abs);
    log('   fetch 状态 =', r.status, 'type =', r.headers.get('content-type'), 'len =', r.headers.get('content-length'));
  }

  // --- MOBI 漫画 ---
  const mobiItem = manifest.find((m) => m.format === 'mobi' && m.size > 50 * 1048576);
  const mobi = await openDocument({ type: 'doc', format: 'mobi', path: mobiItem.path, name: 'x.mobi' });
  const s0 = mobi.sections[0];
  try {
    const blobUrl = await s0.load();
    const html = await (await fetch(blobUrl)).text();
    log('MOBI 章节0 load() 长度 =', html.length, '| 前 120 字:', html.slice(0, 120).replace(/\n/g, ' '));
    const m = html.match(/<img[^>]*>/i);
    log('   img 标签 =', m ? m[0].slice(0, 160) : '无');
  } catch (e) {
    log('MOBI load() 失败:', e && e.message);
  }
  log('DONE');
})()
