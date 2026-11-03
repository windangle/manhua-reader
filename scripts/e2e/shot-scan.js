(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  app.scan.open({ kind: 'folder', label: '/Volumes/NANas._smb._tcp.local/pic/非常運動' });
  app.scan.update({ phase: 'listing', files: 12483, dirs: 386, label: '非常運動' });
  await sleep(900);
  app.scan.update({ phase: 'listing', files: 12890, dirs: 401, label: '非常運動' });
  await sleep(900);
})()
