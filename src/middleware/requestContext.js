const { AsyncLocalStorage } = require('async_hooks');
const requestContextStore = new AsyncLocalStorage();

/**
 * Phân tích chuỗi User-Agent để trả về thông tin thiết bị, hệ điều hành và trình duyệt bằng tiếng Việt.
 * @param {string} userAgent 
 * @returns {string}
 */
function parseUserAgent(userAgent) {
    if (!userAgent) return 'Không rõ thiết bị';
    
    let os = 'Không rõ hệ điều hành';
    let device = 'Máy tính/Laptop';
    
    // Phát hiện hệ điều hành & loại thiết bị
    if (/windows/i.test(userAgent)) {
        os = 'Windows';
        device = 'Máy tính/Laptop';
    } else if (/macintosh|mac os x/i.test(userAgent)) {
        os = 'macOS';
        device = 'MacBook/iMac';
    } else if (/iphone/i.test(userAgent)) {
        os = 'iOS';
        device = 'iPhone';
    } else if (/ipad/i.test(userAgent)) {
        os = 'iPadOS';
        device = 'iPad';
    } else if (/android/i.test(userAgent)) {
        os = 'Android';
        if (/mobile/i.test(userAgent)) {
            device = 'Điện thoại Android';
        } else {
            device = 'Máy tính bảng Android';
        }
    } else if (/linux/i.test(userAgent)) {
        os = 'Linux';
        device = 'Máy tính/Laptop';
    }
    
    // Phát hiện trình duyệt
    let browser = 'Không rõ trình duyệt';
    if (/edg/i.test(userAgent)) {
        browser = 'Edge';
    } else if (/chrome|crios/i.test(userAgent) && !/opr|opios/i.test(userAgent)) {
        browser = 'Chrome';
    } else if (/safari/i.test(userAgent) && !/chrome|crios|opr|opios/i.test(userAgent)) {
        browser = 'Safari';
    } else if (/firefox|fxios/i.test(userAgent)) {
        browser = 'Firefox';
    } else if (/opr|opios/i.test(userAgent)) {
        browser = 'Opera';
    }
    
    return `${device} (${os}) - Trình duyệt ${browser}`;
}

const requestContextMiddleware = (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseUserAgent(userAgent);
    
    requestContextStore.run({ ip, deviceInfo }, next);
};

module.exports = {
    requestContextStore,
    requestContextMiddleware,
    parseUserAgent
};
