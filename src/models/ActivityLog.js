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

const { requestContextStore } = require('../middleware/requestContext');

ActivityLog.beforeCreate((log, options) => {
    try {
        const store = requestContextStore.getStore();
        if (store) {
            const { ip, deviceInfo } = store;
            const rawValue = log.getDataValue('details');
            
            let detailsText = '';
            if (rawValue) {
                try {
                    const parsed = JSON.parse(rawValue);
                    detailsText = typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
                } catch (e) {
                    detailsText = String(rawValue);
                }
            }
            
            const prefix = `[IP: ${ip} | TB: ${deviceInfo}] `;
            if (!detailsText.startsWith('[IP:')) {
                log.setDataValue('details', prefix + detailsText);
            }
        }
    } catch (err) {
        console.error('Lỗi hook beforeCreate ActivityLog:', err);
    }
});

module.exports = ActivityLog;