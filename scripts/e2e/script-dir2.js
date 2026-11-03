(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[D2]', ...a);
  try {
    await sleep(1500);
    const app = window.__app;
    const sc = document.getElementById('scroller');
    const R = app.reader;
    const m = app.state.items.find((x) => x.sourceType === 'folder' && x.pageCount >= 5 && x.pageCount <= 100);
    const rectOf = (i) => document.querySelector('.page[data-i="' + i + '"]').getBoundingClientRect();
    const clickDir = (d) => document.querySelector('#r-dir button[data-dir="' + d + '"]').click();
    await app.openManga(m.id);
    await sleep(1200);

    // ===== 向左翻页（左起？不对：向左翻页 = 第1页在最右）=====
    clickDir('left');
    await sleep(1500);
    R.gotoPage(0);
    await sleep(1200);
    let r0 = rectOf(0), scR = sc.getBoundingClientRect();
    log('[←] 第1页右边缘', Math.round(r0.right), '视口右边缘', Math.round(scR.right), '| 差', Math.round(scR.right - r0.right));
    log('[←] scrollLeft =', Math.round(sc.scrollLeft), '最大 =', Math.round(sc.scrollWidth - sc.clientWidth), '| current =', R.current);
    const b1 = sc.scrollLeft;
    R.gotoPage(1);
    await sleep(1200);
    log('[←] 下一页 scrollLeft', Math.round(b1), '->', Math.round(sc.scrollLeft), '| 变小 =', sc.scrollLeft < b1, '| current =', R.current);

    // ===== 向右翻页 =====
    clickDir('right');
    await sleep(1500);
    R.gotoPage(0);
    await sleep(1200);
    r0 = rectOf(0); scR = sc.getBoundingClientRect();
    log('[→] 第1页左边缘', Math.round(r0.left), '视口左边缘', Math.round(scR.left), '| 差', Math.round(r0.left - scR.left));
    log('[→] scrollLeft =', Math.round(sc.scrollLeft), '| current =', R.current);
    const b2 = sc.scrollLeft;
    R.gotoPage(1);
    await sleep(1200);
    log('[→] 下一页 scrollLeft', Math.round(b2), '->', Math.round(sc.scrollLeft), '| 变大 =', sc.scrollLeft > b2, '| current =', R.current);

    // ===== 键盘 =====
    R.gotoPage(5); await sleep(800);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(1000);
    log('[→] ArrowRight 后 current =', R.current, '(应为 6)');
    clickDir('left'); await sleep(1200);
    R.gotoPage(5); await sleep(800);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await sleep(1000);
    log('[←] ArrowRight 后 current =', R.current, '(应为 4：右方向键=上一页)');
    log('按钮文案:', document.getElementById('r-prev').textContent, '/', document.getElementById('r-next').textContent);
    clickDir('down'); await sleep(1200);
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message);
  }
})()
