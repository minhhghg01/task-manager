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
        // ============================================================
        // 1. RENDER DASHBOARD (CẬP NHẬT)
        // ============================================================
        renderDashboard: async (req, res) => {
            try {
                const user = req.session.user;
                if (!user) return res.redirect('/login');

                const { Task, User, Department } = require('../models');
                // const TaskService = require('../services/taskService'); // Nếu cần

                let totalUsers = 0;
                let totalDepartments = 0;

                // --- 1. LẤY SỐ LIỆU TỔNG QUAN (ADMIN) ---
                if (user.role === 'ADMIN') {
                    totalUsers = await User.count();
                    totalDepartments = await Department.count();
                }

                // --- 2. LẤY TOÀN BỘ TASK CỦA USER ĐỂ TÍNH TOÁN BIỂU ĐỒ ---
                // (Không cần phân trang hay filter phức tạp vì Dashboard chỉ cần số liệu thống kê)
                const allTasksDB = await Task.findAll();

                // Lọc ra task liên quan đến User (Người nhận)
                const myTasks = allTasksDB.filter(t => {
                    let assigneeIds = [];
                    try { assigneeIds = JSON.parse(t.assigned_to || '[]'); } catch (e) { }
                    if (Array.isArray(assigneeIds)) {
                        return assigneeIds.some(id => String(id) === String(user.id));
                    }
                    return false;
                });

                // --- 3. TÍNH TOÁN CHART ---
                const now = new Date();
                const checkOverdue = (t) => {
                    if (t.status === 'Quá hạn') return true;
                    if (t.status !== 'Hoàn thành' && t.due_date) return new Date(t.due_date) < now;
                    return false;
                };

                const stats = {
                    totalUsers: totalUsers,
                    totalDepartments: totalDepartments,
                    totalTasks: myTasks.length,
                    completed: myTasks.filter(t => t.status === 'Hoàn thành').length,
                    overdue: myTasks.filter(t => checkOverdue(t)).length,
                    inProgress: myTasks.filter(t =>
                        ['Mới tạo', 'Đang thực hiện', 'Đang chờ'].includes(t.status) && !checkOverdue(t)
                    ).length
                };

                // --- 4. TÍNH ĐIỂM TRUNG BÌNH ---
                const scoredTasks = myTasks.filter(t =>
                    t.score !== null && t.score !== undefined && String(t.score).trim() !== '' && !isNaN(parseFloat(t.score))
                );

                let myAvgScore = '---';
                if (scoredTasks.length > 0) {
                    const totalScore = scoredTasks.reduce((sum, t) => sum + parseFloat(t.score), 0);
                    myAvgScore = (totalScore / scoredTasks.length).toFixed(1);
                }

                // --- 5. RENDER ---
                // Lưu ý: Không cần truyền biến 'tasks' (danh sách) nữa vì Dashboard không hiện bảng
                const viewName = user.role === 'ADMIN' ? 'pages/admin/dashboard-admin' : 'pages/dashboard';

                res.render(viewName, {
                    user: user,
                    stats: stats,
                    myAvgScore: myAvgScore,
                    pageTitle: 'Tổng quan công việc',

                    // [QUAN TRỌNG] Cờ đánh dấu đây là trang Dashboard chính
                    isDashboard: true,

                    // Vẫn cần truyền mảng rỗng hoặc null để tránh lỗi check if(tasks) bên view
                    tasks: [],
                    suggestedTags: []
                });

            } catch (err) {
                console.error("Lỗi Dashboard:", err);
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

        // 3. API TẠO TASK (ĐÃ SỬA ĐỂ TRẢ VỀ JSON)
        apiCreateTask: async (req, res) => {
            try {
                // Xử lý logic tự giao việc
                if (req.body.is_self_assign === 'true') {
                    req.body.assigned_to = [req.session.user.id];
                }

                // Gọi Service để tạo Task (Service sẽ ném lỗi nếu ngày tháng không hợp lệ)
                const newTask = await TaskService.createTask(req.session.user, req.body, req.file);

                // Xử lý Socket (Thông báo realtime)
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

                // [THAY ĐỔI]: Trả về JSON thành công -> Frontend sẽ nhận được và reload trang
                return res.json({
                    success: true,
                    message: "Tạo công việc thành công!"
                });

            } catch (err) {
                console.error("Lỗi tạo task:", err);

                // [THAY ĐỔI]: Trả về JSON lỗi (Status 400) -> Frontend sẽ nhận được và hiện Alert, KHÔNG reload trang
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
        },

        // ============================================================
        // 4. THỐNG KÊ NHÂN VIÊN (ĐÃ SỬA: SẮP XẾP THEO CHỨC VỤ)
        // ============================================================
        listEmployeesStats: async (req, res) => {
            try {
                const user = req.session.user;
                const { User, Task, Department } = require('../models');

                // 1. Định nghĩa Rank để sắp xếp (Số càng nhỏ chức càng to)
                const ROLE_HIERARCHY = {
                    'ADMIN': 1,
                    'DIRECTOR': 2,
                    'DEPUTY_DIRECTOR': 3,
                    'HEAD': 4,
                    'DEPUTY': 5,
                    'LEADER': 6,
                    'STAFF': 7
                };
                const myRank = ROLE_HIERARCHY[user.role] || 99;

                // 2. Lấy danh sách user trong phòng
                let whereCondition = {};
                if (!['ADMIN', 'DIRECTOR'].includes(user.role)) {
                    whereCondition = { departments_id: user.departments_id };
                }

                const allUsersInDept = await User.findAll({
                    where: whereCondition,
                    include: [{ model: Department, as: 'Department' }]
                });

                // 3. Lọc cấp dưới (Bỏ Admin, bỏ cấp trên/ngang cấp)
                const subordinates = allUsersInDept.filter(u => {
                    if (u.id === user.id) return false;
                    if (u.role === 'ADMIN') return false;
                    const userRank = ROLE_HIERARCHY[u.role] || 99;
                    return userRank > myRank;
                });

                // 4. Tính toán thống kê
                const rawTasks = await Task.findAll();
                const allTasks = rawTasks.map(t => {
                    const taskObj = t.toJSON();
                    try { taskObj.assigneeIds = JSON.parse(taskObj.assigned_to || '[]'); }
                    catch (e) { taskObj.assigneeIds = []; }
                    return taskObj;
                });

                const statsList = [];
                const now = new Date();
                const checkOverdue = (t) => {
                    if (t.status === 'Quá hạn') return true;
                    if (t.status !== 'Hoàn thành' && t.due_date) return new Date(t.due_date) < now;
                    return false;
                };

                for (const sub of subordinates) {
                    const subTasks = allTasks.filter(t =>
                        Array.isArray(t.assigneeIds) &&
                        t.assigneeIds.some(id => String(id) === String(sub.id))
                    );

                    const scoredTasks = subTasks.filter(t =>
                        t.score !== null && t.score !== undefined && String(t.score).trim() !== '' && !isNaN(parseFloat(t.score))
                    );
                    let avgScore = null;
                    if (scoredTasks.length > 0) {
                        const totalScore = scoredTasks.reduce((sum, t) => sum + parseFloat(t.score), 0);
                        avgScore = (totalScore / scoredTasks.length).toFixed(1);
                    }

                    statsList.push({
                        ...sub.toJSON(),
                        stats: {
                            total: subTasks.length,
                            completed: subTasks.filter(t => t.status === 'Hoàn thành').length,
                            overdue: subTasks.filter(t => checkOverdue(t)).length,
                            inProgress: subTasks.filter(t => ['Mới tạo', 'Đang thực hiện', 'Đang chờ'].includes(t.status) && !checkOverdue(t)).length,
                            avgScore: avgScore
                        }
                    });
                }

                // [QUAN TRỌNG] 5. SẮP XẾP DANH SÁCH THEO CHỨC VỤ (Rank nhỏ lên trước)
                statsList.sort((a, b) => {
                    const rankA = ROLE_HIERARCHY[a.role] || 99;
                    const rankB = ROLE_HIERARCHY[b.role] || 99;
                    return rankA - rankB; // Tăng dần (Chức to lên đầu)
                });

                res.render('pages/employees-stats', { users: statsList, currentUserRole: user.role });
            } catch (err) {
                console.error(err);
                res.status(500).send(err.message);
            }
        },

        // --- CÁC HÀM KHÁC GIỮ NGUYÊN ---
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

        viewTaskDetail: async (req, res) => {
            try {
                const user = req.session.user;
                const taskId = req.params.id;
                const task = await TaskService.getTaskDetail(taskId);

                if (!task) return res.status(404).send('Không tìm thấy công việc');

                const isAssigner = String(task.assigned_by) === String(user.id);
                const isAssignee = task.assigneeList.some(u => String(u.id) === String(user.id));
                const isAdmin = user.role === 'ADMIN';

                let canScore = false;
                if (isAdmin) {
                    canScore = true;
                } else {
                    let assigneeIds = [];
                    try { assigneeIds = JSON.parse(task.assigned_to); } catch (e) { assigneeIds = task.assigned_to || []; }
                    const isSelfAssigned = assigneeIds.includes(task.assigned_by) || assigneeIds.includes(String(task.assigned_by));

                    if (isSelfAssigned) {
                        if (['HEAD', 'DEPUTY'].includes(user.role) && String(user.id) !== String(task.assigned_by)) {
                            canScore = true;
                        }
                    } else {
                        if (isAssigner) canScore = true;
                    }
                }

                const priorityColors = { 'Cao (Gấp)': 'danger', 'Trung bình': 'warning text-dark', 'Thấp': 'info text-dark' };
                task.pColor = priorityColors[task.priority] || 'secondary';

                const statusColors = { 'Mới tạo': 'info text-dark', 'Hoàn thành': 'success', 'Quá hạn': 'danger', 'Đang chờ': 'warning text-dark', 'Đang thực hiện': 'primary' };
                task.sColor = statusColors[task.status] || 'secondary';

                if (!task.formattedStartDate) {
                    if (task.start_date) task.formattedStartDate = new Date(task.start_date).toLocaleString('vi-VN');
                    else if (task.createdAt) task.formattedStartDate = new Date(task.createdAt).toLocaleString('vi-VN');
                    else task.formattedStartDate = "Chưa cập nhật";
                }

                // Lọc người mời (Logic cũ của bạn)
                let availableUsers = [];
                if (isAdmin || user.role === 'DIRECTOR') {
                    availableUsers = await User.findAll({ attributes: ['id', 'fullname'] });
                } else if (user.role === 'DEPUTY_DIRECTOR') {
                    availableUsers = await User.findAll({
                        where: {
                            [Op.or]: [
                                { departments_id: user.departments_id },
                                { role: 'HEAD' }
                            ]
                        },
                        attributes: ['id', 'fullname']
                    });
                } else if (user.role === 'HEAD') {
                    availableUsers = await User.findAll({
                        where: {
                            [Op.or]: [
                                { departments_id: user.departments_id },
                                { role: 'HEAD' }
                            ]
                        },
                        attributes: ['id', 'fullname']
                    });
                } else {
                    availableUsers = await User.findAll({
                        where: { departments_id: user.departments_id },
                        attributes: ['id', 'fullname']
                    });
                }

                res.render('pages/task-detail', {
                    task, user, isAssigner, isAssignee, isAdmin, canScore, allUsers: availableUsers
                });
            } catch (err) {
                console.error(err);
                res.status(500).send(err.message);
            }
        },

        updateTaskProgress: async (req, res) => {
            try {
                const { progress } = req.body;
                const task = await TaskService.updateProgress(req.params.id, progress, req.session.user.id);
                res.json({ success: true, progress: task.progress, status: task.status });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

        gradeTask: async (req, res) => {
            try {
                const { score } = req.body;
                await TaskService.gradeTask(req.params.id, score);
                res.json({ success: true, score });
            } catch (err) { res.status(500).json({ success: false, message: err.message }); }
        },

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

        // --- API LẤY DANH SÁCH CẤP DƯỚI (ĐÃ FIX QUYỀN HẠN) ---
        apiGetSubordinates: async (req, res) => {
            try {
                const currentUser = req.session.user;
                const { User } = require('../models');
                const { Op } = require('sequelize');

                // 1. Định nghĩa thứ tự cấp bậc (Số càng nhỏ chức càng to)
                const ROLE_HIERARCHY = {
                    'ADMIN': 1,
                    'DIRECTOR': 2,          // Giám đốc
                    'DEPUTY_DIRECTOR': 3,   // Phó Giám đốc
                    'HEAD': 4,              // Trưởng phòng/Khoa
                    'DEPUTY': 5,            // Phó phòng/Khoa
                    'LEADER': 6,            // Tổ trưởng/Nhóm trưởng
                    'STAFF': 7              // Nhân viên
                };

                const myRank = ROLE_HIERARCHY[currentUser.role] || 99;

                // 2. Điều kiện lọc cơ bản: Cùng phòng ban (Trừ Admin/Giám đốc thấy hết)
                let whereCondition = {};

                if (['ADMIN', 'DIRECTOR'].includes(currentUser.role)) {
                    whereCondition = {}; // Thấy toàn bộ công ty
                } else {
                    whereCondition = { departments_id: currentUser.departments_id };
                }

                // 3. Lấy danh sách user tiềm năng
                const allUsers = await User.findAll({
                    where: whereCondition,
                    attributes: ['id', 'fullname', 'role', 'departments_id']
                });

                // 4. [QUAN TRỌNG] Lọc chỉ lấy người có chức vụ THẤP HƠN (Số Rank LỚN HƠN)
                // Ví dụ: HEAD (4) chỉ thấy DEPUTY (5), LEADER (6), STAFF (7)
                // Không thấy HEAD (4) ngang cấp, không thấy ADMIN (1)
                const subordinates = allUsers.filter(u => {
                    // Không lấy chính mình
                    if (u.id === currentUser.id) return false;

                    const userRank = ROLE_HIERARCHY[u.role] || 99;

                    // Chỉ lấy người có Rank số lớn hơn (nghĩa là chức vụ thấp hơn)
                    return userRank > myRank;
                });

                res.json({ users: subordinates });

            } catch (err) {
                console.error(err);
                res.status(500).json({ error: err.message });
            }
        },

        apiAddCollaborator: async (req, res) => {
            try {
                const { targetUserId } = req.body;
                await TaskService.addCollaborator(req.params.id, targetUserId, req.session.user.id);
                res.json({ success: true });
            } catch (e) { res.status(500).json({ success: false, message: e.message }); }
        },

        apiRespondCollaborator: async (req, res) => {
            try {
                const { action } = req.body;
                await TaskService.respondCollaborator(req.params.id, req.session.user.id, action);
                res.json({ success: true });
            } catch (e) { res.status(500).json({ success: false, message: e.message }); }
        },

        apiUpdateTodo: async (req, res) => {
            try {
                const { action, text, todoId } = req.body;
                const newTodos = await TaskService.updateTodoList(req.params.id, req.session.user.id, action, { text, todoId });
                res.json({ success: true, todos: newTodos });
            } catch (e) { res.status(500).json({ success: false, message: e.message }); }
        },
    };
};