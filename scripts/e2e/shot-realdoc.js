(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1200);
  const manifest = await (await fetch('comic://local/' + encodeURIComponent(new URLSearchParams(location.search).get('manifest') || ''))).json();
  const pick = (pred) => manifest.find(pred);
  const item = pick((m) => m.path.indexOf('第01卷') >= 0)
    || pick((m) => m.format === 'mobi' && m.size > 50 * 1048576)
    || pick((m) => m.format === 'epub');
  const { openDocument } = await import('./doc.js');
  const doc = await openDocument({ type: 'doc', format: item.format, path: item.path, name: 'x' });
  const app = window.__app;
  const R = app.reader;
  // 直接交给阅读器渲染
  document.getElementById('reader-view').classList.remove('hidden');
  document.getElementById('library-view').classList.add('hidden');
  R.doc = doc;
  R.pages = await R._buildDocPages(doc);
  R._buildStrip();
  await new Promise((r) => setTimeout(r, 200));
  R._applyLayout();
  R._updateIndicator();
  R._loadAround(0);
  await sleep(4000);
  console.log('[RD]', item.format, '页数', R.pages.length, '标题', doc.title);
})()
