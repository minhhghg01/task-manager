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
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const cleanName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, 'task-' + Date.now() + '-' + cleanName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'text/plain',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
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
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- IMPORT CONTROLLERS ---
const AuthController = require('../controllers/authController');
const AdminController = require('../controllers/adminController');
const taskControllerFactory = require('../controllers/taskController');

// --- MIDDLEWARES ---
const requireAuth = async (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');

    try {
        const freshUser = await User.findByPk(req.session.user.id, {
            attributes: ['id', 'role', 'fullname', 'departments_id']
        });

        if (!freshUser) {
            req.session.destroy();
            return res.redirect('/login');
        }

        if (req.session.user.role !== freshUser.role) {
            req.session.user.role = freshUser.role;
            req.session.user.fullname = freshUser.fullname;
            req.session.save();
        }

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
    // 1. AUTHENTICATION
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

    // Danh sách: Công việc chung
    router.get('/tasks/general', requireAuth, (req, res, next) => {
        req.filterType = 'general';
        next();
    }, taskController.renderFilteredTasks);

    // Danh sách: Việc của tôi
    router.get('/tasks/my-tasks', requireAuth, (req, res, next) => {
        req.filterType = 'mine';
        next();
    }, taskController.renderFilteredTasks);

    // Danh sách: Việc đã giao
    router.get('/tasks/assigned', requireAuth, (req, res, next) => {
        req.filterType = 'assigned_by_me';
        next();
    }, taskController.renderFilteredTasks);

    // [QUAN TRỌNG] Route này PHẢI nằm TRƯỚC route /tasks/:id
    // Danh sách: Việc được mời (Collaborator Pending)
    router.get('/tasks/invited', requireAuth, (req, res, next) => {
        req.filterType = 'invited';
        next();
    }, taskController.renderFilteredTasks);

    // ============================================================
    // 3. CHI TIẾT CÔNG VIỆC & TƯƠNG TÁC
    // ============================================================
    // Xem chi tiết (Wildcard :id nhận tất cả các chuỗi sau /tasks/, nên phải để cuối cùng trong nhóm GET)
    router.get('/tasks/:id', requireAuth, taskController.viewTaskDetail);

    // Các hành động trong trang chi tiết
    router.post('/tasks/:id/progress', requireAuth, taskController.updateTaskProgress);
    router.post('/tasks/:id/score', requireAuth, taskController.gradeTask);
    router.post('/tasks/:id/comment', requireAuth, taskController.postComment);

    // API Tạo công việc mới
    router.post('/api/tasks', requireAuth, upload.single('attachment'), taskController.apiCreateTask);

    // --- ROUTES CHO NGƯỜI PHỐI HỢP & TODO LIST ---
    router.post('/tasks/:id/collaborators', taskController.apiAddCollaborator);
    router.post('/tasks/:id/collaborators/respond', taskController.apiRespondCollaborator);
    router.post('/tasks/:id/todos', taskController.apiUpdateTodo);

    // ============================================================
    // 4. QUẢN LÝ NHÂN VIÊN
    // ============================================================
    router.get('/employees/stats', requireAuth, taskController.listEmployeesStats);
    router.get('/employees/:id/tasks', requireAuth, taskController.viewEmployeeTasks);
    router.post('/employees/set-role', requireAuth, taskController.setEmployeeRole);
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