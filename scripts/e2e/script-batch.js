(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[B]', ...a);
  await sleep(1200);
  const { openDocument } = await import('./doc.js');
  const manifestUrl = 'comic://local/' + encodeURIComponent(new URLSearchParams(location.search).get('manifest') || '');
  const manifest = await (await fetch(manifestUrl)).json().catch(() => null);
  if (!manifest) { log('拿不到清单'); return; }
  for (const item of manifest) {
    const name = item.path.split('/').pop();
    const t0 = performance.now();
    try {
      const book = await openDocument({ type: 'doc', format: item.format, path: item.path, name });
      const dt = Math.round(performance.now() - t0);
      let extra = '';
      if (book.kind === 'pdf') {
        const p0 = await book.pageSize(0);
        extra = '首页尺寸=' + (p0 ? Math.round(p0.width) + 'x' + Math.round(p0.height) : '?');
      } else {
        extra = '目录=' + (book.toc ? book.toc.length : 0);
      }
      // 渲染第一页/章，检查内容与图片
      const box = document.createElement('div');
      box.style.width = '800px';
      box.style.position = 'absolute';
      box.style.left = '-9999px';
      document.body.appendChild(box);
      const t1 = performance.now();
      await book.renderPage(0, box, 1);
      const rt = Math.round(performance.now() - t1);
      await sleep(2500);   // 等图片加载完再统计
      let imgs = 0, textLen = 0;
      if (book.kind === 'pdf') {
        const c = box.querySelector('canvas');
        extra += ' 画布=' + (c ? c.width + 'x' + c.height : '无');
      } else {
        const f = box.querySelector('iframe');
        if (f && f.contentDocument) {
          imgs = f.contentDocument.querySelectorAll('img,svg image').length;
          textLen = (f.contentDocument.body.textContent || '').trim().length;
          const broken = [...f.contentDocument.querySelectorAll('img')].filter((i) => !i.complete || i.naturalWidth === 0).length;
          extra += ' 图片=' + imgs + '(坏' + broken + ')';
        }
      }
      box.remove();
      log(`✅ ${item.format.toUpperCase().padEnd(5)} ${(item.size/1048576).toFixed(1)}MB ${dt}ms 渲染${rt}ms 页数=${book.pageCount} ${extra} 文本=${textLen}字 「${name.slice(0,28)}」 标题="${book.title || '-'}"`);
    } catch (e) {
      log(`❌ ${item.format.toUpperCase().padEnd(5)} ${(item.size/1048576).toFixed(1)}MB ${Math.round(performance.now()-t0)}ms 「${name.slice(0,28)}」 错误: ${e && e.message}`);
    }
  }
  log('DONE');
})()
