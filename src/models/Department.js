const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Department = sequelize.define('Department', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, unique: true },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' }
}, {
    timestamps: true,
    underscored: true
});

module.exports = Department;