const { Task, User, Department, TaskComment, ActivityLog } = require('../models');
const { Op } = require('sequelize');

// BẢNG TRỌNG SỐ CHỨC VỤ (Dùng để so sánh quyền hạn)
const ROLE_WEIGHTS = {
    'ADMIN': 99,
    'DIRECTOR': 10, 'DEPUTY_DIRECTOR': 9, // Ban Giám đốc
    'HEAD': 5, 'DEPUTY': 4,               // Trưởng/Phó phòng
    'LEADER': 3, 'STAFF': 1               // Tổ trưởng/Nhân viên
};

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

        const myWeight = ROLE_WEIGHTS[currentUser.role] || 0;

        if (assigneeIds.length > 0) {
            const targetUsers = await User.findAll({ where: { id: { [Op.in]: assigneeIds } } });
            for (const target of targetUsers) {
                // Nếu giao cho chính mình -> Bỏ qua kiểm tra
                if (String(target.id) === String(currentUser.id)) continue;

                const targetWeight = ROLE_WEIGHTS[target.role] || 0;
                if (myWeight <= targetWeight && currentUser.role !== 'ADMIN') {
                    throw new Error(`Không thể giao việc cho cấp trên/ngang cấp (${target.fullname})`);
                }
            }
        }

        let startDate = new Date();
        if (taskData.start_date) startDate = new Date(taskData.start_date);

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
            attachment_path: file ? `/uploads/${file.filename}` : null,
            collaborators: '[]', // Khởi tạo mảng rỗng
            todo_list: '[]'      // Khởi tạo mảng rỗng
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

    // --- LẤY CHI TIẾT TASK (ĐÃ CẬP NHẬT PARSE JSON) ---
    static async getTaskDetail(id) {
        const task = await Task.findByPk(id, {
            include: [
                { model: User, as: 'Creator', attributes: ['fullname'] },
                {
                    model: TaskComment, as: 'TaskComments', separate: true,
                    include: [{ model: User, attributes: ['fullname', 'username'] }],
                    order: [['created_at', 'DESC']]
                }
            ]
        });
        if (!task) return null;

        // Check quá hạn
        const now = new Date();
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        if (task.status !== 'Hoàn thành' && dueDate && now > dueDate && task.status !== 'Quá hạn') {
            await task.update({ status: 'Quá hạn' });
            task.status = 'Quá hạn';
        }

        const dbHistory = await ActivityLog.findAll({
            where: { entity_type: 'TASK', entity_id: id },
            include: [{ model: User, attributes: ['fullname'] }],
            order: [['created_at', 'DESC']]
        });

        const taskData = task.toJSON();

        // 1. XỬ LÝ NGƯỜI NHẬN CHÍNH
        let assigneeIds = [];
        try { assigneeIds = JSON.parse(taskData.assigned_to || '[]'); } catch (e) { }
        const assignees = await User.findAll({ where: { id: { [Op.in]: assigneeIds } }, attributes: ['id', 'fullname'] });
        taskData.assigneeNames = assignees.map(u => u.fullname).join(', ');
        taskData.assigneeList = assignees;

        // 2. XỬ LÝ NGƯỜI PHỐI HỢP (COLLABORATORS)
        let collabsRaw = [];
        try { collabsRaw = JSON.parse(taskData.collaborators || '[]'); } catch (e) { }

        // Lấy thông tin chi tiết user từ DB
        const collabIds = collabsRaw.map(c => c.uid);
        const usersInfo = await User.findAll({
            where: { id: { [Op.in]: collabIds } },
            attributes: ['id', 'fullname', 'role']
        });

        taskData.collaboratorList = collabsRaw.map(c => {
            const uInfo = usersInfo.find(u => String(u.id) === String(c.uid));
            return {
                id: c.uid,
                fullname: uInfo ? uInfo.fullname : 'Unknown',
                role: uInfo ? uInfo.role : '',
                status: c.status // PENDING, ACCEPTED
            };
        });

        // 3. XỬ LÝ TODO LIST
        try { taskData.parsedTodoList = JSON.parse(taskData.todo_list || '[]'); } catch (e) { taskData.parsedTodoList = []; }

        // Format ngày tháng
        if (task.start_date) taskData.formattedStartDate = new Date(task.start_date).toLocaleString('vi-VN');
        else taskData.formattedStartDate = new Date(task.createdAt).toLocaleString('vi-VN');
        taskData.formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : 'Không thời hạn';

        // Gộp History
        let finalHistory = dbHistory.map(h => h.toJSON());
        const hasCreateLog = finalHistory.some(h => h.action === 'CREATE');
        if (!hasCreateLog) {
            finalHistory.push({
                action: 'CREATE', createdAt: task.createdAt, details: `Giao việc mới: ${task.title}`,
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
            user_id: userId, action: 'UPDATE_PROGRESS', entity_type: 'TASK', entity_id: taskId,
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
            user_id: userId, task_id: taskId, comment: textContent
        });
    }

    // ============================================================
    // CÁC HÀM MỚI CHO COLLABORATOR VÀ TODO LIST
    // ============================================================

    // 1. THÊM NGƯỜI PHỐI HỢP
    static async addCollaborator(taskId, targetUserId, currentUserId) {
        const task = await Task.findByPk(taskId);
        let collabs = JSON.parse(task.collaborators || '[]');

        // Kiểm tra trùng
        if (collabs.some(c => String(c.uid) === String(targetUserId))) {
            throw new Error("Nhân viên này đã có trong danh sách phối hợp.");
        }

        const currentUser = await User.findByPk(currentUserId);
        const targetUser = await User.findByPk(targetUserId);

        // --- LOGIC QUYỀN LỰC ---
        const myWeight = ROLE_WEIGHTS[currentUser.role] || 0;
        const targetWeight = ROLE_WEIGHTS[targetUser.role] || 0;

        let newStatus = 'PENDING'; // Mặc định là Mời
        let logAction = 'Mời phối hợp';

        // Nếu là Admin HOẶC Cấp trên -> Ép vào luôn (ACCEPTED)
        if (currentUser.role === 'ADMIN' || myWeight > targetWeight) {
            newStatus = 'ACCEPTED';
            logAction = 'Chỉ định phối hợp';
        }

        collabs.push({ uid: targetUserId, status: newStatus });
        await task.update({ collaborators: JSON.stringify(collabs) });

        await ActivityLog.create({
            user_id: currentUserId, action: 'ADD_COLLAB', entity_type: 'TASK', entity_id: taskId,
            details: `${logAction}: ${targetUser.fullname} (${newStatus === 'ACCEPTED' ? 'Đã thêm' : 'Chờ duyệt'})`
        });
    }

    // 2. PHẢN HỒI LỜI MỜI
    static async respondCollaborator(taskId, currentUserId, action) {
        // action: 'ACCEPT', 'DECLINE', 'REMOVE'
        const task = await Task.findByPk(taskId);
        let collabs = JSON.parse(task.collaborators || '[]');

        const index = collabs.findIndex(c => String(c.uid) === String(currentUserId));
        if (index === -1) throw new Error("Bạn không có trong danh sách phối hợp.");

        let logDetail = '';
        if (action === 'ACCEPT') {
            collabs[index].status = 'ACCEPTED';
            logDetail = 'Đã chấp nhận lời mời phối hợp';
        } else if (action === 'DECLINE') {
            collabs.splice(index, 1); // Xóa khỏi mảng
            logDetail = 'Đã từ chối lời mời phối hợp';
        } else if (action === 'REMOVE') {
            collabs.splice(index, 1); // Xóa khỏi mảng
            logDetail = 'Đã rời khỏi nhóm phối hợp';
        }

        await task.update({ collaborators: JSON.stringify(collabs) });

        await ActivityLog.create({
            user_id: currentUserId, action: 'RESPOND_COLLAB', entity_type: 'TASK', entity_id: taskId,
            details: logDetail
        });
    }

    // 3. CẬP NHẬT TODO LIST
    static async updateTodoList(taskId, userId, action, payload) {
        const task = await Task.findByPk(taskId);
        let todos = JSON.parse(task.todo_list || '[]');
        let logDetail = '';

        if (action === 'ADD') {
            todos.push({
                id: Date.now(), // Tạo ID tạm
                text: payload.text,
                done: false
            });
            logDetail = `Thêm checklist: ${payload.text}`;
        } else if (action === 'TOGGLE') {
            const index = todos.findIndex(t => t.id == payload.todoId);
            if (index !== -1) {
                todos[index].done = !todos[index].done;
                logDetail = `Đánh dấu ${todos[index].done ? 'hoàn thành' : 'chưa xong'}: ${todos[index].text}`;
            }
        } else if (action === 'DELETE') {
            const index = todos.findIndex(t => t.id == payload.todoId);
            if (index !== -1) {
                logDetail = `Xóa checklist: ${todos[index].text}`;
                todos.splice(index, 1);
            }
        }

        await task.update({ todo_list: JSON.stringify(todos) });

        if (logDetail) {
            await ActivityLog.create({
                user_id: userId, action: 'UPDATE_TODO', entity_type: 'TASK', entity_id: taskId,
                details: logDetail
            });
        }
        return todos;
    }
}

module.exports = TaskService;