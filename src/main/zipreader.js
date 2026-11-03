'use strict';
// 基于 yauzl 的压缩包随机读取（不整包解压到内存）
const fs = require('fs');

let yauzlMod = null;
async function getYauzl() {
  if (!yauzlMod) {
    const mod = await import('yauzl');
    yauzlMod = mod.default && typeof mod.open === 'function' ? mod.default : mod;
  }
  return yauzlMod;
}

class ZipReader {
  constructor(zipPath) {
    this.zipPath = zipPath;
    this.entries = null;   // [{name, size, isDir}]
    this.zipfile = null;
    this.opened = null;
    this.err = null;
  }

  async _open() {
    if (this.opened) return this.opened;
    const yauzl = await getYauzl();
    this.opened = new Promise((resolve, reject) => {
      yauzl.open(this.zipPath, { lazyEntries: true, autoClose: false, decodeStrings: false }, (err, zipfile) => {
        if (err) return reject(err);
        this.zipfile = zipfile;
        resolve(zipfile);
      });
    });
    return this.opened;
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
        entries.push({ name: raw, size: entry.uncompressedSize, isDir, raw: entry });
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve());
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
    this.entries = entries;
    return entries;
  }

  /** 读取单个条目内容为 Buffer */
  async read(name) {
    const zipfile = await this._open();
    const list = await this.list();
    const target = list.find((e) => e.name === name);
    if (!target) throw new Error('压缩包中不存在条目: ' + name);
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(target.raw || target, (err, stream) => {
        if (err) return reject(err);
        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    });
  }

  /** 只读取条目头部若干字节（用于探测图片尺寸） */
  async readHead(name, bytes = 65536) {
    const zipfile = await this._open();
    const list = await this.list();
    const target = list.find((e) => e.name === name);
    if (!target) throw new Error('压缩包中不存在条目: ' + name);
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(target.raw || target, (err, stream) => {
        if (err) return reject(err);
        const chunks = [];
        let size = 0;
        stream.on('data', (c) => {
          chunks.push(c);
          size += c.length;
          if (size >= bytes) { stream.destroy(); }
        });
        stream.on('error', (e) => { if (!chunks.length) reject(e); });
        stream.on('close', () => resolve(Buffer.concat(chunks).slice(0, bytes)));
      });
    });
  }

  close() {
    try { if (this.zipfile) this.zipfile.close(); } catch (_) {}
    this.zipfile = null;
    this.opened = null;
  }
}

const cache = new Map();

function getReader(zipPath) {
  let r = cache.get(zipPath);
  if (!r) {
    r = new ZipReader(zipPath);
    cache.set(zipPath, r);
  }
  return r;
}

function closeAll() {
  for (const r of cache.values()) r.close();
  cache.clear();
}

module.exports = { ZipReader, getReader, closeAll };
