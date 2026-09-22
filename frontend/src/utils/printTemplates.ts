/**
 * Unified Professional POS & WMS Print Templates
 * Follows retail standard 80mm & 58mm thermal receipt layout and A4 document styling.
 * Pure B&W high contrast for thermal printer compatibility.
 */

export interface ReceiptItemPrintDto {
  stt?: number;
  productName: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  lineTotal: number;
}

export interface SalesReceiptPrintData {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  title?: string;
  receiptNumber?: string;
  invoiceNumber?: string;
  createdAt?: string; // ISO or formatted
  orderDate?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: string; // 'CASH' | 'QR' | 'Tiền mặt' | 'Chuyển khoản QR'
  items: ReceiptItemPrintDto[];
  subtotal: number;
  totalQuantity?: number;
  discount?: number;
  discountTotal?: number;
  taxTotal?: number;
  totalAmount: number;
  paidAmount?: number;
  customerGivenAmount?: number;
  changeAmount?: number;
  note?: string;
  notes?: string;
}

export interface GoodsReceiptPrintData {
  storeName?: string;
  warehouseName?: string;
  receiptNumber?: string;
  createdAt?: string;
  receiptDate?: string;
  creatorName?: string;
  supplierName?: string;
  status?: string;
  remarks?: string;
  items: Array<{
    stt?: number;
    productName: string;
    barcode?: string;
    quantity: number;
    costPrice: number;
    lineTotal: number;
  }>;
  totalQuantity: number;
  totalAmount: number;
}

export interface ShiftReportPrintData {
  storeName?: string;
  shiftId: number | string;
  role?: string;
  userName: string;
  startedAt: string;
  endedAt?: string | null;
  status?: string;
  closingRemarks?: string | null;
  notes?: string;

  // Cashier / Sales section
  orderCount?: number;
  completedOrderCount?: number;
  canceledOrderCount?: number;
  cashRevenue?: number;
  qrRevenue?: number;
  totalRevenue?: number;
  pendingSyncCount?: number;

  // Warehouse section (if applicable)
  receiptCount?: number;
  totalReceiptAmount?: number;
  receiptQuantityTotal?: number;
  adjustmentIncreaseQuantity?: number;
  adjustmentDecreaseQuantity?: number;
  openingCash?: number;
  expectedEndingCash?: number;
  actualEndingCash?: number;
  difference?: number;
}

/**
 * Escape HTML to prevent injection and layout disruption
 */
function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format currency in Vietnamese Dong
 */
export function formatVnd(amount: number | string | undefined | null): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  if (isNaN(num)) return '0 đ';
  return num.toLocaleString('vi-VN') + ' đ';
}

/**
 * Format date-time for Vietnam locale
 */
export function formatPrintDateTime(dateStr?: string | null): string {
  if (!dateStr) return new Date().toLocaleString('vi-VN');
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Common CSS for Thermal Printer & Web Print Preview
 */
const COMMON_PRINT_CSS = `
  @page {
    size: 80mm auto;
    margin: 0;
  }
  @media print {
    body {
      width: 76mm;
      margin: 0 auto;
      padding: 3mm;
    }
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.35;
    color: #000;
    background: #fff;
    max-width: 420px;
    margin: 0 auto;
    padding: 16px 12px;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .left { text-align: left; }
  .bold { font-weight: 700; }
  .uppercase { text-transform: uppercase; }

  /* Store Header */
  .store-header {
    text-align: center;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1.5px dashed #000;
  }
  .store-title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .store-sub {
    font-size: 11px;
    color: #333;
    margin-bottom: 2px;
  }
  .doc-title {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 1px;
    margin: 8px 0 4px 0;
  }
  .doc-meta {
    font-size: 11px;
    color: #222;
  }

  /* Info Section */
  .info-section {
    font-size: 12px;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px dashed #000;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
  }
  .info-label {
    color: #444;
  }
  .info-value {
    font-weight: 600;
    text-align: right;
  }

  /* Items Table */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .items-table th {
    border-bottom: 1.5px solid #000;
    padding: 6px 2px;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
  }
  .items-table td {
    padding: 5px 2px;
    border-bottom: 1px dashed #ddd;
    vertical-align: top;
  }
  .col-stt { width: 24px; text-align: center; }
  .col-name { text-align: left; }
  .col-qty { width: 36px; text-align: center; font-weight: 600; }
  .col-price { width: 68px; text-align: right; }
  .col-total { width: 78px; text-align: right; font-weight: 700; }

  .item-barcode {
    font-size: 10px;
    color: #555;
    font-family: monospace;
  }

  /* Summary Section */
  .summary-section {
    border-top: 1.5px dashed #000;
    padding-top: 8px;
    margin-bottom: 12px;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 0;
    font-size: 12px;
  }
  .summary-row.highlight {
    font-size: 16px;
    font-weight: 900;
    border-top: 1.5px solid #000;
    border-bottom: 1.5px solid #000;
    padding: 8px 0;
    margin: 6px 0;
  }

  /* Footer Section */
  .footer-section {
    text-align: center;
    padding-top: 10px;
    border-top: 1px dashed #000;
    font-size: 11px;
    color: #333;
  }
  .footer-msg {
    font-weight: 700;
    margin-bottom: 4px;
    font-size: 12px;
  }
  .signatures {
    display: flex;
    justify-content: space-around;
    margin-top: 16px;
    padding-top: 8px;
    font-size: 11px;
  }
  .sig-col {
    text-align: center;
    width: 45%;
  }
  .sig-space {
    height: 48px;
  }
`;

/**
 * 1. Generate Sales Receipt HTML (HÓA ĐƠN BÁN HÀNG / BIÊN LAI THANH TOÁN)
 */
export function generateSalesReceiptHtml(
  data: SalesReceiptPrintData,
  options?: { paperSize?: '58mm' | '80mm' | 'A4' }
): string {
  const storeName = escapeHtml(data.storeName || 'POS & WMS STORE');
  const storeAddress = escapeHtml(data.storeAddress || 'Hệ thống Quản lý Bán hàng & Kho');
  const storePhone = escapeHtml(data.storePhone || 'Hotline: 1900 xxxx');
  const title = escapeHtml(data.title || 'HÓA ĐƠN BÁN HÀNG');
  const receiptNum = escapeHtml(data.receiptNumber || data.invoiceNumber || 'POS-0000');
  const dateTime = escapeHtml(formatPrintDateTime(data.createdAt || data.orderDate || new Date().toISOString()));
  const cashier = escapeHtml(data.cashierName || 'Thu ngân');
  const customer = escapeHtml(data.customerName || 'Khách lẻ');
  const rawPm = data.paymentMethod || 'CASH';
  const paymentMethod = escapeHtml(
    rawPm.toUpperCase().includes('QR')
      ? 'Chuyển khoản QR'
      : rawPm.toUpperCase().includes('CASH') || rawPm.includes('Tiền')
      ? 'Tiền mặt'
      : rawPm
  );

  let rowsHtml = '';
  data.items.forEach((item, index) => {
    const stt = item.stt ?? index + 1;
    const name = escapeHtml(item.productName);
    const barcode = item.barcode ? `<div class="item-barcode">${escapeHtml(item.barcode)}</div>` : '';
    const qty = item.quantity;
    const unitPrice = formatVnd(item.unitPrice);
    const lineTotal = formatVnd(item.lineTotal || (item.quantity * item.unitPrice));

    rowsHtml += `
      <tr>
        <td class="col-stt">${stt}</td>
        <td class="col-name">
          <div class="bold">${name}</div>
          ${barcode}
        </td>
        <td class="col-qty">${qty}</td>
        <td class="col-price">${unitPrice}</td>
        <td class="col-total">${lineTotal}</td>
      </tr>
    `;
  });

  const subtotalFormatted = formatVnd(data.subtotal || data.totalAmount);
  const totalFormatted = formatVnd(data.totalAmount);

  let paymentDetailsHtml = '';
  if (data.customerGivenAmount !== undefined && data.customerGivenAmount > 0) {
    const givenFormatted = formatVnd(data.customerGivenAmount);
    const changeFormatted = formatVnd(data.changeAmount ?? Math.max(0, data.customerGivenAmount - data.totalAmount));
    paymentDetailsHtml = `
      <div class="summary-row">
        <span>Tiền khách đưa:</span>
        <span class="bold">${givenFormatted}</span>
      </div>
      <div class="summary-row">
        <span>Tiền thối lại:</span>
        <span class="bold">${changeFormatted}</span>
      </div>
    `;
  }

  const discountHtml = data.discountTotal && data.discountTotal > 0 ? `
    <div class="summary-row">
      <span>Chiết khấu / Giảm giá:</span>
      <span class="bold">-${formatVnd(data.discountTotal)}</span>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>${title} - ${receiptNum}</title>
        <style>${COMMON_PRINT_CSS}</style>
      </head>
      <body>
        <div class="store-header">
          <div class="store-title">${storeName}</div>
          <div class="store-sub">${storeAddress}</div>
          <div class="store-sub">${storePhone}</div>
          <div class="doc-title">${title}</div>
          <div class="doc-meta">Mã phiếu: <strong>${receiptNum}</strong></div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Thời gian:</span>
            <span class="info-value">${dateTime}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Thu ngân:</span>
            <span class="info-value">${cashier}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Khách hàng:</span>
            <span class="info-value">${customer}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Thanh toán:</span>
            <span class="info-value">${paymentMethod}</span>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th class="col-stt">#</th>
              <th class="col-name">Tên hàng hóa</th>
              <th class="col-qty">SL</th>
              <th class="col-price">Đơn giá</th>
              <th class="col-total">T.Tiền</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-section">
          <div class="summary-row">
            <span>Tổng tiền hàng:</span>
            <span class="bold">${subtotalFormatted}</span>
          </div>
          ${discountHtml}
          <div class="summary-row highlight">
            <span>TỔNG THANH TOÁN:</span>
            <span>${totalFormatted}</span>
          </div>
          ${paymentDetailsHtml}
        </div>

        <div class="footer-section">
          <div class="footer-msg">CẢM ƠN QUÝ KHÁCH &amp; HẸN GẶP LẠI!</div>
          <div>Quý khách vui lòng kiểm tra hóa đơn và hàng hóa trước khi rời quầy.</div>
          ${data.note ? `<div style="margin-top: 4px; font-style: italic;">* ${escapeHtml(data.note)}</div>` : ''}
        </div>
      </body>
    </html>
  `;
}

/**
 * 2. Generate Goods Receipt HTML (PHIẾU NHẬP KHO)
 */
export function generateGoodsReceiptHtml(
  data: GoodsReceiptPrintData,
  options?: { paperSize?: '58mm' | '80mm' | 'A4' }
): string {
  const storeName = escapeHtml(data.storeName || 'POS & WMS SYSTEM');
  const warehouse = escapeHtml(data.warehouseName || 'KHO TỔNG');
  const receiptNum = escapeHtml(data.receiptNumber || 'GR-0000');
  const dateTime = escapeHtml(formatPrintDateTime(data.createdAt || data.receiptDate || new Date().toISOString()));
  const creator = escapeHtml(data.creatorName || 'Thủ kho');
  const supplier = escapeHtml(data.supplierName || 'Nhà cung cấp');
  const remarks = escapeHtml(data.remarks || 'Nhập hàng vào kho');

  let rowsHtml = '';
  data.items.forEach((item, index) => {
    const stt = item.stt ?? index + 1;
    const name = escapeHtml(item.productName);
    const barcode = item.barcode ? `<div class="item-barcode">${escapeHtml(item.barcode)}</div>` : '';
    const qty = item.quantity;
    const cost = formatVnd(item.costPrice);
    const lineTotal = formatVnd(item.lineTotal || (item.quantity * item.costPrice));

    rowsHtml += `
      <tr>
        <td class="col-stt">${stt}</td>
        <td class="col-name">
          <div class="bold">${name}</div>
          ${barcode}
        </td>
        <td class="col-qty">${qty}</td>
        <td class="col-price">${cost}</td>
        <td class="col-total">${lineTotal}</td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>PHIẾU NHẬP KHO - ${receiptNum}</title>
        <style>${COMMON_PRINT_CSS}</style>
      </head>
      <body>
        <div class="store-header">
          <div class="store-title">${storeName}</div>
          <div class="store-sub">Phân hệ Quản lý Kho (${warehouse})</div>
          <div class="doc-title">PHIẾU NHẬP KHO</div>
          <div class="doc-meta">Mã phiếu: <strong>${receiptNum}</strong></div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Thời gian nhập:</span>
            <span class="info-value">${dateTime}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Nhà cung cấp:</span>
            <span class="info-value">${supplier}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Người lập phiếu:</span>
            <span class="info-value">${creator}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Ghi chú:</span>
            <span class="info-value">${remarks}</span>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th class="col-stt">#</th>
              <th class="col-name">Mặt hàng nhập</th>
              <th class="col-qty">SL</th>
              <th class="col-price">Giá nhập</th>
              <th class="col-total">T.Tiền</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-section">
          <div class="summary-row">
            <span>Tổng số lượng nhập:</span>
            <span class="bold">${data.totalQuantity} sản phẩm</span>
          </div>
          <div class="summary-row highlight">
            <span>TỔNG GIÁ TRỊ NHẬP:</span>
            <span>${formatVnd(data.totalAmount)}</span>
          </div>
        </div>

        <div class="signatures">
          <div class="sig-col">
            <div class="bold">Người giao hàng</div>
            <div class="sig-space"></div>
            <div>(Ký, ghi rõ họ tên)</div>
          </div>
          <div class="sig-col">
            <div class="bold">Thủ kho nhận</div>
            <div class="sig-space"></div>
            <div>(Ký, ghi rõ họ tên)</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * 3. Generate Shift Report HTML (BÁO CÁO KẾT CA LÀM VIỆC / Z-REPORT)
 */
export function generateShiftReportHtml(
  data: ShiftReportPrintData,
  options?: { paperSize?: '58mm' | '80mm' | 'A4' }
): string {
  const storeName = escapeHtml(data.storeName || 'POS & WMS STORE');
  const shiftId = escapeHtml(String(data.shiftId));
  const user = escapeHtml(data.userName);
  const roleName = data.role === 'Cashier' ? 'Thu ngân' : data.role === 'WarehouseStaff' ? 'Thủ kho' : 'Quản lý';
  const started = escapeHtml(formatPrintDateTime(data.startedAt));
  const ended = escapeHtml(formatPrintDateTime(data.endedAt || new Date().toISOString()));
  const statusStr = escapeHtml(data.status || 'Đã kết thúc');

  const isWarehouseRole = data.role === 'WarehouseStaff';
  const isCashierRole = data.role === 'Cashier';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>BÁO CÁO KẾT CA #${shiftId}</title>
        <style>
          ${COMMON_PRINT_CSS}
          .section-title {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 10px 0 4px 0;
            padding-bottom: 2px;
            border-bottom: 1px solid #000;
          }
        </style>
      </head>
      <body>
        <div class="store-header">
          <div class="store-title">${storeName}</div>
          <div class="doc-title">BÁO CÁO KẾT CA LÀM VIỆC</div>
          <div class="doc-meta">Mã ca: <strong>#${shiftId}</strong> | Trạng thái: <strong>${escapeHtml(data.status)}</strong></div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Nhân viên:</span>
            <span class="info-value">${user} (${roleName})</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bắt đầu ca:</span>
            <span class="info-value">${started}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Kết thúc ca:</span>
            <span class="info-value">${ended}</span>
          </div>
          ${data.closingRemarks ? `
            <div class="info-row">
              <span class="info-label">Ghi chú kết ca:</span>
              <span class="info-value">${escapeHtml(data.closingRemarks)}</span>
            </div>
          ` : ''}
        </div>

        ${!isWarehouseRole ? `
          <div class="section-title">DOANH THU &amp; GIAO DỊCH BÁN HÀNG</div>
          <div class="info-row">
            <span class="info-label">Tổng số phiếu bán:</span>
            <span class="info-value">${data.orderCount} đơn</span>
          </div>
          <div class="info-row">
            <span class="info-label">Phiếu hoàn tất:</span>
            <span class="info-value">${data.completedOrderCount} đơn</span>
          </div>
          <div class="info-row">
            <span class="info-label">Phiếu hủy:</span>
            <span class="info-value">${data.canceledOrderCount} đơn</span>
          </div>
          <div class="info-row">
            <span class="info-label">Thu tiền mặt:</span>
            <span class="info-value bold">${formatVnd(data.cashRevenue)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Thu chuyển khoản QR:</span>
            <span class="info-value bold">${formatVnd(data.qrRevenue)}</span>
          </div>
          <div class="summary-row highlight">
            <span>TỔNG DOANH THU CA:</span>
            <span>${formatVnd(data.totalRevenue)}</span>
          </div>
        ` : ''}

        ${(isWarehouseRole || data.role === 'Admin' || data.role === 'Manager') ? `
          <div class="section-title">HOẠT ĐỘNG KHO TRONG CA</div>
          <div class="info-row">
            <span class="info-label">Số phiếu nhập kho:</span>
            <span class="info-value">${data.receiptCount ?? 0} phiếu</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tổng số lượng nhập:</span>
            <span class="info-value">${data.receiptQuantityTotal ?? 0} sản phẩm</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tổng tiền nhập hàng:</span>
            <span class="info-value bold">${formatVnd(data.totalReceiptAmount ?? 0)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Điều chỉnh tồn tăng:</span>
            <span class="info-value">+${data.adjustmentIncreaseQuantity ?? 0}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Điều chỉnh tồn giảm:</span>
            <span class="info-value">-${data.adjustmentDecreaseQuantity ?? 0}</span>
          </div>
        ` : ''}

        <div class="section-title">ĐỐI SOÁT ĐỒNG BỘ</div>
        <div class="info-row">
          <span class="info-label">Giao dịch chờ đồng bộ:</span>
          <span class="info-value ${(data.pendingSyncCount ?? 0) > 0 ? 'bold' : ''}">${data.pendingSyncCount ?? 0}</span>
        </div>

        <div class="signatures">
          <div class="sig-col">
            <div class="bold">Nhân viên kết ca</div>
            <div class="sig-space"></div>
            <div>${user}</div>
          </div>
          <div class="sig-col">
            <div class="bold">Quản lý / Người nhận ca</div>
            <div class="sig-space"></div>
            <div>(Ký, ghi rõ họ tên)</div>
          </div>
        </div>
      </body>
    </html>
  `;
}
