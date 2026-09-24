export type UserRole = 'Admin' | 'Manager' | 'Cashier' | 'WarehouseStaff' | 'DemoUser' | 'Demo' | string;

/**
 * Utility chuẩn hóa hiển thị tên vai trò người dùng trong hệ thống POS-WMS.
 * Tránh hiển thị tên enum nội bộ hoặc ánh xạ sai vai trò DemoUser / Demo.
 */
export function getRoleDisplayName(role?: UserRole | string | null): string {
  if (!role) return 'Người dùng';
  switch (role) {
    case 'Admin':
    case 'SystemAdmin':
      return 'Quản trị viên';
    case 'Manager':
      return 'Quản lý';
    case 'Cashier':
      return 'Thu ngân';
    case 'WarehouseStaff':
      return 'Thủ kho';
    case 'DemoUser':
    case 'Demo':
      return 'Tài khoản trải nghiệm';
    default:
      return 'Người dùng';
  }
}

/**
 * Kiểm tra xem vai trò có phải là tài khoản trải nghiệm (DemoUser / Demo) hay không.
 */
export function isDemoRole(role?: string | null): boolean {
  return role === 'DemoUser' || role === 'Demo';
}

/**
 * Helper tập trung kiểm tra xem một đối tượng người dùng hoặc chuỗi role có phải là DemoUser / Demo hay không.
 */
export function isDemoUser(target?: UserRole | string | { role?: string } | null): boolean {
  if (!target) return false;
  if (typeof target === 'string') {
    return target === 'DemoUser' || target === 'Demo';
  }
  if (typeof target === 'object' && 'role' in target) {
    return target.role === 'DemoUser' || target.role === 'Demo';
  }
  return false;
}

/**
 * Guard bảo vệ phía client: Ném lỗi nếu tài khoản DemoUser cố gắng gọi mutation thao tác dữ liệu chính.
 */
export function assertNotDemoUserMutation(actionName: string, target?: any): void {
  if (isDemoUser(target)) {
    throw new Error(`[Bảo vệ Sandbox] Hành động "${actionName}" bị từ chối: Tài khoản DemoUser không được phép thay đổi dữ liệu sản xuất.`);
  }
}
