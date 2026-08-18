# Hướng Dẫn Triển Khai Hệ Thống Quản Lý Công Việc Trên Windows Server & IIS

Tài liệu này hướng dẫn chi tiết các bước thiết lập và vận hành ứng dụng trên **Windows Server** sử dụng **IIS (Internet Information Services)** làm máy chủ Reverse Proxy, thiết lập HTTPS bằng công cụ Let's Encrypt trên Windows, cài đặt Ollama và lộ trình chuyển đổi cơ sở dữ liệu sang **PostgreSQL**.

---

## PHẦN 1: TRIỂN KHAI TRÊN WINDOWS SERVER & IIS

### Chuẩn bị trước khi cài đặt:
- Máy chủ chạy hệ điều hành Windows Server (khuyên dùng cấu hình tối thiểu 2 vCPU, 4GB RAM).
- Một tên miền đã được trỏ về địa chỉ IP của Windows Server (ví dụ: `congviec.benhvien.com`).

---

### Bước 1: Cài đặt các phần mềm nền tảng
1. **Tải và cài đặt Node.js**:
   - Truy cập trang chủ [nodejs.org](https://nodejs.org), tải xuống bản installer **LTS** (`.msi`) cho Windows và cài đặt mặc định.
2. **Cài đặt Git cho Windows** (nếu bạn quản lý mã nguồn bằng Git):
   - Tải và cài đặt tại [git-scm.com](https://git-scm.com).
3. **Cài đặt IIS (Internet Information Services)**:
   - Mở **Server Manager** -> Chọn **Add roles and features**.
   - Ở mục **Server Roles**, tích chọn **Web Server (IIS)**.
   - Ở mục **Role Services** bên dưới Web Server (IIS), hãy đảm bảo tích chọn:
     - **Web Server** -> **Common HTTP Features** -> **Default Document, Static Content**.
     - **Web Server** -> **Application Development** -> **WebSocket Protocol** (rất quan trọng cho tính năng thời gian thực của Socket.io).
   - Nhấn **Install** để tiến hành cài đặt.
4. **Cài đặt IIS URL Rewrite & Application Request Routing (ARR)**:
   - Tải và cài đặt công cụ **URL Rewrite** tại: [iis.net/downloads/microsoft/url-rewrite](https://www.iis.net/downloads/microsoft/url-rewrite).
   - Tải và cài đặt **Application Request Routing (ARR 3.0)** tại: [iis.net/downloads/microsoft/application-request-routing](https://www.iis.net/downloads/microsoft/application-request-routing).

---

### Bước 2: Tải mã nguồn ứng dụng & Thiết lập cấu hình
1. Đặt mã nguồn ứng dụng vào một thư mục cố định trên máy chủ (ví dụ: `C:\inetpub\taskmanager`).
2. Mở Command Prompt hoặc PowerShell tại thư mục đó và chạy lệnh cài đặt dependencies:
   ```cmd
   npm install --production
   ```
3. Tạo tệp `.env` trong thư mục gốc (`C:\inetpub\taskmanager\.env`) và điền nội dung:
   ```env
   PORT=3005
   NODE_ENV=production

   # Cấu hình SMTP gửi Gmail OTP
   EMAIL_USER=email_gui_otp_cua_ban@gmail.com
   EMAIL_PASS=mat_khau_ung_dung_gmail

   # Cấu hình AI nội bộ (Local Ollama)
   LOCAL_AI_URL=http://localhost:11434/api/chat
   LOCAL_AI_MODEL=qwen2:0.5b
   ```

---

### Bước 3: Chạy Node.js dưới dạng Windows Service (NSSM)
Để đảm bảo Node.js chạy ngầm liên tục và tự động bật khi khởi động lại Windows Server, chúng ta sử dụng công cụ **NSSM (Non-Sucking Service Manager)**:

1. Tải xuống **NSSM** từ [nssm.cc/download](https://nssm.cc/download). Giải nén và copy tệp `nssm.exe` (chọn bản 64-bit) vào thư mục dự án hoặc `C:\Windows\System32`.
2. Mở Command Prompt với quyền Administrator và chạy lệnh:
   ```cmd
   nssm install TaskManagerService
   ```
3. Một cửa sổ giao diện hiện lên, bạn điền cấu hình như sau:
   - **Path**: Đường dẫn tới tệp `node.exe` (thường là `C:\Program Files\nodejs\node.exe`).
   - **Startup directory**: Thư mục dự án (`C:\inetpub\taskmanager`).
   - **Arguments**: Tên file chạy chính (`server.js`).
   - Sang thẻ **Details**:
     - *Display name*: `TaskManager Service`
     - *Startup type*: `Automatic`
4. Nhấn **Install service** để hoàn tất.
5. Khởi chạy service bằng lệnh:
   ```cmd
   net start TaskManagerService
   ```

---

### Bước 4: Cấu hình IIS làm Reverse Proxy
Chúng ta cấu hình IIS nhận yêu cầu từ cổng 80/443 và chuyển tiếp tới cổng 3005 của Node.js:

1. **Bật tính năng Proxy trong ARR**:
   - Mở **IIS Manager** (Internet Information Services).
   - Chọn tên Server ở cột bên trái -> Nhấp đúp vào **Application Request Routing Cache**.
   - Ở cột bên phải (Actions), nhấp vào **Server Proxy Settings**.
   - Tích chọn **Enable proxy** -> Nhấp **Apply** ở góc trên bên phải.
2. **Tạo Website mới trong IIS**:
   - Nhấp chuột phải vào mục **Sites** ở cột bên trái -> Chọn **Add Website**.
   - *Site name*: `TaskManagerWeb`
   - *Physical path*: Thư mục dự án `C:\inetpub\taskmanager`
   - *Binding*: Chọn `http`, điền Hostname của bạn (ví dụ: `congviec.benhvien.com`).
3. **Cấu hình Rule Rewrite chuyển tiếp cổng**:
   - Nhấp vào website `TaskManagerWeb` vừa tạo -> Nhấp đúp vào biểu tượng **URL Rewrite**.
   - Chọn **Add Rule(s)...** ở cột bên phải -> Chọn **Blank rule** (Inbound rules).
   - Thiết lập cấu hình quy tắc:
     - *Name*: `ProxyToNode`
     - *Using*: `Regular Expressions`
     - *Pattern*: `^(.*)$`
     - Cuộn xuống phần **Action**:
       - *Action type*: `Rewrite`
       - *Rewrite URL*: `http://localhost:3005/{R:1}`
       - Tích chọn **Append query string**.
     - Nhấp **Apply** ở cột bên phải để hoàn tất.

---

### Bước 5: Cấu hình SSL/TLS (HTTPS) tự động bằng win-acme
Trên Windows, để tạo và tự động gia hạn chứng chỉ Let's Encrypt miễn phí cho IIS, công cụ tốt nhất là **win-acme**:

1. Tải bản mới nhất của **win-acme** từ [win-acme.com](https://www.win-acme.com) (tải bản zip recommended).
2. Giải nén vào thư mục cố định (ví dụ `C:\win-acme`).
3. Nhấp chuột phải vào tệp `wacs.exe` -> Chọn **Run as Administrator**.
4. Chọn các phím chức năng theo thứ tự:
   - Gõ **N** (tạo mới chứng chỉ IIS - Create certificate).
   - Chọn website `TaskManagerWeb` của bạn bằng cách gõ số thứ tự hiển thị.
   - Nhập địa chỉ Email để Let's Encrypt gửi cảnh báo nếu gặp sự cố.
   - Đồng ý với điều khoản dịch vụ.
5. Công cụ sẽ tự động xác thực tên miền, tải chứng chỉ SSL về máy, liên kết (bind) cổng 443 HTTPS vào website trên IIS của bạn và tự động thiết lập lịch biểu Windows Task Scheduler để tự động gia hạn mỗi 60 ngày.

---

### Bước 6: Cài đặt và cấu hình Ollama (AI Cục bộ) trên Windows Server
1. Truy cập [ollama.com](https://ollama.com) và tải xuống bản cài đặt cho **Windows** (`OllamaSetup.exe`).
2. Chạy file exe để cài đặt. Sau khi cài đặt xong, biểu tượng Ollama sẽ xuất hiện dưới khay hệ thống (System Tray).
3. Mở Command Prompt hoặc PowerShell và tải mô hình AI siêu nhẹ:
   ```cmd
   ollama run qwen2:0.5b
   ```
4. Sau khi tải xong, AI sẽ hoạt động ở cổng `11434`. Ứng dụng Task Manager sẽ tự động kết nối thông qua cấu hình `LOCAL_AI_URL` trong tệp `.env`.

---
---

## PHẦN 2: LỘ TRÌNH CHUYỂN ĐỔI SANG POSTGRESQL (TRONG TƯƠNG LAI)

Vì ứng dụng đang sử dụng thư viện **Sequelize ORM**, việc chuyển đổi cơ sở dữ liệu từ SQLite sang PostgreSQL rất đơn giản và an toàn thông qua các bước sau:

### Bước 1: Cài đặt thư viện kết nối PostgreSQL
Mở Command Prompt tại thư mục dự án và cài đặt trình điều khiển (driver) cho PostgreSQL:
```cmd
npm install pg pg-hstore
```

### Bước 2: Bổ sung các biến cấu hình PostgreSQL vào `.env`
Mở tệp `.env` và thêm thông tin kết nối PostgreSQL:
```env
# Thay thế hoặc bổ sung cấu hình DB
DB_HOST=localhost
DB_PORT=5432
DB_NAME=benhvientaskmanager
DB_USER=postgres
DB_PASS=mat_khau_database_cua_ban
```

### Bước 3: Sửa đổi cấu hình kết nối trong mã nguồn
Mở tệp **[database.js](file:///d:/ming/DEV/taskManager/benhvien-task-manager/src/config/database.js)** và thay thế toàn bộ nội dung cũ bằng đoạn mã kết nối động dưới đây:

```javascript
const { Sequelize } = require('sequelize');

// Kiểm tra xem có biến cấu hình PostgreSQL không, nếu không sẽ dùng SQLite dự phòng (Fallback)
let sequelize;

if (process.env.DB_NAME) {
    // Kết nối tới PostgreSQL
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            logging: false, // Tắt log truy vấn SQL thô
            pool: {
                max: 10,       // Số lượng kết nối tối đa trong bể kết nối
                min: 2,        // Số lượng kết nối tối thiểu
                idle: 10000,   // Thời gian kết nối được giải phóng nếu không sử dụng (ms)
                acquire: 30000 // Thời gian chờ tối đa để lấy một kết nối trước khi báo lỗi (ms)
            }
        }
    );
    console.log('[Database] Hệ thống đang kết nối tới cơ sở dữ liệu PostgreSQL.');
} else {
    // Dùng SQLite cũ làm phương án dự phòng
    const path = require('path');
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: path.join(__dirname, '../../database.sqlite'),
        logging: false,
        pool: {
            max: 5,
            min: 0,
            idle: 10000
        }
    });
    
    // Áp dụng cấu hình tối ưu SQLite
    (async () => {
        try {
            await sequelize.query('PRAGMA journal_mode=WAL;');
            await sequelize.query('PRAGMA busy_timeout=5000;');
            await sequelize.query('PRAGMA synchronous=NORMAL;');
            console.log('[Database] Đang kết nối tới SQLite (chế độ WAL).');
        } catch (err) {
            console.error('[SQLite] Lỗi cấu hình tối ưu:', err);
        }
    })();
}

module.exports = sequelize;
```

### Bước 4: Khởi động lại ứng dụng
Khi bạn hoàn thành 3 bước trên và có một máy chủ PostgreSQL đang chạy:
1. Tạo một cơ sở dữ liệu trống trên PostgreSQL với tên đã khai báo ở `.env` (ví dụ: `benhvientaskmanager`).
2. Khởi động lại service:
   ```cmd
   net stop TaskManagerService
   net start TaskManagerService
   ```
3. Khi khởi chạy lần đầu tiên, Sequelize ORM sẽ tự động đọc cấu hình các Model (User, Task, Department...) và tự sinh toàn bộ bảng cấu trúc, khóa ngoại, cột dữ liệu trên PostgreSQL hoàn toàn tự động mà bạn không cần viết lệnh SQL tạo bảng.
