/**
 * Centralized Timezone and Date Formatter for Asia/Ho_Chi_Minh
 * Ensures all UTC ISO strings or Date instances are consistently formatted to Vietnam local time
 * regardless of client device/browser timezone.
 */

export const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function parseUtcDate(input: string | Date | number | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    let s = input.trim();
    if (!s) return null;
    // If string has no timezone indicator (no 'Z' and no '+' or '-'), treat as UTC ISO
    if (!s.endsWith('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(s)) {
      s += 'Z';
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatVietnamDateTime(
  input: string | Date | number | null | undefined,
  fallback: string = '--'
): string {
  const d = parseUtcDate(input);
  if (!d) return fallback;
  try {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: VIETNAM_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    let day = '', month = '', year = '', hour = '', minute = '';
    for (const part of parts) {
      if (part.type === 'day') day = part.value;
      if (part.type === 'month') month = part.value;
      if (part.type === 'year') year = part.value;
      if (part.type === 'hour') hour = part.value;
      if (part.type === 'minute') minute = part.value;
    }
    if (day && month && year && hour && minute) {
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    return formatter.format(d);
  } catch {
    return fallback;
  }
}

export function formatVietnamDate(
  input: string | Date | number | null | undefined,
  fallback: string = '--'
): string {
  const d = parseUtcDate(input);
  if (!d) return fallback;
  try {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: VIETNAM_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    let day = '', month = '', year = '';
    for (const part of parts) {
      if (part.type === 'day') day = part.value;
      if (part.type === 'month') month = part.value;
      if (part.type === 'year') year = part.value;
    }
    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }
    return formatter.format(d);
  } catch {
    return fallback;
  }
}

export function formatVietnamTime(
  input: string | Date | number | null | undefined,
  fallback: string = '--'
): string {
  const d = parseUtcDate(input);
  if (!d) return fallback;
  try {
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      timeZone: VIETNAM_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    let hour = '', minute = '';
    for (const part of parts) {
      if (part.type === 'hour') hour = part.value;
      if (part.type === 'minute') minute = part.value;
    }
    if (hour && minute) {
      return `${hour}:${minute}`;
    }
    return formatter.format(d);
  } catch {
    return fallback;
  }
}

export function getVietnamDateParts(d: Date = new Date()): { year: number; month: number; day: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: VIETNAM_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
    const parts = formatter.formatToParts(d);
    let year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate();
    for (const p of parts) {
      if (p.type === 'year') year = parseInt(p.value, 10);
      if (p.type === 'month') month = parseInt(p.value, 10);
      if (p.type === 'day') day = parseInt(p.value, 10);
    }
    return { year, month, day };
  } catch {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
}

/**
 * Converts a Vietnam local calendar date (YYYY-MM-DD) into UTC ISO range:
 * - startUtc: 00:00:00 Asia/Ho_Chi_Minh in UTC (offset -7 hours)
 * - endUtc: next day 00:00:00 Asia/Ho_Chi_Minh in UTC
 */
export function getVietnamDayRangeUtc(vietnamDateStr: string) {
  const [y, m, d] = vietnamDateStr.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 3600 * 1000);
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 7 * 3600 * 1000);
  return {
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString()
  };
}

/**
 * Returns UTC ISO date strings for standard Vietnam periods:
 * 'today' | '7days' | '30days'
 */
export function getVietnamPeriodRangesUtc(period: 'today' | '7days' | '30days') {
  const now = new Date();
  const { year, month, day } = getVietnamDateParts(now);
  const todayStartUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 7 * 3600 * 1000);
  const nowUtc = now;

  if (period === 'today') {
    const prevStartUtc = new Date(todayStartUtc.getTime() - 24 * 3600 * 1000);
    const prevEndUtc = todayStartUtc;
    return {
      currentStartStr: todayStartUtc.toISOString(),
      currentEndStr: nowUtc.toISOString(),
      previousStartStr: prevStartUtc.toISOString(),
      previousEndStr: prevEndUtc.toISOString()
    };
  } else if (period === '7days') {
    const currentStartUtc = new Date(todayStartUtc.getTime() - 7 * 24 * 3600 * 1000);
    const prevStartUtc = new Date(currentStartUtc.getTime() - 7 * 24 * 3600 * 1000);
    const prevEndUtc = currentStartUtc;
    return {
      currentStartStr: currentStartUtc.toISOString(),
      currentEndStr: nowUtc.toISOString(),
      previousStartStr: prevStartUtc.toISOString(),
      previousEndStr: prevEndUtc.toISOString()
    };
  } else {
    // 30days
    const currentStartUtc = new Date(todayStartUtc.getTime() - 30 * 24 * 3600 * 1000);
    const prevStartUtc = new Date(currentStartUtc.getTime() - 30 * 24 * 3600 * 1000);
    const prevEndUtc = currentStartUtc;
    return {
      currentStartStr: currentStartUtc.toISOString(),
      currentEndStr: nowUtc.toISOString(),
      previousStartStr: prevStartUtc.toISOString(),
      previousEndStr: prevEndUtc.toISOString()
    };
  }
}

