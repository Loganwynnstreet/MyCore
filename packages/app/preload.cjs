"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// The only capability the page gets: call an owner operation. The main process validates it.
contextBridge.exposeInMainWorld("mycore", {
  call: (op, args) => ipcRenderer.invoke("mycore:call", op, args ?? {}),
});
