const { User, Department } = require('../models');
const bcrypt = require('bcryptjs');

const AuthController = {
    // 1. Trang đăng nhập
    loginPage: (req, res) => {
        if (req.session.user) return res.redirect('/dashboard');
        res.render('pages/login', { layout: false, error: null });
    },

    // 2. Xử lý đăng nhập
    loginProcess: async (req, res) => {
        const { username, password } = req.body;

        try {
            // Lấy user kèm thông tin phòng ban
            const user = await User.findOne({
                where: { username, status: 'active' }, // Chỉ user active mới được vào
                include: [Department]
            });

            if (!user) {
                return res.render('pages/login', { layout: false, error: 'Tài khoản không tồn tại hoặc bị khóa' });
            }

            // Kiểm tra mật khẩu
            const validPass = await bcrypt.compare(password, user.password);
            if (!validPass) {
                return res.render('pages/login', { layout: false, error: 'Sai mật khẩu' });
            }

            // --- QUAN TRỌNG: LƯU SESSION ---
            // Phải lưu đúng tên trường trong DB (departments_id)
            req.session.user = {
                id: user.id,
                fullname: user.fullname,
                username: user.username,
                role: user.role,
                departments_id: user.departments_id, // <--- Dòng này sửa lỗi undefined
                department_name: user.Department ? user.Department.name : 'Unknown'
            };

            // Lưu session xong thì chuyển hướng
            req.session.save(() => {
                res.redirect('/dashboard');
            });

        } catch (err) {
            console.error(err);
            res.render('pages/login', { layout: false, error: 'Lỗi hệ thống' });
        }
    },

    // 3. Đăng xuất
    logout: (req, res) => {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    },

    // 4. Đổi mật khẩu
    changePassword: async (req, res) => {
        try {
            const user = req.session.user;
            if (!user) return res.redirect('/login');

            const { currentPassword, newPassword, confirmPassword } = req.body;

            // 1. Check xác nhận mật khẩu
            if (newPassword !== confirmPassword) {
                // Đơn giản hóa: alert lỗi rồi back lại (Thực tế nên dùng flash message)
                return res.send('<script>alert("Mật khẩu mới không khớp!"); window.history.back();</script>');
            }

            // 2. Lấy thông tin user từ DB để check pass cũ
            const dbUser = await User.findByPk(user.id);
            const isMatch = await bcrypt.compare(currentPassword, dbUser.password);

            if (!isMatch) {
                return res.send('<script>alert("Mật khẩu hiện tại không đúng!"); window.history.back();</script>');
            }

            // 3. Hash pass mới và lưu
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            await User.update({ password: hashedPassword }, { where: { id: user.id } });

            // 4. Logout bắt đăng nhập lại hoặc thông báo thành công
            res.send('<script>alert("Đổi mật khẩu thành công! Vui lòng đăng nhập lại."); window.location.href="/logout";</script>');

        } catch (e) {
            console.error(e);
            res.status(500).send("Lỗi hệ thống");
        }
    }
};

module.exports = AuthController;