const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Task = sequelize.define('Task', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    priority: { type: DataTypes.ENUM('Low', 'Medium', 'High'), defaultValue: 'Medium' },
    status: {
        type: DataTypes.ENUM('New', 'In_Progress', 'Pending', 'Completed', 'Overdue'),
        defaultValue: 'New'
    },
    assigned_by: { type: DataTypes.INTEGER, allowNull: false },
    assigned_to: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]' // Mặc định là mảng rỗng dạng chuỗi
    },

    progress: { type: DataTypes.INTEGER, defaultValue: 0 },
    department_id: { type: DataTypes.INTEGER },
    start_date: { type: DataTypes.DATE },
    due_date: { type: DataTypes.DATE },
    log_update: { type: DataTypes.TEXT },
    completed_date: { type: DataTypes.DATE },
    score: { type: DataTypes.INTEGER, defaultValue: null },
    attachment_path: { type: DataTypes.STRING },
}, {
    timestamps: true,
    underscored: true
});

module.exports = Task;