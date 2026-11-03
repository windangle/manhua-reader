(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  const local = app.state.items.find((m) => m.sourceType === 'folder');
  await app.openManga(local.id);
  await sleep(1500);
  document.getElementById('r-full').click();
  await sleep(500);
  window.dispatchEvent(new MouseEvent('mousemove', { clientY: 18, bubbles: true }));
  await sleep(600);
})()
