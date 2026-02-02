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

module.exports = sequelize;