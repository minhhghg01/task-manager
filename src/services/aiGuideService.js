/**
 * Service Trợ lý AI Ming - Hướng dẫn sử dụng hệ thống Quản lý Công việc
 */

// Bộ dữ liệu Cẩm nang Hướng dẫn Sử dụng (Knowledge Base)
const KNOWLEDGE_BASE = {
    introduction: {
        title: "Giới thiệu chung về hệ thống",
        content: "Hệ thống Quản lý Công việc là nền tảng quản lý tác vụ toàn diện dành cho bệnh viện, hỗ trợ giao việc, theo dõi tiến độ, tự động lặp lại công việc định kỳ, báo cáo thống kê hiệu suất, và liên kết tài khoản bảo mật bằng mã xác thực OTP qua Gmail.",
        keywords: ["giới thiệu", "là gì", "hệ thống", "chức năng chính", "tổng quan"]
    },
    task_creation: {
        title: "Cách tạo mới và giao công việc",
        content: "Để tạo mới và giao công việc:\n" +
                 "1. Nhấn nút **'Giao việc mới'** (nút màu indigo) ở thanh tiêu đề phía trên.\n" +
                 "2. Điền đầy đủ thông tin: Tên công việc, Mô tả chi tiết, Khoa/Phòng thực hiện.\n" +
                 "3. Chọn **Người thực hiện** (nếu bạn tự làm việc này, tích chọn 'Tôi tự thực hiện công việc này').\n" +
                 "4. Thiết lập **Thời hạn hoàn thành** (Deadline).\n" +
                 "5. Đính kèm tài liệu (nếu có) và thiết lập chế độ lặp lại (nếu là công việc định kỳ).\n" +
                 "6. Nhấn **'Giao việc'** để gửi tác vụ. Người nhận việc sẽ lập tức nhận được thông báo qua hệ thống.",
        keywords: ["giao việc", "tạo việc", "tạo mới", "giao công việc", "thêm việc", "thêm mới"]
    },
    recurring_tasks: {
        title: "Cấu hình lặp lại công việc định kỳ (Recurrence)",
        content: "Hệ thống hỗ trợ 4 chế độ lặp lại công việc:\n" +
                 "- **Không lặp (None)**: Công việc chỉ làm một lần duy nhất.\n" +
                 "- **Hàng ngày (Daily)**: Lặp lại mỗi ngày vào lúc 0:00 sáng.\n" +
                 "- **Từ Thứ 2 đến Thứ 6 hàng tuần**: Tự động bỏ qua Thứ 7 và Chủ nhật để tối ưu hóa ngày làm việc hành chính.\n" +
                 "- **Hàng tuần (Weekly)**: Cho phép tích chọn một hoặc nhiều ngày cụ thể từ Thứ 2 đến Chủ nhật.\n" +
                 "- **Hàng tháng (Monthly)**: Cho phép chọn một hoặc nhiều ngày cụ thể trong tháng từ bảng 31 ngày (dạng lưới 8x4). **Đặc biệt**: Hệ thống tự động xử lý các ngày cuối tháng. Ví dụ, nếu bạn chọn ngày 31 thì vào tháng 2 hệ thống sẽ tự động tạo việc vào ngày 28/2 (hoặc 29/2 năm nhuận), tháng 4 lặp vào ngày 30/4...",
        keywords: ["lặp", "định kỳ", "hàng ngày", "hàng tuần", "hàng tháng", "thứ 2 đến thứ 6", "tháng 2", "cuối tháng"]
    },
    roles: {
        title: "Phân quyền và vai trò các tài khoản",
        content: "Hệ thống phân chia quyền hạn chặt chẽ theo chức danh công việc:\n" +
                 "- **ADMIN (Quản trị viên)**: Quản lý nhân sự, quản lý khoa phòng, theo dõi lịch sử tác động (logs) toàn hệ thống. Không tham gia giao/nhận việc.\n" +
                 "- **DIRECTOR (Giám đốc)**: Xem báo cáo thống kê toàn bệnh viện, giám sát toàn bộ công việc của tất cả các khoa.\n" +
                 "- **HEAD (Trưởng khoa) / DEPUTY (Phó khoa)**: Giao việc cho nhân sự thuộc khoa mình phụ trách; duyệt/từ chối báo cáo hoàn thành công việc của cấp dưới.\n" +
                 "- **LEADER (Tổ trưởng)**: Giao việc cho nhân viên trong tổ/nhóm và thực hiện việc được giao.\n" +
                 "- **STAFF (Nhân viên)**: Nhận việc từ cấp trên, cập nhật tiến độ công việc, viết báo cáo hoàn thành và gửi duyệt.",
        keywords: ["quyền", "vai trò", "chức năng", "admin", "giám đốc", "trưởng khoa", "phó khoa", "tổ trưởng", "nhân viên", "staff", "head", "director"]
    },
    password_security: {
        title: "Bảo mật tài khoản: Đổi mật khẩu & Quên mật khẩu OTP",
        content: "Để bảo vệ tài khoản của bạn:\n" +
                 "1. **Đổi mật khẩu**: Vào trang cá nhân của bạn, sử dụng **Premium Password UI** (với thanh đo độ mạnh mật khẩu và checklist 5 tiêu chí bắt buộc gồm: ít nhất 8 ký tự, có chữ hoa, chữ thường, chữ số và ký tự đặc biệt).\n" +
                 "2. **Quên mật khẩu**: Nhấn 'Quên mật khẩu?' ở trang đăng nhập. Nhập tài khoản để nhận mã OTP qua Gmail. Mã OTP có hiệu lực trong **3 phút**.\n" +
                 "3. **Chống spam OTP**: Hệ thống áp dụng rate limit 3 cấp độ:\n" +
                 "   - 5 lần đầu tiên trong ngày: Cooldown gửi lại là **120 giây**.\n" +
                 "   - 3 lần tiếp theo: Cooldown tăng lên **10 phút**.\n" +
                 "   - Các lần sau đó: Cooldown là **60 phút**.",
        keywords: ["mật khẩu", "quên", "otp", "đổi mật khẩu", "spam", "cooldown", "bảo mật"]
    },
    activity_log: {
        title: "Hệ thống ghi nhận hoạt động (Activity Log)",
        content: "Nhằm mục đích minh bạch và kiểm toán, mọi thao tác (đăng nhập, tạo việc, sửa việc, đổi quyền...) đều được lưu lại lịch sử tự động.\n" +
                 "Hệ thống sử dụng công nghệ `AsyncLocalStorage` để **tự động chụp lại địa chỉ IP và loại thiết bị** của người thao tác (ví dụ: máy tính Windows chạy Chrome, điện thoại iPhone chạy Safari...) và gắn trực tiếp làm tiền tố trong nhật ký hoạt động. Admin có thể tra cứu lịch sử này tại trang 'Lịch sử tác động'.",
        keywords: ["log", "lịch sử", "ghi nhật ký", "thiết bị", "ip", "hoạt động", "tác động"]
    },
    reporting: {
        title: "Báo cáo, thống kê và xuất dữ liệu Excel",
        content: "Người quản lý (Giám đốc, Trưởng khoa) có thể vào mục **'Báo cáo & Thống kê'** để:\n" +
                 "- Xem biểu đồ trực quan (Chart.js) thống kê tỷ lệ công việc Đang làm, Hoàn thành, Trễ hạn.\n" +
                 "- Xem biểu đồ hiệu suất hoàn thành của từng nhân viên.\n" +
                 "- **Xuất Excel**: Tải xuống tệp báo cáo chi tiết các công việc của khoa phòng hoặc toàn viện ở định dạng Excel chuẩn hóa, hỗ trợ bộ lọc khoa phòng và thời gian cực kỳ tiện lợi.",
        keywords: ["báo cáo", "thống kê", "biểu đồ", "excel", "xuất excel", "tải về", "hiệu suất"]
    }
};

// Các mẫu câu chào hỏi
const GREETINGS = ["xin chào", "hello", "hi", "chào", "chào bạn", "chào ming", "chào trợ lý"];

// Hàm tìm câu trả lời phù hợp nhất
function generateResponse(query) {
    if (!query || typeof query !== 'string') {
        return "Chào bạn, tôi là Ming - Trợ lý AI hướng dẫn sử dụng. Bạn vui lòng nhập câu hỏi nhé!";
    }

    const cleanQuery = query.toLowerCase().trim();

    // 1. Kiểm tra chào hỏi
    if (GREETINGS.some(greet => cleanQuery === greet || cleanQuery.startsWith(greet + ' '))) {
        return "Chào bạn! Tôi là **Ming** - Trợ lý ảo AI chuyên hướng dẫn sử dụng hệ thống Quản lý Công việc. Bạn cần tôi trợ giúp thông tin về chức năng nào của phần mềm hôm nay? (Ví dụ: giao việc, công việc lặp lại, đổi mật khẩu, phân quyền...)";
    }

    // 2. Tìm kiếm theo bộ từ khóa
    let bestMatch = null;
    let maxMatches = 0;

    for (const key in KNOWLEDGE_BASE) {
        const item = KNOWLEDGE_BASE[key];
        let matches = 0;

        item.keywords.forEach(kw => {
            if (cleanQuery.includes(kw)) {
                matches++;
            }
        });

        // Ưu tiên khớp nhiều từ khóa nhất
        if (matches > maxMatches) {
            maxMatches = matches;
            bestMatch = item;
        }
    }

    // 3. Phản hồi nếu tìm thấy kết quả phù hợp
    if (bestMatch && maxMatches > 0) {
        return `### ${bestMatch.title}\n\n${bestMatch.content}`;
    }

    // 4. Fallback phản hồi lịch sự
    return "Xin lỗi bạn, câu hỏi của bạn nằm ngoài phạm vi cẩm nang hướng dẫn sử dụng của hệ thống Quản lý Công việc. \n\n" +
           "Tôi là trợ lý AI chuyên hỗ trợ các chủ đề sau:\n" +
           "- 🗓️ **Tạo và giao công việc**\n" +
           "- 🔄 **Cấu hình lặp lại công việc định kỳ** (hàng ngày, hàng tuần, hàng tháng)\n" +
           "- 👤 **Phân quyền, vai trò** của các tài khoản (Admin, Giám đốc, Trưởng khoa, Nhân viên)\n" +
           "- 🔒 **Bảo mật**: Đổi mật khẩu, quên mật khẩu nhận mã OTP và cơ chế chống spam gửi mail\n" +
           "- 📊 **Báo cáo thống kê** và cách xuất file Excel báo cáo công việc\n" +
           "- 📝 **Hệ thống ghi nhận logs** IP và loại thiết bị tự động.\n\n" +
           "Bạn vui lòng đặt câu hỏi liên quan đến các chủ đề trên để tôi có thể hỗ trợ tốt nhất nhé!";
}

module.exports = {
    KNOWLEDGE_BASE,
    generateResponse
};
