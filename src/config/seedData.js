const bcrypt = require('bcryptjs');
const { User, Department } = require('../models');

const seedData = async () => {
    try {
        // 1. Kiểm tra xem đã có dữ liệu chưa
        const deptCount = await Department.count();
        if (deptCount > 0) {
            console.log('--- Dữ liệu đã tồn tại, bỏ qua bước Seed Data ---');
            return;
        }

        console.log('--- Đang khởi tạo dữ liệu mẫu... ---');

        // 2. Tạo Mật khẩu Hash chung (123456)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        // 3. Tạo 10 Khoa/Phòng
        // Lưu ý: ID 1 sẽ là Ban Giám Đốc, ID 2 là CNTT
        const departmentsData = [
            { name: 'Ban Giám Đốc', code: 'BOD' },      // ID: 1
            { name: 'Khoa Công Nghệ Thông Tin', code: 'IT' }, // ID: 2
            { name: 'Khoa Nội', code: 'NOI' },
            { name: 'Khoa Ngoại', code: 'NGOAI' },
            { name: 'Khoa Sản', code: 'SAN' },
            { name: 'Khoa Nhi', code: 'NHI' },
            { name: 'Khoa Cấp Cứu', code: 'CC' },
            { name: 'Khoa Hồi Sức Tích Cực', code: 'HSTC' },
            { name: 'Khoa Xét Nghiệm', code: 'XN' },
            { name: 'Khoa Chẩn Đoán Hình Ảnh', code: 'CDHA' }
        ];

        const createdDepts = await Department.bulkCreate(departmentsData);
        const bodDept = createdDepts.find(d => d.code === 'BOD'); // Lấy ID Ban Giám Đốc
        const itDept = createdDepts.find(d => d.code === 'IT');   // Lấy ID IT

        const users = [];

        // 4. Tạo 1 Admin (Thuộc khoa CNTT)
        users.push({
            fullname: 'System Administrator',
            username: 'admin',
            password: hashedPassword,
            role: 'ADMIN',
            departments_id: itDept.id,
            phone: '0900000000'
        });

        // 5. Tạo 1 Giám đốc (Trưởng phòng của BOD)
        users.push({
            fullname: 'Nguyễn Văn Giám Đốc',
            username: 'giamdoc',
            password: hashedPassword,
            role: 'DIRECTOR', // Role đặc biệt
            departments_id: bodDept.id,
            phone: '0911111111'
        });

        // 6. Tạo 4 Phó Giám đốc (Phó phòng của BOD)
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

        // 7. Tạo nhân sự cho các khoa (bao gồm cả CNTT và các khoa khác)
        // Chúng ta duyệt qua tất cả 10 phòng (trừ BOD ra vì đã tạo sếp ở trên)
        // Tuy nhiên đề bài yêu cầu 10 Trưởng, 10 Phó, 10 NV.
        // Tôi sẽ rải đều vào các khoa.

        const normalDepts = createdDepts.filter(d => d.code !== 'BOD'); // 9 khoa còn lại (bao gồm IT)

        // Để đủ số lượng 10 mỗi loại, ta sẽ lặp và gán
        // Vì có 9 khoa thường + 1 BOD. BOD đã có sếp.
        // Ta sẽ gán Trưởng khoa cho 9 khoa thường + 1 Trưởng phòng Hành chính (giả lập thêm hoặc gán vào IT)
        // Đơn giản hóa: Mỗi khoa trong 10 khoa (kể cả BOD) sẽ có cấu trúc nhân sự, nhưng BOD đã xử lý riêng.
        // Ta sẽ xử lý 9 khoa còn lại:

        normalDepts.forEach((dept, index) => {
            // Trưởng khoa
            users.push({
                fullname: `Lê Trưởng Khoa ${dept.code}`,
                username: `truongkhoa_${dept.code.toLowerCase()}`,
                password: hashedPassword,
                role: 'HEAD',
                departments_id: dept.id
            });

            // Phó khoa
            users.push({
                fullname: `Phạm Phó Khoa ${dept.code}`,
                username: `phokhoa_${dept.code.toLowerCase()}`,
                password: hashedPassword,
                role: 'DEPUTY',
                departments_id: dept.id
            });

            // Nhân viên
            users.push({
                fullname: `Vũ Nhân Viên ${dept.code}`,
                username: `nhanvien_${dept.code.toLowerCase()}`,
                password: hashedPassword,
                role: 'STAFF',
                departments_id: dept.id
            });
        });

        // Bổ sung thêm cho đủ số lượng nếu thiếu (Do 9 khoa chỉ tạo đc 9 người mỗi loại)
        // Tạo thêm 1 người mỗi loại vào khoa IT cho đủ 10
        users.push({ fullname: 'Trưởng Khoa Dự Phòng', username: 'truongkhoa_duphong', password: hashedPassword, role: 'HEAD', departments_id: itDept.id });
        users.push({ fullname: 'Phó Khoa Dự Phòng', username: 'phokhoa_duphong', password: hashedPassword, role: 'DEPUTY', departments_id: itDept.id });
        users.push({ fullname: 'Nhân Viên Dự Phòng', username: 'nhanvien_duphong', password: hashedPassword, role: 'STAFF', departments_id: itDept.id });

        // 8. Insert Users
        await User.bulkCreate(users);
        console.log(`>>> Đã tạo xong: ${users.length} tài khoản thành công!`);
        console.log('>>> Mật khẩu mặc định: 123456');

    } catch (error) {
        console.error('Lỗi Seed Data:', error);
    }
};

module.exports = seedData;