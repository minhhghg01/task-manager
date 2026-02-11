// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const { sequelize, User, Department } = require('./src/models'); // Import index models
const bcrypt = require('bcryptjs');
const seedData = require('./src/config/seedData');

// --- CẤU HÌNH ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;
const HOST = '0.0.0.0'; // <--- [QUAN TRỌNG] Lắng nghe trên mọi IP để mạng LAN truy cập được

// 1. Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('src/public'));

// Cấu hình Session (để lưu trạng thái đăng nhập)
app.use(session({
    secret: 'benhvien_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 ngày
}));

// Middleware toàn cục: Truyền user vào mọi view EJS
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// 2. Routes
// Inject 'io' vào routes để controller có thể bắn thông báo
const webRoutes = require('./src/routes/web')(io);
const apiRoutes = require('./src/routes/api')(io);

app.use('/', webRoutes);
app.use('/api', apiRoutes);

// 3. Socket.io Logic
io.on('connection', (socket) => {
    // Khi client join room theo User ID của họ
    socket.on('JOIN_USER_ROOM', (userId) => {
        if (userId) {
            socket.join(`user_${userId}`);
            console.log(`[Socket] User ${userId} đã online.`);
        }
    });
});

// 4. Khởi động Server & Seed Data (Tạo Admin mặc định)
sequelize.sync().then(async () => {
    console.log('--- Database đã đồng bộ ---');

    // Gọi hàm tạo dữ liệu mẫu
    await seedData();

    // Sửa đoạn listen để lắng nghe HOST
    server.listen(PORT, HOST, () => {
        console.log(`--------------------------------------------------`);
        console.log(`Server đang chạy tại Local:   http://localhost:${PORT}`);
        console.log(`Truy cập từ mạng LAN:         http://192.168.10.8:${PORT}`);
        console.log(`--------------------------------------------------`);
    });
});