'use strict';
const { protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { mimeFor } = require('./imagedim');
const zipreader = require('./zipreader');
const dav = require('./dav');
const store = require('./store');

const SCHEME = 'comic';

/* ------------------------------------------------------------------
 * 内存图片缓存：仅用于网络(WebDAV)资源，避免来回滚动时反复下载。
 * 纯内存、不落盘，有体积上限；本地文件/压缩包直接读盘，不进缓存。
 * ------------------------------------------------------------------ */
const MEM_LIMIT = 256 * 1024 * 1024;
const memCache = new Map(); // key -> { buf, type, bytes }
let memBytes = 0;

function memGet(key) {
  const hit = memCache.get(key);
  if (!hit) return null;
  memCache.delete(key);
  memCache.set(key, hit); // LRU: 命中后移到末尾
  return hit;
}

function memSet(key, buf, name) {
  if (memBytes + buf.length > MEM_LIMIT) {
    for (const [k, v] of memCache) {
      if (memBytes <= MEM_LIMIT * 0.6) break;
      memCache.delete(k);
      memBytes -= v.bytes;
    }
  }
  memCache.set(key, { buf, name, bytes: buf.length });
  memBytes += buf.length;
}

function clearMemCache() {
  const freed = memBytes;
  memCache.clear();
  memBytes = 0;
  return freed;
}

function memUsage() {
  return memBytes;
}

/* ---------------------------- 协议注册 ---------------------------- */

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true,
      },
    },
  ]);
}

const NO_STORE = {
  // no-store：确保浏览器不会把漫画图片写入磁盘缓存，不额外占用硬盘
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Access-Control-Allow-Origin': '*',
};

function withMime(buf, name) {
  const headers = Object.assign({
    'Content-Type': mimeFor(name),
    'Content-Length': String(buf.length),
  }, NO_STORE);
  return new Response(buf, { status: 200, headers });
}

async function handle(request) {
  const url = new URL(request.url);
  const segs = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  const key = url.origin + url.pathname; // 忽略 ?v= 版本参数

  try {
    if (url.host === 'local') {
      const p = segs[0] || '';
      if (!p) return new Response('not found', { status: 404 });
      const stat = await fs.promises.stat(p);
      if (stat.isDirectory()) return new Response('not found', { status: 404 });
      // 直接从磁盘流式读取：不缓存、不落盘
      const res = await net.fetch(pathToFileURL(p).toString());
      const headers = new Headers(NO_STORE);
      headers.set('Content-Type', mimeFor(p));
      return new Response(res.body, { status: 200, headers });
    }

    if (url.host === 'zip') {
      const zipPath = segs[0];
      const entry = segs.slice(1).join('/');
      if (!zipPath || !entry) return new Response('not found', { status: 404 });
      const buf = await zipreader.getReader(zipPath).read(entry);
      return withMime(buf, entry);
    }

    if (url.host === 'dav') {
      const mangaId = segs[0];
      const idx = parseInt(segs[1], 10);
      const hit = memGet(key);
      if (hit) return withMime(hit.buf, hit.name);
      const manga = store.getManga(mangaId);
      if (!manga || !manga.pages || !manga.pages[idx]) return new Response('not found', { status: 404 });
      const page = manga.pages[idx];
      const buf = await dav.getFile(page.href, manga.source.auth || null);
      memSet(key, buf, page.name);
      return withMime(buf, page.name);
    }
  } catch (e) {
    console.error('[protocol]', e);
    return new Response('error: ' + (e && e.message), { status: 500 });
  }
  return new Response('not found', { status: 404 });
}

function registerHandler() {
  protocol.handle(SCHEME, handle);
}

module.exports = {
  registerScheme,
  registerHandler,
  clearMemCache,
  memUsage,
  SCHEME,
};
