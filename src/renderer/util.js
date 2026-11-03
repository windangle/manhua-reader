'use strict';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function toast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' + (type ? ' ' + type : ''), text: msg });
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 260);
  }, 2400);
}

/**
 * 打开一个模态框
 * @param {{title:string, body:HTMLElement|string, actions?:Array<{label:string,primary?:boolean,danger?:boolean,onClick?:Function}>, wide?:boolean, onClose?:Function}} opts
 */
export function openModal(opts) {
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' + (opts.wide ? ' wide' : '') });

  modal.appendChild(el('div', { class: 'modal-head', text: opts.title }));
  const bodyWrap = el('div', { class: 'modal-body' });
  if (typeof opts.body === 'string') bodyWrap.innerHTML = opts.body;
  else bodyWrap.appendChild(opts.body);
  modal.appendChild(bodyWrap);

  const foot = el('div', { class: 'modal-foot' });
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opts.onClose) opts.onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };
  for (const a of opts.actions || []) {
    const btn = el('button', {
      class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''),
      text: a.label,
      onclick: async () => {
        if (a.onClick) {
          const r = await a.onClick({ close });
          if (r === false) return;
        }
        close();
      },
    });
    foot.appendChild(btn);
  }
  if ((opts.actions || []).length) modal.appendChild(foot);
  backdrop.appendChild(modal);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey, true);
  root.appendChild(backdrop);
  const firstInput = modal.querySelector('input, select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 30);
  return { close, modal, body: bodyWrap };
}

export function confirmDialog(title, message, confirmLabel = '确定') {
  return new Promise((resolve) => {
    openModal({
      title,
      body: el('div', { class: 'hint', text: message }),
      actions: [
        { label: '取消', onClick: () => resolve(false) },
        { label: confirmLabel, danger: true, onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}
