// public/js/client-app.js
const socket = io();

// Lấy ID user hiện tại từ thẻ body (được gán trong layout main.ejs)
const currentUserId = document.body.dataset.userid;

if (currentUserId) {
    // Gửi yêu cầu tham gia "phòng" nhận tin của riêng mình
    socket.emit('JOIN_USER_ROOM', currentUserId);
    console.log('Connected to notification system');
}

// Lắng nghe sự kiện có Task mới
socket.on('NEW_TASK_NOTIFICATION', (data) => {
    // 1. Hiển thị thông báo (Browser Alert hoặc Toast tuỳ bạn)
    alert(`🔔 THÔNG BÁO: ${data.message}`);

    // 2. Tự động thêm dòng mới vào bảng nếu đang ở trang dashboard
    const tableBody = document.getElementById('task-table-body');
    if (tableBody) {
        const newRow = `
            <tr class="table-info">
                <td>${data.task.title} <span class="badge bg-danger">Mới</span></td>
                <td>vừa xong</td>
                <td>${data.task.priority}</td>
                <td>New</td>
            </tr>
        `;
        tableBody.insertAdjacentHTML('afterbegin', newRow);
    }
});