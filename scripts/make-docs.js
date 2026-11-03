'use strict';
// 生成测试用电子书：PDF / EPUB / MOBI
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'testdata');
fs.mkdirSync(OUT, { recursive: true });

/* ------------------------------ PDF ------------------------------ */
function makePdf(file, pages) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };   // 1-based
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pagesId = objs.length + 1 + pages.length * 2;          // 占位，稍后修正
  const kids = [];
  const pageIds = [];
  for (let i = 0; i < pages.length; i++) {
    const content = `BT /F1 28 Tf 72 740 Td (${pages[i].title}) Tj 0 -48 Td /F1 16 Tf (${pages[i].text}) Tj ET`;
    const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const pid = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${cid} 0 R >>`);
    kids.push(`${pid} 0 R`);
    pageIds.push(pid);
  }
  const realPagesId = add(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);
  // 修正父引用
  objs[pageIds[0] - 1] = objs[pageIds[0] - 1].replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`);
  for (const pid of pageIds) {
    objs[pid - 1] = objs[pid - 1].replace(`/Parent ${pagesId} 0 R`, `/Parent ${realPagesId} 0 R`);
  }

  let out = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(file, Buffer.from(out, 'latin1'));
  console.log('PDF ->', file, fs.statSync(file).size, 'bytes');
}

/* ------------------------------ EPUB ------------------------------ */
function makeEpub(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'META-INF'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'OEBPS'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'mimetype'), 'application/epub+zip');
  fs.writeFileSync(path.join(dir, 'META-INF', 'container.xml'),
`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  const chapters = [
    { id: 'ch1', title: '第一章 开始', body: '这是电子书的第一个章节，用于验证 EPUB 解析与排版是否正常。文字会按照书籍自身的样式渲染。' },
    { id: 'ch2', title: '第二章 排版', body: '第二个章节包含更多的段落，用来验证章节之间的切换、进度记忆与跳转功能是否工作正常。' },
    { id: 'ch3', title: '第三章 结尾', body: '最后一个章节。到这里整本书的三个章节都应该能被正常阅读。' },
  ];
  chapters.forEach((c, i) => {
    fs.writeFileSync(path.join(dir, 'OEBPS', `${c.id}.xhtml`),
`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${c.title}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>${c.title}</h1><p>${c.body}</p><p>${c.body}</p></body></html>`);
  });
  fs.writeFileSync(path.join(dir, 'OEBPS', 'style.css'),
`body { font-family: serif; line-height: 1.8; } h1 { text-align: center; font-size: 1.4em; }`);
  fs.writeFileSync(path.join(dir, 'OEBPS', 'content.opf'),
`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">test-book-001</dc:identifier>
    <dc:title>测试电子书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/><itemref idref="ch2"/><itemref idref="ch3"/>
  </spine>
</package>`);
  fs.writeFileSync(path.join(dir, 'OEBPS', 'nav.xhtml'),
`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head>
<body><nav epub:type="toc"><ol>
<li><a href="ch1.xhtml">第一章 开始</a></li>
<li><a href="ch2.xhtml">第二章 排版</a></li>
<li><a href="ch3.xhtml">第三章 结尾</a></li>
</ol></nav></body></html>`);

  const zipFile = path.join(OUT, '测试电子书.epub');
  fs.rmSync(zipFile, { force: true });
  execFileSync('zip', ['-X0', zipFile, 'mimetype'], { cwd: dir });
  execFileSync('zip', ['-Xr9', zipFile, 'META-INF', 'OEBPS'], { cwd: dir });
  console.log('EPUB ->', zipFile, fs.statSync(zipFile).size, 'bytes');
}

/* ------------------------------ MOBI ------------------------------ */
function makeMobi(file) {
  const title = '测试电子书';
  const html = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body>' +
    '<h1>第一章 开始</h1><p>这是 MOBI 格式的第一章，用于验证 PalmDOC 解析是否正常。</p>' +
    '<mbp:pagebreak/><h1>第二章 结尾</h1><p>这是第二章，MOBI 会按 mbp:pagebreak 切分章节。</p>' +
    '</body></html>';
  const textBuf = Buffer.from(html, 'utf8');

  // 记录 0 = PalmDOC 头(16) + MOBI 头 + 标题；各字段偏移都是相对记录 0 的绝对偏移
  const titleBuf = Buffer.from(title, 'utf8');
  const record0 = Buffer.alloc(248 + titleBuf.length);

  // PalmDOC 头
  record0.writeUInt16BE(1, 0);                    // compression: none
  record0.writeUInt16BE(0, 2);
  record0.writeUInt32BE(textBuf.length, 4);       // text length
  record0.writeUInt16BE(1, 8);                    // numTextRecords
  record0.writeUInt16BE(4096, 10);                // recordSize
  record0.writeUInt16BE(0, 12);                   // encryption: none
  record0.writeUInt16BE(0, 14);

  // MOBI 头
  record0.write('MOBI', 16, 'ascii');
  record0.writeUInt32BE(248, 20);                 // header length
  record0.writeUInt32BE(2, 24);                   // type: book
  record0.writeUInt32BE(65001, 28);               // utf-8
  record0.writeUInt32BE(0x12345678, 32);          // uid
  record0.writeUInt32BE(6, 36);                   // version 6 (MOBI6)
  record0.writeUInt32BE(248, 84);                 // title offset
  record0.writeUInt32BE(titleBuf.length, 88);     // title length
  record0.writeUInt8(0x09, 94);                   // locale region
  record0.writeUInt8(0x04, 95);                   // locale language (zh)
  record0.writeUInt32BE(2, 108);                  // first image index / resource start
  record0.writeUInt32BE(0, 112);                  // huffman record offset
  record0.writeUInt32BE(0, 116);                  // huffman record count
  record0.writeUInt32BE(0, 128);                  // EXTH flags: none
  record0.writeUInt32BE(1, 192);                  // first content record
  record0.writeUInt32BE(1, 196);                  // last content record
  record0.writeUInt32BE(0, 240);                  // trailing flags
  record0.writeUInt32BE(0xffffffff, 244);         // indx
  titleBuf.copy(record0, 248);

  const records = [record0, textBuf];
  const name = Buffer.alloc(32);
  name.write('测试电子书', 0, 'utf8');

  let pdb = Buffer.alloc(78);
  name.copy(pdb, 0);
  pdb.write('BOOK', 60, 'ascii');
  pdb.write('MOBI', 64, 'ascii');
  pdb.writeUInt16BE(records.length, 76);

  const headerAndList = Buffer.concat([pdb, Buffer.alloc(records.length * 8)]);
  let offset = headerAndList.length;
  const recInfo = Buffer.alloc(records.length * 8);
  records.forEach((r, i) => {
    recInfo.writeUInt32BE(offset, i * 8);
    recInfo.writeUInt8(0, i * 8 + 4);
    offset += r.length;
  });
  const header = Buffer.concat([pdb, recInfo]);
  const file_ = Buffer.concat([header, ...records]);
  fs.writeFileSync(file, file_);
  console.log('MOBI ->', file, file_.length, 'bytes');
}

makePdf(path.join(OUT, '测试文档.pdf'), [
  { title: 'Page One', text: 'Hello from the first PDF page.' },
  { title: 'Page Two', text: 'Second page of the PDF document.' },
  { title: 'Page Three', text: 'Third page - rendered by pdf.js.' },
  { title: 'Page Four', text: 'Fourth page, almost done.' },
  { title: 'Page Five', text: 'The last page of the sample PDF.' },
]);
makeEpub(path.join(OUT, 'epub-build'));
makeMobi(path.join(OUT, '测试电子书.mobi'));
