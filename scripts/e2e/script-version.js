(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1500);
  const info = await window.api.version();
  console.log('[VER] 应用版本 =', info.version, '| 名称 =', info.name, '| Electron =', info.electron, '| Chromium =', info.chrome);
  const chip = document.getElementById('app-version');
  console.log('[VER] 界面版本号 =', chip.textContent, '| tooltip =', chip.title.replace(/\n/g, ' / '));
})()
