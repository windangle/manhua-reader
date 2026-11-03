'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const scanner = require('../src/main/scanner');
const { detectSize, isImageName } = require('../src/main/imagedim');

const ROOT = process.argv[2] || '/Volumes/NANas._smb._tcp.local/pic/非常運動';

async function oldScan(root) {
  const files = [];
  async function walk(dir, rel) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const relPath = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) await walk(abs, relPath);
      else if (isImageName(ent.name)) {
        const st = await fsp.stat(abs);
        files.push({ abs, relPath, size: st.size });
      }
    }
  }
  await walk(root, '');
  const dims = [];
  for (const f of files) {
    const fd = await fsp.open(f.abs, 'r');
    const buf = Buffer.alloc(65536);
    const { bytesRead } = await fd.read(buf, 0, 65536, 0);
    await fd.close();
    dims.push(detectSize(buf.slice(0, bytesRead)));
  }
  return files.length;
}

(async () => {
  console.log('目录:', ROOT);
  let t = Date.now();
  const pages = await scanner.scanFolder(ROOT, { onProgress: () => {} });
  const tNew = Date.now() - t;
  console.log(`新策略(并发遍历 + 少量探测): ${tNew} ms   识别 ${pages.length} 页（估算 ${pages.filter((p) => p.est).length} 页）`);

  t = Date.now();
  const n = await oldScan(ROOT);
  const tOld = Date.now() - t;
  console.log(`旧策略(串行遍历 + 每文件 stat + 逐页探测): ${tOld} ms   文件 ${n} 个`);
  console.log(`提速: ${(tOld / Math.max(1, tNew)).toFixed(1)}x`);
})();
