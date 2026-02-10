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
        // 1. RENDER DASHBOARD (TRANG CHỦ)
        // Admin -> Xem Thống kê
        // User -> Xem Danh sách việc
        renderDashboard: async (req, res) => {
            try {
                const user = req.session.user;
                if (!user) return res.redirect('/login');

                // A. NẾU LÀ ADMIN -> Render Dashboard Thống Kê
                if (user.role === 'ADMIN') {
                    const stats = await getAdminStats();
                    return res.render('pages/admin/dashboard-admin', { stats });
                }

                // B. NẾU LÀ USER THƯỜNG -> Render Danh sách công việc
                const tasks = await TaskService.getTasksByUser(user);
                res.render('pages/dashboard', { user: user, tasks: tasks });

            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // 2. RENDER TASK LIST (DANH SÁCH CÔNG VIỆC) - MỚI
        // Hàm này chuyên dùng cho menu "Công việc của tôi"
        // Admin vào đây sẽ thấy TOÀN BỘ task (do logic bên Service đã quy định Admin được xem all)
        renderTaskList: async (req, res) => {
            try {
                const user = req.session.user;
                if (!user) return res.redirect('/login');

                // Gọi Service để lấy task (Service đã có logic: Admin lấy hết, User lấy theo phòng)
                const tasks = await TaskService.getTasksByUser(user);

                // Render view dashboard cũ (cái view có bảng Table)
                res.render('pages/dashboard', {
                    user: user,
                    tasks: tasks
                });

            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // --- HÀM MỚI: RENDER TASK THEO LOẠI ---
        renderFilteredTasks: async (req, res) => {
            try {
                const user = req.session.user;
                const filterType = req.filterType; // Lấy từ middleware router

                // Gọi Service với tham số filterType
                const tasks = await TaskService.getTasksByUser(user, filterType);

                // Đặt tiêu đề trang tương ứng
                let pageTitle = 'Danh sách công việc';
                if (filterType === 'general') pageTitle = user.role === 'ADMIN' ? 'Công việc toàn hệ thống' : 'Công việc chung của Khoa/Phòng';
                if (filterType === 'mine') pageTitle = 'Công việc của tôi (Được giao)';
                if (filterType === 'assigned_by_me') pageTitle = 'Công việc tôi đã giao';

                res.render('pages/dashboard', {
                    user: user,
                    tasks: tasks,
                    pageTitle: pageTitle // Bạn nhớ sửa file dashboard.ejs để hiện biến này nhé (optional)
                });

            } catch (err) {
                console.error(err);
                res.status(500).send("Lỗi Server: " + err.message);
            }
        },

        // 3. API TẠO TASK (AJAX + Socket)
        apiCreateTask: async (req, res) => {
            try {
                // 1. Tạo Task
                const newTask = await TaskService.createTask(req.session.user, req.body, req.file);

                // 2. Gửi Socket (Xử lý an toàn để tránh crash server)
                try {
                    let assigneeIds = [];
                    // newTask.assigned_to lúc này là chuỗi JSON "[1,2]" lấy từ DB ra
                    if (typeof newTask.assigned_to === 'string') {
                        assigneeIds = JSON.parse(newTask.assigned_to);
                    } else if (Array.isArray(newTask.assigned_to)) {
                        assigneeIds = newTask.assigned_to;
                    }

                    if (Array.isArray(assigneeIds) && io) {
                        assigneeIds.forEach(userId => {
                            // Gửi event socket nếu có logic
                            // io.to(userId.toString()).emit('new_task', newTask);
                        });
                    }
                } catch (socketErr) {
                    console.error("Lỗi gửi socket (không ảnh hưởng việc tạo task):", socketErr);
                }

                // 3. Redirect về Dashboard
                res.redirect('/dashboard');

            } catch (err) {
                console.error("Lỗi tạo task:", err);
                // Trả về trang lỗi hoặc alert
                res.send(`
                    <script>
                        alert('Lỗi: ${err.message}');
                        window.location.href = '/dashboard';
                    </script>
                `);
            }
        },

        // 4. THỐNG KÊ NHÂN VIÊN (MỚI)
        listEmployeesStats: async (req, res) => {
            try {
                const user = req.session.user;
                const UserService = require('../services/userService');

                const subordinates = await UserService.getSubordinates(user);
                const allTasks = await TaskService.getTasksByUser(user); // Lấy task phòng

                const statsList = [];
                const now = new Date();

                for (const sub of subordinates) {
                    // Logic tính toán giữ nguyên
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

                res.render('pages/employees-stats', {
                    users: statsList,
                    currentUserRole: user.role // <--- TRUYỀN THÊM BIẾN NÀY
                });
            } catch (err) { res.status(500).send(err.message); }
        },

        // THÊM HÀM MỚI: Xử lý bổ nhiệm Tổ trưởng
        setEmployeeRole: async (req, res) => {
            try {
                const currentUser = req.session.user;
                const { userId, action } = req.body; // action: 'promote' hoặc 'demote'

                // 1. CHECK QUYỀN: Chỉ Trưởng phòng (HEAD) hoặc Admin mới được dùng
                if (currentUser.role !== 'HEAD' && currentUser.role !== 'ADMIN') {
                    return res.status(403).json({ success: false, message: "Bạn không có quyền thực hiện hành động này." });
                }

                // 2. TÌM USER CẦN SỬA
                const targetUser = await User.findByPk(userId);
                if (!targetUser) {
                    return res.status(404).json({ success: false, message: "Nhân viên không tồn tại." });
                }

                // 3. LOGIC BẢO MẬT QUAN TRỌNG
                // Nếu người thực hiện là HEAD (không phải Admin)
                if (currentUser.role === 'HEAD') {
                    // a. Phải cùng phòng ban
                    if (targetUser.departments_id !== currentUser.departments_id) {
                        return res.status(403).json({ success: false, message: "Bạn chỉ được bổ nhiệm nhân viên trong phòng ban của mình." });
                    }

                    // b. Không được sửa quyền của Admin hoặc Head khác
                    if (targetUser.role === 'ADMIN' || targetUser.role === 'HEAD') {
                        return res.status(403).json({ success: false, message: "Bạn không thể thay đổi quyền của cấp trên hoặc ngang cấp." });
                    }
                }

                // 4. XÁC ĐỊNH ROLE MỚI
                let newRole = 'STAFF'; // Mặc định là nhân viên
                if (action === 'promote') {
                    newRole = 'LEADER'; // Lên làm Tổ trưởng
                }

                // 5. UPDATE DATABASE
                await targetUser.update({ role: newRole });

                // 6. GỬI SOCKET REALTIME (Để bên kia tự F5 nhận quyền mới)
                if (io) {
                    io.emit('role_changed', {
                        userId: targetUser.id,
                        newRole: newRole,
                        message: `Chúc mừng! Bạn đã được ${action === 'promote' ? 'bổ nhiệm làm Tổ trưởng' : 'chuyển sang vai trò Nhân viên'}. Hệ thống sẽ cập nhật lại.`
                    });
                }

                res.json({ success: true });

            } catch (err) {
                console.error("Lỗi bổ nhiệm:", err);
                res.status(500).json({ success: false, message: err.message });
            }
        },

        // 5. CHI TIẾT CÔNG VIỆC CỦA 1 NHÂN VIÊN (MỚI)
        viewEmployeeTasks: async (req, res) => {
            try {
                const targetUserId = req.params.id;
                const user = req.session.user;
                const UserService = require('../services/userService');

                // Check xem có quyền xem nhân viên này không
                const subordinates = await UserService.getSubordinates(user);
                const targetUser = subordinates.find(u => u.id == targetUserId);

                if (!targetUser) return res.status(403).send("Bạn không có quyền xem nhân viên này");

                // Lấy task của nhân viên đó
                const allTasks = await TaskService.getTasksByUser(user);
                const employeeTasks = allTasks.filter(t => {
                    const ids = t.assigneeIds || [];
                    return ids.includes(targetUser.id) || ids.includes(String(targetUser.id));
                });

                res.render('pages/employee-detail', {
                    manager: user,
                    employee: targetUser,
                    tasks: employeeTasks
                });

            } catch (err) {
                res.status(500).send(err.message);
            }
        },

        // --- LOGIC CẬP NHẬT TASK ---
        // --- VIEW CHI TIẾT ---
        viewTaskDetail: async (req, res) => {
            try {
                const user = req.session.user;
                const taskId = req.params.id;
                const task = await TaskService.getTaskDetail(taskId);

                if (!task) return res.status(404).send('Không tìm thấy công việc');

                const isAssigner = task.assigned_by === user.id;
                const isAssignee = task.assigneeList.some(u => u.id === user.id);
                const isAdmin = user.role === 'ADMIN';

                res.render('pages/task-detail', { task, user, isAssigner, isAssignee, isAdmin });
            } catch (err) { res.status(500).send(err.message); }
        },

        // --- UPDATE PROGRESS ---
        updateTaskProgress: async (req, res) => {
            try {
                const { progress } = req.body;
                const task = await TaskService.updateProgress(req.params.id, progress, req.session.user.id);
                res.json({
                    success: true,
                    progress: task.progress,
                    status: task.status
                });
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
                // Form gửi lên name="content", Service sẽ map vào 'comment'
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
        // --- API: LẤY DANH SÁCH CẤP DƯỚI (Cho Modal Giao việc) ---
        apiGetSubordinates: async (req, res) => {
            try {
                const user = req.session.user;
                const UserService = require('../services/userService');

                // Tái sử dụng logic lấy cấp dưới của UserService
                const subordinates = await UserService.getSubordinates(user);

                // Trả về JSON để Javascript phía Client (Modal) hiển thị
                res.json({ users: subordinates });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        }
    };
};
