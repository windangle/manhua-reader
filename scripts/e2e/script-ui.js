(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[UI]', ...a);
  await sleep(1500);
  const app = window.__app;
  try {
    await app.openManga(app.state.items[0].id);
    await sleep(1500);

    // 1) 背景切换按钮
    const bgBtn = document.getElementById('r-bg');
    log('切换前 body.class =', document.body.className);
    bgBtn.click();
    await sleep(500);
    log('切换后 body.class =', document.body.className,
        '| 按钮图标 =', bgBtn.textContent,
        '| 阅读器背景 =', getComputedStyle(document.getElementById('scroller')).backgroundColor);
    bgBtn.click();
    await sleep(300);
    log('再切一次 body.class =', document.body.className, '| 背景 =', getComputedStyle(document.getElementById('scroller')).backgroundColor);

    // 2) 沉浸模式
    document.getElementById('r-full').click();
    await sleep(600);
    const v = document.getElementById('reader-view');
    const pill = document.getElementById('r-immersive-exit');
    log('沉浸中 class =', v.className, '| 退出提示可见 =', pill.classList.contains('show'),
        '| 提示文案 =', pill.textContent.trim());
    // 模拟鼠标移到顶部
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 20, bubbles: true }));
    await sleep(400);
    log('鼠标移至顶部后 show-top =', v.classList.contains('show-top'), '| 提示可见 =', pill.classList.contains('show'));
    // 移开
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 500, bubbles: true }));
    await sleep(400);
    log('鼠标移开后 show-top =', v.classList.contains('show-top'));
    // H 退出
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    await sleep(500);
    log('按 H 后 class =', v.className, '| 提示可见 =', pill.classList.contains('show'));
    log('DONE');
  } catch (e) {
    log('EXCEPTION', e && e.message);
  }
})()
