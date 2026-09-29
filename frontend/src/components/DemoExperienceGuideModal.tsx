import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDemoSandboxStore } from '@/store/useDemoSandboxStore';
import { useNavigation } from '@react-navigation/native';

interface DemoExperienceGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

interface GuideItem {
  id: string;
  title: string;
  desc: string;
  route: string;
  tabParam?: any;
  icon: keyof typeof Ionicons.glyphMap;
}

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'dashboard',
    title: '1. Xem tổng quan hệ thống',
    desc: 'Khám phá biểu đồ doanh thu, số lượng đơn bán và tồn kho showcase (các số liệu giá vốn nhạy cảm được bảo mật).',
    route: 'Dashboard',
    icon: 'pie-chart-outline',
  },
  {
    id: 'pos',
    title: '2. Thử bán hàng & in hóa đơn',
    desc: 'Tìm kiếm sản phẩm, thêm vào giỏ, chọn phương thức thanh toán và tạo hóa đơn bán hàng thử nghiệm.',
    route: 'POS',
    icon: 'cart-outline',
  },
  {
    id: 'shift',
    title: '3. Thử mở và đóng ca làm việc',
    desc: 'Nhập số tiền đầu ca, theo dõi doanh thu tích lũy và thực hiện kết ca kiểm đếm chênh lệch.',
    route: 'Statistics',
    icon: 'stats-chart-outline',
  },
  {
    id: 'receipt',
    title: '4. Thử lập phiếu nhập kho',
    desc: 'Lập phiếu nhập hàng mô phỏng từ nhà cung cấp với giá mô phỏng, tăng tồn kho trong phạm vi thử nghiệm.',
    route: 'Inventory',
    tabParam: { tab: 'receipts' },
    icon: 'cube-outline',
  },
  {
    id: 'adjust',
    title: '5. Thử điều chỉnh tồn kho',
    desc: 'Chọn sản phẩm và thực hiện tăng hoặc giảm số lượng tồn thử nghiệm kèm lý do điều chỉnh.',
    route: 'Inventory',
    tabParam: { tab: 'products' },
    icon: 'swap-vertical-outline',
  },
  {
    id: 'invoice',
    title: '6. Xem hóa đơn và in ấn',
    desc: 'Xem lại danh sách hóa đơn bán hàng và hóa đơn thử nghiệm',
    route: 'Invoice',
    icon: 'receipt-outline',
  },
  {
    id: 'offline',
    title: '7. Trải nghiệm Offline-first',
    desc: 'Tạo đơn hàng khi mất mạng, dữ liệu lưu an toàn vào SQLite và mô phỏng đồng bộ khi có mạng.',
    route: 'POS',
    icon: 'cloud-offline-outline',
  },
];

export default function DemoExperienceGuideModal({ visible, onClose }: DemoExperienceGuideModalProps) {
  const navigation = useNavigation<any>();
  const completedSteps = useDemoSandboxStore(state => state.completedSteps);
  const markStepCompleted = useDemoSandboxStore(state => state.markStepCompleted);

  const handleNavigate = async (item: GuideItem) => {
    await markStepCompleted(item.id);
    onClose();
    if (item.tabParam) {
      navigation.navigate(item.route, item.tabParam);
    } else {
      navigation.navigate(item.route);
    }
  };

  const completedCount = Object.keys(completedSteps).filter(k => completedSteps[k]).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 3,
            borderColor: '#000000',
            width: '100%',
            maxWidth: 620,
            maxHeight: '90%',
            padding: 22,
            ...Platform.select({
              web: { boxShadow: '4px 4px 0px #000' } as any,
              default: {
                shadowColor: '#000',
                shadowOffset: { width: 4, height: 4 },
                shadowOpacity: 1,
                shadowRadius: 0,
                elevation: 8,
              }
            })
          }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b-2 border-black">
            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-black items-center justify-center mr-2.5">
                <Ionicons name="compass-outline" size={18} color="#fff" />
              </View>
              <View>
                <Text className="text-base sm:text-lg font-black text-black uppercase tracking-tight">
                  Bắt đầu trải nghiệm POS & WMS
                </Text>
                <Text className="text-[11px] font-bold text-gray-500 uppercase">
                  Tiến độ: {completedCount}/{GUIDE_ITEMS.length} chức năng đã thử
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng hướng dẫn" className="p-1">
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Banner */}
          <View className="my-3 bg-blue-50 border border-blue-300 p-2.5 flex-row items-center">
            <Ionicons name="shield-checkmark-outline" size={16} color="#0284c7" style={{ marginRight: 8 }} />
            <Text className="text-[11px] text-blue-900 flex-1 leading-4 font-medium">
              Bạn có thể tự do thử nghiệm các chức năng theo thứ tự tùy ý. Mọi dữ liệu đều được cách ly an toàn trong không gian trải nghiệm.
            </Text>
          </View>

          {/* List */}
          <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
            {GUIDE_ITEMS.map((item) => {
              const isDone = !!completedSteps[item.id];
              return (
                <View
                  key={item.id}
                  className={`p-3.5 mb-2.5 border-2 ${isDone ? 'border-green-600 bg-green-50/50' : 'border-black bg-white'
                    }`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="flex-row items-center flex-1 mr-2">
                      <View
                        className={`w-7 h-7 rounded border items-center justify-center mr-2.5 ${isDone ? 'bg-green-600 border-green-600' : 'bg-gray-100 border-black'
                          }`}
                      >
                        <Ionicons
                          name={isDone ? 'checkmark' : item.icon}
                          size={15}
                          color={isDone ? '#fff' : '#000'}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-black text-black uppercase">
                          {item.title}
                        </Text>
                        <Text className="text-[11px] text-gray-600 mt-0.5 leading-4">
                          {item.desc}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      testID={`guide-btn-${item.id}`}
                      onPress={() => handleNavigate(item)}
                      className={`px-3 py-1.5 border border-black ${isDone ? 'bg-white' : 'bg-black'
                        }`}
                    >
                      <Text
                        className={`text-[10px] font-bold uppercase tracking-wider ${isDone ? 'text-black' : 'text-white'
                          }`}
                      >
                        {isDone ? 'Xem lại' : 'Thử ngay'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View className="pt-3 mt-2 border-t border-gray-200 flex-row justify-end">
            <TouchableOpacity
              onPress={onClose}
              className="px-5 py-2 border border-black bg-white"
            >
              <Text className="text-xs font-bold uppercase tracking-wider text-black">
                Đóng hướng dẫn
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
