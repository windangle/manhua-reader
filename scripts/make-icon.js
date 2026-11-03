'use strict';
// 生成应用图标 PNG（纯代码绘制）
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };

const S = 1024;
function rounded(x, y, w, h, r) {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = Math.min(Math.max(x, r), w - r - 1);
  const cy = Math.min(Math.max(y, r), h - r - 1);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const raw = Buffer.alloc((S * 3 + 1) * S);
let o = 0;
for (let y = 0; y < S; y++) {
  raw[o++] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    if (rounded(x, y, S, S, 220)) {
      const t = y / S;
      r = Math.round(108 + (143 - 108) * t);
      g = Math.round(140 + (123 - 140) * t);
      b = Math.round(255 + (255 - 255) * t);
      // 书本：两页白色
      const inLeft = rounded(x - 200, y - 290, 340, 580, 24);
      const inRight = rounded(x - 120, y - 290, 340, 580, 24);
      const spine = x >= 462 && x <= 512 && y >= 250 && y <= 830;
      if ((inLeft || inRight) && !spine) { r = 250; g = 250; b = 253; }
      else if (spine) { r = 232; g = 236; b = 248; }
      // 页面横线
      const line = ((inLeft || inRight) && ((y - 330) % 96 < 16) && y > 350 && y < 780);
      if (line && !spine) { r = 176; g = 190; b = 226; }
      a = 255;
    }
    raw[o++] = r; raw[o++] = g; raw[o++] = b;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.writeFileSync(out, png);
console.log('icon ->', out);
