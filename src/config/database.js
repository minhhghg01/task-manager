const { Sequelize } = require('sequelize');
const path = require('path');

// Sử dụng SQLite
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../database.sqlite'),
    logging: false, // Tắt log SQL cho gọn
    pool: {
        max: 5,
        min: 0,
        idle: 10000
    }
});

// Tối ưu hóa SQLite cho môi trường nhiều người dùng đọc/ghi đồng thời
(async () => {
    try {
        await sequelize.query('PRAGMA journal_mode=WAL;');
        await sequelize.query('PRAGMA busy_timeout=5000;');
        await sequelize.query('PRAGMA synchronous=NORMAL;');
        await sequelize.query('PRAGMA cache_size=-10000;'); // Cache 10MB
        await sequelize.query('PRAGMA temp_store=MEMORY;');
        console.log('[SQLite] Đã kích hoạt chế độ WAL, thiết lập busy_timeout = 5000ms và áp dụng các cấu hình tối ưu hóa bộ nhớ.');
    } catch (err) {
        console.error('[SQLite] Lỗi cấu hình tối ưu hóa SQLite:', err);
    }
})();

module.exports = sequelize;