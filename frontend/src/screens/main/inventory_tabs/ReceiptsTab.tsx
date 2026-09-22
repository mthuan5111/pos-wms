import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { getDBConnection, insertLocalGoodsReceipt } from "@/database/db";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";
import { useAuthStore } from "@/store/authStore";
import { useModalStore } from "@/store/useModalStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { generateGoodsReceiptHtml } from "@/utils/printTemplates";
import { printDocument } from "@/utils/printService";

export interface LocalGoodsReceiptRow {
  OfflineReferenceId: string;
  TotalAmount: number;
  CreatedAt: string;
  IsSynced: number;
  UserId: number | null;
  SupplierId?: number;
  Remarks?: string;
  SupplierName: string | null;
  ServerId: number | null;
  details?: any[];
}

interface ReceiptItemInput {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
}

export default function ReceiptsTab() {
  const [receipts, setReceipts] = useState<LocalGoodsReceiptRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);

  // Modal create state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [suppliers, setSuppliers] = useState<{ Id: number; Name: string }[]>([]);
  const [products, setProducts] = useState<{ Id: string; Name: string; Price: number; StockQuantity: number }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState<string>("");
  const [receiptItems, setReceiptItems] = useState<ReceiptItemInput[]>([]);
  const [remarks, setRemarks] = useState("");
  const [productSearch, setProductSearch] = useState("");

  // Detail modal state
  const [selectedReceipt, setSelectedReceipt] = useState<LocalGoodsReceiptRow | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const loadReceipts = async () => {
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const rows = await db.getAllAsync<LocalGoodsReceiptRow>(
        "SELECT * FROM LocalGoodsReceipts ORDER BY CreatedAt DESC"
      );

      const prods = await db.getAllAsync<any>("SELECT Id, Name FROM LocalProducts");
      const productMap = new Map(prods.map((p) => [String(p.Id), p.Name]));

      for (let row of rows) {
        const details = await db.getAllAsync<any>(
          "SELECT * FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?",
          [row.OfflineReferenceId]
        );
        row.details = details.map((d) => ({
          ...d,
          ProductName: productMap.get(String(d.ProductId)) || `SP #${d.ProductId}`,
        }));
      }
      setReceipts([...rows]);
    } catch (error) {
      console.error("[ReceiptsTab] Lỗi lấy danh sách phiếu nhập:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const goodsReceiptVersion = useCacheInvalidationStore((state) => state.goodsReceiptVersion);

  useFocusEffect(
    useCallback(() => {
      loadReceipts();
    }, [goodsReceiptVersion])
  );

  const formatCurrency = (amount: number) =>
    (amount || 0).toLocaleString("vi-VN") + " đ";

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("vi-VN");
    } catch {
      return isoStr;
    }
  };

  const handleOpenCreateModal = async () => {
    try {
      const db = await getDBConnection();
      const supRows = await db.getAllAsync<{ Id: number; Name: string }>(
        "SELECT Id, Name FROM LocalSuppliers ORDER BY Name ASC"
      );
      const prodRows = await db.getAllAsync<{ Id: string; Name: string; Price: number; StockQuantity: number }>(
        "SELECT Id, Name, Price, StockQuantity FROM LocalProducts ORDER BY Name ASC"
      );
      setSuppliers(supRows);
      setProducts(prodRows);
      if (supRows.length > 0) {
        setSelectedSupplierId(supRows[0].Id);
        setSelectedSupplierName(supRows[0].Name);
      } else {
        setSelectedSupplierId(null);
        setSelectedSupplierName("");
      }
      setReceiptItems([]);
      setRemarks("");
      setProductSearch("");
      setIsCreateModalOpen(true);
    } catch (err) {
      console.error("[ReceiptsTab] Lỗi chuẩn bị tạo phiếu:", err);
      useModalStore.getState().showModal({
        title: "Lỗi",
        message: "Không thể tải danh mục nhà cung cấp hoặc sản phẩm.",
        type: "error",
      });
    }
  };

  const handleAddProductToReceipt = (prod: { Id: string; Name: string; Price: number }) => {
    const prodIdStr = String(prod.Id);
    const existingIndex = receiptItems.findIndex((i) => String(i.productId) === prodIdStr);
    if (existingIndex >= 0) {
      setReceiptItems(
        receiptItems.map((i, idx) =>
          idx === existingIndex ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setReceiptItems([
        ...receiptItems,
        {
          productId: prodIdStr,
          productName: prod.Name,
          quantity: 1,
          costPrice: Math.round(prod.Price * 0.7), // Default cost price estimate
        },
      ]);
    }
  };

  const handleUpdateItemQuantity = (productId: string, qty: number) => {
    if (qty <= 0) return;
    const prodIdStr = String(productId);
    setReceiptItems(
      receiptItems.map((i) => (String(i.productId) === prodIdStr ? { ...i, quantity: qty } : i))
    );
  };

  const handleUpdateItemCost = (productId: string, cost: number) => {
    if (cost < 0) return;
    const prodIdStr = String(productId);
    setReceiptItems(
      receiptItems.map((i) => (String(i.productId) === prodIdStr ? { ...i, costPrice: cost } : i))
    );
  };

  const handleRemoveItem = (productId: string) => {
    const prodIdStr = String(productId);
    setReceiptItems(receiptItems.filter((i) => String(i.productId) !== prodIdStr));
  };

  const totalReceiptAmount = receiptItems.reduce(
    (sum, item) => sum + item.quantity * item.costPrice,
    0
  );

  const handleSaveReceipt = async () => {
    if (isSubmitting) return;

    if (!selectedSupplierId) {
      useModalStore.getState().showModal({
        title: "Thiếu thông tin",
        message: "Vui lòng chọn Nhà cung cấp.",
        type: "error",
      });
      return;
    }

    if (receiptItems.length === 0) {
      useModalStore.getState().showModal({
        title: "Phiếu trống",
        message: "Vui lòng thêm ít nhất một sản phẩm vào phiếu nhập.",
        type: "error",
      });
      return;
    }

    for (const item of receiptItems) {
      if (item.quantity <= 0) {
        useModalStore.getState().showModal({
          title: "Số lượng không hợp lệ",
          message: `Sản phẩm "${item.productName}" phải có số lượng lớn hơn 0.`,
          type: "error",
        });
        return;
      }
      if (item.costPrice < 0) {
        useModalStore.getState().showModal({
          title: "Giá nhập không hợp lệ",
          message: `Sản phẩm "${item.productName}" không được có giá âm.`,
          type: "error",
        });
        return;
      }
    }

    if (isSubmitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const offlineRefId =
        typeof crypto !== "undefined" && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `GR_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      const currentUserId = user?.id || 1;
      const consolidatedMap = new Map<string, { productId: string; quantity: number; costPrice: number }>();
      for (const item of receiptItems) {
        const pid = String(item.productId);
        if (consolidatedMap.has(pid)) {
          const existing = consolidatedMap.get(pid)!;
          existing.quantity += item.quantity;
        } else {
          consolidatedMap.set(pid, { productId: pid, quantity: item.quantity, costPrice: item.costPrice });
        }
      }
      const finalItems = Array.from(consolidatedMap.values());

      await insertLocalGoodsReceipt(
        offlineRefId,
        selectedSupplierId,
        selectedSupplierName || `NCC #${selectedSupplierId}`,
        currentUserId,
        totalReceiptAmount,
        remarks,
        finalItems
      );

      useCacheInvalidationStore.getState().invalidateGoodsReceipt();
      useCacheInvalidationStore.getState().invalidateInventory();
      useCacheInvalidationStore.getState().invalidateProduct();

      setIsCreateModalOpen(false);
      await loadReceipts();

      // Trigger global background sync immediately
      useGlobalSyncStore.getState().syncNow("goods-receipt-created");

      useModalStore.getState().showModal({
        title: "Thành công",
        message: `Đã tạo phiếu nhập kho ${offlineRefId} thành công.`,
        type: "success",
      });
    } catch (err: any) {
      console.error("[ReceiptsTab] Lỗi khi tạo phiếu nhập kho:", err);
      useModalStore.getState().showModal({
        title: "Lỗi tạo phiếu nhập",
        message: err.message || "Không thể lưu phiếu nhập kho.",
        type: "error",
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handlePrintSelectedReceipt = async () => {
    if (!selectedReceipt) return;
    const items = (selectedReceipt.details && selectedReceipt.details.length > 0)
      ? selectedReceipt.details.map(d => ({
          productName: d.ProductName,
          quantity: d.Quantity,
          costPrice: d.CostPrice,
          lineTotal: d.Quantity * d.CostPrice
        }))
      : [{
          productName: 'Hàng hóa nhập kho',
          quantity: 1,
          costPrice: selectedReceipt.TotalAmount,
          lineTotal: selectedReceipt.TotalAmount
        }];

    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

    const html = generateGoodsReceiptHtml({
      receiptNumber: selectedReceipt.OfflineReferenceId,
      receiptDate: selectedReceipt.CreatedAt,
      supplierName: selectedReceipt.SupplierName || `NCC #${selectedReceipt.SupplierId}`,
      creatorName: user?.name || user?.username || 'Thủ kho',
      remarks: selectedReceipt.Remarks || undefined,
      items,
      totalQuantity: totalQty,
      totalAmount: selectedReceipt.TotalAmount
    }, { paperSize: '80mm' });

    try {
      await printDocument(html, `PhieuNhap_${selectedReceipt.OfflineReferenceId}`);
    } catch (e: any) {
      useModalStore.getState().showModal({
        title: "Thông báo",
        message: "Không thể in phiếu nhập: " + (e.message || ''),
        type: "info"
      });
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.Name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.Id.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <View className="flex-1 bg-white p-4">
      {/* Header bar */}
      <View className="mb-4 flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <View>
          <Text className="font-bold text-black uppercase" style={{ letterSpacing: 1 }}>
            Lịch sử phiếu nhập kho
          </Text>
          <Text className="text-xs text-gray-500 font-bold mt-0.5">
            {receipts.length} phiếu đã ghi nhận
          </Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            testID="create-receipt-btn"
            accessibilityLabel="Tạo phiếu nhập"
            onPress={handleOpenCreateModal}
            className="bg-black px-4 py-2 flex-row items-center flex-1 sm:flex-initial justify-center"
          >
            <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text className="text-white font-bold uppercase text-xs">Tạo phiếu nhập</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate("Settings")}
            className="border-2 border-black px-3 py-2 justify-center items-center"
          >
            <Text className="text-black font-bold uppercase text-xs">Đồng bộ</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Receipts list */}
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.OfflineReferenceId}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshing={isLoading}
        onRefresh={loadReceipts}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setSelectedReceipt(item);
              setIsDetailModalOpen(true);
            }}
            className="bg-white p-4 mb-4 border-2 border-black"
          >
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <View className="flex-1 mr-2">
                <Text className="font-bold text-sm text-black" numberOfLines={1}>
                  {item.OfflineReferenceId}
                </Text>
                {item.ServerId ? (
                  <Text className="text-gray-500 text-xs font-bold">
                    Server ID: #{item.ServerId}
                  </Text>
                ) : null}
              </View>
              <Text className="text-black font-black font-serif text-lg">
                {formatCurrency(item.TotalAmount)}
              </Text>
            </View>

            <View className="flex-row items-center mb-1">
              <Ionicons name="time" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2 font-bold text-xs">{formatDate(item.CreatedAt)}</Text>
            </View>
            <View className="flex-row items-center mb-1">
              <Ionicons name="business" size={14} color="#000" style={{ width: 20 }} />
              <Text className="text-black ml-2 text-xs font-bold">
                {item.SupplierName || `NCC ID: ${item.SupplierId}`}
              </Text>
            </View>

            {item.Remarks ? (
              <View className="flex-row mt-2 p-2 bg-gray-100">
                <Ionicons name="chatbox" size={14} color="#525252" style={{ width: 20 }} />
                <Text className="text-black ml-2 flex-1 italic text-xs">{item.Remarks}</Text>
              </View>
            ) : null}

            {item.details && item.details.length > 0 && (
              <View className="mt-3 border-t border-gray-300 pt-2">
                <Text className="font-bold text-xs uppercase mb-2 text-gray-700">
                  Chi tiết sản phẩm ({item.details.length}):
                </Text>
                {item.details.map((d: any, idx: number) => (
                  <View key={idx} className="flex-row justify-between mb-1">
                    <Text className="text-black text-xs flex-1" numberOfLines={1}>
                      - {d.ProductName}
                    </Text>
                    <Text className="text-black text-xs font-bold w-20 text-right">
                      SL: {d.Quantity}
                    </Text>
                    <Text className="text-gray-600 text-xs w-24 text-right">
                      {formatCurrency(d.CostPrice || 0)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="mt-3 flex-row justify-between items-center border-t border-gray-100 pt-2">
              <Text className="text-xs text-gray-500 italic">Nhấn để xem chi tiết</Text>
              {item.IsSynced === 1 ? (
                <Text className="text-green-700 font-bold text-xs uppercase">
                  <Ionicons name="checkmark-circle" /> Đã đồng bộ
                </Text>
              ) : (
                <Text className="text-red-700 font-bold text-xs uppercase">
                  <Ionicons name="alert-circle" /> Chưa đồng bộ
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="document-text-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: "#000", marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Chưa có phiếu nhập nào</Text>
            <TouchableOpacity
              onPress={handleOpenCreateModal}
              className="mt-4 bg-black px-4 py-2"
            >
              <Text className="text-white font-bold text-xs uppercase">Tạo phiếu nhập ngay</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* MODAL TẠO PHIẾU NHẬP (BUG-GR-001) */}
      <Modal
        visible={isCreateModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !isSubmitting && setIsCreateModalOpen(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-full max-w-2xl max-h-[90%] border-2 border-black flex-col">
            {/* Header */}
            <View className="bg-black p-4 flex-row justify-between items-center">
              <View>
                <Text className="text-white font-bold uppercase tracking-wider text-sm">
                  Lập Phiếu Nhập Kho
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  Nhập nhiều sản phẩm, tăng kho tự động
                </Text>
              </View>
              <TouchableOpacity
                disabled={isSubmitting}
                onPress={() => setIsCreateModalOpen(false)}
                className="p-1"
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView className="p-4 flex-1" showsVerticalScrollIndicator={false}>
              {/* Chọn Nhà cung cấp */}
              <Text className="font-bold text-xs uppercase tracking-wider text-black mb-2">
                1. Chọn Nhà cung cấp (*)
              </Text>
              {suppliers.length === 0 ? (
                <View className="p-3 bg-red-50 border border-red-400 mb-4">
                  <Text className="text-xs text-red-600 font-bold">
                    Chưa có nhà cung cấp nào. Vui lòng tạo nhà cung cấp trước.
                  </Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                  <View className="flex-row gap-2">
                    {suppliers.map((s) => {
                      const isSelected = selectedSupplierId === s.Id;
                      return (
                        <TouchableOpacity
                          key={s.Id}
                          testID={`supplier-select-${s.Id}`}
                          onPress={() => {
                            setSelectedSupplierId(s.Id);
                            setSelectedSupplierName(s.Name);
                          }}
                          className={`px-3 py-2 border-2 ${
                            isSelected ? "border-black bg-black" : "border-gray-300 bg-white"
                          }`}
                        >
                          <Text
                            className={`font-bold text-xs ${
                              isSelected ? "text-white" : "text-black"
                            }`}
                          >
                            {s.Name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Tìm và thêm sản phẩm */}
              <Text className="font-bold text-xs uppercase tracking-wider text-black mb-2">
                2. Chọn Sản phẩm nhập (*)
              </Text>
              <View className="flex-row items-center border border-black px-3 py-1.5 mb-2">
                <Ionicons name="search" size={16} color="#000" style={{ marginRight: 6 }} />
                <TextInput
                  placeholder="Tìm theo tên hoặc barcode..."
                  placeholderTextColor="#737373"
                  value={productSearch}
                  onChangeText={setProductSearch}
                  className="flex-1 text-xs py-1"
                />
                {productSearch ? (
                  <TouchableOpacity onPress={() => setProductSearch("")}>
                    <Ionicons name="close-circle" size={16} color="#737373" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Danh sách gợi ý SP */}
              <View className="max-h-36 border border-gray-200 mb-4">
                <ScrollView nestedScrollEnabled>
                  {filteredProducts.slice(0, 8).map((p) => {
                    const isAdded = receiptItems.some((i) => i.productId === p.Id);
                    return (
                      <TouchableOpacity
                        key={p.Id}
                        testID={`receipt-prod-option-${p.Id}`}
                        onPress={() => handleAddProductToReceipt(p)}
                        className={`flex-row justify-between items-center p-2 border-b border-gray-100 ${
                          isAdded ? "bg-gray-50" : "bg-white"
                        }`}
                      >
                        <View className="flex-1 mr-2">
                          <Text className="font-bold text-xs text-black" numberOfLines={1}>
                            {p.Name}
                          </Text>
                          <Text className="text-gray-500 text-[10px]">
                            Tồn: {p.StockQuantity} | Giá bán: {formatCurrency(p.Price)}
                          </Text>
                        </View>
                        <View className="bg-black px-2 py-1">
                          <Text className="text-white text-[10px] font-bold uppercase">
                            {isAdded ? "+ Thêm" : "Chọn"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <View className="p-3 items-center">
                      <Text className="text-xs text-gray-500">Không tìm thấy sản phẩm phù hợp</Text>
                    </View>
                  )}
                </ScrollView>
              </View>

              {/* Danh sách sản phẩm trong phiếu */}
              <Text className="font-bold text-xs uppercase tracking-wider text-black mb-2">
                3. Danh sách dòng nhập ({receiptItems.length} sản phẩm)
              </Text>
              {receiptItems.length === 0 ? (
                <View className="p-4 border-2 border-dashed border-gray-300 items-center mb-4">
                  <Text className="text-xs text-gray-500 font-bold">
                    Chưa có sản phẩm nào được thêm vào phiếu
                  </Text>
                  <Text className="text-[10px] text-gray-400 mt-1">
                    Nhấn vào sản phẩm ở trên để thêm
                  </Text>
                </View>
              ) : (
                <View className="mb-4">
                  {receiptItems.map((item, idx) => (
                    <View
                      key={item.productId}
                      className="border border-black p-3 mb-2 bg-gray-50"
                    >
                      <View className="flex-row justify-between items-start mb-2">
                        <Text className="font-bold text-xs text-black flex-1 mr-2">
                          {idx + 1}. {item.productName}
                        </Text>
                        <TouchableOpacity
                          testID={`remove-line-${item.productId}`}
                          accessibilityLabel={`remove-line-${item.productId}`}
                          onPress={() => handleRemoveItem(item.productId)}
                          className="p-1"
                        >
                          <Ionicons name="trash-outline" size={16} color="#dc2626" />
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row gap-2 items-center">
                        <View className="flex-1">
                          <Text className="text-[10px] font-bold text-gray-600 mb-1">
                            SỐ LƯỢNG
                          </Text>
                          <TextInput
                            keyboardType="numeric"
                            value={String(item.quantity)}
                            onChangeText={(txt) => {
                              const q = parseInt(txt.replace(/\D/g, ""), 10) || 0;
                              handleUpdateItemQuantity(item.productId, q);
                            }}
                            className="border border-black bg-white px-2 py-1 text-xs font-bold text-black"
                          />
                        </View>

                        <View className="flex-[1.5]">
                          <Text className="text-[10px] font-bold text-gray-600 mb-1">
                            ĐƠN GIÁ NHẬP (Đ)
                          </Text>
                          <TextInput
                            keyboardType="numeric"
                            value={String(item.costPrice)}
                            onChangeText={(txt) => {
                              const c = parseInt(txt.replace(/\D/g, ""), 10) || 0;
                              handleUpdateItemCost(item.productId, c);
                            }}
                            className="border border-black bg-white px-2 py-1 text-xs font-bold text-black"
                          />
                        </View>

                        <View className="flex-1 items-end justify-center pt-3">
                          <Text className="text-[10px] text-gray-500 font-bold">THÀNH TIỀN</Text>
                          <Text className="text-xs font-black text-black">
                            {formatCurrency(item.quantity * item.costPrice)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Ghi chú */}
              <Text className="font-bold text-xs uppercase tracking-wider text-black mb-1">
                4. Ghi chú phiếu nhập
              </Text>
              <TextInput
                placeholder="Ghi chú thêm (số hóa đơn VAT, xe vận chuyển...)"
                placeholderTextColor="#737373"
                value={remarks}
                onChangeText={setRemarks}
                className="border border-black p-2 text-xs mb-4"
              />

              {/* Tổng tiền */}
              <View className="border-t-2 border-black pt-3 pb-4 flex-row justify-between items-center">
                <Text className="font-black uppercase text-xs tracking-wider text-black">
                  TỔNG CỘNG TIỀN HÀNG:
                </Text>
                <Text className="font-black font-serif text-xl text-black">
                  {formatCurrency(totalReceiptAmount)}
                </Text>
              </View>
            </ScrollView>

            {/* Actions */}
            <View className="p-4 border-t-2 border-black flex-row gap-2 justify-end bg-gray-50">
              <TouchableOpacity
                disabled={isSubmitting}
                onPress={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 border border-black bg-white"
              >
                <Text className="font-bold text-xs uppercase text-black">Hủy bỏ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="submit-receipt-btn"
                accessibilityLabel="submit-receipt-btn"
                disabled={isSubmitting}
                onPress={handleSaveReceipt}
                className={`px-6 py-2 bg-black flex-row items-center ${
                  isSubmitting ? "opacity-60" : ""
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 4 }} />
                )}
                <Text className="font-bold text-xs uppercase text-white">
                  {isSubmitting ? "Đang lưu..." : "Xác nhận nhập kho"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CHI TIẾT PHIẾU NHẬP (BUG-GR-002) */}
      <Modal
        visible={isDetailModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-full max-w-xl max-h-[85%] border-2 border-black flex-col">
            <View className="bg-black p-4 flex-row justify-between items-center">
              <View>
                <Text className="text-white font-bold uppercase tracking-wider text-sm">
                  Chi Tiết Phiếu Nhập Kho
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {selectedReceipt?.OfflineReferenceId}
                </Text>
              </View>
              <TouchableOpacity
                testID="close-receipt-detail"
                accessibilityLabel="close-receipt-detail"
                onPress={() => setIsDetailModalOpen(false)}
                className="p-1"
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView className="p-4 flex-1">
              <View className="mb-4 pb-3 border-b border-gray-200">
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-500 text-xs font-bold">Ngày lập:</Text>
                  <Text className="text-black text-xs font-bold">
                    {selectedReceipt ? formatDate(selectedReceipt.CreatedAt) : ""}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-500 text-xs font-bold">Nhà cung cấp:</Text>
                  <Text className="text-black text-xs font-bold">
                    {selectedReceipt?.SupplierName || `NCC #${selectedReceipt?.SupplierId}`}
                  </Text>
                </View>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-gray-500 text-xs font-bold">Trạng thái đồng bộ:</Text>
                  <Text
                    className={`text-xs font-black uppercase ${
                      selectedReceipt?.IsSynced === 1 ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {selectedReceipt?.IsSynced === 1 ? "Đã đồng bộ lên máy chủ" : "Chưa đồng bộ (Local)"}
                  </Text>
                </View>
                {selectedReceipt?.Remarks ? (
                  <View className="mt-2 p-2 bg-gray-100">
                    <Text className="text-xs text-gray-700 italic">
                      Ghi chú: {selectedReceipt.Remarks}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text className="font-bold text-xs uppercase tracking-wider text-black mb-2">
                Danh mục mặt hàng nhập kho:
              </Text>
              <View className="border border-black mb-4">
                <View className="flex-row bg-gray-100 p-2 border-b border-black">
                  <Text className="font-bold text-[10px] uppercase text-black flex-1">
                    Sản phẩm
                  </Text>
                  <Text className="font-bold text-[10px] uppercase text-black w-14 text-right">
                    Số lượng
                  </Text>
                  <Text className="font-bold text-[10px] uppercase text-black w-24 text-right">
                    Giá nhập
                  </Text>
                  <Text className="font-bold text-[10px] uppercase text-black w-24 text-right">
                    Thành tiền
                  </Text>
                </View>
                {selectedReceipt?.details?.map((d, i) => (
                  <View
                    key={i}
                    className="flex-row p-2 border-b border-gray-200 items-center"
                  >
                    <Text className="text-xs text-black flex-1" numberOfLines={2}>
                      {d.ProductName}
                    </Text>
                    <Text className="text-xs font-bold text-black w-14 text-right">
                      {d.Quantity}
                    </Text>
                    <Text className="text-xs text-gray-600 w-24 text-right">
                      {formatCurrency(d.CostPrice)}
                    </Text>
                    <Text className="text-xs font-black text-black w-24 text-right">
                      {formatCurrency(d.Quantity * d.CostPrice)}
                    </Text>
                  </View>
                ))}
              </View>

              <View className="flex-row justify-between items-center p-3 bg-gray-50 border border-black">
                <Text className="font-bold uppercase text-xs text-black">TỔNG CỘNG:</Text>
                <Text className="font-black font-serif text-lg text-black">
                  {selectedReceipt ? formatCurrency(selectedReceipt.TotalAmount) : "0 đ"}
                </Text>
              </View>
            </ScrollView>

            <View className="p-3 border-t border-gray-200 flex-row justify-end gap-2">
              <TouchableOpacity
                onPress={() => setIsDetailModalOpen(false)}
                className="border-2 border-gray-400 px-4 py-2"
              >
                <Text className="text-black font-bold text-xs uppercase">Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="btn-print-receipt-tab"
                onPress={handlePrintSelectedReceipt}
                className="bg-black px-4 py-2 flex-row items-center"
              >
                <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text className="text-white font-bold text-xs uppercase">In phiếu nhập</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
