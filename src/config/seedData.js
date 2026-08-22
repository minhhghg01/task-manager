const bcrypt = require('bcryptjs');
const { User, Department, sequelize } = require('../models');

// Hàm chuyển Tiếng Việt có dấu thành không dấu và tạo tên tài khoản
const convertFullnameToUsername = (fullname, suffix = '') => {
    const unsigned = fullname.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLowerCase();
    
    const parts = unsigned.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0] + suffix;
    
    const last = parts[parts.length - 1];
    const initials = parts.slice(0, parts.length - 1).map(p => p[0]).join('');
    return initials + last + suffix;
};

const seedData = async () => {
    try {
        const isPostgres = sequelize.options.dialect === 'postgres';
        
        if (isPostgres) {
            try {
                await sequelize.query('ALTER TABLE users ALTER COLUMN departments_id DROP NOT NULL;');
            } catch (err) {}
        }
        
        // 1. Kiểm tra xem đã có dữ liệu mẫu cũ chưa
        const oldAdmin = await User.findOne({ where: { username: 'admin' } });
        
        // Nếu admin cũ thuộc phòng ban (ở bản cũ admin thuộc IT), tiến hành dọn sạch và gieo lại
        if (oldAdmin && oldAdmin.departments_id !== null) {
            console.log('--- Phát hiện dữ liệu mẫu cũ. Đang tự động dọn dẹp và nạp dữ liệu mẫu mới... ---');
            if (isPostgres) {
                await sequelize.query('TRUNCATE TABLE "activity_logs", "task_comments", "task_attachments", "tasks", "task_templates", "users", "departments" RESTART IDENTITY CASCADE;');
            } else {
                await sequelize.query('PRAGMA foreign_keys = OFF;');
                await sequelize.query('DELETE FROM activity_logs;');
                await sequelize.query('DELETE FROM task_comments;');
                await sequelize.query('DELETE FROM task_attachments;');
                await sequelize.query('DELETE FROM tasks;');
                await sequelize.query('DELETE FROM task_templates;');
                await sequelize.query('DELETE FROM users;');
                await sequelize.query('DELETE FROM departments;');
                await sequelize.query('PRAGMA foreign_keys = ON;');
            }
        }

        const deptCount = await Department.count();
        const userCount = await User.count();
        if (deptCount > 0 && userCount > 0) {
            console.log('--- Dữ liệu đã tồn tại, bỏ qua bước Seed Data ---');
            return;
        }

        console.log('--- Đang khởi tạo dữ liệu mẫu mới... ---');

        // 2. Tạo Mật khẩu Hash chung (123456)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        // 3. Tạo hoặc lấy Khoa/Phòng (Giữ đủ 10 khoa phòng cho cấu trúc hệ thống)
        const departmentsData = [
            { name: 'Ban Giám Đốc', code: 'BOD' },      // ID: 1
            { name: 'Phòng Công nghệ thông tin', code: 'IT' }, // ID: 2
            { name: 'Khoa Nội', code: 'NOI' },
            { name: 'Khoa Ngoại', code: 'NGOAI' },
            { name: 'Khoa Sản', code: 'SAN' },
            { name: 'Khoa Nhi', code: 'NHI' },
            { name: 'Khoa Cấp Cứu', code: 'CC' },
            { name: 'Khoa Hồi Sức Tích Cực', code: 'HSTC' },
            { name: 'Khoa Xét Nghiệm', code: 'XN' },
            { name: 'Khoa Chẩn Đoán Hình Ảnh', code: 'CDHA' }
        ];

        let createdDepts = [];
        if (deptCount === 0) {
            createdDepts = await Department.bulkCreate(departmentsData);
        } else {
            createdDepts = await Department.findAll();
        }

        if (userCount === 0) {
            const bodDept = createdDepts.find(d => d.code === 'BOD');
            const itDept = createdDepts.find(d => d.code === 'IT');

            const users = [];

            // 4. Tạo Admin (Không thuộc phòng ban nào)
            users.push({
                fullname: 'System Administrator',
                username: 'admin',
                password: hashedPassword,
                role: 'ADMIN',
                departments_id: null, // Không thuộc phòng nào
                phone: '0900000000'
            });

            // 5. Tạo các tài khoản Giám đốc (BOD)
            users.push({
                fullname: 'Nguyễn Văn Giám Đốc',
                username: 'giamdoc',
                password: hashedPassword,
                role: 'DIRECTOR',
                departments_id: bodDept.id,
                phone: '0911111111'
            });

            for (let i = 1; i <= 4; i++) {
                users.push({
                    fullname: `Trần Phó Giám ${i}`,
                    username: `phogiamdoc${i}`,
                    password: hashedPassword,
                    role: 'DEPUTY_DIRECTOR',
                    departments_id: bodDept.id,
                    phone: `092222222${i}`
                });
            }

            // 6. Tạo 11 tài khoản Phòng Công nghệ thông tin theo danh sách
            const itStaffList = [
                { name: 'Đinh Công Dũng', role: 'HEAD' },         // Trưởng phòng
                { name: 'Nguyễn Văn Tuấn', role: 'DEPUTY' },       // Phó trưởng phòng
                { name: 'Trần Xuân Đông', role: 'STAFF' },
                { name: 'Phạm Thanh Thúy', role: 'STAFF' },
                { name: 'Đặng Thị Phương Hồng', role: 'STAFF' },
                { name: 'Bùi Đăng Quân', role: 'STAFF' },
                { name: 'Bùi Hưng Nam', role: 'STAFF' },
                { name: 'Nguyễn Đức Minh', role: 'STAFF' },
                { name: 'Bùi Đức Anh', role: 'STAFF' },
                { name: 'Trịnh Đình Trọng', role: 'STAFF' },
                { name: 'Nguyễn Đức Hùng', role: 'STAFF' }
            ];

            itStaffList.forEach(staff => {
                users.push({
                    fullname: staff.name,
                    username: convertFullnameToUsername(staff.name, 'it'),
                    password: hashedPassword,
                    role: staff.role,
                    departments_id: itDept.id
                });
            });

            // 7. Insert Users
            await User.bulkCreate(users);
            console.log(`>>> Đã tạo xong: ${users.length} tài khoản thành công!`);
            console.log('>>> Mật khẩu mặc định: 123456');
        }

    } catch (error) {
        console.error('Lỗi Seed Data:', error);
    }
};

module.exports = seedData;