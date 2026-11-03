(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[E]', ...a);
  await sleep(1200);
  const { openDocument } = await import('./doc.js');
  const manifest = await (await fetch('./manifest.json')).json();
  const item = manifest.find((m) => m.format === 'epub');
  const book = await openDocument({ type: 'doc', format: 'epub', path: item.path, name: 'x.epub' });
  log('章节数 =', book.sections.length);
  for (let i = 0; i < 3; i++) {
    const s = book.sections[i];
    const url = 'comic://zip/' + encodeURIComponent(item.path) + '/' + encodeURIComponent(s.id);
    const r = await fetch(url);
    const t = await r.text();
    log(`章节${i} id="${s.id}" status=${r.status} 文本长度=${t.length} 前40字="${t.slice(0, 40).replace(/\n/g, ' ')}"`);
    const doc = await s.createDocument();
    log(`   createDocument: body长度=${doc.body ? doc.body.innerHTML.length : -1} 文本长度="${(doc.body ? doc.body.textContent : '').trim().slice(0, 30)}"`);
  }
  log('DONE');
})()
