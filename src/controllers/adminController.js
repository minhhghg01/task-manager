const { User, Department, ActivityLog } = require('../models');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const fs = require('fs');

// --- HÀM HELPER GHI LOG ---
const logAction = async (userId, action, entityType, entityId, details) => {
    try {
        await ActivityLog.create({
            user_id: userId,
            action: action,          // VD: CREATE, UPDATE, DELETE
            entity_type: entityType, // VD: USER, DEPARTMENT
            entity_id: entityId,
            details: details         // VD: "Tạo user Nguyễn Văn A"
        });
    } catch (e) {
        console.error("Lỗi ghi log:", e);
    }
};

const AdminController = {
    // ============================================================
    // QUẢN LÝ USER (NHÂN SỰ)
    // ============================================================

    // 1. DANH SÁCH USER
    listUsers: async (req, res) => {
        try {
            const users = await User.findAll({
                include: [Department],
                order: [['id', 'DESC']]
            });
            const departments = await Department.findAll();
            res.render('pages/admin/users', { users, departments, pageTitle: 'Quản lý Nhân sự' });
        } catch (e) { res.status(500).send(e.message); }
    },

    // 2. TẠO USER MỚI (+ LOG)
    createUser: async (req, res) => {
        try {
            const { fullname, username, password, role, departments_id, gmail } = req.body;

            // Hash mật khẩu
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const newUser = await User.create({
                fullname, username, password: hashedPassword, role, departments_id, gmail, status: 'active'
            });

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'CREATE', 'USER', newUser.id, `Thêm nhân viên: ${fullname} (${username})`);
            }

            res.redirect('/admin/users');
        } catch (e) { res.status(500).send(e.message); }
    },

    // 3. TRANG SỬA USER (GET)
    detailUserPage: async (req, res) => {
        try {
            const user = await User.findByPk(req.params.id);
            const departments = await Department.findAll();

            if (!user) return res.status(404).send("User not found");

            res.render('pages/admin/user-detail', { targetUser: user, departments });
        } catch (e) { res.status(500).send(e.message); }
    },

    // 4. CẬP NHẬT USER (POST + LOG)
    updateUser: async (req, res) => {
        try {
            const { fullname, username, role, departments_id, status, password, gmail } = req.body;
            let updateData = { fullname, username, role, departments_id, status, gmail };

            // Chỉ hash password nếu nhập mới
            if (password && password.trim() !== "") {
                const salt = await bcrypt.genSalt(10);
                updateData.password = await bcrypt.hash(password, salt);
            }

            await User.update(updateData, { where: { id: req.params.id } });

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'UPDATE', 'USER', req.params.id, `Cập nhật nhân viên: ${fullname}`);
            }

            res.redirect('/admin/users');
        } catch (e) { res.status(500).send(e.message); }
    },

    // 5. XÓA USER (+ LOG)
    deleteUser: async (req, res) => {
        try {
            // Lấy thông tin user trước khi xóa để ghi log
            const userToDelete = await User.findByPk(req.params.id);
            const name = userToDelete ? userToDelete.fullname : 'Unknown';

            await User.destroy({ where: { id: req.params.id } });

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'DELETE', 'USER', req.params.id, `Xóa nhân viên: ${name}`);
            }

            res.redirect('/admin/users');
        } catch (e) { res.status(500).send(e.message); }
    },


    // ============================================================
    // QUẢN LÝ DEPARTMENT (KHOA PHÒNG)
    // ============================================================

    // 6. DANH SÁCH KHOA
    listDepartments: async (req, res) => {
        try {
            const departments = await Department.findAll();
            res.render('pages/admin/departments', { departments, pageTitle: 'Quản lý Khoa Phòng' });
        } catch (e) { res.status(500).send(e.message); }
    },

    // 7. TẠO KHOA MỚI (+ LOG)
    createDepartment: async (req, res) => {
        try {
            const newDept = await Department.create(req.body);

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'CREATE', 'DEPARTMENT', newDept.id, `Thêm khoa: ${newDept.name}`);
            }

            res.redirect('/admin/departments');
        } catch (e) { res.status(500).send(e.message); }
    },

    // 8. TRANG SỬA KHOA (GET)
    detailDepartmentPage: async (req, res) => {
        try {
            // Lưu ý: View dùng biến 'dept' nên ở đây phải truyền 'dept'
            const dept = await Department.findByPk(req.params.id);

            if (!dept) return res.status(404).send("Department not found");

            res.render('pages/admin/department-detail', { dept });
        } catch (e) { res.status(500).send(e.message); }
    },

    // 9. CẬP NHẬT KHOA (POST + LOG)
    updateDepartment: async (req, res) => {
        try {
            const { name, code, status } = req.body;
            await Department.update({ name, code, status }, { where: { id: req.params.id } });

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'UPDATE', 'DEPARTMENT', req.params.id, `Cập nhật khoa: ${name} (${code})`);
            }

            res.redirect('/admin/departments');
        } catch (e) { res.status(500).send(e.message); }
    },

    // 10. XÓA KHOA (+ LOG)
    deleteDepartment: async (req, res) => {
        try {
            const deptToDelete = await Department.findByPk(req.params.id);
            const name = deptToDelete ? deptToDelete.name : 'Unknown';

            await Department.destroy({ where: { id: req.params.id } });

            // GHI LOG
            if (req.session.user) {
                await logAction(req.session.user.id, 'DELETE', 'DEPARTMENT', req.params.id, `Xóa khoa: ${name}`);
            }

            res.redirect('/admin/departments');
        } catch (e) { res.status(500).send(e.message); }
    },


    // ============================================================
    // QUẢN LÝ ACTIVITY LOGS (LỊCH SỬ)
    // ============================================================

    // 11. XEM DANH SÁCH LOG
    listLogs: async (req, res) => {
        try {
            const logs = await ActivityLog.findAll({
                include: [{ model: User, attributes: ['fullname', 'username'] }], // Lấy tên người làm
                order: [['created_at', 'DESC']], // Mới nhất lên đầu
                limit: 100 // Chỉ lấy 100 dòng gần nhất cho nhẹ
            });

            res.render('pages/admin/logs', { logs, pageTitle: 'Lịch sử tác động' });
        } catch (e) {
            res.status(500).send(e.message);
        }
    },

    // 12. TẢI FILE BIỂU MẪU IMPORT (GET /admin/import/template)
    downloadTemplate: (req, res) => {
        try {
            const wb = XLSX.utils.book_new();

            // Sheet KhoaPhong
            const deptsData = [
                {
                    'Mã khoa phòng': 'IT',
                    'Tên khoa phòng': 'Khoa Công nghệ thông tin',
                    'Trạng thái (active/inactive)': 'active'
                },
                {
                    'Mã khoa phòng': 'XQ',
                    'Tên khoa phòng': 'Khoa X-Quang',
                    'Trạng thái (active/inactive)': 'active'
                }
            ];
            const wsDepts = XLSX.utils.json_to_sheet(deptsData);
            XLSX.utils.book_append_sheet(wb, wsDepts, 'KhoaPhong');

            // Sheet NhanVien
            const usersData = [
                {
                    'Tài khoản': 'nhanvien_it_new',
                    'Mật khẩu': '123456',
                    'Họ tên': 'Nguyễn Văn A',
                    'Chức vụ': 'STAFF',
                    'Mã khoa phòng': 'IT',
                    'Trạng thái (active/inactive)': 'active'
                },
                {
                    'Tài khoản': 'truongkhoa_xq_new',
                    'Mật khẩu': '123456',
                    'Họ tên': 'Trần Văn B',
                    'Chức vụ': 'HEAD',
                    'Mã khoa phòng': 'XQ',
                    'Trạng thái (active/inactive)': 'active'
                }
            ];
            const wsUsers = XLSX.utils.json_to_sheet(usersData);
            XLSX.utils.book_append_sheet(wb, wsUsers, 'NhanVien');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Disposition', 'attachment; filename="BieuMau_Import.xlsx"');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
        } catch (err) {
            console.error(err);
            res.status(500).send("Lỗi tải biểu mẫu: " + err.message);
        }
    },

    // 13. IMPORT DỮ LIỆU TỪ EXCEL (POST /admin/import/excel)
    importExcel: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).send("Không tìm thấy file tải lên.");
            }

            const workbook = XLSX.readFile(req.file.path);
            let importedDepts = 0;
            let importedUsers = 0;

            // 1. Xử lý sheet KhoaPhong
            if (workbook.SheetNames.includes('KhoaPhong')) {
                const sheetDepts = workbook.Sheets['KhoaPhong'];
                const deptsJson = XLSX.utils.sheet_to_json(sheetDepts);

                for (const row of deptsJson) {
                    const code = String(row['Mã khoa phòng'] || '').trim();
                    const name = String(row['Tên khoa phòng'] || '').trim();
                    let status = String(row['Trạng thái (active/inactive)'] || row['Trạng thái'] || 'active').trim().toLowerCase();
                    if (status !== 'inactive') status = 'active';

                    if (code && name) {
                        const [dept, created] = await Department.findOrCreate({
                            where: { code },
                            defaults: { name, status }
                        });

                        if (!created) {
                            await dept.update({ name, status });
                        }
                        importedDepts++;
                    }
                }
            }

            // 2. Xử lý sheet NhanVien
            if (workbook.SheetNames.includes('NhanVien')) {
                const sheetUsers = workbook.Sheets['NhanVien'];
                const usersJson = XLSX.utils.sheet_to_json(sheetUsers);

                const validRoles = ['ADMIN', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'HEAD', 'DEPUTY', 'LEADER', 'STAFF'];

                for (const row of usersJson) {
                    const username = String(row['Tài khoản'] || '').trim();
                    const password = String(row['Mật khẩu'] || '').trim();
                    const fullname = String(row['Họ tên'] || '').trim();
                    let role = String(row['Chức vụ'] || 'STAFF').trim().toUpperCase();
                    const deptCode = String(row['Mã khoa phòng'] || '').trim();
                    let status = String(row['Trạng thái (active/inactive)'] || row['Trạng thái'] || 'active').trim().toLowerCase();
                    if (status !== 'inactive') status = 'active';

                    if (!validRoles.includes(role)) {
                        role = 'STAFF';
                    }

                    if (username && fullname && deptCode) {
                        // Tìm hoặc tự động tạo Department theo deptCode
                        let dept = await Department.findOne({ where: { code: deptCode } });
                        if (!dept) {
                            dept = await Department.create({
                                name: `Khoa ${deptCode}`,
                                code: deptCode,
                                status: 'active'
                            });
                        }

                        const userExist = await User.findOne({ where: { username } });
                        if (userExist) {
                            const updateData = { fullname, role, departments_id: dept.id, status };
                            if (password) {
                                const salt = await bcrypt.genSalt(10);
                                updateData.password = await bcrypt.hash(password, salt);
                            }
                            await userExist.update(updateData);
                        } else {
                            const salt = await bcrypt.genSalt(10);
                            const hashedPassword = await bcrypt.hash(password || '123456', salt);
                            await User.create({
                                username,
                                password: hashedPassword,
                                fullname,
                                role,
                                departments_id: dept.id,
                                status
                            });
                        }
                        importedUsers++;
                    }
                }
            }

            // Ghi Log lịch sử
            if (req.session.user) {
                await logAction(
                    req.session.user.id,
                    'CREATE',
                    'USER',
                    null,
                    `Nhập dữ liệu Excel thành công: ${importedDepts} khoa phòng, ${importedUsers} nhân viên`
                );
            }

            // Xóa file tạm
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.redirect(`/admin/users?importSuccess=true&depts=${importedDepts}&users=${importedUsers}`);
        } catch (err) {
            console.error("Lỗi Import Excel:", err);
            // Đảm bảo xóa file tạm nếu lỗi
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).send("Lỗi xử lý file Excel: " + err.message);
        }
    }
};

module.exports = AdminController;