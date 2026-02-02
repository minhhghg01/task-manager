const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fullname: { type: DataTypes.STRING, allowNull: false },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false }, // Lưu hash
    gmail: { type: DataTypes.STRING, validate: { isEmail: true } },
    phone: { type: DataTypes.STRING },
    departments_id: { type: DataTypes.INTEGER, allowNull: false },
    role: {
        type: DataTypes.ENUM('ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'HEAD', 'DEPUTY', 'LEADER', 'STAFF'),
        defaultValue: 'STAFF'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
    }
}, {
    timestamps: true, // Tự động tạo created_at, updated_at
    underscored: true // Chuyển camelCase thành snake_case (created_at)
});

module.exports = User;