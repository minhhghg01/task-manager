const { User, Department } = require('../models');
const { Op } = require('sequelize');

class UserService {
    static async getSubordinates(currentUser) {
        try {
            const whereCondition = {
                departments_id: currentUser.departments_id, // Cùng phòng
                id: { [Op.ne]: currentUser.id }, // Trừ bản thân
                status: 'active'
            };

            // 1. GIÁM ĐỐC: Thấy Phó GĐ + Trưởng khoa các phòng khác
            if (currentUser.role === 'DIRECTOR') {
                return await User.findAll({
                    where: {
                        [Op.or]: [
                            { departments_id: currentUser.departments_id }, // Người trong BOD
                            { role: 'HEAD' } // Các trưởng khoa
                        ],
                        id: { [Op.ne]: currentUser.id },
                        status: 'active'
                    },
                    include: [Department]
                });
            }

            // 2. TRƯỞNG PHÒNG (HEAD): Thấy tất cả cấp dưới trong phòng
            if (currentUser.role === 'HEAD') {
                whereCondition.role = { [Op.in]: ['DEPUTY', 'LEADER', 'STAFF'] };
            }
            // 3. PHÓ PHÒNG (DEPUTY): Thấy Tổ trưởng và Nhân viên (Không thấy Trưởng phòng)
            else if (['DEPUTY', 'DEPUTY_DIRECTOR'].includes(currentUser.role)) {
                whereCondition.role = { [Op.in]: ['LEADER', 'STAFF'] };
            }
            // 4. TỔ TRƯỞNG (LEADER): Chỉ thấy Nhân viên (Không thấy Phó/Trưởng)
            else if (currentUser.role === 'LEADER') {
                whereCondition.role = 'STAFF';
            }
            // 5. NHÂN VIÊN (STAFF): Không thấy ai (Không được giao việc)
            else {
                return [];
            }

            return await User.findAll({
                where: whereCondition,
                include: [Department]
            });

        } catch (error) {
            console.error(error);
            return [];
        }
    }
}
module.exports = UserService;