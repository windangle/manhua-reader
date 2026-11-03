(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DOC]', ...a);
  await sleep(1500);
  const app = window.__app;
  const R = app.reader;
  try {
    for (const [id, label] of [['doc-pdf','PDF'], ['doc-epub','EPUB'], ['doc-mobi','MOBI']]) {
      const t0 = performance.now();
      await app.openManga(id);
      await sleep(2500);
      const kind = R.doc && R.doc.kind;
      const canvas = document.querySelector('.page canvas');
      const iframe = document.querySelector('.page iframe');
      const box = document.querySelector('.page[data-i="0"]');
      log(`[${label}] kind=${kind} 页数=${R.pages.length} 标题="${R.doc && R.doc.title}" 耗时=${Math.round(performance.now()-t0)}ms`);
      log(`   画布=${canvas ? canvas.width+'x'+canvas.height : '无'} iframe=${iframe ? '有' : '无'} 首框高度=${box ? box.offsetHeight : 0}`);
      if (kind === 'text') {
        log(`   目录条目=${R.doc.toc ? R.doc.toc.length : 0} 章节0文本长度=${iframe && iframe.contentDocument ? (iframe.contentDocument.body.textContent||'').trim().length : 0}`);
      }
      // 翻到第 2 页
      R.gotoPage(1);
      await sleep(1500);
      const c2 = document.querySelector('.page[data-i="1"] canvas');
      const i2 = document.querySelector('.page[data-i="1"] iframe');
      log(`   第2页 画布=${c2 ? '已渲染' : '无'} iframe=${i2 ? '已渲染' : '无'} current=${R.current}`);
      R.close();
      await sleep(600);
    }
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message, e && e.stack);
  }
})()
