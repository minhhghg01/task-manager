const { Task, User, Department } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');

// --- HÀM HELPER ĐẾM SỐ LỜI MỜI (CHO HEADER) ---
const countInvitations = async (user, TaskModel) => {
    try {
        const allTasks = await TaskModel.findAll({ attributes: ['collaborators'] });
        let count = 0;
        allTasks.forEach(t => {
            let collabs = [];
            try {
                collabs = (typeof t.collaborators === 'string') ? JSON.parse(t.collaborators || '[]') : (t.collaborators || []);
            } catch (e) { collabs = []; }
            if (Array.isArray(collabs)) {
                const hasPending = collabs.some(c => String(c.uid) === String(user.id) && c.status === 'PENDING');
                if (hasPending) count++;
            }
        });
        return count;
    } catch (e) {
        console.error("Lỗi đếm lời mời:", e);
        return 0;
    }
};

const ReportController = {
    // 1. RENDER TRANG BÁO CÁO (GET /reports)
    renderReportPage: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user) return res.redirect('/login');

            // Lấy danh sách phòng ban
            let departments = [];
            if (['ADMIN', 'DIRECTOR'].includes(user.role)) {
                departments = await Department.findAll({ where: { status: 'active' } });
            } else {
                // Lock vào phòng ban của user
                departments = await Department.findAll({ where: { id: user.departments_id } });
            }

            // Lấy danh sách nhân viên của phòng ban đầu tiên (hoặc phòng ban của user)
            const defaultDeptId = ['ADMIN', 'DIRECTOR'].includes(user.role) ? 'all' : user.departments_id;
            
            let usersInDept = [];
            if (defaultDeptId !== 'all') {
                usersInDept = await User.findAll({ where: { departments_id: defaultDeptId, status: 'active' } });
            } else {
                usersInDept = await User.findAll({ where: { status: 'active' } });
            }

            const invitationCount = await countInvitations(user, Task);

            res.render('pages/reports', {
                departments,
                usersInDept,
                defaultDeptId,
                invitationCount,
                user
            });
        } catch (err) {
            console.error(err);
            res.status(500).send("Lỗi tải trang báo cáo: " + err.message);
        }
    },

    // 2. PREVIEW BÁO CÁO DƯỚI DẠNG JSON (GET /reports/preview)
    previewReport: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user) return res.status(401).json({ success: false, message: "Chưa đăng nhập." });

            const { departmentId, userId, startDate, endDate } = req.query;

            // Xử lý phân quyền phòng ban
            let targetDeptId = departmentId;
            if (!['ADMIN', 'DIRECTOR'].includes(user.role)) {
                targetDeptId = user.departments_id; // Khóa cứng phòng ban của user thường
            }

            // Xây dựng điều kiện truy vấn
            let whereCondition = {};
            if (targetDeptId && targetDeptId !== 'all') {
                whereCondition.department_id = targetDeptId;
            }

            // Lọc theo thời gian (ngày tạo task)
            if (startDate || endDate) {
                whereCondition.created_at = {};
                if (startDate) {
                    whereCondition.created_at[Op.gte] = new Date(startDate + "T00:00:00");
                }
                if (endDate) {
                    whereCondition.created_at[Op.lte] = new Date(endDate + "T23:59:59");
                }
            }

            // Lấy danh sách tasks
            const tasks = await Task.findAll({
                where: whereCondition,
                order: [['created_at', 'DESC']]
            });

            // Lấy thông tin mapping tên
            const allUsers = await User.findAll({ attributes: ['id', 'fullname'] });
            const allDepts = await Department.findAll({ attributes: ['id', 'name'] });

            const userMap = {};
            allUsers.forEach(u => { userMap[u.id] = u.fullname; });

            const deptMap = {};
            allDepts.forEach(d => { deptMap[d.id] = d.name; });

            // Lọc theo nhân viên (nếu được chọn)
            let filteredTasks = tasks.map(t => t.toJSON());
            if (userId && userId !== 'all') {
                filteredTasks = filteredTasks.filter(t => {
                    let assignees = [];
                    let collabs = [];
                    try { assignees = JSON.parse(t.assigned_to || '[]'); } catch (e) {}
                    try { collabs = JSON.parse(t.collaborators || '[]').map(c => c.uid); } catch (e) {}

                    return assignees.map(String).includes(String(userId)) ||
                           collabs.map(String).includes(String(userId)) ||
                           String(t.assigned_by) === String(userId);
                });
            }

            // Format dữ liệu trả về
            const formatted = filteredTasks.map((t, idx) => {
                let assignees = [];
                let collabs = [];
                try { assignees = JSON.parse(t.assigned_to || '[]'); } catch (e) {}
                try { collabs = JSON.parse(t.collaborators || '[]'); } catch (e) {}

                const assigneeNames = assignees.map(uid => userMap[uid] || `User #${uid}`).join(', ');
                const collabNames = collabs.map(c => userMap[c.uid] || `User #${c.uid}`).join(', ');

                return {
                    stt: idx + 1,
                    id: t.id,
                    title: t.title,
                    description: t.description || '',
                    departmentId: t.department_id,
                    departmentName: deptMap[t.department_id] || 'Chưa phân',
                    assignedBy: userMap[t.assigned_by] || 'Hệ thống',
                    assignedTo: assigneeNames || 'Chưa phân công',
                    assignedToIds: assignees.map(Number),
                    collaborators: collabNames || 'Không có',
                    priority: t.priority,
                    status: t.status,
                    progress: t.progress,
                    score: t.score !== null ? t.score : 'Chưa chấm',
                    startDate: t.start_date ? new Date(t.start_date).toLocaleDateString('vi-VN') : '',
                    dueDate: t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '',
                    createdAt: new Date(t.createdAt).toLocaleDateString('vi-VN')
                };
            });

            res.json({ success: true, tasks: formatted });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    // 3. XUẤT FILE EXCEL BÁO CÁO (GET /reports/export)
    exportTasksReport: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user) return res.redirect('/login');

            const { departmentId, userId, startDate, endDate } = req.query;

            // Xử lý phân quyền phòng ban
            let targetDeptId = departmentId;
            if (!['ADMIN', 'DIRECTOR'].includes(user.role)) {
                targetDeptId = user.departments_id; // Khóa cứng phòng ban của user thường
            }

            // Xây dựng điều kiện truy vấn
            let whereCondition = {};
            if (targetDeptId && targetDeptId !== 'all') {
                whereCondition.department_id = targetDeptId;
            }

            // Lọc theo thời gian (ngày tạo task)
            if (startDate || endDate) {
                whereCondition.created_at = {};
                if (startDate) {
                    whereCondition.created_at[Op.gte] = new Date(startDate + "T00:00:00");
                }
                if (endDate) {
                    whereCondition.created_at[Op.lte] = new Date(endDate + "T23:59:59");
                }
            }

            // Lấy danh sách tasks
            const tasks = await Task.findAll({
                where: whereCondition,
                order: [['created_at', 'DESC']]
            });

            // Lấy thông tin mapping tên
            const allUsers = await User.findAll({ attributes: ['id', 'fullname'] });
            const allDepts = await Department.findAll({ attributes: ['id', 'name'] });

            const userMap = {};
            allUsers.forEach(u => { userMap[u.id] = u.fullname; });

            const deptMap = {};
            allDepts.forEach(d => { deptMap[d.id] = d.name; });

            // Lọc theo nhân viên (nếu được chọn)
            let filteredTasks = tasks.map(t => t.toJSON());
            if (userId && userId !== 'all') {
                filteredTasks = filteredTasks.filter(t => {
                    let assignees = [];
                    let collabs = [];
                    try { assignees = JSON.parse(t.assigned_to || '[]'); } catch (e) {}
                    try { collabs = JSON.parse(t.collaborators || '[]').map(c => c.uid); } catch (e) {}

                    return assignees.map(String).includes(String(userId)) ||
                           collabs.map(String).includes(String(userId)) ||
                           String(t.assigned_by) === String(userId);
                });
            }

            // Chuẩn bị dữ liệu Excel
            const excelData = filteredTasks.map((t, idx) => {
                let assignees = [];
                let collabs = [];
                try { assignees = JSON.parse(t.assigned_to || '[]'); } catch (e) {}
                try { collabs = JSON.parse(t.collaborators || '[]'); } catch (e) {}

                const assigneeNames = assignees.map(uid => userMap[uid] || `User #${uid}`).join(', ');
                const collabNames = collabs.map(c => userMap[c.uid] || `User #${c.uid}`).join(', ');

                return {
                    'STT': idx + 1,
                    'Mã Công Việc': t.id,
                    'Tên Công Việc': t.title,
                    'Mô Tả': t.description || '',
                    'Khoa/Phòng': deptMap[t.department_id] || 'Chưa phân',
                    'Người Giao': userMap[t.assigned_by] || 'Hệ thống',
                    'Người Nhận': assigneeNames || 'Chưa phân công',
                    'Người Phối Hợp': collabNames || 'Không có',
                    'Độ Ưu Tiên': t.priority,
                    'Trạng Thái': t.status,
                    'Tiến Độ (%)': `${t.progress}%`,
                    'Điểm Số': t.score !== null ? t.score : 'Chưa chấm',
                    'Ngày Bắt Đầu': t.start_date ? new Date(t.start_date).toLocaleDateString('vi-VN') : '',
                    'Hạn Chót': t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '',
                    'Ngày Tạo': new Date(t.createdAt).toLocaleDateString('vi-VN')
                };
            });

            // Tạo workbook và sheet bằng xlsx
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(excelData);

            // Thiết lập độ rộng các cột tự động hoặc định trước
            ws['!cols'] = [
                { wch: 6 },   // STT
                { wch: 14 },  // Mã Công Việc
                { wch: 30 },  // Tên Công Việc
                { wch: 40 },  // Mô Tả
                { wch: 25 },  // Khoa/Phòng
                { wch: 22 },  // Người Giao
                { wch: 28 },  // Người Nhận
                { wch: 28 },  // Người Phối Hợp
                { wch: 14 },  // Độ Ưu Tiên
                { wch: 16 },  // Trạng Thái
                { wch: 12 },  // Tiến Độ (%)
                { wch: 10 },  // Điểm Số
                { wch: 15 },  // Ngày Bắt Đầu
                { wch: 15 },  // Hạn Chót
                { wch: 15 }   // Ngày Tạo
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Báo Cáo Công Việc');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const filename = `BaoCaoCongViec_${Date.now()}.xlsx`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
        } catch (err) {
            console.error(err);
            res.status(500).send("Lỗi xuất file excel: " + err.message);
        }
    }
};

module.exports = ReportController;
