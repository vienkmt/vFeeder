/**
 * Preload Script - Expose IPC API to renderer
 * API matches Tauri invoke/listen pattern for minimal App.vue changes
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Invoke IPC handler (matches Tauri invoke)
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),

  // Listen for events (matches Tauri listen)
  on: (channel, callback) => {
    const listener = (_, data) => callback({ payload: data })
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  // Window operations
  setTitle: (title) => ipcRenderer.invoke('set-title', title)
})
