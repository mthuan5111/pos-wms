import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDBConnection } from '@/database/db';
import { useModalStore } from '@/store/useModalStore';
import { useAuthStore } from '@/store/authStore';
import { useGlobalSyncStore } from '@/store/useGlobalSyncStore';

interface RecoveryModalProps {
  visible: boolean;
  onClose: () => void;
}

export interface UnownedRecord {
  OfflineReferenceId: string;
  CreatedAt: string;
  TotalAmount: number;
  IsSynced: number;
  DetailCount: number;
  OwnerUserId?: number | null;
  EmployeeName?: string | null;
}

export default function RecoveryModal({ visible, onClose }: RecoveryModalProps) {
  const [unownedRecords, setUnownedRecords] = useState<UnownedRecord[]>([]);
  const { showModal } = useModalStore();
  const user = useAuthStore((s) => s.user);

  // Only Admin should see this modal at all
  const isAdmin = user?.role === "Admin";

  const loadUnownedRecords = async () => {
    if (!isAdmin) return;
    try {
      const db = await getDBConnection();
      const results = await db.getAllAsync<UnownedRecord>(`
        SELECT
          lo.OfflineReferenceId,
          lo.CreatedAt,
          lo.TotalAmount,
          lo.IsSynced,
          lo.OwnerUserId,
          lo.EmployeeName,
          (SELECT COUNT(*) FROM LocalOrderDetails d WHERE d.OfflineReferenceId = lo.OfflineReferenceId) as DetailCount
        FROM LocalOrders lo
        WHERE lo.IsSynced = 0 AND (lo.OwnerUserId IS NULL OR lo.OwnerUserId != ?)
        ORDER BY lo.CreatedAt DESC
      `, [user?.id || 0]);
      setUnownedRecords(results);
    } catch (e) {
      console.error("[RecoveryModal] Load error:", e);
    }
  };

  useEffect(() => {
    if (visible) loadUnownedRecords();
  }, [visible]);

  const handleSync = async (record: UnownedRecord) => {
    try {
      showModal({
        title: "Đang đồng bộ...",
        message: `Đang xử lý đồng bộ đơn hàng ${record.OfflineReferenceId} lên máy chủ...`,
        type: "info"
      });
      await useGlobalSyncStore.getState().syncNow("admin-recovery");
      await loadUnownedRecords();
    } catch (e) {
      showModal({ title: "Lỗi", message: "Đồng bộ thất bại.", type: "error" });
    }
  };

  const handleExport = (record: UnownedRecord) => {
    showModal({
      title: "Xuất dữ liệu",
      message: `OfflineRef: ${record.OfflineReferenceId}\nNhân viên: ${record.EmployeeName || "Không rõ"}\nNgày: ${record.CreatedAt}\nTổng: ${record.TotalAmount}\nChi tiết: ${record.DetailCount} sản phẩm`,
      type: "info"
    });
  };

  const handleAssign = (record: UnownedRecord) => {
    // Admin must confirm before assigning to themselves
    // In future: allow picking a specific active user
    if (!user) return;
    showModal({
      title: "Gán tài khoản",
      message: `Gán record ${record.OfflineReferenceId} cho tài khoản ${user.name} (ID: ${user.id})?\n\nSau khi gán, record sẽ thuộc về tài khoản này nhưng chưa tự động đồng bộ.`,
      type: "confirm",
      onConfirm: async () => {
        try {
          const db = await getDBConnection();
          await db.withTransactionAsync(async () => {
            await db.runAsync(
              'UPDATE LocalOrders SET OwnerUserId = ? WHERE OfflineReferenceId = ? AND OwnerUserId IS NULL',
              [user.id, record.OfflineReferenceId]
            );
          });
          showModal({ title: "Thành công", message: "Đã gán tài khoản. Record chưa tự động đồng bộ.", type: "success" });
          await loadUnownedRecords();
        } catch (e) {
          showModal({ title: "Lỗi", message: "Không thể gán tài khoản.", type: "error" });
        }
      }
    });
  };

  const handleDelete = (record: UnownedRecord) => {
    showModal({
      title: "Xóa bản ghi",
      message: `Xóa vĩnh viễn record ${record.OfflineReferenceId} (${record.DetailCount} sản phẩm)?\n\nThao tác này không thể hoàn tác.`,
      type: "confirm",
      destructive: true,
      onConfirm: async () => {
        try {
          const db = await getDBConnection();
          await db.withTransactionAsync(async () => {
            await db.runAsync(
              'DELETE FROM LocalOrderDetails WHERE OfflineReferenceId = ?',
              [record.OfflineReferenceId]
            );
            await db.runAsync(
              'DELETE FROM LocalOrders WHERE OfflineReferenceId = ? AND OwnerUserId IS NULL',
              [record.OfflineReferenceId]
            );
          });
          showModal({ title: "Thành công", message: "Đã xóa bản ghi.", type: "success" });
          await loadUnownedRecords();
        } catch (e) {
          showModal({ title: "Lỗi", message: "Không thể xóa bản ghi.", type: "error" });
        }
      }
    });
  };

  if (!isAdmin) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: 'white', padding: 18, borderRadius: 2, borderWidth: 2, borderColor: '#000', width: '95%', maxWidth: 540, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text numberOfLines={1} style={{ fontFamily: 'serif', fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase', flex: 1, marginRight: 8 }}>Dữ liệu Offline cần phục hồi</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity>
          </View>

          {unownedRecords.length === 0 ? (
            <Text style={{ textAlign: 'center', marginTop: 20, color: '#525252' }}>Không có dữ liệu cần phục hồi.</Text>
          ) : (
            <FlatList
              data={unownedRecords}
              keyExtractor={(item) => item.OfflineReferenceId}
              renderItem={({ item }) => (
                <View style={{ borderWidth: 1, borderColor: '#000', padding: 12, marginBottom: 10 }}>
                  <Text style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>Ref: {item.OfflineReferenceId}</Text>
                  <Text>Nhân viên lập: {item.EmployeeName || `User #${item.OwnerUserId || 'Chưa gán'}`}</Text>
                  <Text>Ngày tạo: {item.CreatedAt}</Text>
                  <Text>Tổng tiền: {item.TotalAmount.toLocaleString("vi-VN")} ₫</Text>
                  <Text>Số sản phẩm: {item.DetailCount}</Text>
                  <Text>Trạng thái: {item.IsSynced === 1 ? "Đã sync" : "Chưa sync"}</Text>
                  <View style={{ flexDirection: 'row', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity onPress={() => handleSync(item)} style={{ borderWidth: 1, borderColor: '#16a34a', backgroundColor: '#dcfce7', padding: 6 }}><Text style={{ color: '#16a34a', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>ĐỒNG BỘ NGAY</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleExport(item)} style={{ borderWidth: 1, borderColor: '#000', padding: 6 }}><Text style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>XUẤT</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleAssign(item)} style={{ borderWidth: 1, borderColor: '#000', padding: 6, backgroundColor: '#f0f0f0' }}><Text style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>GÁN TÀI KHOẢN</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)} style={{ borderWidth: 1, borderColor: '#dc2626', padding: 6 }}><Text style={{ color: '#dc2626', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>XÓA</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
