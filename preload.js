'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    summary: (id) => ipcRenderer.invoke('library:summary', id),
    addFolder: () => ipcRenderer.invoke('library:addFolder'),
    addZip: () => ipcRenderer.invoke('library:addZip'),
    addDav: (info) => ipcRenderer.invoke('library:addDav', info),
    addDoc: () => ipcRenderer.invoke('library:addDoc'),
    addDocSeries: (mode) => ipcRenderer.invoke('library:addDocSeries', mode),
    createFolder: (name) => ipcRenderer.invoke('library:createFolder', name),
    updateFolder: (id, patch) => ipcRenderer.invoke('library:updateFolder', id, patch),
    removeFolder: (id) => ipcRenderer.invoke('library:removeFolder', id),
    move: (payload) => ipcRenderer.invoke('library:move', payload),
    update: (id, patch) => ipcRenderer.invoke('library:update', id, patch),
    remove: (id) => ipcRenderer.invoke('library:remove', id),
    rescan: (id) => ipcRenderer.invoke('library:rescan', id),
  },
  manga: {
    get: (id) => ipcRenderer.invoke('manga:get', id),
  },
  reader: {
    saveProgress: (id, progress) => ipcRenderer.invoke('reader:saveProgress', id, progress),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  dialog: {
    pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  },
  cache: {
    clear: () => ipcRenderer.invoke('cache:clear'),
    usage: () => ipcRenderer.invoke('cache:usage'),
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
    showItem: (p) => ipcRenderer.invoke('shell:showItem', p),
  },
  version: () => ipcRenderer.invoke('app:version'),
  onMenu: (cb) => ipcRenderer.on('menu:action', (_e, action) => cb(action)),
  onScan: (cb) => ipcRenderer.on('scan:event', (_e, evt) => cb(evt)),
});
