# vFeeder Config - Electron Version

ESP32 configuration tool for Auto Reset Feeder devices, built with Electron for Windows 7 compatibility.

## Overview

**vFeeder Config** is a lightweight desktop application that allows you to configure ESP32 devices via serial connection. You can read and write two parameters:
- Error count limit (SO_LOI): 1-9 occurrences
- Monitoring time (SO_PHUT): 20-600 seconds

**Technology Stack**
- **Frontend**: Vue.js 3 + Vite
- **Backend**: Node.js + Electron 22
- **Serial Communication**: serialport v10.5
- **Build Tool**: electron-builder

## Requirements

- Node.js 18 or higher
- Windows 7 SP1 or later (for packaging/deployment)
- VC++ Redistributable 2015 (may be required on Windows 7)

## Development

### Install Dependencies
```bash
npm install
```

### Development Mode
```bash
npm run dev
```
Starts the Electron app in development mode with hot reload.

### Build Frontend
```bash
npm run build
```
Builds Vue.js frontend to `/out/renderer/`.

### Package Application
```bash
npm run package
```
Builds the app and creates an installer: `vFeeder-Config-{version}-{arch}-setup.exe`

**For both architectures (x64 + ia32):**
```bash
npm run package:all
```

## Project Structure

```
src/
├── main/              # Electron main process
│   └── index.js       # IPC handlers, serial management
├── preload/           # Preload scripts
│   └── index.js       # Safe context bridge
└── renderer/          # Vue.js frontend
    ├── App.vue        # Main app component
    ├── main.js        # Entry point
    ├── api.js         # IPC communication
    └── components/
        └── Toast.vue  # Notifications
```

## Build Configuration

- **Window**: 700x550 (min 550x450)
- **Installer**: NSIS (one-click, per-user)
- **Icon**: `resources/icon.ico`
- **Output**: `release/` directory

## Notes

- **Electron Version**: 22.3.27 (Windows 7 support, EOL accepted for offline-only use)
- **VC++ Runtime**: Bundled in installer (vc_redist.x86.exe) - auto-installs on Win7 if missing
- **Offline Ready**: All dependencies bundled, no network required for installation
- **Installer Size**: ~100MB (includes Electron, Node.js, serialport native modules, VC++ runtime)

## License

MIT
