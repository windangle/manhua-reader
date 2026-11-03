'use strict';
// 把 pdf.js 的构建产物同步到渲染进程目录（运行时直接从本地加载，避免把整个库打进包里）
const fs = require('fs');
const path = require('path');

const files = ['pdf.min.mjs', 'pdf.worker.min.mjs'];
const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build');
const dst = path.join(__dirname, '..', 'src', 'renderer', 'vendor');

if (!fs.existsSync(src)) {
  console.log('[sync-vendor] 未找到 pdfjs-dist，跳过');
  process.exit(0);
}
fs.mkdirSync(dst, { recursive: true });
for (const f of files) {
  const from = path.join(src, f);
  const to = path.join(dst, f);
  if (!fs.existsSync(from)) continue;
  const a = fs.readFileSync(from);
  const b = fs.existsSync(to) ? fs.readFileSync(to) : null;
  if (!b || !a.equals(b)) {
    fs.writeFileSync(to, a);
    console.log('[sync-vendor] 已更新', f);
  }
}
