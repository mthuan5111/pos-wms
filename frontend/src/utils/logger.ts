/**
 * Trình ghi log tập trung chuyên nghiệp (Structured Logger)
 * - Tự động tắt debug trong production
 * - Khử khuẩn dữ liệu nhạy cảm (Tokens, Passwords, Secrets, Connection Strings, Cookies)
 * - Bảo vệ thông điệp (message và error.message) không lộ secret hoặc JWT
 * - Chống crash do circular reference
 * - Bảo đảm không che nhầm các thuộc tính vô hại (keyboardType, cacheKey, listKey...)
 */

const SAFE_KEY_SUBSTRINGS = [
  'keyboardtype',
  'cachekey',
  'listkey',
  'itemkey',
  'sortkey',
  'pagekey',
  'rowkey',
  'columnkey',
  'keyextractor',
  'publickey',
];

const SENSITIVE_SUBSTRINGS = [
  'password',
  'passwd',
  'secret',
  'apikey',
  'privatekey',
  'authorization',
  'cookie',
  'setcookie',
  'accesstoken',
  'refreshtoken',
  'connectionstring',
];

function isSensitiveKey(rawKey: string): boolean {
  const normalized = rawKey.toLowerCase().replace(/[-_]/g, '');

  // Không che các thuộc tính UI và kỹ thuật an toàn
  if (SAFE_KEY_SUBSTRINGS.some(safe => normalized.includes(safe))) {
    return false;
  }

  // Khớp chính xác hoặc khớp từ khóa đặc biệt
  if (
    normalized === 'key' ||
    normalized === 'jwtkey' ||
    normalized === 'secretkey' ||
    normalized === 'apikey' ||
    normalized === 'privatekey'
  ) {
    return true;
  }

  // Khớp từ khóa token tổng quát (nhưng không phải tokenizer)
  if (normalized.includes('token') && !normalized.includes('tokenize')) {
    return true;
  }

  return SENSITIVE_SUBSTRINGS.some(s => normalized.includes(s));
}

/**
 * Khử khuẩn chuỗi văn bản:
 * - Che JWT nằm giữa chuỗi (dù có hoặc không có prefix Bearer)
 * - Che Bearer tokens
 * - Che token hoặc credentials trong query string của URL
 * - Che thông tin xác thực Basic Auth trong URL
 */
export function sanitizeString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;

  // 1. Che Bearer token
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');

  // 2. Che JWT token (dạng eyJhbGci... hoặc tương tự) ở bất kỳ đâu trong chuỗi
  sanitized = sanitized.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]');

  // 3. Che token/password/secret trong query string
  sanitized = sanitized.replace(
    /([?&](?:access_token|refresh_token|token|api_key|apiKey|secret|password|pwd)=)[^&\s]+/gi,
    '$1[REDACTED]'
  );

  // 4. Che thông tin đăng nhập trong URL dạng http(s)://user:password@host
  sanitized = sanitized.replace(/(https?:\/\/)([^:\/\s]+):([^@\/\s]+)@/g, '$1$2:[REDACTED]@');

  return sanitized;
}

export function sanitizeValue(value: any, depth = 0, seen = new WeakSet()): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return '[Max Depth Exceeded]';

  if (typeof value === 'object') {
    // Chống lặp vòng (Circular reference)
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item, depth + 1, seen));
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: sanitizeString(value.message),
        stack: __DEV__ ? sanitizeString(value.stack || '') : undefined,
      };
    }

    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(value[key], depth + 1, seen);
      }
    }
    return sanitized;
  }

  return String(value);
}

export const logger = {
  debug(module: string, message: string, data?: any) {
    if (!__DEV__) return;
    const cleanMsg = sanitizeString(message);
    if (data !== undefined) {
      console.log(`[DEBUG][${module}] ${cleanMsg}`, sanitizeValue(data));
    } else {
      console.log(`[DEBUG][${module}] ${cleanMsg}`);
    }
  },

  info(module: string, message: string, data?: any) {
    const cleanMsg = sanitizeString(message);
    if (data !== undefined) {
      console.log(`[INFO][${module}] ${cleanMsg}`, sanitizeValue(data));
    } else {
      console.log(`[INFO][${module}] ${cleanMsg}`);
    }
  },

  warn(module: string, message: string, data?: any) {
    const cleanMsg = sanitizeString(message);
    if (data !== undefined) {
      console.warn(`[WARN][${module}] ${cleanMsg}`, sanitizeValue(data));
    } else {
      console.warn(`[WARN][${module}] ${cleanMsg}`);
    }
  },

  error(module: string, message: string, error?: any, data?: any) {
    const cleanMsg = sanitizeString(message);
    const sanitizedData = data !== undefined ? sanitizeValue(data) : undefined;
    const sanitizedError = sanitizeValue(error);

    if (__DEV__) {
      console.error(`[ERROR][${module}] ${cleanMsg}`, sanitizedError, sanitizedData || '');
    } else {
      // In production, keep log concise and sanitized without leaking full stack traces or secrets
      let errMsg = 'Chi tiết lỗi đã được ghi nhận';
      if (error instanceof Error) {
        errMsg = sanitizeString(error.message);
      } else if (typeof error === 'string') {
        errMsg = sanitizeString(error);
      } else if (sanitizedError && typeof sanitizedError === 'object' && sanitizedError.message) {
        errMsg = sanitizeString(sanitizedError.message);
      }

      console.error(`[ERROR][${module}] ${cleanMsg}: ${errMsg}`);
    }
  }
};
