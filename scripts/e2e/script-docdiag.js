(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DD]', ...a);
  await sleep(1500);
  const app = window.__app;
  log('书架条目:', app.state.items.map((m) => m.id + '(' + m.name + ',' + m.sourceType + ')').join(' | '));
  const full = await window.api.manga.get('doc-pdf');
  log('manga:get doc-pdf =', full ? (full.name + ' | ' + full.source.type + ' | pages=' + full.pages.length) : 'null');
  try {
    const mod = await import('./vendor/pdf.min.mjs');
    log('pdf.js 导入成功, version =', mod.version);
    const { openDocument } = await import('./doc.js');
    log('doc.js 导入成功');
    const book = await openDocument(full.source);
    log('openDocument 成功: kind=' + book.kind + ' pages=' + book.pageCount + ' title=' + book.title);
  } catch (e) {
    log('EXCEPTION', e && e.message, e && e.stack);
  }
})()
