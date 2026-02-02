const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskAttachment = sequelize.define('TaskAttachment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    task_id: {
        type: DataTypes.TEXT, // JSON "[101, 102]" (Chia sẻ nhiều task)
        get() { return JSON.parse(this.getDataValue('task_id') || '[]'); },
        set(val) { this.setDataValue('task_id', JSON.stringify(val)); }
    },
    department_id: {
        type: DataTypes.TEXT, // JSON "[1, 2]" (Chia sẻ nhiều phòng)
        get() { return JSON.parse(this.getDataValue('department_id') || '[]'); },
        set(val) { this.setDataValue('department_id', JSON.stringify(val)); }
    },
    file_name: { type: DataTypes.STRING },
    file_path: { type: DataTypes.STRING }, // Đường dẫn file
    uploaded_by: { type: DataTypes.INTEGER }
}, {
    timestamps: true,
    underscored: true
});

module.exports = TaskAttachment;