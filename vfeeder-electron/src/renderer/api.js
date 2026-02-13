/**
 * API Bridge - Drop-in replacement for @tauri-apps/api
 * Provides Tauri-compatible interface for Electron IPC
 */

// Replaces: import { invoke } from "@tauri-apps/api/core"
export async function invoke(cmd, args = {}) {
  return window.electronAPI.invoke(cmd, args)
}

// Replaces: import { listen } from "@tauri-apps/api/event"
export async function listen(event, callback) {
  const unlisten = window.electronAPI.on(event, callback)
  return unlisten
}

// Replaces: import { getCurrentWindow } from "@tauri-apps/api/window"
export function getCurrentWindow() {
  return {
    setTitle: async (title) => window.electronAPI.setTitle(title)
  }
}
