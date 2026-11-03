'use strict';
// 极简 WebDAV 客户端：列目录 / 读取文件（兼容坚果云、Nextcloud、群晖等）

function authHeaders(auth) {
  const h = {};
  if (!auth) return h;
  if (auth.type === 'basic' && auth.user) {
    h['Authorization'] = 'Basic ' + Buffer.from(auth.user + ':' + (auth.pass || ''), 'utf8').toString('base64');
  } else if (auth.type === 'bearer' && auth.token) {
    h['Authorization'] = 'Bearer ' + auth.token;
  }
  return h;
}

function tagText(xml, tag) {
  const re = new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?' + tag + '>', 'i');
  const m = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

function hasCollection(xml) {
  const m = xml.match(/<(?:[A-Za-z0-9_.-]+:)?resourcetype\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?resourcetype>/i);
  if (!m) return false;
  return /collection/i.test(m[1]);
}

/** 列出一个目录下的条目 */
async function listDir(url, auth) {
  const body = '<?xml version="1.0" encoding="utf-8"?>' +
    '<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:getcontentlength/><D:getlastmodified/><D:displayname/></D:prop></D:propfind>';
  const res = await fetch(url, {
    method: 'PROPFIND',
    headers: Object.assign({ Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, authHeaders(auth)),
    body,
  });
  if (!res.ok) throw new Error('PROPFIND ' + res.status + ' ' + res.statusText);
  const xml = await res.text();
  const items = [];
  const re = /<(?:[A-Za-z0-9_.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_.-]+:)?response>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const hrefRaw = tagText(block, 'href');
    if (!hrefRaw) continue;
    let href;
    try { href = new URL(hrefRaw, url).toString(); } catch (_) { continue; }
    const isDir = hasCollection(block);
    const len = parseInt(tagText(block, 'getcontentlength') || '0', 10) || 0;
    const name = decodeURIComponent(href.replace(/\/$/, '').split('/').pop() || '');
    items.push({ href, name: name || href, isDir, size: len });
  }
  return items;
}

/** 递归收集所有文件 */
async function listRecursive(url, auth, maxDepth = 12) {
  const out = [];
  async function walk(u, depth, rel) {
    if (depth > maxDepth) return;
    let items;
    try { items = await listDir(u, auth); } catch (e) { throw e; }
    for (const it of items) {
      if (!rel && it.isDir) continue; // 顶层自身
      const relPath = rel ? rel + '/' + it.name : it.name;
      if (it.isDir) await walk(it.href.replace(/\/$/, '') + '/', depth + 1, relPath);
      else out.push({ href: it.href, name: it.name, relPath, size: it.size });
    }
  }
  await walk(url, 0, '');
  return out;
}

/** 读取文件内容 */
async function getFile(href, auth) {
  const res = await fetch(href, { headers: authHeaders(auth) });
  if (!res.ok) throw new Error('GET ' + res.status + ' ' + res.statusText);
  return Buffer.from(await res.arrayBuffer());
}

/** 读取文件头部（用于探测尺寸），优先使用 Range */
async function getHead(href, auth, bytes = 65536) {
  try {
    const res = await fetch(href, { headers: Object.assign({ Range: 'bytes=0-' + (bytes - 1) }, authHeaders(auth)) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length) return buf.slice(0, bytes);
    }
  } catch (_) { /* 回退整文件 */ }
  const full = await getFile(href, auth);
  return full.slice(0, bytes);
}

module.exports = { listDir, listRecursive, getFile, getHead, authHeaders };
