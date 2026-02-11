const { Task, User, TaskComment, ActivityLog } = require('../models');
const { Op } = require('sequelize');

// TRỌNG SỐ CHỨC VỤ
const ROLE_WEIGHTS = {
    'ADMIN': 99,
    'DIRECTOR': 10, 'DEPUTY_DIRECTOR': 9,
    'HEAD': 5, 'DEPUTY': 4,
    'LEADER': 3, 'STAFF': 1
};

class TaskService {
    // --- LẤY DANH SÁCH TASK ---
    static async getTasksByUser(user, filterType = 'general') {
        let tasks = [];
        const allUsers = await User.findAll({ attributes: ['id', 'fullname'] });
        const userMap = {};
        allUsers.forEach(u => userMap[u.id] = u.fullname);

        let whereCondition = {};

        // 1. XÁC ĐỊNH ĐIỀU KIỆN QUERY DB
        if (user.role === 'ADMIN') {
            if (filterType === 'general') whereCondition = {};
            else return []; // Admin không có "việc của tôi" theo nghĩa thường
        } else {
            if (filterType === 'general') {
                // Việc chung: Lấy theo phòng ban
                whereCondition = { department_id: user.departments_id };
            } else if (filterType === 'assigned_by_me') {
                // Việc tôi giao
                whereCondition = { assigned_by: user.id };
            } else {
                // 'mine' (Việc của tôi) hoặc 'invited' (Lời mời)
                // Do dữ liệu nằm trong cột JSON (collaborators/assigned_to), 
                // ta lấy rộng ra (toàn bộ hoặc theo phòng) rồi lọc kỹ bằng Javascript bên dưới.
                // Để chắc chắn không sót việc từ phòng khác mời sang, ta để điều kiện mở:
                whereCondition = {};
            }
        }

        tasks = await Task.findAll({
            where: whereCondition,
            include: [{ model: User, as: 'Creator', attributes: ['fullname'] }],
            order: [['created_at', 'DESC']]
        });

        // 2. XỬ LÝ DỮ LIỆU (PARSE JSON & FORMAT)
        const processedTasks = tasks.map(t => {
            const task = t.toJSON();

            // a. Parse người được giao (assigned_to)
            let assigneeIds = [];
            try {
                const parsed = JSON.parse(task.assigned_to || '[]');
                if (Array.isArray(parsed)) assigneeIds = parsed;
            } catch (e) { assigneeIds = []; }

            // b. Parse người phối hợp (collaborators) -> Để lọc Invite
            let collaborators = [];
            try {
                collaborators = JSON.parse(task.collaborators || '[]');
            } catch (e) { collaborators = []; }

            task.assigneeNames = assigneeIds.map(id => userMap[id] || 'Unknown').join(', ');
            task.formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : 'Không thời hạn';

            // Gán dữ liệu thô vào để dùng cho bộ lọc bên dưới
            task.assigneeIds = assigneeIds;
            task.collaboratorList = collaborators;

            return task;
        });

        // 3. LỌC KẾT QUẢ CUỐI CÙNG (JAVASCRIPT FILTER)
        if (user.role === 'ADMIN') return processedTasks;
        if (filterType === 'general') return processedTasks;
        if (filterType === 'assigned_by_me') return processedTasks;

        // Lọc: Việc của tôi (Được giao chính hoặc Đã chấp nhận phối hợp)
        if (filterType === 'mine') {
            return processedTasks.filter(t =>
                t.assigneeIds.some(id => String(id) === String(user.id))
            );
        }

        // Lọc: Lời mời hợp tác (Có tên trong collaborators VÀ trạng thái PENDING)
        if (filterType === 'invited') {
            return processedTasks.filter(t =>
                t.collaboratorList.some(c => String(c.uid) === String(user.id) && c.status === 'PENDING')
            );
        }

        return processedTasks;
    }

    static async createTask(currentUser, taskData, file) {
        let assigneeIds = [];
        const raw = taskData.assigned_to;
        if (Array.isArray(raw)) assigneeIds = raw;
        else if (typeof raw === 'string') {
            if (raw.trim().startsWith('[')) { try { assigneeIds = JSON.parse(raw); } catch (e) { assigneeIds = []; } }
            else { assigneeIds = [raw]; }
        } else if (typeof raw === 'number') assigneeIds = [raw];

        assigneeIds = assigneeIds.filter(id => id && id !== 'null' && id !== 'undefined');

        if (assigneeIds.length === 0) throw new Error('Vui lòng chọn ít nhất một người nhận việc!');

        const myWeight = ROLE_WEIGHTS[currentUser.role] || 0;
        if (assigneeIds.length > 0) {
            const targetUsers = await User.findAll({ where: { id: { [Op.in]: assigneeIds } } });
            for (const target of targetUsers) {
                if (String(target.id) === String(currentUser.id)) continue;
                const targetWeight = ROLE_WEIGHTS[target.role] || 0;
                if (myWeight <= targetWeight && currentUser.role !== 'ADMIN') {
                    throw new Error(`Không thể giao việc cho cấp trên/ngang cấp (${target.fullname})`);
                }
            }
        }

        let startDate = new Date();
        if (taskData.start_date) startDate = new Date(taskData.start_date);

        const newTask = await Task.create({
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority,
            department_id: currentUser.departments_id,
            assigned_by: currentUser.id,
            assigned_to: JSON.stringify(assigneeIds),
            start_date: startDate,
            due_date: taskData.due_date || null,
            status: 'Mới tạo',
            attachment_path: file ? `/uploads/${file.filename}` : null,
            collaborators: '[]',
            todo_list: '[]'
        });

        await ActivityLog.create({
            user_id: currentUser.id, action: 'CREATE', entity_type: 'TASK', entity_id: newTask.id,
            details: `Giao việc mới: ${taskData.title}`
        });

        return await Task.findByPk(newTask.id, { include: [{ model: User, as: 'Creator', attributes: ['fullname'] }] });
    }

    static async getTaskDetail(id) {
        const task = await Task.findByPk(id, {
            include: [
                { model: User, as: 'Creator', attributes: ['fullname'] },
                { model: TaskComment, as: 'TaskComments', separate: true, include: [{ model: User, attributes: ['fullname', 'username'] }], order: [['created_at', 'DESC']] }
            ]
        });
        if (!task) return null;

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
        let assigneeIds = [];
        try { assigneeIds = JSON.parse(taskData.assigned_to || '[]'); } catch (e) { }
        const assignees = await User.findAll({ where: { id: { [Op.in]: assigneeIds } }, attributes: ['id', 'fullname'] });
        taskData.assigneeNames = assignees.map(u => u.fullname).join(', ');
        taskData.assigneeList = assignees;

        let collabsRaw = [];
        try { collabsRaw = JSON.parse(taskData.collaborators || '[]'); } catch (e) { }
        const collabIds = collabsRaw.map(c => c.uid);
        const usersInfo = await User.findAll({ where: { id: { [Op.in]: collabIds } }, attributes: ['id', 'fullname', 'role'] });

        taskData.collaboratorList = collabsRaw.map(c => {
            const uInfo = usersInfo.find(u => String(u.id) === String(c.uid));
            return {
                id: c.uid,
                fullname: uInfo ? uInfo.fullname : 'Unknown',
                role: uInfo ? uInfo.role : '',
                status: c.status
            };
        });

        try { taskData.parsedTodoList = JSON.parse(taskData.todo_list || '[]'); } catch (e) { taskData.parsedTodoList = []; }

        if (task.start_date) taskData.formattedStartDate = new Date(task.start_date).toLocaleString('vi-VN');
        else taskData.formattedStartDate = new Date(task.createdAt).toLocaleString('vi-VN');
        taskData.formattedDueDate = task.due_date ? new Date(task.due_date).toLocaleString('vi-VN') : 'Không thời hạn';

        let finalHistory = dbHistory.map(h => h.toJSON());
        const hasCreateLog = finalHistory.some(h => h.action === 'CREATE');
        if (!hasCreateLog) finalHistory.push({ action: 'CREATE', createdAt: task.createdAt, details: `Giao việc mới: ${task.title}`, User: { fullname: task.Creator ? task.Creator.fullname : 'Người tạo' } });
        finalHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        taskData.history = finalHistory;

        return taskData;
    }

    // --- CÁC HÀM LOGIC MỚI ---

    // 1. THÊM NGƯỜI PHỐI HỢP
    static async addCollaborator(taskId, targetUserId, currentUserId) {
        const task = await Task.findByPk(taskId);
        let collabs = JSON.parse(task.collaborators || '[]');

        if (collabs.some(c => String(c.uid) === String(targetUserId))) {
            throw new Error("Nhân viên này đã có trong danh sách.");
        }

        const currentUser = await User.findByPk(currentUserId);
        const targetUser = await User.findByPk(targetUserId);

        // --- RULE 1: CHẶN ADMIN ---
        if (targetUser.role === 'ADMIN') {
            throw new Error("Không thể mời Admin tham gia công việc.");
        }

        // --- RULE 2: PHÂN QUYỀN MỜI (LOGIC MỚI) ---
        let canInvite = false;

        // A. ADMIN: Full quyền (để xử lý sự cố)
        if (currentUser.role === 'ADMIN') {
            canInvite = true;
        }
        // B. BAN GIÁM ĐỐC (GĐ & PGĐ)
        else if (['DIRECTOR', 'DEPUTY_DIRECTOR'].includes(currentUser.role)) {
            // Mời người cùng Ban GĐ HOẶC Trưởng khoa khác
            const isSameDept = currentUser.departments_id === targetUser.departments_id;
            const isTargetHead = targetUser.role === 'HEAD';

            if (isSameDept || isTargetHead) {
                canInvite = true;
            }
        }
        // C. TRƯỞNG PHÒNG: Mời cùng phòng HOẶC Trưởng phòng khác
        else if (currentUser.role === 'HEAD') {
            const isSameDept = currentUser.departments_id === targetUser.departments_id;
            const isTargetHead = targetUser.role === 'HEAD';
            if (isSameDept || isTargetHead) canInvite = true;
        }
        // D. CÒN LẠI: Chỉ cùng phòng
        else {
            if (currentUser.departments_id === targetUser.departments_id) canInvite = true;
        }

        if (!canInvite) {
            throw new Error("Bạn không có quyền mời nhân viên này (Chỉ được mời cấp dưới trực tiếp hoặc người cùng phòng).");
        }

        // --- RULE 3: TRẠNG THÁI (MỜI vs CHỈ ĐỊNH) ---
        const myWeight = ROLE_WEIGHTS[currentUser.role] || 0;
        const targetWeight = ROLE_WEIGHTS[targetUser.role] || 0;

        let newStatus = 'PENDING';
        let logAction = 'Mời phối hợp';

        // Admin hoặc Cấp trên ép cấp dưới -> Tự động ACCEPT
        if (currentUser.role === 'ADMIN' || myWeight > targetWeight) {
            newStatus = 'ACCEPTED';
            logAction = 'Chỉ định phối hợp';

            let assignees = JSON.parse(task.assigned_to || '[]');
            if (!assignees.includes(targetUserId) && !assignees.includes(String(targetUserId))) {
                assignees.push(targetUserId);
                await task.update({ assigned_to: JSON.stringify(assignees) });
            }
        }

        collabs.push({ uid: targetUserId, status: newStatus });
        await task.update({ collaborators: JSON.stringify(collabs) });

        await ActivityLog.create({
            user_id: currentUserId,
            action: 'ADD_COLLAB',
            entity_type: 'TASK',
            entity_id: taskId,
            details: `${logAction}: ${targetUser.fullname}`
        });
    }

    // 2. PHẢN HỒI LỜI MỜI (SYNC NGƯỜI NHẬN)
    static async respondCollaborator(taskId, currentUserId, action) {
        const task = await Task.findByPk(taskId);
        let collabs = JSON.parse(task.collaborators || '[]');
        let assignees = JSON.parse(task.assigned_to || '[]');

        const index = collabs.findIndex(c => String(c.uid) === String(currentUserId));
        if (index === -1) throw new Error("Bạn không có trong danh sách mời.");

        let logDetail = '';

        if (action === 'ACCEPT') {
            collabs[index].status = 'ACCEPTED';
            logDetail = 'Đã chấp nhận lời mời phối hợp';

            // [LOGIC MỚI] Chấp nhận -> Thêm vào người nhận việc (assigned_to)
            if (!assignees.includes(currentUserId) && !assignees.includes(String(currentUserId))) {
                assignees.push(currentUserId);
            }

        } else if (action === 'DECLINE') {
            collabs.splice(index, 1);
            logDetail = 'Đã từ chối lời mời phối hợp';
            // Không cần xóa assigned_to vì lúc mời chưa được add vào

        } else if (action === 'REMOVE') {
            collabs.splice(index, 1);
            logDetail = 'Đã rời khỏi nhóm phối hợp';

            // [LOGIC MỚI] Rời nhóm -> Xóa khỏi người nhận việc
            assignees = assignees.filter(id => String(id) !== String(currentUserId));
        }

        await task.update({
            collaborators: JSON.stringify(collabs),
            assigned_to: JSON.stringify(assignees)
        });

        await ActivityLog.create({ user_id: currentUserId, action: 'RESPOND_COLLAB', entity_type: 'TASK', entity_id: taskId, details: logDetail });
    }

    // 3. CẬP NHẬT TODO LIST (CHECK QUYỀN)
    static async updateTodoList(taskId, userId, action, payload) {
        const task = await Task.findByPk(taskId);
        if (!task) throw new Error('Công việc không tồn tại.');

        // --- BƯỚC 1: KIỂM TRA QUYỀN HẠN CHẶT CHẼ ---
        let assigneeIds = [];
        try { assigneeIds = JSON.parse(task.assigned_to || '[]'); } catch (e) { }

        // Chuyển tất cả về String để so sánh chính xác
        const listPeopleInTask = assigneeIds.map(id => String(id));
        const creatorId = String(task.assigned_by);
        const currentId = String(userId);

        const currentUser = await User.findByPk(userId);
        const isAdmin = currentUser.role === 'ADMIN';

        // Điều kiện: Phải là Admin HOẶC Người tạo HOẶC Người được giao (bao gồm người phối hợp đã Accept)
        const isAuthorized = isAdmin || (currentId === creatorId) || listPeopleInTask.includes(currentId);

        if (!isAuthorized) {
            throw new Error("Bạn không tham gia công việc này nên không được phép chỉnh sửa Checklist.");
        }
        // ---------------------------------------------

        let todos = JSON.parse(task.todo_list || '[]');
        let logDetail = '';

        if (action === 'ADD') {
            todos.push({
                id: Date.now(),
                text: payload.text,
                done: false
            });
            logDetail = `Thêm việc cần làm: "${payload.text}"`;
        }
        else if (action === 'TOGGLE') {
            const index = todos.findIndex(t => t.id == payload.todoId);
            if (index !== -1) {
                // Đảo ngược trạng thái
                const newStatus = !todos[index].done;
                todos[index].done = newStatus;

                // Ghi log rõ ràng Tick hay Bỏ Tick
                if (newStatus) {
                    logDetail = `Đã hoàn thành việc: "${todos[index].text}"`;
                } else {
                    logDetail = `Bỏ đánh dấu hoàn thành việc: "${todos[index].text}"`;
                }
            }
        }
        else if (action === 'DELETE') {
            const index = todos.findIndex(t => t.id == payload.todoId);
            if (index !== -1) {
                logDetail = `Xóa việc cần làm: "${todos[index].text}"`;
                todos.splice(index, 1);
            }
        }

        // Chỉ update DB và ghi log nếu có thay đổi hợp lệ
        if (logDetail) {
            await task.update({ todo_list: JSON.stringify(todos) });

            await ActivityLog.create({
                user_id: userId,
                action: 'UPDATE_TODO',
                entity_type: 'TASK',
                entity_id: taskId,
                details: logDetail
            });
        }

        return todos;
    }

    static async updateProgress(taskId, progress, userId) {
        const task = await Task.findByPk(taskId);
        if (!task) throw new Error('Task không tồn tại');
        let newStatus = task.status;
        const now = new Date();
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const prog = parseInt(progress);
        if (prog === 100) { newStatus = 'Hoàn thành'; task.completed_date = now; }
        else { if (dueDate && now > dueDate) newStatus = 'Quá hạn'; else newStatus = 'Đang thực hiện'; }
        await task.update({ progress: prog, status: newStatus });
        await ActivityLog.create({ user_id: userId, action: 'UPDATE_PROGRESS', entity_type: 'TASK', entity_id: taskId, details: `Cập nhật tiến độ: ${prog}% (Trạng thái: ${newStatus})` });
        return task;
    }

    static async gradeTask(taskId, score) { return await Task.update({ score: score }, { where: { id: taskId } }); }
    static async addComment(userId, taskId, textContent) { return await TaskComment.create({ user_id: userId, task_id: taskId, comment: textContent }); }
}

module.exports = TaskService;