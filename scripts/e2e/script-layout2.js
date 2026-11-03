(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[L2]', ...a);
  await sleep(1500);
  const app = window.__app;
  await app.refreshLibrary();
  await sleep(400);
  const grid = document.getElementById('lib-grid');
  const cs = getComputedStyle(grid);
  log('rows =', cs.gridTemplateRows);
  log('align-content =', cs.alignContent, '| grid-auto-rows =', cs.gridAutoRows, '| height =', cs.height);
  const card = grid.querySelector('.card');
  const ccs = getComputedStyle(card);
  log('card height =', ccs.height, '| min-height =', ccs.minHeight, '| align-self =', ccs.alignSelf, '| display =', ccs.display, '| overflow =', ccs.overflow);
  // 试验：把 grid 改成 block 流式，看卡片是否正常
  grid.style.display = 'block';
  await sleep(300);
  log('改 block 后 card 高度 =', card.offsetHeight);
  grid.style.display = '';
  grid.style.gridAutoRows = 'min-content';
  await sleep(300);
  log('grid-auto-rows:min-content 后 card 高度 =', card.offsetHeight, '| rows =', getComputedStyle(grid).gridTemplateRows);
})()
