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
  if (!error.response) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.message?.toLowerCase().includes('timeout')) {
      return {
        type: 'network',
        title: 'Hết thời gian chờ',
        message: 'Kết nối mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.'
      };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        type: 'network',
        title: 'Thiết bị ngoại tuyến',
        message: 'Thiết bị đang ngoại tuyến. Bạn vẫn có thể tiếp tục với các chức năng hỗ trợ ngoại tuyến.'
      };
    }

    return {
      type: 'network',
      title: 'Tạm thời không phản hồi',
      message: 'Hệ thống đang tạm thời không phản hồi. Vui lòng thử lại sau.'
    };
  }

  const status = error.response.status;
  const data = error.response.data || {};
  const correlationId = error.response.headers?.['x-correlation-id'];

  let type: AppError['type'] = 'unknown';
  let title = 'Thông báo';
  let message = data.message || '';
  let fieldErrors: Record<string, string[]> | undefined = undefined;

  if (status === 400) {
    type = 'validation';
    title = 'Thông tin chưa hợp lệ';
    if (data.errors) {
      fieldErrors = data.errors;
      message = 'Vui lòng kiểm tra lại các mục chưa hợp lệ.';
    } else {
      message = data.message || 'Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại.';
    }
  } else if (status === 401) {
    type = 'auth';
    title = 'Phiên đăng nhập hết hạn';
    message = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  } else if (status === 403) {
    type = 'forbidden';
    title = 'Không có quyền thao tác';
    message = 'Bạn không có quyền thực hiện thao tác này.';
  } else if (status === 404) {
    type = 'not_found';
    title = 'Không tìm thấy';
    message = 'Không tìm thấy dữ liệu hoặc chức năng được yêu cầu.';
  } else if (status === 409) {
    type = 'conflict';
    title = 'Không thể đồng bộ dữ liệu';
    message = data.message || 'Dữ liệu trên hệ thống đã được cập nhật từ thiết bị khác. Vui lòng tải lại trước khi tiếp tục.';
  } else if (status === 422) {
    type = 'validation';
    title = 'Thông tin chưa hợp lệ';
    message = 'Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại.';
  } else if (status === 429) {
    type = 'unknown';
    title = 'Thao tác quá nhanh';
    message = 'Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.';
  } else if (status >= 500) {
    type = 'server';
    title = 'Sự cố hệ thống';
    message = 'Hệ thống gặp sự cố khi xử lý yêu cầu. Vui lòng thử lại.';
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

export function classifySyncError(status: number, message: string = ''): { status: string; canRetry: boolean; message: string } {
  const msgLower = (message || '').toLowerCase();
  const isStockConflict = status === 400 && (
    msgLower.includes("tồn kho") || msgLower.includes("stock") || msgLower.includes("insufficient")
  );

  if (isStockConflict) {
    return {
      status: 'NeedsReconciliation',
      canRetry: false,
      message: 'Dữ liệu tồn kho trên hệ thống đã thay đổi. Vui lòng tải lại dữ liệu để đối soát.'
    };
  }
  if (status === 400 || status === 403 || status === 404) {
    return {
      status: 'PermanentFailure',
      canRetry: false,
      message: 'Không thể đồng bộ dữ liệu do thông tin không hợp lệ hoặc thiếu quyền hạn.'
    };
  }
  if (status === 401) {
    return {
      status: 'RetryableError',
      canRetry: true,
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    };
  }
  if (status === 409) {
    return {
      status: 'NeedsReconciliation',
      canRetry: false,
      message: 'Không thể đồng bộ dữ liệu. Dữ liệu trên hệ thống đã được cập nhật từ thiết bị khác. Vui lòng tải lại trước khi tiếp tục.'
    };
  }
  if (status >= 500) {
    return {
      status: 'RetryableError',
      canRetry: true,
      message: 'Dữ liệu chưa được đồng bộ. Hệ thống sẽ tự động thử lại khi kết nối ổn định.'
    };
  }
  return {
    status: 'RetryableError',
    canRetry: true,
    message: 'Dữ liệu chưa được đồng bộ. Hệ thống sẽ tự động thử lại khi kết nối ổn định.'
  };
}
