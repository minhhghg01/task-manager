const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

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

    return router;
};