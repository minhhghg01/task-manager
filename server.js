// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const { sequelize, User, Department } = require('./src/models'); // Import index models
const bcrypt = require('bcryptjs');
const seedData = require('./src/config/seedData');
const { createClient } = require('redis');
const { RedisStore } = require('connect-redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// --- CẤU HÌNH ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3005;
const HOST = '0.0.0.0'; // <--- [QUAN TRỌNG] Lắng nghe trên mọi IP để mạng LAN truy cập được

// --- CẤU HÌNH REDIS ---
const USE_REDIS = process.env.USE_REDIS === 'true' || !!process.env.REDIS_HOST;
let sessionMiddleware;

if (USE_REDIS) {
    const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
    const REDIS_PORT = process.env.REDIS_PORT || 6379;
    const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';

    let redisUrl = `redis://${REDIS_HOST}:${REDIS_PORT}`;
    if (REDIS_PASSWORD) {
        redisUrl = `redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`;
    }

    console.log(`[Redis] Đang kết nối tới ${redisUrl}...`);
    const redisClient = createClient({ url: redisUrl });
    redisClient.on('error', (err) => console.error('[Redis Error]', err));
    redisClient.on('connect', () => console.log('[Redis] Đã kết nối thành công.'));

    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    Promise.all([
        redisClient.connect(),
        pubClient.connect(),
        subClient.connect()
    ]).then(() => {
        console.log('[Redis] Tất cả các kết nối Redis đã sẵn sàng.');
        io.adapter(createAdapter(pubClient, subClient));
    }).catch(err => {
        console.error('[Redis] Lỗi kết nối Redis:', err);
    });

    sessionMiddleware = session({
        store: new RedisStore({ client: redisClient, prefix: "sess:" }),
        secret: 'benhvien_secret_key_2026',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1 * 60 * 60 * 1000 } // 1 giờ
    });
} else {
    console.log('[Redis] Bỏ qua cấu hình Redis. Sử dụng MemoryStore cho Session và MemoryAdapter cho Socket.io (Môi trường Dev).');
    sessionMiddleware = session({
        secret: 'benhvien_secret_key_2026',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1 * 60 * 60 * 1000 } // 1 giờ
    });
}

// 1. Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', './src/views');
app.use(express.static('src/public'));

// Cấu hình Session
app.use(sessionMiddleware);

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

// Catch-all 404 handler
app.use((req, res, next) => {
    res.status(404).render('pages/404');
});

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