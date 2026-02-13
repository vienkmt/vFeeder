const { contextBridge, ipcRenderer } = require('electron')

// Expose API to renderer (matches Tauri invoke/listen pattern)
contextBridge.exposeInMainWorld('api', {
  // Invoke IPC handler (like Tauri invoke)
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Listen for events (like Tauri listen)
  listen: (channel, callback) => {
    const handler = (_, data) => callback({ payload: data })
    ipcRenderer.on(channel, handler)
    // Return unlisten function
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // Window operations
  setTitle: (title) => ipcRenderer.invoke('set-title', title)
})
