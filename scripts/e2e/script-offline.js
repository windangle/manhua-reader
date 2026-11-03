(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[OFF]', ...a);
  await sleep(1500);
  const app = window.__app;
  const m = app.state.items.find((x) => x.id === 'missing-1');
  await app.openManga(m.id);
  await sleep(2500);
  const notice = document.getElementById('reader-notice');
  log('提示可见 =', !notice.classList.contains('hidden'), '| 文案 =', notice.textContent.trim());
  const img = document.querySelector('.page[data-i="0"] img');
  log('图片失败态 =', document.querySelector('.page[data-i="0"]').classList.contains('failed'));
  log('DONE');
})()
