/**
 * Main Process - Electron entry point
 * Combines SerialManager + IPC handlers + BrowserWindow setup
 * (Inlined for electron-vite compatibility)
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// ============================================================
// SERIAL MANAGER
// ============================================================
const { SerialPort } = require('serialport')

class SerialManager {
  constructor(mainWindow) {
    this.ports = new Map()
    this.mainWindow = mainWindow
  }

  async listPorts() {
    const ports = await SerialPort.list()
    return ports
      .filter(p => {
        // USB devices have vendorId, Bluetooth/debug don't
        if (!p.vendorId) return false
        const name = p.path
        if (process.platform === 'win32') return name.startsWith('COM')
        if (process.platform === 'darwin') return name.startsWith('/dev/tty.')
        if (process.platform === 'linux') {
          return name.startsWith('/dev/ttyUSB') ||
                 name.startsWith('/dev/ttyACM') ||
                 name.startsWith('/dev/ttyS')
        }
        return true
      })
      .map(p => ({
        name: p.path,
        port_type: process.platform === 'win32' ? p.path : p.path.split('/').pop() || p.path,
        manufacturer: p.manufacturer || null,
        product: p.pnpId || p.serialNumber || null,
      }))
  }

  openPort(config) {
    if (this.ports.has(config.port_name)) {
      throw new Error(`Port ${config.port_name} đã được mở`)
    }

    const port = new SerialPort({
      path: config.port_name,
      baudRate: config.baud_rate,
      dataBits: config.data_bits,
      stopBits: config.stop_bits === '2' ? 2 : 1,
      parity: config.parity.toLowerCase(),
      autoOpen: false,
    })

    return new Promise((resolve, reject) => {
      port.open(err => {
        if (err) {
          const msg = err.message.toLowerCase()
          if (msg.includes('busy') || msg.includes('access denied') ||
              msg.includes('permission denied') || msg.includes('already in use')) {
            return reject(new Error(`BUSY:${config.port_name}`))
          }
          return reject(new Error(`ERROR:${config.port_name}:${err.message}`))
        }

        port.set({ dtr: config.dtr, rts: config.rts }, () => {})

        const gapMs = Math.max(5, Math.min(50, Math.floor((256 * 10 * 1000) / config.baud_rate)))
        let buffer = Buffer.alloc(0)
        let timer = null

        port.on('data', chunk => {
          buffer = Buffer.concat([buffer, chunk])
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('serial-data', {
                port_name: config.port_name,
                data: Array.from(buffer),
                timestamp: Date.now(),
              })
            }
            buffer = Buffer.alloc(0)
          }, gapMs)
        })

        port.on('close', () => {
          this.ports.delete(config.port_name)
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('serial-disconnected', {
              port_name: config.port_name,
              reason: 'Port closed',
              timestamp: Date.now(),
            })
          }
        })

        port.on('error', err => {
          this.ports.delete(config.port_name)
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('serial-disconnected', {
              port_name: config.port_name,
              reason: err.message,
              timestamp: Date.now(),
            })
          }
        })

        this.ports.set(config.port_name, { port, config })
        resolve(`Đã mở port ${config.port_name} thành công`)
      })
    })
  }

  async closePort(portName) {
    const entry = this.ports.get(portName)
    if (!entry) return `Port ${portName} chưa mở`
    return new Promise(resolve => {
      entry.port.close(() => {
        this.ports.delete(portName)
        resolve(`Đã đóng port ${portName}`)
      })
    })
  }

  sendData(portName, data) {
    const entry = this.ports.get(portName)
    if (!entry) throw new Error(`Port ${portName} chưa được mở`)
    return new Promise((resolve, reject) => {
      entry.port.write(data, err => {
        if (err) return reject(new Error(`Lỗi gửi dữ liệu: ${err.message}`))
        entry.port.drain(() => resolve(`Đã gửi ${data.length} bytes`))
      })
    })
  }

  isPortOpen(portName) {
    return this.ports.has(portName)
  }

  closeAll() {
    for (const [name] of this.ports) {
      this.closePort(name).catch(() => {})
    }
  }
}

// ============================================================
// IPC HANDLERS
// ============================================================
function registerHandlers(serialManager) {
  ipcMain.handle('list_serial_ports', () => serialManager.listPorts())
  ipcMain.handle('open_port', (_, args) => serialManager.openPort(args.config || args))
  ipcMain.handle('close_port', (_, args) => serialManager.closePort(args.portName || args))
  ipcMain.handle('send_data', (_, args) => serialManager.sendData(args.portName, args.data))
  ipcMain.handle('is_port_open', (_, args) => serialManager.isPortOpen(args.portName || args))
  ipcMain.handle('set-title', (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.setTitle(title)
  })
}

// ============================================================
// MAIN WINDOW
// ============================================================
let mainWindow
let serialManager

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 550,
    minWidth: 550,
    minHeight: 450,
    title: 'vFeeder Config',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  serialManager = new SerialManager(mainWindow)
  registerHandlers(serialManager)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (serialManager) serialManager.closeAll()
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  if (serialManager) serialManager.closeAll()
})
