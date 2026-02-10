const { Task, User, Department, TaskComment, ActivityLog } = require('../models');
const { Op } = require('sequelize');

class TaskService {
    // --- LẤY DANH SÁCH TASK ---
    static async getTasksByUser(user, filterType = 'general') {
        let tasks = [];
        const allUsers = await User.findAll({ attributes: ['id', 'fullname'] });
        const userMap = {};
        allUsers.forEach(u => userMap[u.id] = u.fullname);

        let whereCondition = {};
        if (user.role === 'ADMIN') {
            if (filterType === 'general') whereCondition = {};
            else return [];
        } else {
            if (filterType === 'general') whereCondition = { department_id: user.departments_id };
            else if (filterType === 'mine') whereCondition = { assigned_to: { [Op.like]: `%%` } };
            else if (filterType === 'assigned_by_me') whereCondition = { assigned_by: user.id };
        }

        tasks = await Task.findAll({
            where: whereCondition,
            include: [{ model: User, as: 'Creator', attributes: ['fullname'] }],
            order: [['created_at', 'DESC']]
        });

        const processedTasks = tasks.map(t => {
            const task = t.toJSON();
            let assigneeIds = [];
            try {
                const parsed = JSON.parse(task.assigned_to || '[]');
                if (Array.isArray(parsed)) assigneeIds = parsed;
            } catch (e) { assigneeIds = []; }

            task.assigneeNames = assigneeIds.map(id => userMap[id] || 'Unknown').join(', ');
            task.formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : 'Không thời hạn';
            return { ...task, assigneeIds };
        });

        if (user.role === 'ADMIN' || filterType === 'assigned_by_me' || filterType === 'general') {
            return processedTasks;
        }
        if (filterType === 'mine') {
            return processedTasks.filter(t => t.assigneeIds.some(id => String(id) === String(user.id)));
        }
        return processedTasks;
    }

    // --- TẠO TASK MỚI ---
    static async createTask(currentUser, taskData, file) {
        let assigneeIds = [];
        const raw = taskData.assigned_to;
        if (Array.isArray(raw)) assigneeIds = raw;
        else if (typeof raw === 'string') {
            if (raw.trim().startsWith('[')) { try { assigneeIds = JSON.parse(raw); } catch (e) { assigneeIds = []; } }
            else { assigneeIds = [raw]; }
        } else if (typeof raw === 'number') assigneeIds = [raw];

        assigneeIds = assigneeIds.filter(id => id && id !== 'null' && id !== 'undefined');

        if (assigneeIds.length === 0) {
            throw new Error('Vui lòng chọn ít nhất một người nhận việc!');
        }

        const roleWeight = { 'ADMIN': 99, 'DIRECTOR': 10, 'DEPUTY_DIRECTOR': 9, 'HEAD': 5, 'DEPUTY': 4, 'LEADER': 3, 'STAFF': 1 };
        const myWeight = roleWeight[currentUser.role] || 0;

        if (assigneeIds.length > 0) {
            const targetUsers = await User.findAll({ where: { id: { [Op.in]: assigneeIds } } });
            for (const target of targetUsers) {
                const targetWeight = roleWeight[target.role] || 0;
                if (myWeight <= targetWeight && currentUser.role !== 'ADMIN') {
                    throw new Error(`Không thể giao việc cho cấp trên/ngang cấp (${target.fullname})`);
                }
            }
        }

        // --- XỬ LÝ NGÀY BẮT ĐẦU ---
        let startDate = new Date(); // Mặc định lấy giờ server
        if (taskData.start_date) {
            startDate = new Date(taskData.start_date); // Nếu form gửi lên thì lấy theo form
        }

        const assignedToString = JSON.stringify(assigneeIds);
        const newTask = await Task.create({
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority,
            department_id: currentUser.departments_id,
            assigned_by: currentUser.id,
            assigned_to: assignedToString,
            start_date: startDate,
            due_date: taskData.due_date || null,
            status: 'Mới tạo',
            attachment_path: file ? `/uploads/${file.filename}` : null
        });

        await ActivityLog.create({
            user_id: currentUser.id,
            action: 'CREATE',
            entity_type: 'TASK',
            entity_id: newTask.id,
            details: `Giao việc mới: ${taskData.title}`
        });

        return await Task.findByPk(newTask.id, {
            include: [{ model: User, as: 'Creator', attributes: ['fullname'] }]
        });
    }

    // --- LẤY CHI TIẾT TASK ---
    static async getTaskDetail(id) {
        const task = await Task.findByPk(id, {
            include: [
                { model: User, as: 'Creator', attributes: ['fullname'] },
                {
                    model: TaskComment,
                    as: 'TaskComments',
                    separate: true,
                    include: [{ model: User, attributes: ['fullname', 'username'] }],
                    order: [['created_at', 'DESC']]
                }
            ]
        });
        if (!task) return null;

        const now = new Date();
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        if (task.status !== 'Completed' && dueDate && now > dueDate) {
            if (task.status !== 'Overdue') {
                await task.update({ status: 'Overdue' });
                task.status = 'Overdue';
            }
        }

        const dbHistory = await ActivityLog.findAll({
            where: {
                entity_type: 'TASK',
                entity_id: id,
                action: { [Op.in]: ['UPDATE_PROGRESS', 'CREATE'] }
            },
            include: [{ model: User, attributes: ['fullname'] }],
            order: [['created_at', 'DESC']]
        });

        const assigneeIds = JSON.parse(task.assigned_to || '[]');
        const assignees = await User.findAll({
            where: { id: { [Op.in]: assigneeIds } },
            attributes: ['id', 'fullname']
        });

        const taskData = task.toJSON();
        taskData.assigneeNames = assignees.map(u => u.fullname).join(', ');
        taskData.assigneeList = assignees;
        taskData.formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : 'Không thời hạn';

        let finalHistory = dbHistory.map(h => h.toJSON());
        const hasCreateLog = finalHistory.some(h => h.action === 'CREATE');

        if (!hasCreateLog) {
            finalHistory.push({
                action: 'CREATE',
                createdAt: task.createdAt,
                details: `Giao việc mới: ${task.title}`,
                User: { fullname: task.Creator ? task.Creator.fullname : 'Người tạo' }
            });
        }
        finalHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        taskData.history = finalHistory;
        return taskData;
    }

    // --- CẬP NHẬT TIẾN ĐỘ ---
    static async updateProgress(taskId, progress, userId) {
        const task = await Task.findByPk(taskId);
        if (!task) throw new Error('Task không tồn tại');

        let newStatus = task.status;
        const now = new Date();
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const prog = parseInt(progress);

        if (prog === 100) {
            newStatus = 'Hoàn thành';
            task.completed_date = now;
        } else {
            if (dueDate && now > dueDate) newStatus = 'Quá hạn';
            else newStatus = 'Đang thực hiện';
        }

        await task.update({ progress: prog, status: newStatus });

        await ActivityLog.create({
            user_id: userId,
            action: 'UPDATE_PROGRESS',
            entity_type: 'TASK',
            entity_id: taskId,
            details: `Cập nhật tiến độ: ${prog}% (Trạng thái: ${newStatus})`
        });

        return task;
    }

    // --- CHẤM ĐIỂM ---
    static async gradeTask(taskId, score) {
        return await Task.update({ score: score }, { where: { id: taskId } });
    }

    // --- BÌNH LUẬN ---
    static async addComment(userId, taskId, textContent) {
        return await TaskComment.create({
            user_id: userId,
            task_id: taskId,
            comment: textContent
        });
    }
}

module.exports = TaskService;