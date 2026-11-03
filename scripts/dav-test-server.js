'use strict';
// 极简 WebDAV 测试服务器（仅用于本地联调）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'testdata');
const PORT = Number(process.env.PORT || 8899);

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/dav/')) { res.writeHead(404); return res.end('no'); }
  const rel = url.slice('/dav/'.length);
  const abs = path.join(ROOT, rel);

  if (req.method === 'PROPFIND') {
    let st;
    try { st = fs.statSync(abs); } catch (e) { res.writeHead(404); return res.end('nf'); }
    const items = [{ name: path.basename(abs) || '/', isDir: st.isDirectory(), href: url, size: st.size }];
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(abs)) {
        const s2 = fs.statSync(path.join(abs, e));
        items.push({ name: e, isDir: s2.isDirectory(), href: url.replace(/\/?$/, '/') + e, size: s2.size });
      }
    }
    const xml = '<?xml version="1.0" encoding="utf-8"?>' +
      '<D:multistatus xmlns:D="DAV:">' +
      items.map((it) => '<D:response><D:href>' + xmlEscape(it.href) + '</D:href>' +
        '<D:propstat><D:prop><D:resourcetype>' + (it.isDir ? '<D:collection/>' : '') + '</D:resourcetype>' +
        '<D:getcontentlength>' + it.size + '</D:getcontentlength><D:displayname>' + xmlEscape(it.name) + '</D:displayname>' +
        '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>').join('') +
      '</D:multistatus>';
    res.writeHead(207, { 'Content-Type': 'application/xml; charset=utf-8' });
    return res.end(xml);
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    let st;
    try { st = fs.statSync(abs); } catch (e) { res.writeHead(404); return res.end('nf'); }
    const range = req.headers['range'];
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.writeHead(206, { 'Content-Type': 'image/png', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(abs, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs).pipe(res);
  }

  res.writeHead(405); res.end();
});
server.listen(PORT, '127.0.0.1', () => console.log('dav test server on http://127.0.0.1:' + PORT + '/dav/'));
