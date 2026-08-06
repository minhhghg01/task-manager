const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { TaskTemplate } = require('../models');

// Import Controller Factory
const taskControllerFactory = require('../controllers/taskController');
const UserService = require('../services/userService');

// Cấu hình Upload (Cần khai báo lại ở đây hoặc tách ra file config riêng)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

module.exports = (io) => {
    // BƯỚC QUAN TRỌNG: Khởi tạo taskController bằng cách truyền io vào
    const taskController = taskControllerFactory(io);

    // --- ĐỊNH NGHĨA ROUTE ---

    // API Tạo task (kèm upload file)
    // upload.single('attachment') là middleware xử lý file
    // taskController.apiCreateTask là hàm xử lý logic
    router.post('/tasks', upload.single('attachment'), taskController.apiCreateTask);

    // API lấy danh sách user cấp dưới (để hiển thị trong dropdown chọn người nhận việc)
    router.get('/users/subordinates', async (req, res) => {
        try {
            if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });

            const users = await UserService.getSubordinates(req.session.user);
            res.json({ users });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: error.message });
        }
    });

    // --- API QUẢN LÝ MẪU CÔNG VIỆC CHUNG ---
    
    // Lấy danh sách mẫu
    router.get('/templates', async (req, res) => {
        try {
            if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
            
            const { Op } = require('sequelize');
            const { User } = require('../models');
            const currentUser = req.session.user;

            const templates = await TaskTemplate.findAll({
                include: [{
                    model: User,
                    as: 'Creator',
                    attributes: ['id', 'fullname', 'departments_id']
                }],
                where: {
                    [Op.or]: [
                        { created_by: currentUser.id },
                        { share_level: 'GLOBAL' },
                        {
                            [Op.and]: [
                                { share_level: 'DEPARTMENT' },
                                { '$Creator.departments_id$': currentUser.departments_id || 0 }
                            ]
                        }
                    ]
                },
                order: [['created_at', 'DESC']]
            });
            res.json({ success: true, templates });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Tạo mẫu mới
    router.post('/templates', async (req, res) => {
        try {
            if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
            
            const { name, title, description, priority, tags, share_level } = req.body;
            if (!name) return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên mẫu!' });

            const allowedLevels = ['PRIVATE', 'DEPARTMENT', 'GLOBAL'];
            const level = (share_level && allowedLevels.includes(share_level.toUpperCase()))
                ? share_level.toUpperCase()
                : 'PRIVATE';

            const template = await TaskTemplate.create({
                name: name,
                title: title || '',
                description: description || '',
                priority: priority || 'Trung bình',
                tags: tags || '',
                share_level: level,
                created_by: req.session.user.id
            });

            res.json({ success: true, message: 'Lưu mẫu công việc thành công!', template });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Xóa mẫu
    router.delete('/templates/:id', async (req, res) => {
        try {
            if (!req.session.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
            
            const template = await TaskTemplate.findByPk(req.params.id);
            if (!template) return res.status(404).json({ success: false, message: 'Không tìm thấy mẫu!' });

            // Chỉ ADMIN hoặc Người tạo mới được xóa mẫu
            if (req.session.user.role !== 'ADMIN' && template.created_by !== req.session.user.id) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa mẫu này!' });
            }

            await template.destroy();
            res.json({ success: true, message: 'Đã xóa mẫu công việc thành công!' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
};