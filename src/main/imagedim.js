'use strict';
// 轻量图片尺寸探测：只读文件头，不解码整图

const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jpe': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.avif': 'image/avif', '.jfif': 'image/jpeg',
};

const IMAGE_EXT = new Set(Object.keys(EXT_MIME).concat(['.tif', '.tiff', '.heic', '.ico']));

function isImageName(name) {
  const i = name.lastIndexOf('.');
  if (i < 0) return false;
  return IMAGE_EXT.has(name.slice(i).toLowerCase());
}

function mimeFor(name) {
  const i = name.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  return EXT_MIME[name.slice(i).toLowerCase()] || 'application/octet-stream';
}

function pngSize(b) {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function gifSize(b) {
  if (b.length < 10) return null;
  if (b.toString('ascii', 0, 3) !== 'GIF') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

function bmpSize(b) {
  if (b.length < 26) return null;
  if (b.toString('ascii', 0, 2) !== 'BM') return null;
  return { w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)) };
}

function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    }
    const len = b.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

function webpSize(b) {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fmt = b.toString('ascii', 12, 16);
  if (fmt === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
  return null;
}

/** 从图片头部字节解析尺寸，失败返回 null */
function detectSize(buf) {
  if (!buf || buf.length < 16) return null;
  for (const fn of [pngSize, jpegSize, gifSize, webpSize, bmpSize]) {
    try {
      const r = fn(buf);
      if (r && r.w > 0 && r.h > 0) return r;
    } catch (_) { /* ignore */ }
  }
  return null;
}

module.exports = { detectSize, mimeFor, isImageName, EXT_MIME };
