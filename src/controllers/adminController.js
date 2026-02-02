const { User, Department, ActivityLog } = require('../models');
const bcrypt = require('bcryptjs');

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
            const { fullname, username, password, role, departments_id } = req.body;

            // Hash mật khẩu
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const newUser = await User.create({
                fullname, username, password: hashedPassword, role, departments_id, status: 'active'
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

            res.render('pages/admin/user-detail', { user, departments });
        } catch (e) { res.status(500).send(e.message); }
    },

    // 4. CẬP NHẬT USER (POST + LOG)
    updateUser: async (req, res) => {
        try {
            const { fullname, username, role, departments_id, status, password } = req.body;
            let updateData = { fullname, username, role, departments_id, status };

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
    }
};

module.exports = AdminController;