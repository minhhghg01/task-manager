const { Task, ActivityLog, User } = require('../models');
const { Op } = require('sequelize');

function addMonths(startDate, n) {
    const target = new Date(startDate);
    target.setDate(1); // Tránh lỗi lệch ngày khi setMonth
    target.setMonth(startDate.getMonth() + n);
    const maxDays = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const originalDay = startDate.getDate();
    target.setDate(Math.min(originalDay, maxDays));
    target.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
    return target;
}

function calculateNextRecurrenceDate(startDate, currentDate, recurrence, recurrenceDays) {
    const current = new Date(currentDate);

    if (recurrence === 'daily') {
        return new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }

    if (recurrence === 'weekly') {
        if (recurrenceDays) {
            let days = [];
            try {
                days = typeof recurrenceDays === 'string' ? JSON.parse(recurrenceDays) : recurrenceDays;
            } catch (e) {
                days = [];
            }
            if (Array.isArray(days) && days.length > 0) {
                const currentDay = current.getDay(); // 0 = Sunday, 1 = Monday, ...
                for (let d = 1; d <= 7; d++) {
                    const nextDayCandidate = (currentDay + d) % 7;
                    if (days.includes(nextDayCandidate)) {
                        return new Date(current.getTime() + d * 24 * 60 * 60 * 1000);
                    }
                }
            }
        }
        // Mặc định lặp lại sau 7 ngày
        return new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    if (recurrence === 'monthly') {
        let targetDays = [startDate.getDate()];
        if (recurrenceDays) {
            try {
                let parsed = typeof recurrenceDays === 'string' ? JSON.parse(recurrenceDays) : recurrenceDays;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    targetDays = Array.from(new Set(parsed.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 31)));
                } else if (!isNaN(parseInt(recurrenceDays))) {
                    targetDays = [parseInt(recurrenceDays)];
                }
            } catch (e) {}
        }
        
        let year = current.getFullYear();
        let month = current.getMonth(); // 0-11
        
        let bestCandidate = null;
        let checkMonth = month;
        let checkYear = year;
        
        // Quét các tháng tiếp theo để tìm ứng viên hợp lệ gần nhất
        for (let mOffset = 0; mOffset < 12; mOffset++) {
            let candidatesInMonth = [];
            const maxDays = new Date(checkYear, checkMonth + 1, 0).getDate();
            
            for (const targetDay of targetDays) {
                let candidate = new Date(checkYear, checkMonth, 1, startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), startDate.getMilliseconds());
                candidate.setDate(Math.min(targetDay, maxDays));
                if (candidate > current) {
                    candidatesInMonth.push(candidate);
                }
            }
            
            if (candidatesInMonth.length > 0) {
                candidatesInMonth.sort((a, b) => a - b);
                bestCandidate = candidatesInMonth[0];
                break;
            }
            
            checkMonth++;
            if (checkMonth > 11) {
                checkMonth = 0;
                checkYear++;
            }
        }
        return bestCandidate;
    }

    return null;
}

async function checkAndGenerateRecurringTasks(io) {
    console.log('[Scheduler] Đang quét các công việc lặp lại định kỳ...');
    try {
        const now = new Date();
        const parentTasks = await Task.findAll({
            where: {
                recurrence: { [Op.ne]: 'none' },
                next_recurrence_date: { [Op.lte]: now }
            }
        });

        for (const parentTask of parentTasks) {
            let hasChanges = false;
            while (parentTask.next_recurrence_date && new Date(parentTask.next_recurrence_date) <= now) {
                const currentNextDate = new Date(parentTask.next_recurrence_date);

                // Tính toán due_date cho task con dựa trên duration của task gốc
                let newDueDate = null;
                if (parentTask.due_date && parentTask.start_date) {
                    const duration = new Date(parentTask.due_date) - new Date(parentTask.start_date);
                    newDueDate = new Date(currentNextDate.getTime() + duration);
                }

                // Reset checklist (todo_list)
                let todoList = [];
                try {
                    todoList = JSON.parse(parentTask.todo_list || '[]');
                } catch (e) {
                    todoList = [];
                }
                if (Array.isArray(todoList)) {
                    todoList = todoList.map(t => ({ ...t, done: false }));
                }

                // Tạo công việc con
                const childTask = await Task.create({
                    title: parentTask.title,
                    description: parentTask.description,
                    priority: parentTask.priority,
                    department_id: parentTask.department_id,
                    assigned_by: parentTask.assigned_by,
                    assigned_to: parentTask.assigned_to,
                    collaborators: parentTask.collaborators,
                    todo_list: JSON.stringify(todoList),
                    tags: parentTask.tags,
                    start_date: currentNextDate,
                    due_date: newDueDate,
                    status: 'Mới tạo',
                    progress: 0,
                    recurrence: 'none',
                    recurrence_days: null,
                    recurrence_parent_id: parentTask.id
                });

                // Ghi log
                await ActivityLog.create({
                    user_id: parentTask.assigned_by,
                    action: 'CREATE',
                    entity_type: 'TASK',
                    entity_id: childTask.id,
                    details: `Hệ thống tự động tạo việc định kỳ từ việc gốc #${parentTask.id}`
                });

                console.log(`[Scheduler] Đã tự động tạo Child Task #${childTask.id} từ Master Task #${parentTask.id}`);

                // Gửi thông báo socket
                if (io) {
                    let assigneeIds = [];
                    try {
                        assigneeIds = JSON.parse(childTask.assigned_to || '[]');
                    } catch (e) {}
                    if (Array.isArray(assigneeIds)) {
                        assigneeIds.forEach(userId => {
                            io.to(`user_${userId}`).emit('new_task', childTask);
                        });
                    }
                }

                // Cập nhật ngày lặp tiếp theo cho Master task
                const nextDate = calculateNextRecurrenceDate(
                    new Date(parentTask.start_date),
                    currentNextDate,
                    parentTask.recurrence,
                    parentTask.recurrence_days
                );
                parentTask.next_recurrence_date = nextDate;
                hasChanges = true;
            }

            if (hasChanges) {
                await parentTask.save();
            }
        }
    } catch (err) {
        console.error('[Scheduler] Gặp lỗi khi sinh việc lặp lại:', err);
    }
}

function start(io) {
    // Chạy kiểm tra ngay khi khởi động
    checkAndGenerateRecurringTasks(io);

    // Chạy định kỳ mỗi 1 giờ
    setInterval(() => {
        checkAndGenerateRecurringTasks(io);
    }, 60 * 60 * 1000);
}

module.exports = {
    calculateNextRecurrenceDate,
    checkAndGenerateRecurringTasks,
    start
};
