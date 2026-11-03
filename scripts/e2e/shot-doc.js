(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const app = window.__app;
  const id = (location.search.match(/doc=([\w-]+)/) || [])[1] || 'doc-epub';
  await app.openManga(id);
  await sleep(3500);
})()
