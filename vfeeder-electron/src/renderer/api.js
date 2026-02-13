// API bridge - provides Tauri-like interface for Electron
// This allows minimal changes to App.vue

// Invoke IPC command (replaces Tauri's invoke)
export async function invoke(command, args = {}) {
  // Convert command name: snake_case to kebab-case for IPC channels
  const channel = command.replace(/_/g, '-')
  return window.api.invoke(channel, args)
}

// Listen for events (replaces Tauri's listen)
export async function listen(event, callback) {
  return window.api.listen(event, callback)
}

// Get current window (replaces Tauri's getCurrentWindow)
export function getCurrentWindow() {
  return {
    setTitle: async (title) => window.api.setTitle(title)
  }
}
