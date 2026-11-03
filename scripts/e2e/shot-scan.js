(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  app.scan.open({ kind: 'folder', label: '/Volumes/NAS/Comics' });
  app.scan.update({ phase: 'listing', files: 12483, dirs: 386, label: 'Comics' });
  await sleep(900);
  app.scan.update({ phase: 'listing', files: 12890, dirs: 401, label: 'Comics' });
  await sleep(900);
})()
