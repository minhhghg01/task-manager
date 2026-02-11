const { User, Department } = require('../models');
const { Op } = require('sequelize');

// Định nghĩa thứ tự ưu tiên (Số càng nhỏ chức càng to)
const ROLE_PRIORITY = {
    'ADMIN': 0,
    'DIRECTOR': 1,          // Giám đốc
    'DEPUTY_DIRECTOR': 2,   // Phó Giám đốc
    'HEAD': 3,              // Trưởng khoa/phòng
    'DEPUTY': 4,            // Phó khoa/phòng
    'LEADER': 5,            // Tổ trưởng
    'STAFF': 6              // Nhân viên
};

class UserService {
    static async getSubordinates(currentUser) {
        try {
            let whereCondition = {};

            // 1. ADMIN: Xem tất cả
            if (currentUser.role === 'ADMIN') {
                whereCondition = {};
            }
            // 2. GIÁM ĐỐC: Xem Ban GĐ + Trưởng khoa
            else if (currentUser.role === 'DIRECTOR') {
                whereCondition = {
                    [Op.or]: [
                        { departments_id: currentUser.departments_id },
                        { role: 'HEAD' }
                    ]
                };
            }
            // 3. PHÓ GIÁM ĐỐC: Xem Ban GĐ (cấp dưới) + Trưởng khoa
            else if (currentUser.role === 'DEPUTY_DIRECTOR') {
                whereCondition = {
                    [Op.or]: [
                        {
                            departments_id: currentUser.departments_id,
                            role: { [Op.notIn]: ['DIRECTOR', 'DEPUTY_DIRECTOR'] }
                        },
                        { role: 'HEAD' }
                    ]
                };
            }
            // 4. TRƯỞNG KHOA / PHÓ KHOA
            else if (['HEAD', 'DEPUTY'].includes(currentUser.role)) {
                whereCondition = { departments_id: currentUser.departments_id };
            }
            // 5. TỔ TRƯỞNG
            else if (currentUser.role === 'LEADER') {
                whereCondition = {
                    departments_id: currentUser.departments_id,
                    role: 'STAFF'
                };
            }
            // 6. NHÂN VIÊN
            else {
                return [];
            }

            // --- BỘ LỌC CHUNG ---
            if (whereCondition.id) {
                whereCondition.id = { [Op.and]: [whereCondition.id, { [Op.ne]: currentUser.id }] };
            } else {
                whereCondition.id = { [Op.ne]: currentUser.id };
            }
            whereCondition.status = 'active';

            // --- LẤY DỮ LIỆU ---
            const users = await User.findAll({
                where: whereCondition,
                include: [{ model: Department, as: 'Department', attributes: ['name'] }],
                attributes: ['id', 'fullname', 'role', 'departments_id']
            });

            // --- SẮP XẾP THỦ CÔNG (CUSTOM SORT) ---
            // Sắp xếp theo chức vụ trước, sau đó đến tên
            return users.sort((a, b) => {
                const weightA = ROLE_PRIORITY[a.role] || 99;
                const weightB = ROLE_PRIORITY[b.role] || 99;

                if (weightA !== weightB) {
                    return weightA - weightB; // Chức to lên đầu
                }
                return a.fullname.localeCompare(b.fullname); // Cùng chức thì xếp tên A-Z
            });

        } catch (error) {
            console.error("Lỗi UserService:", error);
            return [];
        }
    }
}

module.exports = UserService;