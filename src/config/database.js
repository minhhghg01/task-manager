const { Sequelize } = require('sequelize');
const path = require('path');

let sequelize;

// Sử dụng công tắc USE_POSTGRES trong tệp .env
const usePostgres = process.env.USE_POSTGRES === 'true';

if (usePostgres) {
    // Kết nối đến PostgreSQL khi được bật
    sequelize = new Sequelize(
        process.env.DB_NAME || 'benhvientaskmanager',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASS || 'minh1234',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            logging: false, // Tắt log truy vấn SQL thô cho gọn nhẹ
            pool: {
                max: 20,       // Số lượng kết nối tối đa mở đồng thời
                min: 5,        // Số lượng kết nối tối thiểu luôn mở sẵn
                idle: 20000,   // Thời gian tối đa giải phóng kết nối nhàn rỗi (ms)
                acquire: 30000 // Thời gian tối đa chờ kết nối trước khi báo lỗi (ms)
            }
        }
    );
    console.log('[Database] Cấu hình hệ thống kết nối cơ sở dữ liệu PostgreSQL.');
} else {
    // Phương án dự phòng SQLite cho môi trường lập trình local
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
}

module.exports = sequelize;