const { User, Department, ActivityLog } = require('../models');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// In-memory stores for Forgot Password OTP
const otpStore = new Map(); // Key: username, Value: { otp, expiresAt, verified }
const otpRequestsTodayStore = new Map(); // Key: username, Value: { count, lastSentAt, dateStr }

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
    }
});

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

            // GHI LOG LOGIN
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
            await ActivityLog.create({
                user_id: user.id,
                action: 'LOGIN',
                entity_type: 'AUTH',
                entity_id: user.id,
                details: 'Đăng nhập thành công'
            });

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
    logout: async (req, res) => {
        try {
            if (req.session && req.session.user) {
                const user = req.session.user;
                await ActivityLog.create({
                    user_id: user.id,
                    action: 'LOGOUT',
                    entity_type: 'AUTH',
                    entity_id: user.id,
                    details: 'Đăng xuất khỏi hệ thống'
                });
            }
        } catch (e) {
            console.error("Lỗi ghi log logout:", e);
        }
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

            // 1.2. Check các tiêu chuẩn bảo mật của mật khẩu mới (8+ chars, A-Z, a-z, 123, special symbol)
            const lengthRegex = /^.{8,}$/;
            const upperRegex = /[A-Z]/;
            const lowerRegex = /[a-z]/;
            const numberRegex = /[0-9]/;
            const specialRegex = /[^A-Za-z0-9]/;

            if (!lengthRegex.test(newPassword) ||
                !upperRegex.test(newPassword) ||
                !lowerRegex.test(newPassword) ||
                !numberRegex.test(newPassword) ||
                !specialRegex.test(newPassword)) {
                return res.send('<script>alert("Mật khẩu mới không đủ độ bảo mật! Cần tối thiểu 8 ký tự, gồm ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số và 1 ký tự đặc biệt."); window.history.back();</script>');
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
    },

    // 5. Trang quên mật khẩu
    forgotPasswordPage: (req, res) => {
        if (req.session.user) return res.redirect('/dashboard');
        res.render('pages/forgot-password', { layout: false });
    },

    // 6. Gửi mã OTP
    sendOTP: async (req, res) => {
        try {
            const { username } = req.body;
            if (!username) {
                return res.json({ success: false, message: 'Vui lòng cung cấp tên tài khoản!' });
            }

            const user = await User.findOne({ where: { username } });
            if (!user) {
                return res.json({ success: false, message: 'Tài khoản không tồn tại trên hệ thống!' });
            }

            if (!user.gmail) {
                return res.json({ success: false, message: 'Tài khoản này chưa được đăng ký địa chỉ Gmail. Vui lòng liên hệ Admin để bổ sung!' });
            }

            const todayStr = new Date().toISOString().split('T')[0];
            let rateLimit = otpRequestsTodayStore.get(username);
            
            if (!rateLimit || rateLimit.dateStr !== todayStr) {
                rateLimit = { count: 0, lastSentAt: 0, dateStr: todayStr };
                otpRequestsTodayStore.set(username, rateLimit);
            }

            let cooldown = 120;
            if (rateLimit.count >= 5 && rateLimit.count < 8) {
                cooldown = 10 * 60;
            } else if (rateLimit.count >= 8) {
                cooldown = 60 * 60;
            }

            const elapsed = Math.floor((Date.now() - rateLimit.lastSentAt) / 1000);
            if (elapsed < cooldown) {
                const remaining = cooldown - elapsed;
                let errorMsg = `Vui lòng đợi ${remaining} giây trước khi gửi lại OTP.`;
                if (remaining >= 60) {
                    errorMsg = `Vui lòng đợi ${Math.ceil(remaining / 60)} phút trước khi gửi lại OTP.`;
                }
                return res.json({ success: false, message: errorMsg, cooldown: remaining });
            }

            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = Date.now() + 3 * 60 * 1000;

            otpStore.set(username, { otp, expiresAt, verified: false });
            console.log(`[DEBUG OTP] Tài khoản: ${username} | Mã OTP mới nhất: ${otp}`);

            rateLimit.count += 1;
            rateLimit.lastSentAt = Date.now();
            otpRequestsTodayStore.set(username, rateLimit);

            let nextCooldown = 120;
            if (rateLimit.count >= 5 && rateLimit.count < 8) {
                nextCooldown = 10 * 60;
            } else if (rateLimit.count >= 8) {
                nextCooldown = 60 * 60;
            }

            const maskedEmail = user.gmail.replace(/^([^@]{2})[^@]+(@.+)$/, '$1***$2');
            
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                const mailOptions = {
                    from: `"Hệ thống Quản lý Công việc" <${process.env.EMAIL_USER}>`,
                    to: user.gmail,
                    subject: '[Quản Lý Công Việc] Mã xác thực OTP đặt lại mật khẩu',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                            <h2 style="color: #4f46e5; text-align: center; margin-bottom: 20px;">Xác thực đặt lại mật khẩu</h2>
                            <p>Xin chào <strong>${user.fullname}</strong>,</p>
                            <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản <strong>${user.username}</strong>. Vui lòng sử dụng mã OTP dưới đây để tiếp tục:</p>
                            <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 26px; font-weight: bold; letter-spacing: 6px; color: #1f2937; margin: 25px 0; border-radius: 6px; border: 1px solid #e5e7eb;">
                                ${otp}
                            </div>
                            <p style="color: #ef4444; font-size: 0.85rem; font-style: italic;">Mã OTP này có hiệu lực trong vòng 3 phút. Vui lòng tuyệt đối không chia sẻ mã này với bất kỳ ai.</p>
                            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 0.8rem; color: #6b7280; text-align: center; margin: 0;">Đây là email tự động từ Hệ thống Quản lý Công việc. Vui lòng không phản hồi email này.</p>
                        </div>
                    `
                };
                
                transporter.sendMail(mailOptions).catch(err => {
                    console.error('[SMTP Error] Lỗi gửi email OTP:', err);
                });
            } else {
                console.log(`\n======================================================`);
                console.log(`[DEVELOPER FALLBACK] Gmail SMTP chưa được cấu hình.`);
                console.log(`Tài khoản: ${username} | Gmail: ${user.gmail}`);
                console.log(`MÃ OTP CỦA BẠN LÀ: ${otp}`);
                console.log(`======================================================\n`);
            }

            return res.json({ success: true, maskedEmail, cooldown: nextCooldown });

        } catch (err) {
            console.error(err);
            return res.json({ success: false, message: 'Đã xảy ra lỗi trên hệ thống!' });
        }
    },

    // 7. Xác thực mã OTP
    verifyOTP: async (req, res) => {
        try {
            const { username, otp } = req.body;
            if (!username || !otp) {
                return res.json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
            }

            const record = otpStore.get(username);
            if (!record) {
                return res.json({ success: false, message: 'Mã xác thực không tồn tại hoặc đã bị hủy!' });
            }

            if (Date.now() > record.expiresAt) {
                otpStore.delete(username);
                return res.json({ success: false, message: 'Mã OTP đã hết hiệu lực 3 phút!' });
            }

            if (record.otp !== otp) {
                return res.json({ success: false, message: 'Mã xác thực OTP không chính xác!' });
            }

            record.verified = true;
            otpStore.set(username, record);

            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.json({ success: false, message: 'Lỗi xác minh OTP!' });
        }
    },

    // 8. Đặt lại mật khẩu mới
    resetPassword: async (req, res) => {
        try {
            const { username, newPassword, confirmPassword } = req.body;
            if (!username || !newPassword || !confirmPassword) {
                return res.json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
            }

            if (newPassword !== confirmPassword) {
                return res.json({ success: false, message: 'Mật khẩu xác nhận không khớp!' });
            }

            const lengthRegex = /^.{8,}$/;
            const upperRegex = /[A-Z]/;
            const lowerRegex = /[a-z]/;
            const numberRegex = /[0-9]/;
            const specialRegex = /[^A-Za-z0-9]/;

            if (!lengthRegex.test(newPassword) ||
                !upperRegex.test(newPassword) ||
                !lowerRegex.test(newPassword) ||
                !numberRegex.test(newPassword) ||
                !specialRegex.test(newPassword)) {
                return res.json({ success: false, message: 'Mật khẩu mới không đủ độ bảo mật! Cần tối thiểu 8 ký tự, gồm ít nhất 1 chữ hoa, 1 chữ thường, 1 chữ số và 1 ký tự đặc biệt.' });
            }

            const record = otpStore.get(username);
            if (!record || !record.verified) {
                return res.json({ success: false, message: 'Yêu cầu không hợp lệ. Vui lòng xác thực mã OTP trước!' });
            }

            const user = await User.findOne({ where: { username } });
            if (!user) {
                return res.json({ success: false, message: 'Tài khoản không tồn tại!' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            await User.update({ password: hashedPassword }, { where: { id: user.id } });

            otpStore.delete(username);

            await ActivityLog.create({
                user_id: user.id,
                action: 'UPDATE',
                entity_type: 'USER',
                entity_id: user.id,
                details: 'Đặt lại mật khẩu thành công qua luồng Quên mật khẩu OTP'
            });

            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.json({ success: false, message: 'Đã xảy ra lỗi khi đặt lại mật khẩu!' });
        }
    }
};

module.exports = AuthController;