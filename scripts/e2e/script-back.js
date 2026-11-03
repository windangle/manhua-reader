(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[BACK]', ...a);
  await sleep(1500);
  const app = window.__app;
  const id = app.state.items[0].id;
  try {
    await app.openManga(id);
    await sleep(1500);
    log('打开后 reader 可见 =', !document.getElementById('reader-view').classList.contains('hidden'),
        '| library 隐藏 =', document.getElementById('library-view').classList.contains('hidden'));

    document.getElementById('r-back').click();
    await sleep(900);
    log('点返回后 reader 可见 =', !document.getElementById('reader-view').classList.contains('hidden'),
        '| library 隐藏 =', document.getElementById('library-view').classList.contains('hidden'),
        '| 卡片数 =', document.querySelectorAll('.card').length);

    await app.openManga(id);
    await sleep(1200);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(900);
    log('按 ESC 后 reader 可见 =', !document.getElementById('reader-view').classList.contains('hidden'),
        '| library 隐藏 =', document.getElementById('library-view').classList.contains('hidden'),
        '| 卡片数 =', document.querySelectorAll('.card').length);

    document.getElementById('btn-cache').click();
    await sleep(900);
    log('清理缓存按钮已点击');
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message);
  }
})()
