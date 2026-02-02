const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { User } = require('../models');

// --- Tạo thư mục upload nếu chưa tồn tại ---
const uploadDir = './src/public/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// --- CẤU HÌNH UPLOAD FILE (Multer) ---
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: function (req, file, cb) {
        // Xử lý tên file để không bị lỗi tiếng Việt
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const cleanName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, 'task-' + Date.now() + '-' + cleanName);
    }
});

// Bộ lọc file
const fileFilter = (req, file, cb) => {
    // Danh sách các loại file cho phép (MIME types)
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', // Ảnh
        'text/plain', // Notepad (.txt)
        'application/pdf', // PDF
        'application/msword', // Word .doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word .docx
        'application/vnd.ms-excel', // Excel .xls
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel .xlsx
        'application/vnd.ms-powerpoint', // Powerpoint .ppt
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' // Powerpoint .pptx
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Định dạng file không hỗ trợ!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // Giới hạn 10MB
});

// --- IMPORT CONTROLLERS ---
const AuthController = require('../controllers/authController');
const AdminController = require('../controllers/adminController');
const taskControllerFactory = require('../controllers/taskController');

// --- MIDDLEWARES ---
const requireAuth = async (req, res, next) => {
    // 1. Nếu chưa có session -> Đá về login
    if (!req.session.user) return res.redirect('/login');

    try {
        // 2. Lấy thông tin mới nhất từ DB (Chỉ lấy role để tối ưu tốc độ)
        const freshUser = await User.findByPk(req.session.user.id, {
            attributes: ['id', 'role', 'fullname', 'departments_id']
        });

        // 3. Nếu không tìm thấy User trong DB (ví dụ bị Admin xóa) -> Hủy session
        if (!freshUser) {
            req.session.destroy();
            return res.redirect('/login');
        }

        // 4. QUAN TRỌNG: Nếu Role trong DB khác Role trong Session -> Cập nhật Session ngay
        if (req.session.user.role !== freshUser.role) {
            req.session.user.role = freshUser.role;
            req.session.user.fullname = freshUser.fullname; // Update luôn tên nếu đổi
            // Lưu lại session
            req.session.save();
        }

        // 5. Gán user mới nhất vào req để các controller sau dùng
        req.user = freshUser;
        next();

    } catch (err) {
        console.error("Lỗi Auth Middleware:", err);
        res.status(500).send("Lỗi xác thực hệ thống");
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'ADMIN') return next();
    res.status(403).send('Cấm truy cập - Chỉ dành cho Admin');
};

module.exports = (io) => {
    const taskController = taskControllerFactory(io);

    // ============================================================
    // 1. AUTHENTICATION (Đăng nhập, Đăng xuất, Đổi mật khẩu)
    // ============================================================
    router.get('/login', AuthController.loginPage);
    router.post('/login', AuthController.loginProcess);
    router.get('/logout', AuthController.logout);
    router.post('/change-password', requireAuth, AuthController.changePassword);

    // ============================================================
    // 2. DASHBOARD & DANH SÁCH CÔNG VIỆC
    // ============================================================
    router.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));
    router.get('/dashboard', requireAuth, taskController.renderDashboard);

    // Danh sách: Công việc chung (Toàn bộ hoặc theo Phòng)
    router.get('/tasks/general', requireAuth, (req, res, next) => {
        req.filterType = 'general';
        next();
    }, taskController.renderFilteredTasks);

    // Danh sách: Việc của tôi (Được giao)
    router.get('/tasks/my-tasks', requireAuth, (req, res, next) => {
        req.filterType = 'mine';
        next();
    }, taskController.renderFilteredTasks);

    // Danh sách: Việc đã giao (Tôi là người tạo)
    router.get('/tasks/assigned', requireAuth, (req, res, next) => {
        req.filterType = 'assigned_by_me';
        next();
    }, taskController.renderFilteredTasks);

    // ============================================================
    // 3. CHI TIẾT CÔNG VIỆC & TƯƠNG TÁC (QUAN TRỌNG)
    // ============================================================
    // Xem chi tiết
    router.get('/tasks/:id', requireAuth, taskController.viewTaskDetail);

    // Các hành động trong trang chi tiết
    router.post('/tasks/:id/progress', requireAuth, taskController.updateTaskProgress); // Cập nhật tiến độ
    router.post('/tasks/:id/score', requireAuth, taskController.gradeTask);       // Chấm điểm
    router.post('/tasks/:id/comment', requireAuth, taskController.postComment);   // Bình luận

    // API Tạo công việc mới (Có upload file)
    router.post('/api/tasks', requireAuth, upload.single('attachment'), taskController.apiCreateTask);

    // ============================================================
    // 4. QUẢN LÝ NHÂN VIÊN (Dành cho Lãnh đạo)
    // ============================================================
    // Xem bảng thống kê nhân viên
    router.get('/employees/stats', requireAuth, taskController.listEmployeesStats);

    // Xem chi tiết công việc của 1 nhân viên cụ thể
    router.get('/employees/:id/tasks', requireAuth, taskController.viewEmployeeTasks);

    // API Bổ nhiệm / Bãi nhiệm Tổ trưởng
    router.post('/employees/set-role', requireAuth, taskController.setEmployeeRole);

    // API Lấy danh sách cấp dưới (Dùng cho Modal giao việc)
    router.get('/api/users/subordinates', requireAuth, taskController.apiGetSubordinates);

    // ============================================================
    // 5. ADMIN: QUẢN LÝ USER
    // ============================================================
    router.get('/admin/users', requireAuth, requireAdmin, AdminController.listUsers);
    router.post('/admin/users/create', requireAuth, requireAdmin, AdminController.createUser);
    router.get('/admin/users/detail/:id', requireAuth, requireAdmin, AdminController.detailUserPage);
    router.post('/admin/users/update/:id', requireAuth, requireAdmin, AdminController.updateUser);
    router.get('/admin/users/delete/:id', requireAuth, requireAdmin, AdminController.deleteUser);

    // ============================================================
    // 6. ADMIN: QUẢN LÝ KHOA/PHÒNG
    // ============================================================
    router.get('/admin/departments', requireAuth, requireAdmin, AdminController.listDepartments);
    router.post('/admin/departments/create', requireAuth, requireAdmin, AdminController.createDepartment);
    router.get('/admin/departments/detail/:id', requireAuth, requireAdmin, AdminController.detailDepartmentPage);
    router.post('/admin/departments/update/:id', requireAuth, requireAdmin, AdminController.updateDepartment);
    router.get('/admin/departments/delete/:id', requireAuth, requireAdmin, AdminController.deleteDepartment);

    // ============================================================
    // 7. ADMIN: LỊCH SỬ HỆ THỐNG
    // ============================================================
    router.get('/admin/logs', requireAuth, requireAdmin, AdminController.listLogs);

    return router;
};