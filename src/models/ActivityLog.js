const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActivityLog = sequelize.define('ActivityLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
        // Ví dụ: 'LOGIN', 'CREATE_TASK', 'UPDATE_STATUS', 'DELETE_USER'
    },
    entity_type: {
        type: DataTypes.STRING,
        allowNull: true
        // Ví dụ: 'TASK', 'USER', 'DEPARTMENT' - Để biết log này thuộc về đối tượng nào
    },
    entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true
        // ID của đối tượng bị tác động (Ví dụ: ID của Task vừa tạo)
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true,
        // Tự động chuyển Object/Array thành String khi lưu và ngược lại khi lấy
        get() {
            const rawValue = this.getDataValue('details');
            try {
                return rawValue ? JSON.parse(rawValue) : null;
            } catch (e) {
                return rawValue;
            }
        },
        set(value) {
            if (typeof value === 'object') {
                this.setDataValue('details', JSON.stringify(value));
            } else {
                this.setDataValue('details', value);
            }
        }
    }
}, {
    timestamps: true,     // Bật timestamp để có created_at
    updatedAt: false,     // Tắt updated_at (Log là bất biến, không sửa)
    underscored: true,    // Tự động map created_at (camelCase -> snake_case)
    tableName: 'activity_logs'
});

module.exports = ActivityLog;