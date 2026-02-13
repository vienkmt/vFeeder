# vFeeder Config

Công cụ cấu hình ESP32 SmartFeeder qua cổng serial. Hỗ trợ nạp thủ công và tự động hàng loạt trên dây chuyền sản xuất.

## Tính năng

- **Kết nối USB JTAG** - Tự động phát hiện thiết bị cắm/rút
- **Đọc/Ghi cấu hình** - Số lần lỗi (1-9), thời gian giám sát (20-600s)
- **Chế độ tự động nạp** - Cắm → ghi → rút → cắm cái mới → lặp lại
- **Offline hoàn toàn** - Không kết nối internet

## Cài đặt

Tải file cài đặt Windows (.exe hoặc .msi) từ [Releases](../../releases).

## Hướng dẫn sử dụng

### Thủ công

1. Cắm thiết bị USB JTAG vào máy tính
2. Chọn thiết bị → **Kết nối**
3. Đặt thông số → **Ghi cấu hình**

### Tự động nạp

1. Đặt thông số cấu hình
2. Bật **Tự động nạp**
3. Cắm thiết bị → tự ghi → rút → cắm cái mới

### Giá trị mặc định

| Thông số | Giá trị |
|----------|---------|
| Số lần lỗi | 3 |
| Thời gian giám sát | 120 giây |

## Phát triển

### Electron Version (Windows 7 Support)

```bash
cd vfeeder-electron
npm install
npm run dev        # Development
npm run build      # Build frontend
npm run package    # Create installer
```

See [vfeeder-electron/README.md](./vfeeder-electron/README.md) for details.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Vue.js 3 + Vite |
| Backend | Node.js + Electron 22 |
| Serial Comm | serialport v10.5 |
| Installer | electron-builder (NSIS) |

**Note**: Migrated from Tauri to Electron for Windows 7 compatibility

## License

MIT
