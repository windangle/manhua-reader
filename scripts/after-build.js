'use strict';
// electron-builder 打包后钩子：删除「未打包的 .app 中间产物」
// 原因：项目目录在 ~/Documents 下会被 Spotlight 索引，
// 留着它会让 Cmd+Space 搜出两个「漫画书架」。
const fs = require('fs');
const path = require('path');

module.exports = async function afterAllArtifactBuild() {
  if (process.env.KEEP_UNPACKED === '1') {
    console.log('[after-build] KEEP_UNPACKED=1，保留未打包目录');
    return;
  }
  const out = path.join(__dirname, '..', 'release');
  for (const dir of ['mac', 'mac-arm64', 'mac-x64']) {
    const p = path.join(out, dir);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('[after-build] removed', p);
    }
  }
};
