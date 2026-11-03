'use strict';
// 生成大量小图片，用于压测目录扫描性能
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
function png(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7) & 255;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COUNT = Number(process.argv[2] || 3000);
const DIRS = Number(process.argv[3] || 30);
const root = path.join(__dirname, '..', 'testdata', '大目录测试');
fs.rmSync(root, { recursive: true, force: true });
const buf = png(120, 180);
for (let d = 0; d < DIRS; d++) {
  const dir = path.join(root, `卷${String(d + 1).padStart(2, '0')}`);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < COUNT / DIRS; i++) {
    fs.writeFileSync(path.join(dir, `第${String(i + 1).padStart(4, '0')}页.png`), buf);
  }
}
console.log('生成完成:', root, COUNT, '张');
