(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[SCAN]', ...a);
  await sleep(1500);
  const app = window.__app;
  let events = 0, lastEvt = null;
  window.api.onScan((e) => { events++; lastEvt = e; });

  const id = app.state.items.find((m) => m.name === '大目录测试').id;
  const modal = document.getElementById('scan-modal');
  const p = window.api.library.rescan(id);
  await sleep(40);
  log('扫描中 弹窗可见 =', !modal.classList.contains('hidden'),
      '| 阶段 =', document.getElementById('scan-phase').textContent,
      '| 计数 =', document.getElementById('scan-count').textContent,
      '| 说明 =', document.getElementById('scan-sub').textContent);
  const res = await p;
  await sleep(300);
  log('扫描后 弹窗隐藏 =', modal.classList.contains('hidden'),
      '| 页数 =', res.entry.pageCount,
      '| 收到事件数 =', events,
      '| 最后事件 =', lastEvt && lastEvt.type);
  log('DONE');
})()
