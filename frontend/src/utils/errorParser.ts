export interface AppError {
  type: 'network' | 'validation' | 'auth' | 'forbidden' | 'not_found' | 'conflict' | 'server' | 'unknown';
  title: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  statusCode?: number;
  errorCode?: string;
  correlationId?: string;
}

/**
 * Safely extract entity ID from various response formats:
 * - Primitive integer (e.g. 51)
 * - ApiResponse<int> (e.g. { isSuccess: true, data: 51 })
 * - Object with id or Id (e.g. { id: 51 } or { Id: 51 })
 * - Nested data object (e.g. { data: { id: 51 } })
 */
export function parseEntityId(response: any): number | null {
  if (response === null || response === undefined) return null;
  if (typeof response === "number" && !isNaN(response)) return response;
  if (typeof response === "string") {
    const parsed = parseInt(response, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (typeof response === "object") {
    if (typeof response.data === "number" && !isNaN(response.data)) {
      return response.data;
    }
    if (typeof response.Data === "number" && !isNaN(response.Data)) {
      return response.Data;
    }
    const candidate =
      response.id ??
      response.Id ??
      response.data?.id ??
      response.data?.Id ??
      response.Data?.id ??
      response.Data?.Id;
    if (candidate !== undefined && candidate !== null) {
      const parsed = Number(candidate);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

export const parseApiError = (error: any): AppError => {
  const defaultMessage = 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.';

  if (!error.response) {
    return {
      type: 'network',
      title: 'Lỗi kết nối',
      message: defaultMessage
    };
  }

  const status = error.response.status;
  const data = error.response.data || {};
  const correlationId = error.response.headers?.['x-correlation-id'];

  let type: AppError['type'] = 'unknown';
  let title = data.title || error.response.statusText || 'Lỗi';
  let message = data.message || '';
  let fieldErrors: Record<string, string[]> | undefined = undefined;

  if (status === 400) {
    type = 'validation';
    title = 'Lỗi Dữ Liệu';
    if (data.errors) {
      fieldErrors = data.errors;
      message = 'Vui lòng kiểm tra lại các trường bị lỗi.';
    } else {
      message = data.message || data.title || 'Dữ liệu không hợp lệ.';
    }
  } else if (status === 401) {
    type = 'auth';
    title = 'Lỗi Xác Thực';
    message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  } else if (status === 403) {
    type = 'forbidden';
    title = 'Lỗi Quyền Hạn';
    message = 'Tài khoản không có quyền thực hiện thao tác này.';
  } else if (status === 404) {
    type = 'not_found';
    title = 'Không Tìm Thấy';
    message = 'Phiên bản máy chủ hiện tại chưa hỗ trợ hoặc tài nguyên không tồn tại.';
  } else if (status === 409) {
    type = 'conflict';
    title = 'Lỗi Xung Đột';
    message = data.message || 'Xung đột dữ liệu.';
  } else if (status >= 500) {
    type = 'server';
    title = 'Lỗi Máy Chủ';
    message = 'Máy chủ gặp lỗi. Mã tra cứu: ' + (correlationId || 'N/A');
  }

  return {
    type,
    title,
    message,
    fieldErrors,
    statusCode: status,
    errorCode: data.errorCode,
    correlationId
  };
};

export function classifySyncError(status: number, message: string = ''): { status: string; canRetry: boolean } {
  const msgLower = (message || '').toLowerCase();
  const isStockConflict = status === 400 && (
    msgLower.includes("tồn kho") || msgLower.includes("stock") || msgLower.includes("insufficient")
  );

  if (isStockConflict) {
    return { status: 'NeedsReconciliation', canRetry: false };
  }
  if (status === 400 || status === 403 || status === 404) {
    return { status: 'PermanentFailure', canRetry: false };
  }
  if (status === 401) {
    return { status: 'RetryableError', canRetry: true };
  }
  if (status >= 500) {
    return { status: 'RetryableError', canRetry: true };
  }
  if (status === 409) {
    return { status: 'NeedsReconciliation', canRetry: false };
  }
  return { status: 'RetryableError', canRetry: true };
}
