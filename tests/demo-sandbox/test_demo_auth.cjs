/**
 * SCRIPT KIỂM THỬ AUTHORIZATION & AN TOÀN DỮ LIỆU BACKEND CHO DEMOUSER
 * Vị trí: tests/demo-sandbox/test_demo_auth.cjs
 *
 * QUY TẮC ĐÁNH GIÁ (5 TRẠNG THÁI CHUẨN + PASS_DATA_REDACTION + BLOCKED_BACKEND_UNAVAILABLE):
 * - PASS_AUTHORIZATION: Endpoint tồn tại, trả 401 hoặc 403 đúng như mong đợi (và khớp errorCode nếu có yêu cầu).
 * - PASS_DATA_REDACTION: Endpoint trả 200 theo thiết kế, dữ liệu nhạy cảm được che/null hoàn toàn.
 * - PASS_DOMAIN_REJECTION: Endpoint tồn tại, qua auth nhưng bị từ chối an toàn bởi domain.
 * - NOT_TESTED_ROUTE_NOT_FOUND: Trả 404 do route không tồn tại (KHÔNG tính vào pass auth).
 * - BLOCKED_BACKEND_UNAVAILABLE: Không kết nối được tới backend (port sai hoặc server chưa chạy).
 * - FAIL_SECURITY: Mutating API trả 2xx cho DemoUser, hoặc lộ dữ liệu nhạy cảm.
 * - FAIL_UNEXPECTED: Lỗi server 5xx, response ngoài dự kiến, hoặc mã lỗi errorCode không khớp kỳ vọng.
 *
 * EXIT CODES:
 * - 0: Hoàn thành, 0 FAIL_SECURITY, 0 FAIL_UNEXPECTED.
 * - 1: Đăng nhập thất bại hoặc thiếu credential (BLOCKED).
 * - 2: Phát hiện lỗ hổng bảo mật (FAIL_SECURITY).
 * - 3: Lỗi ngoài dự kiến hoặc lỗi server (FAIL_UNEXPECTED).
 * - 4: Backend không phản hồi / chưa khởi động (BLOCKED_BACKEND_UNAVAILABLE).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Đọc credential nghiêm ngặt từ biến môi trường terminal
const HOST = process.env.DEMO_API_HOST || '127.0.0.1';
const PORT = parseInt(process.env.DEMO_API_PORT || '5050', 10);
const USERNAME = process.env.DEMO_VIEWER_USERNAME;
const PASSWORD = process.env.DEMO_VIEWER_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error('\n======================================================================');
  console.error('THÔNG BÁO: CHƯA THIẾT LẬP BIẾN MÔI TRƯỜNG CREDENTIAL CHO DEMOUSER');
  console.error('======================================================================');
  console.error('Trạng thái: BLOCKED_MISSING_CREDENTIAL');
  console.error('Vui lòng thiết lập biến môi trường trước khi chạy kiểm thử:');
  console.error('  PowerShell:');
  console.error('    $env:DEMO_VIEWER_USERNAME="demo_viewer"');
  console.error('    $env:DEMO_VIEWER_PASSWORD="<nhập_mật_khẩu_của_bạn>"');
  console.error('======================================================================\n');
  process.exit(1);
}

async function request(options, postData = null) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          isConnectionError: false,
          statusCode: res.statusCode,
          headers: res.headers,
          json
        });
      });
    });
    req.on('error', (err) => {
      resolve({
        isConnectionError: true,
        error: err,
        statusCode: 0,
        headers: {},
        json: null
      });
    });
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const TEST_STATUS = {
  PASS_AUTHORIZATION: 'PASS_AUTHORIZATION',
  PASS_DATA_REDACTION: 'PASS_DATA_REDACTION',
  PASS_DOMAIN_REJECTION: 'PASS_DOMAIN_REJECTION',
  NOT_TESTED_ROUTE_NOT_FOUND: 'NOT_TESTED_ROUTE_NOT_FOUND',
  BLOCKED_BACKEND_UNAVAILABLE: 'BLOCKED_BACKEND_UNAVAILABLE',
  FAIL_SECURITY: 'FAIL_SECURITY',
  FAIL_UNEXPECTED: 'FAIL_UNEXPECTED'
};

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(jsonStr);
    }
  } catch {}
  return null;
}

// Validator kiểm tra che chắn dữ liệu nhạy cảm cho báo cáo tổng quan (REP-02)
function validateReportSummaryRedaction(res) {
  if (res.isConnectionError) {
    return {
      pass: false,
      status: TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE,
      reason: `Không kết nối được backend: ${res.error.code || res.error.message}`
    };
  }

  if (res.statusCode !== 200) {
    return {
      pass: false,
      status: TEST_STATUS.FAIL_UNEXPECTED,
      reason: `Kỳ vọng HTTP 200 cho API read-only được cấp quyền, nhận được ${res.statusCode}`
    };
  }

  const json = res.json || {};
  const data = json.data || {};

  const sensitiveFieldPatterns = [
    /^(?:grossProfit|grossMargin|grossMarginPercent|totalInventoryValue|cost|costPrice|totalCost|profit|margin|inventoryValue|purchaseValue)$/i
  ];

  const leakedFields = [];

  function checkObjectFields(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (/^hasGrossProfitData$/i.test(key) && val === true) {
        leakedFields.push(`${fullKey} (cờ dữ liệu lợi nhuận bị bật: true)`);
      }
      if (/^hasInventoryValueData$/i.test(key) && val === true) {
        leakedFields.push(`${fullKey} (cờ dữ liệu giá trị kho bị bật: true)`);
      }

      for (const pattern of sensitiveFieldPatterns) {
        if (pattern.test(key)) {
          if (val !== null && val !== undefined) {
            leakedFields.push(fullKey);
          }
        }
      }

      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        checkObjectFields(val, fullKey);
      }
    }
  }

  checkObjectFields(data, 'data');
  checkObjectFields(json, 'root');

  if (leakedFields.length > 0) {
    return {
      pass: false,
      status: TEST_STATUS.FAIL_SECURITY,
      reason: `LỖI BẢO MẬT: Phát hiện trường nhạy cảm không null: [${leakedFields.join(', ')}] (Giá trị đã được che)`
    };
  }

  return {
    pass: true,
    status: TEST_STATUS.PASS_DATA_REDACTION,
    reason: '200 OK & Toàn bộ trường tài chính nhạy cảm (GrossProfit, Margin, TotalInventoryValue) đã được che (null/false)'
  };
}

async function runTests() {
  console.log('======================================================================');
  console.log(`BẮT ĐẦU KIỂM THỬ AUTHORIZATION BACKEND CHO DEMOUSER (Host: ${HOST}:${PORT})`);
  console.log('======================================================================\n');

  console.log(`[AUTH] Đang gửi yêu cầu đăng nhập tài khoản DemoUser...`);
  const loginRes = await request({
    hostname: HOST,
    port: PORT,
    path: '/api/Auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: USERNAME,
    password: PASSWORD
  });

  if (loginRes.isConnectionError) {
    console.error(`[AUTH BLOCKED] Không thể kết nối tới backend tại ${HOST}:${PORT}.`);
    console.error(`Chi tiết: ${loginRes.error.code || loginRes.error.message}`);
    process.exit(4);
  }

  if (loginRes.statusCode !== 200 || !loginRes.json?.data?.accessToken) {
    console.error(`[AUTH FAILED] Đăng nhập thất bại. HTTP ${loginRes.statusCode}.`);
    process.exit(1);
  }

  const token = loginRes.json.data.accessToken;
  console.log('[AUTH SUCCESS] Lấy access token JWT thành công.');

  // Lấy UserId từ response hoặc JWT claim
  let demoUserId = loginRes.json?.data?.id;
  if (!demoUserId) {
    const jwtClaims = decodeJwtPayload(token);
    if (jwtClaims) {
      demoUserId = jwtClaims.nameid || jwtClaims.sub || jwtClaims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'];
    }
  }

  if (!demoUserId) {
    console.error('[AUTH ERROR] Không xác định được UserId từ login response hoặc JWT claims.');
    process.exit(3);
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const testCases = [
    // --- 1. ORDERS ---
    {
      id: 'ORD-01',
      name: 'POST /api/Orders/sync (Đồng bộ hóa đơn bán hàng thật)',
      method: 'POST',
      path: '/api/Orders/sync',
      body: { orders: [] },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 2. GOODS RECEIPTS ---
    {
      id: 'GR-01',
      name: 'POST /api/GoodsReceipts/sync (Đồng bộ phiếu nhập kho thật)',
      method: 'POST',
      path: '/api/GoodsReceipts/sync',
      body: { receipts: [] },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'GR-02',
      name: 'POST /api/GoodsReceipts (Tạo phiếu nhập trực tiếp)',
      method: 'POST',
      path: '/api/GoodsReceipts',
      body: { supplierId: 1, totalAmount: 100000, details: [] },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 3. SHIFTS ---
    {
      id: 'SFT-01',
      name: 'POST /api/Shifts/open (Mở ca làm việc thật)',
      method: 'POST',
      path: '/api/Shifts/open',
      body: { initialCash: 500000 },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'SFT-02',
      name: 'POST /api/Shifts/1/end (Đóng ca làm việc thật)',
      method: 'POST',
      path: '/api/Shifts/1/end',
      body: { actualCash: 500000 },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 4. PRODUCTS & IMAGES ---
    {
      id: 'PRD-01',
      name: 'POST /api/Products (Tạo sản phẩm mới thật)',
      method: 'POST',
      path: '/api/Products',
      body: { name: 'Demo Hack Product', categoryId: 1, price: 50000 },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'PRD-02',
      name: 'PUT /api/Products/1 (Cập nhật sản phẩm thật)',
      method: 'PUT',
      path: '/api/Products/1',
      body: { name: 'Demo Hack Product Updated', categoryId: 1, price: 60000 },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'PRD-03',
      name: 'DELETE /api/Products/1 (Xóa sản phẩm thật)',
      method: 'DELETE',
      path: '/api/Products/1',
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'PRD-04',
      name: 'POST /api/Products/upload-image (Upload ảnh lên Cloudinary qua backend)',
      method: 'POST',
      path: '/api/Products/upload-image',
      body: { productId: '1', imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'PRD-05',
      name: 'DELETE /api/Products/1/image (Xóa ảnh sản phẩm thật trên backend)',
      method: 'DELETE',
      path: '/api/Products/1/image',
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'PRD-06',
      name: 'POST /api/Products/cleanup-orphan-image (Dọn dẹp ảnh mồ côi trên Cloudinary)',
      method: 'POST',
      path: '/api/Products/cleanup-orphan-image',
      body: { publicId: 'pos-wms/test_orphan_id' },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 5. INVENTORIES ---
    {
      id: 'INV-01',
      name: 'PUT /api/Inventories/1 (Sửa số lượng tồn kho trực tiếp)',
      method: 'PUT',
      path: '/api/Inventories/1',
      body: { stockQuantity: 999 },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'INV-02',
      name: 'POST /api/Inventories/adjust (Điều chỉnh kiểm kê kho thật)',
      method: 'POST',
      path: '/api/Inventories/adjust',
      body: { productId: 1, delta: 10, reason: 'Demo test adjustment' },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 6. USERS & PASSWORDS (ĐỘNG THEO USER ID THỰC TẾ) ---
    {
      id: 'USR-01',
      name: 'GET /api/Users (Xem danh sách tài khoản)',
      method: 'GET',
      path: '/api/Users',
      isMutating: false,
      expectedStatuses: [403],
    },
    {
      id: 'USR-02',
      name: 'POST /api/Users (Tạo tài khoản mới)',
      method: 'POST',
      path: '/api/Users',
      body: { username: 'unauthorized_user', password: 'DummyPassword123!', role: 'Admin' },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'USR-03',
      name: `PUT /api/Users/${demoUserId}/change-password (Tự đổi mật khẩu tài khoản Demo hiện tại)`,
      method: 'PUT',
      path: `/api/Users/${demoUserId}/change-password`,
      body: { currentPassword: 'DummyCurrentPassword123!', newPassword: 'DummyNewPassword123!' },
      isMutating: true,
      expectedStatuses: [403],
      expectedErrorCode: 'FORBIDDEN_DEMO_USER'
    },
    {
      id: 'USR-04',
      name: 'PUT /api/Users/1/reset-password (Reset mật khẩu tài khoản khác)',
      method: 'PUT',
      path: '/api/Users/1/reset-password',
      body: { newPassword: 'DummyNewPassword123!' },
      isMutating: true,
      expectedStatuses: [403]
    },

    // --- 7. SUPPLIERS & CATEGORIES ---
    {
      id: 'SUP-01',
      name: 'POST /api/Suppliers (Tạo nhà cung cấp mới)',
      method: 'POST',
      path: '/api/Suppliers',
      body: { name: 'Demo Hack Supplier' },
      isMutating: true,
      expectedStatuses: [403],
    },
    {
      id: 'CAT-01',
      name: 'POST /api/Categories (Tạo danh mục mới)',
      method: 'POST',
      path: '/api/Categories',
      body: { name: 'Demo Hack Category' },
      isMutating: true,
      expectedStatuses: [403],
    },

    // --- 8. SENSITIVE LOGS & FINANCIAL REPORTS ---
    {
      id: 'LOG-01',
      name: 'GET /api/AuditLogs (Xem nhật ký kiểm toán hệ thống)',
      method: 'GET',
      path: '/api/AuditLogs',
      isMutating: false,
      expectedStatuses: [403],
    },
    {
      id: 'REP-01',
      name: 'GET /api/Reports/purchase-summary (Xem tổng giá trị mua hàng/giá vốn)',
      method: 'GET',
      path: '/api/Reports/purchase-summary',
      isMutating: false,
      expectedStatuses: [403],
    },
    {
      id: 'REP-02',
      name: 'GET /api/Reports/summary (Kiểm tra che chắn giá vốn/lợi nhuận)',
      method: 'GET',
      path: '/api/Reports/summary',
      isMutating: false,
      expectedStatuses: [200],
      customValidator: validateReportSummaryRedaction
    },

    // --- 9. ROUTES KHÔNG TỒN TẠI (PHẢI TRẢ 404 VÀ ĐƯỢC PHÂN LOẠI ĐÚNG) ---
    {
      id: 'NON-01',
      name: 'POST /api/Shifts/force-close (Route không tồn tại trong backend)',
      method: 'POST',
      path: '/api/Shifts/force-close',
      body: { shiftId: 1 },
      isMutating: true,
      isNonExistentRoute: true
    },
    {
      id: 'NON-02',
      name: 'POST /api/Database/reset (Route không tồn tại trong backend)',
      method: 'POST',
      path: '/api/Database/reset',
      body: {},
      isMutating: true,
      isNonExistentRoute: true
    },
    {
      id: 'NON-03',
      name: 'POST /api/Database/seed (Route không tồn tại trong backend)',
      method: 'POST',
      path: '/api/Database/seed',
      body: {},
      isMutating: true,
      isNonExistentRoute: true
    },
    {
      id: 'NON-04',
      name: 'POST /api/Database/bootstrap (Route không tồn tại trong backend)',
      method: 'POST',
      path: '/api/Database/bootstrap',
      body: {},
      isMutating: true,
      isNonExistentRoute: true
    }
  ];

  const results = {
    [TEST_STATUS.PASS_AUTHORIZATION]: [],
    [TEST_STATUS.PASS_DATA_REDACTION]: [],
    [TEST_STATUS.PASS_DOMAIN_REJECTION]: [],
    [TEST_STATUS.NOT_TESTED_ROUTE_NOT_FOUND]: [],
    [TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE]: [],
    [TEST_STATUS.FAIL_SECURITY]: [],
    [TEST_STATUS.FAIL_UNEXPECTED]: []
  };

  const reportItems = [];

  for (const tc of testCases) {
    const res = await request({
      hostname: HOST,
      port: PORT,
      path: tc.path,
      method: tc.method,
      headers: { ...authHeaders, ...(tc.headers || {}) }
    }, tc.body || null);

    let status = TEST_STATUS.FAIL_UNEXPECTED;
    let detail = '';

    if (res.isConnectionError) {
      status = TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE;
      detail = `Không thể kết nối backend tại ${HOST}:${PORT} (${res.error.code || res.error.message})`;
    } else if (tc.isNonExistentRoute) {
      if (res.statusCode === 404) {
        status = TEST_STATUS.NOT_TESTED_ROUTE_NOT_FOUND;
        detail = '404 Route Not Found (Xác nhận endpoint không tồn tại trong backend, không tính vào pass auth)';
      } else {
        status = TEST_STATUS.FAIL_UNEXPECTED;
        detail = `Kỳ vọng 404 cho route không tồn tại, nhưng nhận được ${res.statusCode}`;
      }
    } else if (tc.customValidator) {
      const val = tc.customValidator(res);
      status = val.status;
      detail = val.reason;
    } else if (res.statusCode === 404) {
      status = TEST_STATUS.NOT_TESTED_ROUTE_NOT_FOUND;
      detail = '404 Route Not Found (Endpoint không tồn tại hoặc sai URL)';
    } else if (tc.expectedStatuses && tc.expectedStatuses.includes(res.statusCode)) {
      if (tc.expectedErrorCode) {
        // Kiểm tra đúng vị trí trong response: res.json?.errorCode hoặc res.json?.data?.errorCode
        const actualErrorCode = res.json?.errorCode || res.json?.data?.errorCode;
        if (actualErrorCode !== tc.expectedErrorCode) {
          status = TEST_STATUS.FAIL_UNEXPECTED;
          detail = `HTTP ${res.statusCode} nhưng application errorCode không khớp. Kỳ vọng: '${tc.expectedErrorCode}', thực tế nhận: '${actualErrorCode || 'null'}'`;
        } else {
          status = TEST_STATUS.PASS_AUTHORIZATION;
          detail = `HTTP ${res.statusCode} & errorCode '${actualErrorCode}' đúng quy tắc authorization`;
        }
      } else {
        status = TEST_STATUS.PASS_AUTHORIZATION;
        detail = `HTTP ${res.statusCode} Forbidden/Unauthorized đúng quy tắc authorization`;
      }
    } else if (res.statusCode === 400 && res.json && res.json.isSuccess === false) {
      status = TEST_STATUS.PASS_DOMAIN_REJECTION;
      detail = `HTTP 400 Từ chối bởi quy tắc nghiệp vụ an toàn (Mã: ${res.json.errorCode || 'N/A'})`;
    } else if (res.statusCode >= 200 && res.statusCode < 300) {
      status = TEST_STATUS.FAIL_SECURITY;
      detail = `LỖI BẢO MẬT: Mutating API trả về ${res.statusCode} cho DemoUser!`;
    } else {
      status = TEST_STATUS.FAIL_UNEXPECTED;
      detail = `HTTP ${res.statusCode} không nằm trong dự kiến (Mã lỗi: ${res.json?.errorCode || 'N/A'})`;
    }

    results[status].push({
      id: tc.id,
      method: tc.method,
      path: tc.path,
      actualStatus: res.statusCode,
      classification: status,
      detail
    });

    reportItems.push({
      id: tc.id,
      method: tc.method,
      path: tc.path,
      actualStatus: res.statusCode,
      classification: status,
      errorCode: res.json?.errorCode || res.json?.data?.errorCode || null
    });

    console.log(`[${status}] [${tc.id}] ${tc.method} ${tc.path} -> HTTP ${res.statusCode} | ${detail}`);
  }

  console.log('\n======================================================================');
  console.log('TỔNG HỢP KẾT QUẢ KIỂM THỬ AUTHORIZATION:');
  console.log('======================================================================');
  console.log(`• PASS_AUTHORIZATION:          ${results[TEST_STATUS.PASS_AUTHORIZATION].length}`);
  console.log(`• PASS_DATA_REDACTION:         ${results[TEST_STATUS.PASS_DATA_REDACTION].length}`);
  console.log(`• PASS_DOMAIN_REJECTION:        ${results[TEST_STATUS.PASS_DOMAIN_REJECTION].length}`);
  console.log(`• NOT_TESTED_ROUTE_NOT_FOUND:   ${results[TEST_STATUS.NOT_TESTED_ROUTE_NOT_FOUND].length} (Không tính vào pass auth)`);
  console.log(`• BLOCKED_BACKEND_UNAVAILABLE:  ${results[TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE].length}`);
  console.log(`• FAIL_SECURITY:               ${results[TEST_STATUS.FAIL_SECURITY].length}`);
  console.log(`• FAIL_UNEXPECTED:             ${results[TEST_STATUS.FAIL_UNEXPECTED].length}`);
  console.log('======================================================================\n');

  // Lưu báo cáo an toàn: CHỈ lưu metadata cần thiết, KHÔNG lưu token, password, raw response body hoặc callback
  const reportPath = path.resolve(__dirname, 'auth_test_report.json');
  const safeReport = {
    timestamp: new Date().toISOString(),
    summary: {
      PASS_AUTHORIZATION: results[TEST_STATUS.PASS_AUTHORIZATION].length,
      PASS_DATA_REDACTION: results[TEST_STATUS.PASS_DATA_REDACTION].length,
      PASS_DOMAIN_REJECTION: results[TEST_STATUS.PASS_DOMAIN_REJECTION].length,
      NOT_TESTED_ROUTE_NOT_FOUND: results[TEST_STATUS.NOT_TESTED_ROUTE_NOT_FOUND].length,
      BLOCKED_BACKEND_UNAVAILABLE: results[TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE].length,
      FAIL_SECURITY: results[TEST_STATUS.FAIL_SECURITY].length,
      FAIL_UNEXPECTED: results[TEST_STATUS.FAIL_UNEXPECTED].length
    },
    items: reportItems
  };
  fs.writeFileSync(reportPath, JSON.stringify(safeReport, null, 2), 'utf8');

  if (results[TEST_STATUS.BLOCKED_BACKEND_UNAVAILABLE].length > 0) {
    console.error('THÔNG BÁO: Backend không khả dụng hoặc chưa khởi động.');
    process.exit(4);
  }

  if (results[TEST_STATUS.FAIL_SECURITY].length > 0) {
    console.error('CẢNH BÁO: PHÁT HIỆN LỖ HỔNG BẢO MẬT FAIL_SECURITY!');
    process.exit(2);
  }

  if (results[TEST_STATUS.FAIL_UNEXPECTED].length > 0) {
    console.error('CẢNH BÁO: CÓ TEST CASE THẤT BẠI NGOÀI DỰ KIẾN FAIL_UNEXPECTED!');
    process.exit(3);
  }

  process.exit(0);
}

runTests().catch(err => {
  console.error('Lỗi thực thi test:', err.message || err);
  process.exit(3);
});
