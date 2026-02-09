# vFeeder Config - ESP32 Configuration Tool

## Tổng quan

**vFeeder Config** là ứng dụng desktop đơn giản để cấu hình thiết bị ESP32 (Auto Reset Feeder) qua serial. Cho phép đọc/ghi 2 thông số: số lần lỗi và thời gian giám sát.

- **Frontend**: Vue.js 3 + Vite
- **Backend**: Rust
- **Framework**: Tauri 2

## Cấu trúc dự án

```
vfeeder-config/
├── src/                    # Frontend Vue.js
│   ├── App.vue            # Single page app
│   ├── main.js            # Entry point
│   └── components/
│       └── Toast.vue      # Toast notification
├── src-tauri/             # Backend Rust
│   ├── src/
│   │   ├── lib.rs         # Serial commands
│   │   └── main.rs        # Entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
└── vite.config.js
```

## ESP32 Protocol

- **Gửi config**: `#{error_limit}-{time_alive}#` (VD: `#2-120#`)
- **Query**: `#?#`
- **Response OK**: `>>> OK: SO_LOI={n},SO_PHUT={n}`
- **Response query**: `>>> CONFIG HIEN TAI: {n} lan/{n} phut`
- **Response error**: `>>> ERR: ...`
- **Giới hạn**: error_limit: 1-9, time_alive: 20-600 giây

## Backend Rust - Tauri Commands

| Command | Mô tả |
|---------|-------|
| `list_serial_ports()` | Liệt kê các cổng USB serial |
| `open_port(config)` | Mở kết nối (mặc định 115200/8/N/1) |
| `close_port(port_name)` | Đóng kết nối |
| `send_data(port_name, data)` | Gửi text data |
| `is_port_open(port_name)` | Kiểm tra trạng thái |

## Dependencies

### Rust
- `tauri` v2, `serialport` v4.3, `serde` v1, `parking_lot` v0.12

### Frontend
- `vue` ^3.5.13, `@tauri-apps/api` ^2
- `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`

## Chạy ứng dụng

```bash
npm run tauri dev    # Development
npm run tauri build  # Production
```

## Cửa sổ

- **Kích thước mặc định**: 700 x 550
- **Kích thước tối thiểu**: 550 x 450
- **Ngôn ngữ**: Tiếng Việt
