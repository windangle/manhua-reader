(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[EDIT]', ...a);
  await sleep(1500);
  const app = window.__app;

  app.openEditor('test-folder-1');
  await sleep(800);
  const modal = document.querySelector('.modal');
  const nameInput = modal.querySelector('.field input[type=text]');
  nameInput.value = '我的收藏漫画';
  const btns = [...modal.querySelectorAll('button')].map((b) => b.textContent);
  log('editor buttons =', JSON.stringify(btns));

  // 从漫画页中选择封面
  [...modal.querySelectorAll('button')].find((b) => b.textContent.includes('从漫画页中选择')).click();
  await sleep(1200);
  const thumbs = document.querySelectorAll('.thumb');
  log('thumb count =', thumbs.length);
  thumbs[2].click();
  await sleep(700);

  // 保存
  const saveBtn = [...document.querySelectorAll('.modal-foot button')].find((b) => b.textContent === '保存');
  log('save button found =', !!saveBtn);
  saveBtn.click();
  await sleep(1200);

  const full = await window.api.manga.get('test-folder-1');
  log('new name =', full.name);
  log('new cover =', JSON.stringify(full.cover));
  const card = document.querySelector('.card .card-title');
  log('card title =', card && card.textContent);
  log('DONE');
})()
