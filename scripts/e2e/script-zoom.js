(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const app = window.__app;
  const r = app.reader;
  r.setZoom(1.6);
  r.gotoPage(6);
  await new Promise((res) => setTimeout(res, 2000));
  return 'done';
})()
