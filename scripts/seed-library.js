'use strict';
// 往 userData 写入测试书架数据，便于自动化验证
const fs = require('fs');
const path = require('path');
const os = require('os');

const appDir = process.env.COMIC_USER_DATA || path.join(os.homedir(), 'Library', 'Application Support', '漫画书架');
fs.mkdirSync(appDir, { recursive: true });
const root = path.join(__dirname, '..', 'testdata');
const folder = path.join(root, '测试漫画');
const zip = path.join(root, '测试压缩包.cbz');

const { detectSize } = require('../src/main/imagedim');
function sizeOf(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(65536);
  const n = fs.readSync(fd, buf, 0, 65536, 0);
  fs.closeSync(fd);
  const d = detectSize(buf.slice(0, n));
  return d || { w: 400, h: 600 };
}
const files = fs.readdirSync(folder).filter((f) => f.endsWith('.png')).sort();
const pages = files.map((f) => {
  const p = path.join(folder, f);
  const d = sizeOf(p);
  return { name: f, path: p, size: fs.statSync(p).size, w: d.w, h: d.h };
});

const data = {
  version: 1,
  manga: [
    {
      id: 'test-folder-1',
      name: '测试漫画（文件夹）',
      cover: null,
      source: { type: 'folder', path: folder, label: folder },
      pages,
      progress: { index: 3, offset: 0.2 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastReadAt: Date.now(),
    },
    {
      id: 'test-zip-1',
      name: '测试压缩包',
      cover: { type: 'page', index: 0 },
      source: { type: 'zip', path: zip, label: zip },
      pages: files.map((f) => ({ name: f, entry: '测试漫画/' + f, size: 0, w: pages.find((p) => p.name === f).w, h: pages.find((p) => p.name === f).h })),
      progress: { index: 0, offset: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastReadAt: 0,
    },
  ],
  settings: { zoom: 1, background: 'dark', lastOpened: null },
};
fs.writeFileSync(path.join(appDir, 'library.json'), JSON.stringify(data, null, 2));
console.log('seeded ->', path.join(appDir, 'library.json'));
