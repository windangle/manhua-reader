'use strict';
// 基于 yauzl 的压缩包随机读取（不整包解压到内存）
//
// 这里刻意不使用 yauzl 的 openReadStream：它内部用 fd-slicer 管理 fd，读取流被提前
// destroy 时引用计数会归零并直接 fs.close(fd)，导致同一个压缩包之后再也读不出内容
// （表现为「封面能看到、打开却是白图」）；并发探测时还会抛
// "TypeError: Cannot read properties of null (reading 'fd')"。
// 改为：yauzl 只负责读中央目录列出条目，条目内容由我们自己 fs.read + zlib 解压，
// fd 由本模块自己持有和关闭，生命周期完全可控。
const fs = require('fs');
const zlib = require('zlib');

const MAX_OUT = 512 * 1024 * 1024; // 单条目解压上限，防 zip 炸弹

let yauzlMod = null;
async function getYauzl() {
  if (!yauzlMod) {
    const mod = await import('yauzl');
    yauzlMod = mod.default && typeof mod.fromFd === 'function' ? mod.default : mod;
  }
  return yauzlMod;
}

class ZipReader {
  constructor(zipPath) {
    this.zipPath = zipPath;
    this.entries = null;   // [{name, size, isDir}]
    this.zipfile = null;
    this.fd = null;
    this.opened = null;
  }

  async _open() {
    if (this.opened) return this.opened;
    this.opened = (async () => {
      const yauzl = await getYauzl();
      const fd = fs.openSync(this.zipPath, 'r');
      this.fd = fd;
      const zipfile = await new Promise((resolve, reject) => {
        yauzl.fromFd(fd, { lazyEntries: true, autoClose: false, decodeStrings: false }, (err, zf) => {
          if (err) reject(err); else resolve(zf);
        });
      });
      this.zipfile = zipfile;
      return zipfile;
    })();
    try {
      return await this.opened;
    } catch (e) {
      this.opened = null;
      this.close();
      throw e;
    }
  }

  /** 列出压缩包内所有条目 */
  async list() {
    if (this.entries) return this.entries;
    const zipfile = await this._open();
    const entries = [];
    await new Promise((resolve, reject) => {
      zipfile.on('entry', (entry) => {
        // decodeStrings:false 时 fileName 是 Buffer，统一按 UTF-8 解码，兼容中文文件名
        const raw = Buffer.isBuffer(entry.fileName) ? entry.fileName.toString('utf8') : String(entry.fileName);
        const isDir = /\/$/.test(raw);
        entries.push({
          name: raw,
          size: entry.uncompressedSize,
          isDir,
          raw: entry,
          method: entry.compressionMethod,   // 0=存储 8=deflate
          compressedSize: entry.compressedSize,
          headerOffset: entry.relativeOffsetOfLocalHeader, // 本地文件头偏移
        });
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve());
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
    this.entries = entries;
    return entries;
  }

  /** 条目数据在文件中的起始偏移（由 local header 算出） */
  _dataStart(entry) {
    const lh = Buffer.alloc(30);
    fs.readSync(this.fd, lh, 0, 30, entry.headerOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('压缩包条目头损坏: ' + entry.name);
    const nameLen = lh.readUInt16LE(26);
    const extraLen = lh.readUInt16LE(28);
    return entry.headerOffset + 30 + nameLen + extraLen;
  }

  /** 读取条目内容；limit>0 时只返回前 limit 字节 */
  async read(name, limit = 0) {
    const list = await this.list();
    const target = list.find((e) => e.name === name);
    if (!target) throw new Error('压缩包中不存在条目: ' + name);
    if (target.isDir) throw new Error('条目是目录: ' + name);
    if (this.fd === null) throw new Error('压缩包已关闭: ' + this.zipPath);

    const start = this._dataStart(target);
    const compSize = target.compressedSize;
    // 压缩数据量 <= 解压后数据量，所以取前 limit 字节的压缩数据足以解出 limit 字节
    const want = limit > 0 ? Math.min(compSize, limit) : compSize;
    const buf = Buffer.alloc(want);
    if (want > 0) fs.readSync(this.fd, buf, 0, want, start);

    if (target.method === 0) {
      const raw = buf.slice(0, limit > 0 ? limit : buf.length);
      return raw;
    }
    if (target.method !== 8) throw new Error('不支持的压缩方式: ' + target.method);
    return this._inflate(buf, limit);
  }

  /** 流式解压（截断输入时只取已解出的部分，不报错） */
  _inflate(buf, limit) {
    return new Promise((resolve, reject) => {
      const inf = zlib.createInflateRaw({ maxOutputLength: MAX_OUT });
      const chunks = [];
      let total = 0;
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        if (err && !chunks.length) { reject(err); return; }
        let out = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        if (limit > 0 && out.length > limit) out = out.slice(0, limit);
        resolve(out);
      };
      inf.on('data', (c) => {
        chunks.push(c);
        total += c.length;
        if (limit > 0 && total >= limit) inf.destroy(); // 够了就停，剩余压缩数据不需要
      });
      inf.on('error', (e) => {
        // 截断导致的 Z_BUF_ERROR 属正常，只在没解出任何数据时才算失败
        if (chunks.length) finish(null); else finish(e);
      });
      inf.on('close', () => finish(null));
      inf.end(buf);
    });
  }

  /** 只读取条目头部若干字节（用于探测图片尺寸） */
  async readHead(name, bytes = 65536) {
    return this.read(name, bytes);
  }

  close() {
    try { if (this.zipfile) this.zipfile.close(); } catch (_) {}
    this.zipfile = null;
    try { if (this.fd !== null) fs.closeSync(this.fd); } catch (_) {}
    this.fd = null;
    this.opened = null;
    this.entries = null;
  }
}

const cache = new Map();
const MAX_CACHED = 8; // 同时最多保留多少个打开的压缩包（每个占用一个 fd）

function getReader(zipPath) {
  let r = cache.get(zipPath);
  if (!r) {
    r = new ZipReader(zipPath);
    cache.set(zipPath, r);
    // 超出上限时关闭最早打开的那个
    if (cache.size > MAX_CACHED) {
      const oldestKey = cache.keys().next().value;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      try { oldest.close(); } catch (_) {}
    }
  }
  return r;
}

function closeAll() {
  for (const r of cache.values()) r.close();
  cache.clear();
}

module.exports = { ZipReader, getReader, closeAll };
