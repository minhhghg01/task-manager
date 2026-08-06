const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskTemplate = sequelize.define('TaskTemplate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false }, // Tên mẫu công việc (VD: Báo cáo ngày, Họp giao ban)
    title: { type: DataTypes.STRING }, // Tiêu đề công việc được định nghĩa sẵn
    description: { type: DataTypes.TEXT }, // Mô tả công việc định nghĩa sẵn
    priority: { type: DataTypes.ENUM('Thấp', 'Trung bình', 'Cao (Gấp)'), defaultValue: 'Trung bình' },
    tags: { type: DataTypes.STRING }, // Các nhãn gán sẵn dạng chuỗi
    created_by: { type: DataTypes.INTEGER, allowNull: false } // ID người tạo mẫu
}, {
    timestamps: true,
    underscored: true
});

module.exports = TaskTemplate;
