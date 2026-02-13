<script setup>
import { ref, onMounted } from 'vue'
import { getCurrentWindow } from './api.js'

const status = ref('Ready')
const electronVersion = ref('')

onMounted(async () => {
  // Set window title
  try {
    await getCurrentWindow().setTitle('vFeeder Config')
  } catch (e) {
    console.warn('Could not set title:', e)
  }

  // Get Electron version
  electronVersion.value = process.versions?.electron || 'Unknown'
  status.value = 'Electron app initialized'
})
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="logo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1>vFeeder Config</h1>
      <span class="badge">Electron</span>
    </header>

    <main class="content">
      <div class="card">
        <h2>Phase 1: Setup Complete</h2>
        <p class="status">{{ status }}</p>
        <p class="info">Electron Version: {{ electronVersion }}</p>
        <p class="info">Platform: {{ process.platform }}</p>
        <p class="note">
          Phase 2 will add serial port communication.<br>
          Phase 3 will migrate the full UI from Tauri app.
        </p>
      </div>
    </main>
  </div>
</template>

<style>
@import "@fontsource/plus-jakarta-sans/400.css";
@import "@fontsource/plus-jakarta-sans/600.css";
@import "@fontsource/plus-jakarta-sans/700.css";

:root {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --accent: #0ea5e9;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --border: #e2e8f0;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #0ea5e9, #38bdf8);
  border-radius: 10px;
  color: white;
}

.header h1 {
  font-size: 1.1rem;
  font-weight: 700;
}

.badge {
  margin-left: auto;
  padding: 4px 12px;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.card h2 {
  font-size: 1.25rem;
  margin-bottom: 16px;
  color: var(--accent);
}

.status {
  font-size: 1rem;
  font-weight: 600;
  color: #10b981;
  margin-bottom: 12px;
}

.info {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.note {
  margin-top: 20px;
  padding: 12px;
  background: #fef3c7;
  border-radius: 8px;
  font-size: 0.8rem;
  color: #92400e;
  line-height: 1.6;
}
</style>
