<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from "vue";
import { invoke, listen, getCurrentWindow } from "./api.js";
import Toast from "./components/Toast.vue";

// State
const ports = ref([]);
const selectedPort = ref("");
const isConnected = ref(false);
const errorLimit = ref(3);
const timeAlive = ref(120);
const logMessages = ref([]);
const status = ref("idle"); // idle | reading | writing | success | error
const statusMessage = ref("");
const logContainer = ref(null);
const dropdownOpen = ref(false);
const showHelp = ref(false);

// Auto Flash Mode
const autoFlashEnabled = ref(false);
const autoFlashStatus = ref("idle"); // idle | connecting | writing | success | error
const autoFlashCount = ref(0);
const autoFlashError = ref("");
let isAutoFlashing = false;
let lastFlashedPort = null;

// Toast
const toastVisible = ref(false);
const toastMessage = ref("");
const toastType = ref("error");

// Accumulate serial response
let responseBuffer = "";
let responseTimer = null;

function showToast(message, type = "error") {
  toastMessage.value = message;
  toastType.value = type;
  toastVisible.value = true;
}

// Thêm log + auto scroll
function addLog(type, text) {
  const now = new Date().toLocaleTimeString();
  logMessages.value.push({ type, text, time: now });
  if (logMessages.value.length > 100) {
    logMessages.value.shift();
  }
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

// Parse response từ ESP32
function parseResponse(rawText) {
  const text = rawText.trim();
  if (!text) return;

  if (text.includes(">>> OK:")) {
    const match = text.match(/SO_LOI=(\d+),SO_PHUT=(\d+)/);
    if (match) {
      status.value = "success";
      statusMessage.value = `Ghi cấu hình thành công: ${match[1]} lần lỗi, ${match[2]} giây`;
      showToast(statusMessage.value, "success");
    }
  } else if (text.includes(">>> CONFIG HIEN TAI:")) {
    const match = text.match(/(\d+)\s*lan\/(\d+)\s*phut/);
    if (match) {
      status.value = "success";
      statusMessage.value = `Cấu hình trên thiết bị này: ${match[1]} lần lỗi, ${match[2]} giây`;
    }
  } else if (text.includes(">>> ERR:")) {
    status.value = "error";
    statusMessage.value = text.replace(/>>>.*ERR:\s*/, "").trim();
    showToast("Lỗi: " + statusMessage.value, "error");
  }
}

function toggleDropdown() {
  if (isConnected.value) return;
  dropdownOpen.value = !dropdownOpen.value;
  if (dropdownOpen.value) refreshPorts();
}

function selectPort(name) {
  selectedPort.value = name;
  dropdownOpen.value = false;
}

function closeDropdown(e) {
  if (!e.target.closest('.port-dropdown')) {
    dropdownOpen.value = false;
  }
}

// Refresh danh sách port - lọc ESP32 và USB serial
async function refreshPorts() {
  try {
    const result = await invoke("list_serial_ports");
    ports.value = result.filter(p => {
      const desc = (p.product || '').toLowerCase() + (p.manufacturer || '').toLowerCase();
      // ESP32 devices: Espressif, JTAG, USB serial
      return desc.includes('jtag') || desc.includes('usb') || desc.includes('espressif');
    });
  } catch (error) {
    console.error("Lỗi liệt kê port:", error);
  }
}

// Kết nối serial
async function connect() {
  if (!selectedPort.value) {
    showToast("Vui lòng chọn cổng serial!", "warning");
    return;
  }

  try {
    const config = {
      port_name: selectedPort.value,
      baud_rate: 115200,
      data_bits: 8,
      stop_bits: "1",
      parity: "None",
      dtr: false,
      rts: false,
    };
    await invoke("open_port", { config });
    isConnected.value = true;
    addLog("sys", "Đã kết nối " + selectedPort.value);
    // Tự động đọc config khi kết nối
    setTimeout(() => readConfig(), 500);
  } catch (error) {
    const errStr = String(error).trim();
    if (errStr.includes("BUSY:")) {
      showToast("Cổng đang được sử dụng bởi ứng dụng khác", "error");
    } else {
      showToast("Không thể kết nối: " + errStr, "error");
    }
  }
}

// Ngắt kết nối
async function disconnect() {
  try {
    await invoke("close_port", { portName: selectedPort.value });
    isConnected.value = false;
    addLog("sys", "Đã ngắt kết nối");
  } catch (error) {
    console.error("Lỗi ngắt kết nối:", error);
  }
}

// Đọc cấu hình từ ESP32
async function readConfig() {
  if (!isConnected.value) {
    showToast("Vui lòng kết nối trước!", "warning");
    return;
  }
  status.value = "reading";
  statusMessage.value = "Đang đọc cấu hình...";
  try {
    await invoke("send_data", {
      portName: selectedPort.value,
      data: "#?#",
    });
    addLog("tx", "#?#");
  } catch (error) {
    status.value = "error";
    statusMessage.value = "Lỗi gửi lệnh đọc";
    showToast("Lỗi gửi: " + error, "error");
  }
}

// Ghi cấu hình vào ESP32
async function writeConfig() {
  if (!isConnected.value) {
    showToast("Vui lòng kết nối trước!", "warning");
    return;
  }

  // Validate
  const el = parseInt(errorLimit.value);
  const ta = parseInt(timeAlive.value);
  if (isNaN(el) || el < 1 || el > 9) {
    showToast("Số lần lỗi phải từ 1 đến 9", "warning");
    return;
  }
  if (isNaN(ta) || ta < 20 || ta > 600) {
    showToast("Thời gian giám sát phải từ 20 đến 600 giây", "warning");
    return;
  }

  status.value = "writing";
  statusMessage.value = "Đang ghi cấu hình...";
  const cmd = `#${el}-${ta}#`;
  try {
    await invoke("send_data", {
      portName: selectedPort.value,
      data: cmd,
    });
    addLog("tx", cmd);
  } catch (error) {
    status.value = "error";
    statusMessage.value = "Lỗi gửi lệnh ghi";
    showToast("Lỗi gửi: " + error, "error");
  }
}

// Toggle chế độ tự động
function toggleAutoFlash() {
  autoFlashEnabled.value = !autoFlashEnabled.value;
  if (autoFlashEnabled.value) {
    autoFlashStatus.value = "idle";
    autoFlashError.value = "";
    isAutoFlashing = false;
    lastFlashedPort = null;
    addLog("sys", "Bật chế độ tự động");
  } else {
    autoFlashStatus.value = "idle";
    autoFlashError.value = "";
    isAutoFlashing = false;
    addLog("sys", "Tắt chế độ tự động");
  }
}

// Auto flash workflow - được gọi khi phát hiện thiết bị mới
async function executeAutoFlash(portName) {
  if (isAutoFlashing) return;
  isAutoFlashing = true;
  autoFlashError.value = "";

  try {
    // Step 1: Connect
    autoFlashStatus.value = "connecting";
    selectedPort.value = portName;
    const config = {
      port_name: portName,
      baud_rate: 115200,
      data_bits: 8,
      stop_bits: "1",
      parity: "None",
      dtr: false,
      rts: false,
    };
    await invoke("open_port", { config });
    isConnected.value = true;
    addLog("sys", "Auto: Đã kết nối " + portName);

    // Step 2: Wait 500ms for stabilization
    await new Promise(r => setTimeout(r, 500));

    // Step 3: Write config
    autoFlashStatus.value = "writing";
    const el = parseInt(errorLimit.value);
    const ta = parseInt(timeAlive.value);
    if (isNaN(el) || el < 1 || el > 9 || isNaN(ta) || ta < 20 || ta > 600) {
      throw new Error("Giá trị cấu hình không hợp lệ");
    }
    const cmd = `#${el}-${ta}#`;
    await invoke("send_data", { portName, data: cmd });
    addLog("tx", cmd);

    // Step 4: Wait for OK response (max 5s)
    const ok = await waitForResponse(5000);
    if (!ok) {
      throw new Error("Không nhận được phản hồi từ thiết bị");
    }

    // Step 5: Success
    autoFlashStatus.value = "success";
    autoFlashCount.value++;
    lastFlashedPort = portName;
    addLog("sys", `Auto: Ghi thành công (#${autoFlashCount.value})`);

    // Step 6: Wait 1s then disconnect
    await new Promise(r => setTimeout(r, 1000));
    try {
      await invoke("close_port", { portName });
    } catch (e) { /* ignore */ }
    isConnected.value = false;
    addLog("sys", "Auto: Đã ngắt kết nối");

    // Ready for next device
    autoFlashStatus.value = "idle";
  } catch (error) {
    autoFlashStatus.value = "error";
    autoFlashError.value = String(error.message || error);
    addLog("sys", "Auto: Lỗi - " + autoFlashError.value);
    // Try to disconnect on error
    try {
      await invoke("close_port", { portName });
      isConnected.value = false;
    } catch (e) { /* ignore */ }
  } finally {
    isAutoFlashing = false;
  }
}

// Wait for OK response from ESP32
function waitForResponse(timeout) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const originalParseResponse = parseResponse;
    let resolved = false;

    // Watch for status change from parseResponse
    const checkInterval = setInterval(() => {
      if (status.value === "success") {
        clearInterval(checkInterval);
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }
    }, 100);
  });
}

// Reset auto flash error
function resetAutoFlashError() {
  autoFlashError.value = "";
  autoFlashStatus.value = "idle";
  isAutoFlashing = false;
  lastFlashedPort = null;
}

// Xóa log
function clearLog() {
  logMessages.value = [];
}

// Computed
const connectionLabel = computed(() =>
  isConnected.value ? "Đã kết nối" : "Chưa kết nối"
);

const selectedPortInfo = computed(() =>
  ports.value.find(p => p.name === selectedPort.value)
);

const autoFlashLabel = computed(() => {
  const labels = {
    idle: "Đang chờ thiết bị mới...",
    connecting: "Đang kết nối...",
    writing: "Đang ghi...",
    success: "Hoàn tất ✓",
    error: "Lỗi",
  };
  return labels[autoFlashStatus.value] || "Chờ...";
});

const statusIcon = computed(() => {
  switch (status.value) {
    case "success": return "check";
    case "error": return "x";
    case "reading":
    case "writing": return "loading";
    default: return "idle";
  }
});

// Event listeners
let unlistenSerial = null;
let unlistenDisconnect = null;
let portWatcher = null;

onMounted(async () => {
  // Set window title
  try {
    await getCurrentWindow().setTitle("vFeeder Config - Windows 7 Version");
  } catch (e) {
    console.warn("Could not set title:", e);
  }

  await refreshPorts();
  document.addEventListener('click', closeDropdown);

  // Theo dõi cắm/rút thiết bị mỗi 1.5s
  portWatcher = setInterval(async () => {
    const oldNames = ports.value.map(p => p.name).sort().join(',');
    await refreshPorts();
    const newNames = ports.value.map(p => p.name).sort().join(',');

    if (oldNames !== newNames) {
      const oldSet = new Set(oldNames.split(',').filter(Boolean));
      const newSet = new Set(newNames.split(',').filter(Boolean));

      // Thiết bị mới cắm vào
      for (const name of newSet) {
        if (!oldSet.has(name)) {
          const port = ports.value.find(p => p.name === name);
          const label = port?.product || name.replace('/dev/', '');
          addLog("sys", `Phát hiện thiết bị: ${label}`);

          // Auto flash mode: tự động ghi cấu hình
          if (autoFlashEnabled.value && !isAutoFlashing && name !== lastFlashedPort) {
            executeAutoFlash(name);
          } else if (!autoFlashEnabled.value) {
            showToast(`Phát hiện thiết bị: ${label}`, "success");
            if (!selectedPort.value) selectedPort.value = name;
          }
        }
      }

      // Thiết bị bị rút
      for (const name of oldSet) {
        if (!newSet.has(name)) {
          addLog("sys", `Thiết bị đã rút: ${name.replace('/dev/', '')}`);
          if (selectedPort.value === name) {
            selectedPort.value = "";
          }
          // Reset lastFlashedPort khi rút → cho phép flash lại khi cắm lại
          if (lastFlashedPort === name) {
            lastFlashedPort = null;
            if (autoFlashEnabled.value) {
              autoFlashStatus.value = "idle";
            }
          }
        }
      }
    }
  }, 1500);

  // Listen serial data
  unlistenSerial = await listen("serial-data", (event) => {
    const { data } = event.payload;
    // Chuyển bytes thành text
    const text = new TextDecoder().decode(new Uint8Array(data));

    // Tích lũy response buffer
    responseBuffer += text;

    // Reset timer mỗi lần nhận data
    clearTimeout(responseTimer);
    responseTimer = setTimeout(() => {
      const fullResponse = responseBuffer.trim();
      responseBuffer = "";
      if (!fullResponse) return;

      // Chỉ hiển thị dòng có >>> hoặc SmartFeeder
      const lines = fullResponse.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(">>>") || trimmed.startsWith("SmartFeeder")) {
          addLog("rx", trimmed);
        }
      }
      parseResponse(fullResponse);
    }, 200);
  });

  // Listen disconnect
  unlistenDisconnect = await listen("serial-disconnected", (event) => {
    isConnected.value = false;
    addLog("sys", "Thiết bị đã bị ngắt kết nối");
    showToast("Thiết bị đã bị ngắt kết nối!", "error");
  });
});

onUnmounted(async () => {
  document.removeEventListener('click', closeDropdown);
  if (portWatcher) clearInterval(portWatcher);
  if (unlistenSerial) unlistenSerial();
  if (unlistenDisconnect) unlistenDisconnect();
  clearTimeout(responseTimer);

  if (isConnected.value) {
    try {
      await invoke("close_port", { portName: selectedPort.value });
    } catch (e) {
      console.error("Error closing:", e);
    }
  }
});
</script>

<template>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1>vFeeder Config - Windows 7 Version</h1>
      </div>
      <div class="header-right">
        <div class="status-badge" :class="isConnected ? 'connected' : 'disconnected'">
          <span class="status-dot"></span>
          <span>{{ connectionLabel }}</span>
        </div>
        <button class="btn-help" @click="showHelp = true">Hướng dẫn sử dụng</button>
      </div>
    </header>

    <div class="content">
      <!-- Panel Kết nối -->
      <section class="panel">
        <h2 class="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 11-12.73 0" stroke-linecap="round"/>
            <line x1="12" y1="2" x2="12" y2="12" stroke-linecap="round"/>
          </svg>
          Thiết bị
        </h2>
        <div class="connection-row">
          <div class="port-dropdown" :class="{ open: dropdownOpen, disabled: isConnected }">
            <div class="dropdown-trigger" @click="toggleDropdown">
              <div class="dropdown-display">
                <span v-if="!selectedPort" class="placeholder">Chọn thiết bị...</span>
                <div v-else class="selected-info">
                  <span class="selected-name">{{ selectedPort.replace('/dev/', '') }}</span>
                  <span v-if="selectedPortInfo?.product" class="selected-device">{{ selectedPortInfo.product }}</span>
                </div>
              </div>
              <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="dropdown-menu" v-if="dropdownOpen">
              <div v-if="ports.length === 0" class="dropdown-empty">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Không tìm thấy thiết bị USB JTAG
              </div>
              <div
                v-for="p in ports"
                :key="p.name"
                class="dropdown-option"
                :class="{ selected: selectedPort === p.name }"
                @click="selectPort(p.name)"
              >
                <div class="option-details">
                  <span class="option-name">{{ p.name.replace('/dev/', '') }}</span>
                  <span class="option-product" v-if="p.product || p.manufacturer">{{ p.product || p.manufacturer }}</span>
                </div>
                <svg v-if="selectedPort === p.name" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </div>
          </div>
          <button class="btn-refresh" @click="refreshPorts" :disabled="isConnected" title="Làm mới">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M23 4v6h-6M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
            </svg>
          </button>
          <button
            v-if="!autoFlashEnabled && !isConnected"
            class="btn-connect"
            @click="connect"
            :disabled="!selectedPort"
          >
            Kết nối
          </button>
          <button
            v-if="!autoFlashEnabled && isConnected"
            class="btn-disconnect"
            @click="disconnect"
          >
            Ngắt
          </button>
        </div>
      </section>

      <!-- Panel Cấu hình -->
      <section class="panel config-panel">
        <div class="panel-header">
          <h2 class="panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Cài đặt cấu hình
          </h2>
          <!-- Auto Flash Toggle -->
          <button
            class="auto-toggle"
            :class="{ active: autoFlashEnabled }"
            @click="toggleAutoFlash"
          >
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-label">Bật tự động nạp</span>
          </button>
        </div>

        <div class="config-grid">
          <div class="config-field">
            <label>Số lần lỗi <span class="hint">(1-9)</span></label>
            <input
              type="number"
              v-model.number="errorLimit"
              min="1"
              max="9"
              :disabled="!isConnected && !autoFlashEnabled"
              placeholder="3"
            />
          </div>
          <div class="config-field">
            <label>Thời gian <span class="hint">(20-600 giây)</span></label>
            <input
              type="number"
              v-model.number="timeAlive"
              min="20"
              max="600"
              step="10"
              :disabled="!isConnected && !autoFlashEnabled"
              placeholder="120"
            />
          </div>
        </div>

        <!-- Auto Flash Status (khi bật chế độ tự động) -->
        <div v-if="autoFlashEnabled" class="auto-flash-section">
          <div class="auto-flash-bar" :class="autoFlashStatus">
            <div v-if="autoFlashStatus === 'connecting' || autoFlashStatus === 'writing'" class="spinner"></div>
            <svg v-else-if="autoFlashStatus === 'success'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <svg v-else-if="autoFlashStatus === 'error'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>{{ autoFlashLabel }}</span>
            <span v-if="autoFlashCount > 0" class="flash-counter">Số thiết bị đã cấu hình: {{ autoFlashCount }}</span>
          </div>
          <div v-if="autoFlashError" class="auto-flash-error">
            <span>{{ autoFlashError }}</span>
            <button class="btn-retry" @click="resetAutoFlashError">Thử lại</button>
          </div>
        </div>

        <!-- Manual controls (ẩn khi auto mode) -->
        <div v-if="!autoFlashEnabled" class="config-actions">
          <button class="btn btn-secondary" @click="readConfig" :disabled="!isConnected || status === 'reading'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
            </svg>
            Đọc cấu hình
          </button>
          <button class="btn btn-primary" @click="writeConfig" :disabled="!isConnected || status === 'writing'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Ghi cấu hình
          </button>
        </div>

        <!-- Status (chỉ hiện ở chế độ thủ công) -->
        <div v-if="!autoFlashEnabled && status !== 'idle'" class="status-bar" :class="status">
          <svg v-if="statusIcon === 'check'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <svg v-else-if="statusIcon === 'x'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <div v-else-if="statusIcon === 'loading'" class="spinner"></div>
          {{ statusMessage }}
        </div>
      </section>

      <!-- Panel Log -->
      <section class="panel log-panel">
        <div class="panel-header">
          <h2 class="panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            Logs
          </h2>
          <button class="btn btn-sm" @click="clearLog" v-if="logMessages.length > 0">Xóa</button>
        </div>
        <div class="log-content" ref="logContainer">
          <div v-if="logMessages.length === 0" class="log-empty">
            Chưa có dữ liệu. Kết nối thiết bị để bắt đầu.
          </div>
          <div
            v-for="(msg, i) in logMessages"
            :key="i"
            class="log-entry"
            :class="msg.type"
          >
            <span class="log-badge">{{ msg.type === 'tx' ? 'TX' : msg.type === 'rx' ? 'RX' : 'SYS' }}</span>
            <span class="log-text">{{ msg.text }}</span>
            <span class="log-time">{{ msg.time }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Help Modal -->
    <div v-if="showHelp" class="modal-overlay" @click.self="showHelp = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Hướng dẫn sử dụng</h3>
          <button class="modal-close" @click="showHelp = false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="help-section">
            <h4>Chế độ thủ công</h4>
            <ol>
              <li>Kẹp bo mạch và cắm thiết bị vào máy tính</li>
              <li>Chọn thiết bị từ danh sách → Nhấn <strong>Kết nối</strong></li>
              <li>Đặt thông số: Số lần lỗi (1-9), Thời gian (20-600s)</li>
              <li>Nhấn <strong>Ghi cấu hình</strong> để nạp vào thiết bị</li>
              <li>Nhấn <strong>Đọc cấu hình</strong> để xem cấu hình hiện tại</li>
            </ol>
          </div>
          <div class="help-section">
            <h4>Chế độ tự động nạp</h4>
            <ol>
              <li>Đặt thông số cấu hình mong muốn</li>
              <li>Bật <strong>Tự động nạp</strong></li>
              <li>Cắm thiết bị → Tự động nạp → Rút ra → Cắm thiết bị mới</li>
              <li>Số thiết bị đã nạp hiển thị trên thanh trạng thái</li>
            </ol>
          </div>
          <div class="help-section">
            <h4>Giá trị mặc định</h4>
            <p>Số lần lỗi: <strong>3</strong> — Thời gian: <strong>120 giây</strong></p>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <Toast
      :visible="toastVisible"
      :message="toastMessage"
      :type="toastType"
      @close="toastVisible = false"
    />
  </div>
</template>

<style>
@import "@fontsource/plus-jakarta-sans/400.css";
@import "@fontsource/plus-jakarta-sans/500.css";
@import "@fontsource/plus-jakarta-sans/600.css";
@import "@fontsource/plus-jakarta-sans/700.css";
@import "@fontsource/jetbrains-mono/400.css";

:root {
  --bg-primary: #f8fafc;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f1f5f9;
  --bg-hover: #e2e8f0;
  --accent-primary: #0ea5e9;
  --accent-secondary: #38bdf8;
  --accent-light: #e0f2fe;
  --success: #10b981;
  --success-light: #d1fae5;
  --danger: #ef4444;
  --danger-light: #fee2e2;
  --warning: #f59e0b;
  --warning-light: #fef3c7;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --text-tertiary: #94a3b8;
  --border-color: #e2e8f0;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  border-radius: var(--radius-lg);
  color: white;
  box-shadow: 0 2px 8px rgb(14 165 233 / 0.3);
}

.header h1 {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 600;
}

.status-badge.connected {
  background: var(--success);
  color: white;
}

.status-badge.disconnected {
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge.connected .status-dot {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Content */
.content {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Panel = config-card style from TermiPro */
.panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px;
  box-shadow: var(--shadow-sm);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.panel-title svg {
  color: var(--accent-primary);
  width: 14px;
  height: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header .panel-title {
  margin-bottom: 0;
}

/* Connection - TermiPro style */
.connection-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Port custom dropdown */
.port-dropdown {
  flex: 1;
  position: relative;
}

.port-dropdown.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 38px;
}

.dropdown-trigger:hover {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
}

.port-dropdown.open .dropdown-trigger {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.dropdown-display {
  flex: 1;
  min-width: 0;
}

.dropdown-display .placeholder {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

.selected-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.selected-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.selected-device {
  font-size: 0.65rem;
  color: var(--accent-primary);
  font-weight: 500;
}

.chevron {
  color: var(--text-tertiary);
  transition: transform 0.2s ease;
  flex-shrink: 0;
  margin-left: 8px;
}

.port-dropdown.open .chevron {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  max-height: 220px;
  overflow-y: auto;
  animation: dropdownSlide 0.15s ease;
}

@keyframes dropdownSlide {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.dropdown-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px;
  color: var(--text-tertiary);
  font-size: 0.75rem;
}

.dropdown-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.dropdown-option:hover {
  background: var(--bg-tertiary);
}

.dropdown-option.selected {
  background: var(--accent-light);
}

.dropdown-option.selected svg {
  color: var(--accent-primary);
}

.option-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-name {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.option-product {
  font-size: 0.65rem;
  color: var(--accent-primary);
  font-weight: 500;
}

.btn-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.btn-refresh:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Connect/Disconnect - TermiPro gradient style */
.btn-connect,
.btn-disconnect {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-lg);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;
  color: white;
}

.btn-connect {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  box-shadow: 0 4px 14px rgb(14 165 233 / 0.35);
}

.btn-connect:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgb(14 165 233 / 0.4);
}

.btn-connect:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-disconnect {
  background: linear-gradient(135deg, var(--danger), #f87171);
  box-shadow: 0 4px 14px rgb(239 68 68 / 0.35);
}

.btn-disconnect:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgb(239 68 68 / 0.4);
}

/* Generic buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: var(--font-sans);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.btn-primary:hover:not(:disabled) {
  background: #0284c7;
  border-color: #0284c7;
  box-shadow: 0 2px 8px rgb(14 165 233 / 0.3);
}

.btn-secondary {
  background: var(--bg-tertiary);
  border-color: var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--text-tertiary);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 0.68rem;
  border-radius: var(--radius-sm);
}

/* Config */
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.config-field label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.config-field .hint {
  font-weight: 400;
  color: var(--text-tertiary);
  font-size: 0.72rem;
}

.config-field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  outline: none;
  text-align: center;
  transition: all 0.2s ease;
}

.config-field input:hover:not(:disabled) {
  border-color: var(--accent-primary);
}

.config-field input:focus {
  background: var(--bg-secondary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-light);
}

.config-field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.config-actions .btn {
  flex: 1;
  justify-content: center;
}

/* Auto Flash Toggle */
.auto-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-primary);
  transition: all 0.3s ease;
}

.auto-toggle:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.auto-toggle.active {
  background: var(--accent-light);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  opacity: 1;
}

.toggle-track {
  position: relative;
  width: 28px;
  height: 16px;
  background: var(--border-color);
  border-radius: 10px;
  transition: background 0.3s ease;
  flex-shrink: 0;
}

.auto-toggle.active .toggle-track {
  background: var(--accent-primary);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.auto-toggle.active .toggle-thumb {
  transform: translateX(12px);
}

.toggle-label {
  white-space: nowrap;
  font-weight: 700;
}

/* Auto Flash Section */
.auto-flash-section {
  margin-top: 2px;
}

.auto-flash-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

.auto-flash-bar.idle {
  background: var(--warning-light);
  color: #92400e;
  animation: breathing 2s ease-in-out infinite;
}

.auto-flash-bar.connecting,
.auto-flash-bar.writing {
  background: var(--accent-light);
  color: #0369a1;
}

.auto-flash-bar.success {
  background: var(--success-light);
  color: #047857;
}

.auto-flash-bar.error {
  background: var(--danger-light);
  color: #b91c1c;
}

@keyframes breathing {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

.flash-counter {
  margin-left: auto;
  padding: 2px 8px;
  background: rgba(255,255,255,0.6);
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}

.auto-flash-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 8px 12px;
  background: var(--danger-light);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  color: #b91c1c;
}

.btn-retry {
  margin-left: auto;
  padding: 3px 10px;
  background: white;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 600;
  color: #b91c1c;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-retry:hover {
  background: #fee2e2;
}

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 500;
}

.status-bar.success {
  background: var(--success-light);
  color: #047857;
}

.status-bar.error {
  background: var(--danger-light);
  color: #b91c1c;
}

.status-bar.reading,
.status-bar.writing {
  background: var(--accent-light);
  color: #0369a1;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Log */
.log-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 150px;
}

.log-content {
  flex: 1;
  margin-top: 10px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 8px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.log-empty {
  color: var(--text-tertiary);
  text-align: center;
  padding: 20px;
  font-family: var(--font-sans);
  font-size: 0.82rem;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
}

.log-entry:last-child {
  border-bottom: none;
}

.log-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 28px;
  text-align: center;
}

.log-entry.tx .log-badge {
  background: var(--warning-light);
  color: #92400e;
}

.log-entry.rx .log-badge {
  background: var(--accent-light);
  color: #0369a1;
}

.log-entry.sys .log-badge {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.log-text {
  flex: 1;
  word-break: break-all;
  color: var(--text-primary);
}

.log-time {
  color: var(--text-tertiary);
  font-size: 0.6rem;
  flex-shrink: 0;
}

/* Header right */
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-help {
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 0.72rem;
  font-weight: 500;
  transition: color 0.2s ease;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.btn-help:hover {
  color: var(--accent-primary);
}

/* Help Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  animation: modalSlide 0.2s ease;
}

@keyframes modalSlide {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: var(--danger-light);
  color: var(--danger);
}

.modal-body {
  padding: 16px;
}

.help-section {
  margin-bottom: 14px;
}

.help-section:last-child {
  margin-bottom: 0;
}

.help-section h4 {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--accent-primary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.help-section ol {
  padding-left: 18px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.help-section ol strong {
  color: var(--text-primary);
}

.help-section p {
  font-size: 0.78rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.help-section p strong {
  color: var(--text-primary);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>
