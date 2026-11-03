(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[DIR]', ...a);
  await sleep(1500);
  const app = window.__app;
  const m = app.state.items.find((x) => x.sourceType === 'folder' && x.pageCount >= 5);
  const sc = document.getElementById('scroller');
  const R = app.reader;
  const rectOf = (i) => document.querySelector('.page[data-i="' + i + '"]').getBoundingClientRect();
  const clickDir = (d) => document.querySelector('#r-dir button[data-dir="' + d + '"]').click();
  try {
    // 1) 打开（当前方向为 right，右起阅读）
    await app.openManga(m.id);
    await sleep(1500);
    log('打开方向 =', R.direction, '| current =', R.current);
    let r0 = rectOf(0), scRect = sc.getBoundingClientRect();
    log('右起: 第1页右边缘', Math.round(r0.right), '视口右边缘', Math.round(scRect.right), '| 差', Math.round(scRect.right - r0.right));
    log('右起: scrollLeft =', Math.round(sc.scrollLeft), '| 最大滚动 =', Math.round(sc.scrollWidth - sc.clientWidth));

    // 2) 下一页应向左
    const before = sc.scrollLeft;
    R.gotoPage(1);
    await sleep(1200);
    log('下一页: scrollLeft', Math.round(before), '->', Math.round(sc.scrollLeft), '| current =', R.current);

    // 3) 跳页
    document.getElementById('r-page-input').value = '10';
    document.getElementById('r-page-input').dispatchEvent(new Event('change'));
    await sleep(1500);
    log('跳到第 10 页: current =', R.current, '| scrollLeft =', Math.round(sc.scrollLeft));

    // 4) 切到向左阅读，位置应保持
    clickDir('left');
    await sleep(1500);
    const r0b = rectOf(0), r1b = rectOf(1);
    log('切到向左: current =', R.current, '| 第1页在第2页左侧 =', r0b.left < r1b.left);

    // 5) 切回竖排
    clickDir('down');
    await sleep(1500);
    log('切回竖排: current =', R.current, '| scrollHeight =', sc.scrollHeight, '| class =', sc.className);

    const saved = await window.api.manga.get(m.id);
    log('已保存方向 =', saved.direction);
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message);
  }
})()
