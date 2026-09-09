import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  RefreshControl
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { getLocalOrders, getLocalOrderDetails, LocalOrderRow } from "@/database/db";
import { getServerReceipts } from "@/services/goodsReceiptApi";
import { useAuthStore } from "@/store/authStore";

type TabType = "sales" | "imports";

export default function InvoiceScreen() {
  const { user } = useAuthStore();
  const role = user?.role || "";
  
  const defaultTab = role === "WarehouseStaff" ? "imports" : "sales";
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  const [orders, setOrders] = useState<LocalOrderRow[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "sales") {
        const data = await getLocalOrders();
        setOrders(data);
      } else {
        const res = await getServerReceipts();
        if (res.isSuccess) setReceipts(res.data);
      }
    } catch (error) {
      if (Platform.OS === "web") window.alert("Lỗi tải dữ liệu hóa đơn");
      else Alert.alert("Lỗi", "Không thể tải dữ liệu hóa đơn");
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeTab]),
  );

  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, order) => sum + order.TotalAmount, 0);
  }, [orders]);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("vi-VN", {
      hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
    });
  };

  const handlePrintInvoice = async (order: LocalOrderRow) => {
    try {
      const details = await getLocalOrderDetails(order.OfflineReferenceId);
      let detailsHtml = "";
      details.forEach((d, idx) => {
        detailsHtml += `<tr><td>${idx + 1}</td><td>${d.ProductName || d.ProductId}</td><td style="text-align: center;">${d.Quantity}</td><td class="price-col">${formatCurrency(d.Price || d.UnitPrice || 0)}</td><td class="price-col">${formatCurrency(d.Quantity * (d.Price || d.UnitPrice || 0))}</td></tr>`;
      });

      const htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <title>POS-WMS INVOICE</title>
            <style>
              body { font-family: monospace; padding: 20px; color: #000; font-size: 14px; max-width: 400px; margin: auto; }
              .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #ccc; }
              .price-col { text-align: right; }
              .total-section { border-top: 2px dashed #000; padding-top: 10px; text-align: right; font-size: 18px; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>POS-WMS STORE</h2>
              <p>Mã HĐ: ${order.OfflineReferenceId.split("_")[1] || order.OfflineReferenceId}</p>
              <p>Ngày: ${formatDate(order.CreatedAt)}</p>
              <p>Thu ngân: ${order.EmployeeName || "Không rõ"}</p>
            </div>
            <table>
              <tr><th>STT</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th class="price-col">Đơn giá</th><th class="price-col">Thành tiền</th></tr>
              ${detailsHtml}
            </table>
            <div class="total-section">Tổng cộng: ${formatCurrency(order.TotalAmount)}</div>
            <p style="text-align: center; margin-top: 20px; font-size: 12px;">CẢM ƠN QUÝ KHÁCH & HẸN GẶP LẠI!</p>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      } else {
        const { printAsync } = require('expo-print');
        await printAsync({ html: htmlContent });
      }
    } catch (e) {
      if (Platform.OS === "web") window.alert("Không thể in hóa đơn.");
      else Alert.alert("Lỗi", "Không thể in hóa đơn.");
    }
  };

  const renderSalesItem = ({ item }: { item: LocalOrderRow }) => (
    <View className="bg-white p-5 mb-4 border-2 border-black">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="font-bold text-lg text-black uppercase tracking-widest">{item.OfflineReferenceId}</Text>
        <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.TotalAmount)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="time-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black font-bold">{formatDate(item.CreatedAt)}</Text>
      </View>
      <View className="flex-row items-center mb-4">
        <Ionicons name="person-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.EmployeeName || `Thu ngân vô danh`}</Text>
      </View>
      <View className="flex-row justify-end border-t-2 border-gray-100 pt-4 mt-2">
        <TouchableOpacity
          className="flex-row items-center bg-black px-4 py-2"
          onPress={() => handlePrintInvoice(item)}
        >
          <Ionicons name="print-outline" size={18} color="#fff" />
          <Text className="text-white font-bold uppercase tracking-widest text-xs ml-2">In hóa đơn</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderImportItem = ({ item }: { item: any }) => (
    <View className="bg-white p-5 mb-4 border-2 border-black">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="font-bold text-lg text-black uppercase tracking-widest">{item.offlineReferenceId || `ID: ${item.id}`}</Text>
        <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.totalAmount)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="time-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black font-bold">{formatDate(item.createdAt)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="business" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.supplier?.name || "Hệ thống (Mặc định)"}</Text>
      </View>
      <View className="flex-row items-center mb-4">
        <Ionicons name="person-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.user?.name || "Người tạo: " + item.userId}</Text>
      </View>
      {item.details && item.details.length > 0 && (
          <View className="mt-2 pt-4 border-t-2 border-dashed border-gray-300">
              <Text className="font-bold text-black mb-3 text-xs uppercase" style={{ letterSpacing: 1 }}>Chi tiết ({item.details.length} sản phẩm)</Text>
              {item.details.map((d: any, idx: number) => (
                  <View key={idx} className="flex-row justify-between items-center mb-2">
                      <Text className="text-black flex-1" numberOfLines={1}>{d.product?.name || `SP ID: ${d.productId}`}</Text>
                      <Text className="text-black font-bold ml-2">x{d.quantity}</Text>
                  </View>
              ))}
          </View>
      )}
    </View>
  );

  const canViewSales = role === "Cashier" || role === "Manager";
  const canViewImports = role === "WarehouseStaff" || role === "Manager";

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-6 pt-5 pb-0 bg-white border-b-4 border-black mb-4">
        <View className="flex-row justify-between items-center mb-4">
          <View>
            <Text style={{ fontFamily: 'serif', fontSize: 36, fontWeight: '900', color: '#000', letterSpacing: -1, textTransform: 'uppercase' }}>
              Hóa đơn
            </Text>
            <Text className="mt-1" style={{ fontSize: 11, letterSpacing: 4, color: '#525252', textTransform: 'uppercase' }}>
              Quản lý chứng từ
            </Text>
          </View>
          <View className="w-12 h-12 border-2 border-black items-center justify-center">
            <Ionicons name="receipt-outline" size={24} color="#000" />
          </View>
        </View>

        {role === "Manager" && (
            <View className="flex-row border-b-2 border-black mt-2">
                <TouchableOpacity 
                    onPress={() => setActiveTab("sales")}
                    className={`flex-1 items-center pb-3 ${activeTab === "sales" ? "border-b-4 border-black" : ""}`}
                >
                    <Text className={`font-bold uppercase tracking-widest text-xs ${activeTab === "sales" ? "text-black" : "text-gray-400"}`}>
                    Hóa đơn bán
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setActiveTab("imports")}
                    className={`flex-1 items-center pb-3 ${activeTab === "imports" ? "border-b-4 border-black" : ""}`}
                >
                    <Text className={`font-bold uppercase tracking-widest text-xs ${activeTab === "imports" ? "text-black" : "text-gray-400"}`}>
                    Hóa đơn nhập
                    </Text>
                </TouchableOpacity>
            </View>
        )}
      </View>

      {activeTab === "sales" && canViewSales && (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.OfflineReferenceId}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderSalesItem}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center mt-20">
              <Ionicons name="document-text-outline" size={64} color="#e5e7eb" />
              <Text className="text-gray-400 mt-4 font-bold" style={{ letterSpacing: 2, textTransform: 'uppercase' }}>Không có hóa đơn bán</Text>
            </View>
          }
        />
      )}

      {activeTab === "imports" && canViewImports && (
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderImportItem}
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center mt-20">
              <Ionicons name="document-text-outline" size={64} color="#e5e7eb" />
              <Text className="text-gray-400 mt-4 font-bold" style={{ letterSpacing: 2, textTransform: 'uppercase' }}>Không có hóa đơn nhập</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
