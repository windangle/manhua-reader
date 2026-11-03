(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[MD]', ...a);
  await sleep(1500);
  const full = await window.api.manga.get('doc-mobi');
  const { openDocument } = await import('./doc.js');
  try {
    const book = await openDocument(full.source);
    log('成功: kind=' + book.kind + ' 页数=' + book.pageCount + ' 标题=' + book.title + ' 目录=' + (book.toc ? book.toc.length : 0));
  } catch (e) {
    log('异常:', e && e.message);
    log(e && e.stack);
  }
})()
