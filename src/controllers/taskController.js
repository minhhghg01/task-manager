const TaskService = require('../services/taskService');
const { Task, User, Department, ActivityLog } = require('../models');
const { Op } = require('sequelize');

// --- HÀM HELPER GHI LOG ---
const logAction = async (userId, action, entityType, entityId, details) => {
    try {
        await ActivityLog.create({
            user_id: userId,
            action: action,
            entity_type: entityType,
            entity_id: entityId,
            details: details
        });
    } catch (e) {
        console.error("Lỗi ghi log:", e);
    }
};

// --- HÀM HELPER LẤY THỐNG KÊ CHO ADMIN ---
const getAdminStats = async () => {
    try {
        const totalDepts = await Department.count();
        const totalUsers = await User.count();
        const totalTasks = await Task.count();

        // Đã sửa status thành Tiếng Việt
        const completedTasks = await Task.count({ where: { status: 'Hoàn thành' } });
        const inProgressTasks = await Task.count({
            where: { status: { [Op.in]: ['Mới tạo', 'Đang thực hiện', 'Đang chờ', 'Hoàn thành', 'Quá hạn'] } }
        });
        const overdueTasks = await Task.count({
            where: {
                status: { [Op.ne]: 'Hoàn thành' },
                due_date: { [Op.lt]: new Date() }
            }
        });

        return { totalDepts, totalUsers, totalTasks, completedTasks, inProgressTasks, overdueTasks };
    } catch (error) {
        console.error("Lỗi thống kê:", error);
        return { totalDepts: 0, totalUsers: 0, totalTasks: 0, completedTasks: 0, inProgressTasks: 0, overdueTasks: 0 };
    }
};

// --- MAIN CONTROLLER ---
module.exports = (io) => {
    return {
        // 1. RENDER DASHBOARD
        renderDashboard: async (req, res) => {
            try {
                const user = req.session.user;
                if (!user) return res.redirect('/login');

                if (user.role === 'ADMIN') {
                    const stats = await getAdminStats();
                    return res.render('pages/admin/dashboard-admin', { stats });
                }

                const tasks = await TaskService.getTasksByUser(user);
                res.render('pages/dashboard', { user: user, tasks: tasks });

            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // 2. RENDER TASK LIST
        renderTaskList: async (req, res) => {
            try {
                const user = req.session.user;
                if (!user) return res.redirect('/login');
                const tasks = await TaskService.getTasksByUser(user);
                res.render('pages/dashboard', { user: user, tasks: tasks });
            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // --- RENDER FILTERED TASKS ---
        renderFilteredTasks: async (req, res) => {
            try {
                const user = req.session.user;
                const filterType = req.filterType;
                const tasks = await TaskService.getTasksByUser(user, filterType);

                let pageTitle = 'Danh sách công việc';
                if (filterType === 'general') pageTitle = user.role === 'ADMIN' ? 'Công việc toàn hệ thống' : 'Công việc chung của Khoa/Phòng';
                if (filterType === 'mine') pageTitle = 'Công việc của tôi (Được giao)';
                if (filterType === 'assigned_by_me') pageTitle = 'Công việc tôi đã giao';

                res.render('pages/dashboard', {
                    user: user,
                    tasks: tasks,
                    pageTitle: pageTitle
                });
            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // 3. API TẠO TASK (ĐÃ SỬA LOGIC TỰ GIAO VIỆC)
        apiCreateTask: async (req, res) => {
            try {
                // --- XỬ LÝ TỰ GIAO VIỆC ---
                // Nếu checkbox "Tôi tự làm" được tích -> Gán ID người nhận là chính mình
                if (req.body.is_self_assign === 'true') {
                    req.body.assigned_to = [req.session.user.id];
                }
                // --------------------------

                const newTask = await TaskService.createTask(req.session.user, req.body, req.file);

                // Gửi Socket (Giữ nguyên)
                try {
                    let assigneeIds = [];
                    if (typeof newTask.assigned_to === 'string') {
                        assigneeIds = JSON.parse(newTask.assigned_to);
                    } else if (Array.isArray(newTask.assigned_to)) {
                        assigneeIds = newTask.assigned_to;
                    }
                    if (Array.isArray(assigneeIds) && io) {
                        assigneeIds.forEach(userId => {
                            // io.to(userId.toString()).emit('new_task', newTask);
                        });
                    }
                } catch (socketErr) {
                    console.error("Lỗi socket:", socketErr);
                }

                res.redirect('/dashboard');

            } catch (err) {
                console.error("Lỗi tạo task:", err);
                res.send(`<script>alert('Lỗi: ${err.message}'); window.history.back();</script>`);
            }
        },

        // 4. THỐNG KÊ NHÂN VIÊN
        listEmployeesStats: async (req, res) => {
            try {
                const user = req.session.user;
                const UserService = require('../services/userService');
                const subordinates = await UserService.getSubordinates(user);
                const allTasks = await TaskService.getTasksByUser(user);
                const statsList = [];
                const now = new Date();

                for (const sub of subordinates) {
                    const subTasks = allTasks.filter(t => t.assigneeIds.some(id => String(id) === String(sub.id)));
                    statsList.push({
                        ...sub.toJSON(),
                        stats: {
                            total: subTasks.length,
                            completed: subTasks.filter(t => t.status === 'Hoàn thành').length,
                            inProgress: subTasks.filter(t => ['Mới tạo', 'Đang thực hiện', 'Đang chờ', 'Hoàn thành', 'Quá hạn'].includes(t.status)).length,
                            overdue: subTasks.filter(t => t.status !== 'Hoàn thành' && new Date(t.due_date) < now).length
                        }
                    });
                }
                res.render('pages/employees-stats', { users: statsList, currentUserRole: user.role });
            } catch (err) { res.status(500).send(err.message); }
        },

        // --- CÁC HÀM QUẢN LÝ NHÂN VIÊN ---
        setEmployeeRole: async (req, res) => {
            try {
                const currentUser = req.session.user;
                const { userId, action } = req.body;
                if (currentUser.role !== 'HEAD' && currentUser.role !== 'ADMIN') return res.status(403).json({ success: false, message: "Không có quyền." });

                const targetUser = await User.findByPk(userId);
                if (!targetUser) return res.status(404).json({ success: false, message: "Không tìm thấy user." });

                if (currentUser.role === 'HEAD') {
                    if (targetUser.departments_id !== currentUser.departments_id) return res.status(403).json({ success: false, message: "Khác phòng ban." });
                    if (targetUser.role === 'ADMIN' || targetUser.role === 'HEAD') return res.status(403).json({ success: false, message: "Không thể sửa quyền cấp trên." });
                }

                let newRole = action === 'promote' ? 'LEADER' : 'STAFF';
                await targetUser.update({ role: newRole });
                if (io) io.emit('role_changed', { userId: targetUser.id, newRole: newRole });
                res.json({ success: true });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

        viewEmployeeTasks: async (req, res) => {
            try {
                const targetUserId = req.params.id;
                const user = req.session.user;
                const UserService = require('../services/userService');
                const subordinates = await UserService.getSubordinates(user);
                const targetUser = subordinates.find(u => u.id == targetUserId);
                if (!targetUser) return res.status(403).send("Không có quyền xem.");

                const allTasks = await TaskService.getTasksByUser(user);
                const employeeTasks = allTasks.filter(t => {
                    const ids = t.assigneeIds || [];
                    return ids.includes(targetUser.id) || ids.includes(String(targetUser.id));
                });

                res.render('pages/employee-detail', { manager: user, employee: targetUser, tasks: employeeTasks });
            } catch (err) { res.status(500).send(err.message); }
        },

        // 5. VIEW CHI TIẾT (ĐÃ SỬA LOGIC QUYỀN CHẤM ĐIỂM)
        viewTaskDetail: async (req, res) => {
            try {
                const user = req.session.user;
                const taskId = req.params.id;
                const task = await TaskService.getTaskDetail(taskId);

                if (!task) return res.status(404).send('Không tìm thấy công việc');

                const isAssigner = String(task.assigned_by) === String(user.id);
                const assigneeList = task.assigneeList || [];
                const isAssignee = assigneeList.some(u => String(u.id) === String(user.id));

                // --- TÍNH TOÁN QUYỀN CHẤM ĐIỂM (canScore) ---
                let canScore = false;

                if (user.role === 'ADMIN') {
                    canScore = true;
                } else {
                    // Kiểm tra xem có phải "Tự giao việc" (Người giao == Người nhận)
                    // Lưu ý: task.assigned_to là chuỗi JSON hoặc mảng ID
                    let assigneeIds = [];
                    try { assigneeIds = JSON.parse(task.assigned_to); } catch (e) { assigneeIds = task.assigned_to || []; }

                    const isSelfAssigned = assigneeIds.includes(task.assigned_by) || assigneeIds.includes(String(task.assigned_by));

                    if (isSelfAssigned) {
                        // NẾU TỰ GIAO: Người làm (chính mình) KHÔNG ĐƯỢC chấm.
                        // Chỉ cấp trên (HEAD/DEPUTY) mới được chấm.
                        if (['HEAD', 'DEPUTY'].includes(user.role)) {
                            // Cấp trên chỉ được chấm nếu KHÔNG PHẢI là người làm task đó
                            // (Tránh trường hợp Trưởng phòng tự tạo task cho mình rồi tự chấm)
                            if (String(user.id) !== String(task.assigned_by)) {
                                canScore = true;
                            }
                        }
                    } else {
                        // NẾU GIAO CHO NGƯỜI KHÁC: Người giao được quyền chấm.
                        if (isAssigner) canScore = true;
                    }
                }
                // ---------------------------------------------

                res.render('pages/task-detail', {
                    task,
                    user,
                    isAssigner,
                    isAssignee,
                    isAdmin: user.role === 'ADMIN',
                    canScore: canScore // Truyền biến này xuống View
                });
            } catch (err) { res.status(500).send(err.message); }
        },

        // --- UPDATE PROGRESS ---
        updateTaskProgress: async (req, res) => {
            try {
                const { progress } = req.body;
                const task = await TaskService.updateProgress(req.params.id, progress, req.session.user.id);
                res.json({ success: true, progress: task.progress, status: task.status });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

        // --- CHẤM ĐIỂM ---
        gradeTask: async (req, res) => {
            try {
                const { score } = req.body;
                await TaskService.gradeTask(req.params.id, score);
                res.json({ success: true, score });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

        // --- BÌNH LUẬN ---
        postComment: async (req, res) => {
            try {
                const { content } = req.body;
                const newComment = await TaskService.addComment(req.session.user.id, req.params.id, content);
                res.json({
                    success: true,
                    comment: {
                        content: newComment.comment,
                        createdAt: newComment.createdAt,
                        user: req.session.user.fullname
                    }
                });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

        // --- API GET SUBORDINATES ---
        apiGetSubordinates: async (req, res) => {
            try {
                const user = req.session.user;
                const UserService = require('../services/userService');
                const subordinates = await UserService.getSubordinates(user);
                res.json({ users: subordinates });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        }
    };
};