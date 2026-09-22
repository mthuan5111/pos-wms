import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";
import { getDBConnection, insertLocalGoodsReceipt } from "@/database/db";
import { getServerOrders } from "@/services/orderApi";
import { getServerReceipts } from "@/services/goodsReceiptApi";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useModalStore } from "@/store/useModalStore";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";
import { formatVietnamDateTime } from "@/utils/timezone";
import { generateSalesReceiptHtml, generateGoodsReceiptHtml } from "@/utils/printTemplates";
import { printDocument } from "@/utils/printService";

type TabType = "sales" | "imports";

export interface MergedOrder {
  key: string;
  id: string;
  offlineId: string;
  totalAmount: number;
  date: string;
  employee: string;
  paymentMethod: string;
  status: string;
  isSynced: boolean;
  serverId?: number;
  details?: { productName: string; barcode: string; quantity: number; unitPrice: number }[];
}

export interface MergedReceipt {
  key: string;
  id: string;
  offlineId: string;
  totalAmount: number;
  date: string;
  creator: string;
  supplier: string;
  remarks?: string;
  status: string;
  isSynced: boolean;
  serverId?: number;
  details?: { productName: string; barcode: string; quantity: number; costPrice: number }[];
}

export interface LocalOrderRow {
  OfflineReferenceId: string;
  TotalAmount: number;
  CreatedAt: string;
  IsSynced: number;
  EmployeeName: string;
  PaymentMethod: string;
  ServerId: number | null;
  OwnerUserId: number | null;
}

export interface ServerOrderDto {
  id: number;
  offlineReferenceId: string | null;
  totalAmount: number;
  orderDate: string;
  paymentMethod?: string;
  status?: number;
  userId: number | null;
  employee?: { name: string } | null;
  userName?: string;
  details?: any[];
}

export interface LocalGoodsReceiptRow {
  OfflineReferenceId: string;
  TotalAmount: number;
  CreatedAt: string;
  IsSynced: number;
  UserId: number | null;
  SupplierName: string | null;
  Remarks: string | null;
  ServerId: number | null;
}

export interface ServerGoodsReceiptDto {
  id: number;
  offlineReferenceId: string | null;
  totalAmount: number;
  receiptDate?: string;
  createdAt?: string;
  userId: number | null;
  remarks?: string;
  user?: { name: string } | null;
  userName?: string;
  supplier?: { name: string } | null;
  supplierName?: string;
  details?: any[];
}

export default function InvoiceScreen() {
  const { user } = useAuthStore();
  const role = user?.role || "";
  const route = useRoute<any>();

  const defaultTab: TabType = role === "WarehouseStaff" ? "imports" : "sales";
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  const [orders, setOrders] = useState<MergedOrder[]>([]);
  const [receipts, setReceipts] = useState<MergedReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { pendingCount } = useGlobalSyncStore();
  const { goodsReceiptVersion, orderVersion } = useCacheInvalidationStore();

  // Detail Modals
  const [selectedOrder, setSelectedOrder] = useState<MergedOrder | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<MergedReceipt | null>(null);

  // Create Receipt Modal
  const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);
  const [availableSuppliers, setAvailableSuppliers] = useState<{ Id: number; Name: string }[]>([]);
  const [availableProducts, setAvailableProducts] = useState<{ Id: string; Name: string; Price: number; Barcode?: string }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [receiptItems, setReceiptItems] = useState<{
    productId: string;
    productName: string;
    barcode: string;
    quantity: number;
    quantityStr?: string;
    costPrice: number;
    costPriceStr?: string;
    error?: string;
  }[]>([]);
  const [receiptFormErrors, setReceiptFormErrors] = useState<{ supplier?: string; items?: string }>({});
  const [receiptRemarks, setReceiptRemarks] = useState("");
  const [receiptProdSearch, setReceiptProdSearch] = useState("");

  const formatCurrency = (amount: number) => {
    return (amount || 0).toLocaleString("vi-VN") + " ₫";
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const db = await getDBConnection();

      // Product map for detail names
      const localProds = await db.getAllAsync<any>("SELECT Id, Name, Barcode, Price FROM LocalProducts");
      const prodNameMap = new Map<string, { name: string; barcode: string; price: number }>(
        localProds.map(p => [String(p.Id), { name: p.Name, barcode: p.Barcode || "", price: p.Price || 0 }])
      );

      if (activeTab === "sales") {
        let localOrders: LocalOrderRow[] = [];
        if (role === "Cashier") {
          localOrders = await db.getAllAsync<LocalOrderRow>(
            "SELECT * FROM LocalOrders WHERE OwnerUserId = ? ORDER BY CreatedAt DESC",
            [user?.id || 0]
          );
        } else {
          localOrders = await db.getAllAsync<LocalOrderRow>(
            "SELECT * FROM LocalOrders ORDER BY CreatedAt DESC"
          );
        }

        let serverData: ServerOrderDto[] = [];
        try {
          const res = await getServerOrders();
          if (res.isSuccess) serverData = res.data;
        } catch (e) {
          console.warn("Could not fetch server orders");
        }

        const result: MergedOrder[] = [];
        const knownServerIds = new Set<number>();
        const knownOfflineIds = new Set<string>();

        // Server records
        for (const so of serverData) {
          knownServerIds.add(so.id);
          if (so.offlineReferenceId) {
            knownOfflineIds.add(so.offlineReferenceId);
          }
          result.push({
            key: `server:${so.id}`,
            id: so.id.toString(),
            offlineId: so.offlineReferenceId || `SRV_${so.id}`,
            totalAmount: so.totalAmount,
            date: so.orderDate,
            employee: so.employee?.name || so.userName || `User #${so.userId}`,
            paymentMethod: so.paymentMethod === 'QR' || so.paymentMethod === 'VIETQR' ? 'Chuyển khoản QR' : 'Tiền mặt',
            status: 'Hoàn thành',
            isSynced: true,
            serverId: so.id,
            details: (so.details || []).map(d => ({
              productName: d.productName || d.ProductName || d.product?.name || `SP #${d.productId || d.ProductId}`,
              barcode: d.barcode || d.Barcode || d.product?.barcode || "",
              quantity: d.quantity ?? d.Quantity ?? 1,
              unitPrice: d.unitPrice ?? d.UnitPrice ?? d.price ?? d.Price ?? 0
            }))
          });
        }

        // Local records
        for (const lo of localOrders) {
          if (knownOfflineIds.has(lo.OfflineReferenceId)) continue;
          if (lo.ServerId && knownServerIds.has(lo.ServerId)) continue;

          let localDetails: any[] = [];
          try {
            const detailRows = await db.getAllAsync<any>(
              "SELECT ProductId, Quantity, Price FROM LocalOrderDetails WHERE OfflineReferenceId = ?",
              [lo.OfflineReferenceId]
            );
            localDetails = detailRows.map(d => ({
              productName: prodNameMap.get(String(d.ProductId))?.name || `SP #${d.ProductId}`,
              barcode: prodNameMap.get(String(d.ProductId))?.barcode || "",
              quantity: d.Quantity,
              unitPrice: d.Price
            }));
          } catch {}

          result.push({
            key: `offline:${lo.OfflineReferenceId}`,
            id: lo.OfflineReferenceId,
            offlineId: lo.OfflineReferenceId,
            totalAmount: lo.TotalAmount,
            date: lo.CreatedAt,
            employee: lo.EmployeeName || `User #${lo.OwnerUserId}`,
            paymentMethod: lo.PaymentMethod === 'QR' || lo.PaymentMethod === 'VIETQR' ? 'Chuyển khoản QR' : 'Tiền mặt',
            status: 'Hoàn thành',
            isSynced: lo.IsSynced === 1 || !!lo.ServerId,
            serverId: lo.ServerId || undefined,
            details: localDetails
          });
        }

        result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setOrders(result);
      } else {
        let localReceipts: LocalGoodsReceiptRow[] = [];
        if (role === "WarehouseStaff") {
          localReceipts = await db.getAllAsync<LocalGoodsReceiptRow>(
            "SELECT * FROM LocalGoodsReceipts WHERE UserId = ? ORDER BY CreatedAt DESC",
            [user?.id || 0]
          );
        } else {
          localReceipts = await db.getAllAsync<LocalGoodsReceiptRow>(
            "SELECT * FROM LocalGoodsReceipts ORDER BY CreatedAt DESC"
          );
        }

        let serverData: ServerGoodsReceiptDto[] = [];
        try {
          const res = await getServerReceipts();
          if (res.isSuccess) serverData = res.data;
        } catch (e) {
          console.warn("Could not fetch server receipts");
        }

        const receiptResult: MergedReceipt[] = [];
        const knownReceiptServerIds = new Set<number>();
        const knownReceiptOfflineIds = new Set<string>();

        for (const sr of serverData) {
          knownReceiptServerIds.add(sr.id);
          if (sr.offlineReferenceId) {
            knownReceiptOfflineIds.add(sr.offlineReferenceId);
          }
          receiptResult.push({
            key: `server:${sr.id}`,
            id: sr.id.toString(),
            offlineId: sr.offlineReferenceId || `SRV_${sr.id}`,
            totalAmount: sr.totalAmount,
            date: sr.receiptDate || sr.createdAt || new Date().toISOString(),
            creator: sr.user?.name || sr.userName || `User #${sr.userId}`,
            supplier: sr.supplier?.name || sr.supplierName || "Nhà cung cấp",
            remarks: sr.remarks || "Nhập hàng từ NCC",
            status: 'Hoàn thành',
            isSynced: true,
            serverId: sr.id,
            details: (sr.details || []).map(d => ({
              productName: d.productName || d.ProductName || d.product?.name || `SP #${d.productId || d.ProductId}`,
              barcode: d.barcode || d.Barcode || d.product?.barcode || "",
              quantity: d.quantity ?? d.Quantity ?? 1,
              costPrice: d.costPrice ?? d.CostPrice ?? 0
            }))
          });
        }

        for (const lr of localReceipts) {
          if (knownReceiptOfflineIds.has(lr.OfflineReferenceId)) continue;
          if (lr.ServerId && knownReceiptServerIds.has(lr.ServerId)) continue;

          let localReceiptDetails: any[] = [];
          try {
            const detailRows = await db.getAllAsync<any>(
              "SELECT ProductId, Quantity, CostPrice FROM LocalGoodsReceiptDetails WHERE OfflineReferenceId = ?",
              [lr.OfflineReferenceId]
            );
            localReceiptDetails = detailRows.map(d => ({
              productName: prodNameMap.get(String(d.ProductId))?.name || `SP #${d.ProductId}`,
              barcode: prodNameMap.get(String(d.ProductId))?.barcode || "",
              quantity: d.Quantity,
              costPrice: d.CostPrice
            }));
          } catch {}

          receiptResult.push({
            key: `offline:${lr.OfflineReferenceId}`,
            id: lr.OfflineReferenceId,
            offlineId: lr.OfflineReferenceId,
            totalAmount: lr.TotalAmount,
            date: lr.CreatedAt,
            creator: lr.UserId === user?.id ? (user?.name || user?.username || `User #${lr.UserId}`) : `User #${lr.UserId}`,
            supplier: lr.SupplierName || "Nhà cung cấp",
            remarks: lr.Remarks || "Phiếu nhập kho",
            status: 'Hoàn thành',
            isSynced: lr.IsSynced === 1 || !!lr.ServerId,
            serverId: lr.ServerId || undefined,
            details: localReceiptDetails
          });
        }

        receiptResult.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setReceipts(receiptResult);
      }
    } catch (error) {
      console.error("[InvoiceScreen] Error loading data:", error);
      useModalStore.getState().showModal({ title: "Thông báo", message: "Lỗi tải dữ liệu hóa đơn", type: "info" });
    } finally {
      setIsLoading(false);
    }
  };

  // Section 6C: Reactive invalidation on version change without switching tabs
  useEffect(() => {
    loadData();
  }, [goodsReceiptVersion, orderVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeTab, pendingCount])
  );

  // Open Create Receipt with optional batch draft prefill
  const handleOpenCreateReceipt = async (prefillProducts?: any[]) => {
    try {
      const db = await getDBConnection();
      const sups = await db.getAllAsync<{ Id: number; Name: string }>(
        "SELECT Id, Name FROM LocalSuppliers ORDER BY Name ASC"
      );
      const prods = await db.getAllAsync<{ Id: string; Name: string; Price: number; Barcode: string }>(
        "SELECT Id, Name, Price, Barcode FROM LocalProducts ORDER BY Name ASC"
      );
      setAvailableSuppliers(sups);
      setAvailableProducts(prods);
      setSelectedSupplierId(sups.length > 0 ? sups[0].Id : null);
      setReceiptRemarks("");
      setReceiptProdSearch("");
      setReceiptFormErrors({});

      if (prefillProducts && prefillProducts.length > 0) {
        const itemMap = new Map<string, any>();
        for (const p of prefillProducts) {
          const pid = String(p.productId || p.Id);
          if (!itemMap.has(pid)) {
            const cost = p.costPrice || (p.Price ? Math.round(p.Price * 0.7) : 10000);
            const qty = p.quantity || 10;
            itemMap.set(pid, {
              productId: pid,
              productName: p.productName || p.Name,
              barcode: p.barcode || p.Barcode || "",
              quantity: qty,
              quantityStr: String(qty),
              costPrice: cost,
              costPriceStr: String(cost),
              error: undefined
            });
          }
        }
        setReceiptItems(Array.from(itemMap.values()));
      } else {
        setReceiptItems([]);
      }

      setIsCreateReceiptOpen(true);
    } catch (err) {
      useModalStore.getState().showModal({
        title: "Lỗi",
        message: "Không thể nạp danh mục nhà cung cấp hoặc sản phẩm.",
        type: "error"
      });
    }
  };

  // Handle route params (e.g. from Dashboard "Lập phiếu nhập các mặt hàng đã chọn")
  useEffect(() => {
    if (route?.params?.tab) {
      setActiveTab(route.params.tab === "receipt" || route.params.tab === "imports" ? "imports" : "sales");
    }
    if (route?.params?.openCreateReceipt) {
      setActiveTab("imports");
      handleOpenCreateReceipt(route?.params?.prefillProducts);
    }
  }, [route?.params]);

  const handleAddProdToReceipt = (p: { Id: string; Name: string; Price: number; Barcode?: string }) => {
    setReceiptFormErrors(prev => ({ ...prev, items: undefined }));
    const existingIndex = receiptItems.findIndex(item => item.productId === String(p.Id));
    if (existingIndex >= 0) {
      setReceiptItems(receiptItems.map((item, idx) => {
        if (idx !== existingIndex) return item;
        const newQ = item.quantity + 1;
        return { ...item, quantity: newQ, quantityStr: String(newQ), error: undefined };
      }));
    } else {
      const defaultCost = Math.round((p.Price || 10000) * 0.7);
      setReceiptItems([
        ...receiptItems,
        {
          productId: String(p.Id),
          productName: p.Name,
          barcode: p.Barcode || "",
          quantity: 1,
          quantityStr: "1",
          costPrice: defaultCost,
          costPriceStr: String(defaultCost),
          error: undefined
        }
      ]);
    }
  };

  const handleUpdateItemQuantity = (productId: string, newQty: number) => {
    setReceiptItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const error = newQty <= 0 ? "Số lượng phải là số nguyên lớn hơn 0." : undefined;
      return { ...item, quantity: newQty, quantityStr: String(newQty), error };
    }));
  };

  const handleQuantityTextChange = (productId: string, text: string) => {
    setReceiptItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      if (text.trim() === "") {
        return { ...item, quantityStr: text, error: "Số lượng không được để trống." };
      }
      const parsed = parseInt(text.trim(), 10);
      if (isNaN(parsed) || text.includes('.') || text.includes(',')) {
        return { ...item, quantityStr: text, error: "Số lượng phải là số nguyên." };
      }
      if (parsed <= 0) {
        return { ...item, quantity: parsed, quantityStr: text, error: "Số lượng phải lớn hơn 0." };
      }
      return { ...item, quantity: parsed, quantityStr: text, error: undefined };
    }));
  };

  const handleQuantityBlur = (productId: string) => {
    setReceiptItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const raw = item.quantityStr?.trim();
      const parsed = parseInt(raw || "0", 10);
      if (!raw || isNaN(parsed) || parsed <= 0) {
        const fallback = item.quantity > 0 ? item.quantity : 1;
        return { ...item, quantity: fallback, quantityStr: String(fallback), error: undefined };
      }
      return { ...item, quantity: parsed, quantityStr: String(parsed), error: undefined };
    }));
  };

  const handleCostPriceTextChange = (productId: string, text: string) => {
    setReceiptItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      if (text.trim() === "") {
        return { ...item, costPriceStr: text, error: "Giá nhập không được để trống." };
      }
      const parsed = parseFloat(text.trim());
      if (isNaN(parsed) || parsed < 0) {
        return { ...item, costPriceStr: text, error: "Giá nhập không được nhỏ hơn 0." };
      }
      return { ...item, costPrice: parsed, costPriceStr: text, error: undefined };
    }));
  };

  const handleCostPriceBlur = (productId: string) => {
    setReceiptItems(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const raw = item.costPriceStr?.trim();
      const parsed = parseFloat(raw || "0");
      if (!raw || isNaN(parsed) || parsed < 0) {
        const fallback = Math.max(0, item.costPrice);
        return { ...item, costPrice: fallback, costPriceStr: String(fallback), error: undefined };
      }
      return { ...item, costPrice: parsed, costPriceStr: String(parsed), error: undefined };
    }));
  };

  const handleSubmitNewReceipt = async () => {
    if (isSubmittingReceipt) return;
    const errors: typeof receiptFormErrors = {};
    if (!selectedSupplierId) {
      errors.supplier = "Vui lòng chọn nhà cung cấp.";
    }
    if (receiptItems.length === 0) {
      errors.items = "Vui lòng thêm ít nhất một sản phẩm vào phiếu nhập.";
    }

    let hasLineErrors = false;
    const validatedItems = receiptItems.map(item => {
      const q = parseInt(item.quantityStr ?? String(item.quantity), 10);
      const cp = parseFloat(item.costPriceStr ?? String(item.costPrice));
      let lineError: string | undefined = undefined;
      if (isNaN(q) || q <= 0 || (item.quantityStr && (item.quantityStr.includes('.') || item.quantityStr.includes(',')))) {
        lineError = "Số lượng phải là số nguyên lớn hơn 0.";
        hasLineErrors = true;
      } else if (isNaN(cp) || cp < 0) {
        lineError = "Giá nhập không được nhỏ hơn 0.";
        hasLineErrors = true;
      }
      return {
        ...item,
        quantity: isNaN(q) ? item.quantity : q,
        quantityStr: isNaN(q) ? item.quantityStr : String(q),
        costPrice: isNaN(cp) ? item.costPrice : cp,
        costPriceStr: isNaN(cp) ? item.costPriceStr : String(cp),
        error: lineError
      };
    });

    if (Object.keys(errors).length > 0 || hasLineErrors) {
      setReceiptFormErrors(errors);
      setReceiptItems(validatedItems);
      return;
    }
    setReceiptFormErrors({});

    setIsSubmittingReceipt(true);
    try {
      const sup = availableSuppliers.find(s => s.Id === selectedSupplierId);
      const total = validatedItems.reduce((sum, i) => sum + i.quantity * i.costPrice, 0);
      const offlineRefId = typeof crypto !== 'undefined' && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : `GR_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await insertLocalGoodsReceipt(
        offlineRefId,
        selectedSupplierId!,
        sup?.Name || "Nhà cung cấp",
        user?.id || 0,
        total,
        receiptRemarks.trim() || "Nhập hàng",
        validatedItems.map(i => ({ productId: i.productId, quantity: i.quantity, costPrice: i.costPrice }))
      );

      useGlobalSyncStore.getState().syncNow("receipt-created-from-invoice");
      setIsCreateReceiptOpen(false);
      useModalStore.getState().showModal({
        title: "Thành công",
        message: "Đã lập phiếu nhập kho thành công!",
        type: "success"
      });
      await loadData();
    } catch (e: any) {
      useModalStore.getState().showModal({ title: "Lỗi", message: "Không thể tạo phiếu nhập: " + e.message, type: "error" });
    } finally {
      setIsSubmittingReceipt(false);
    }
  };

  const handlePrintOrder = async (order: MergedOrder) => {
    const items = (order.details && order.details.length > 0)
      ? order.details.map(d => ({
          productName: d.productName,
          barcode: d.barcode,
          quantity: d.quantity,
          unitPrice: d.unitPrice,
          lineTotal: d.unitPrice * d.quantity
        }))
      : [{
          productName: 'Đơn hàng POS',
          quantity: 1,
          unitPrice: order.totalAmount,
          lineTotal: order.totalAmount
        }];

    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

    const html = generateSalesReceiptHtml({
      invoiceNumber: order.offlineId,
      orderDate: order.date,
      cashierName: order.employee,
      paymentMethod: order.paymentMethod,
      items,
      totalQuantity: totalQty,
      subtotal: order.totalAmount,
      discount: 0,
      totalAmount: order.totalAmount,
      paidAmount: order.totalAmount,
    }, { paperSize: '80mm' });

    try {
      await printDocument(html, `HoaDon_${order.offlineId}`);
    } catch (err: any) {
      useModalStore.getState().showModal({
        title: 'Thông báo',
        message: 'Không thể in hóa đơn: ' + (err.message || ''),
        type: 'info'
      });
    }
  };

  const handlePrintReceipt = async (receipt: MergedReceipt) => {
    const items = (receipt.details && receipt.details.length > 0)
      ? receipt.details.map(d => ({
          productName: d.productName,
          barcode: d.barcode,
          quantity: d.quantity,
          costPrice: d.costPrice,
          lineTotal: d.costPrice * d.quantity
        }))
      : [{
          productName: 'Mặt hàng nhập kho',
          quantity: 1,
          costPrice: receipt.totalAmount,
          lineTotal: receipt.totalAmount
        }];

    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);

    const html = generateGoodsReceiptHtml({
      receiptNumber: receipt.offlineId,
      receiptDate: receipt.date,
      supplierName: receipt.supplier,
      creatorName: receipt.creator,
      status: receipt.status,
      remarks: receipt.remarks,
      items,
      totalQuantity: totalQty,
      totalAmount: receipt.totalAmount,
    }, { paperSize: '80mm' });

    try {
      await printDocument(html, `PhieuNhap_${receipt.offlineId}`);
    } catch (err: any) {
      useModalStore.getState().showModal({
        title: 'Thông báo',
        message: 'Không thể in phiếu nhập: ' + (err.message || ''),
        type: 'info'
      });
    }
  };

  const renderSalesItem = ({ item }: { item: MergedOrder }) => (
    <TouchableOpacity
      testID={`order-card-${item.offlineId}`}
      onPress={() => setSelectedOrder(item)}
      activeOpacity={0.8}
      className="bg-white p-5 mb-4 border-2 border-black"
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="font-bold text-lg text-black uppercase tracking-wider">{item.offlineId}</Text>
        <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.totalAmount)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="time-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black font-bold">{formatVietnamDateTime(item.date)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="person-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.employee}</Text>
      </View>
      <View className="flex-row items-center mb-4">
        <Ionicons name="card-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-gray-700 text-xs font-bold">{item.paymentMethod}</Text>
      </View>

      <View className="flex-row justify-between items-center border-t-2 border-gray-100 pt-3 mt-1">
        <View className="flex-row items-center">
          {item.isSynced ? (
            <><Ionicons name="checkmark-circle" size={18} color="#16a34a" /><Text className="ml-1 text-green-600 font-bold text-xs uppercase">ĐÃ ĐỒNG BỘ</Text></>
          ) : (
            <><Ionicons name="time" size={18} color="#ea580c" /><Text className="ml-1 text-orange-600 font-bold text-xs uppercase">CHƯA ĐỒNG BỘ</Text></>
          )}
        </View>
        <View className="flex-row items-center">
          <Text className="text-xs text-blue-700 font-bold uppercase mr-1">Xem chi tiết</Text>
          <Ionicons name="chevron-forward" size={14} color="#1d4ed8" />
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderImportItem = ({ item }: { item: MergedReceipt }) => (
    <TouchableOpacity
      testID={`receipt-card-${item.offlineId}`}
      onPress={() => setSelectedReceipt(item)}
      activeOpacity={0.8}
      className="bg-white p-5 mb-4 border-2 border-black"
    >
      <View className="flex-row justify-between items-center mb-3">
        <Text className="font-bold text-lg text-black uppercase tracking-wider">{item.offlineId}</Text>
        <Text className="text-black font-black font-serif text-lg">{formatCurrency(item.totalAmount)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="time-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black font-bold">{formatVietnamDateTime(item.date)}</Text>
      </View>
      <View className="flex-row items-center mb-2">
        <Ionicons name="business-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.supplier}</Text>
      </View>
      <View className="flex-row items-center mb-4">
        <Ionicons name="person-outline" size={16} color="#000" style={{ width: 24 }} />
        <Text className="text-black">{item.creator}</Text>
      </View>

      <View className="flex-row justify-between items-center border-t-2 border-gray-100 pt-3 mt-1">
        <View className="flex-row items-center">
          {item.isSynced ? (
            <><Ionicons name="checkmark-circle" size={18} color="#16a34a" /><Text className="ml-1 text-green-600 font-bold text-xs uppercase">ĐÃ ĐỒNG BỘ</Text></>
          ) : (
            <><Ionicons name="time" size={18} color="#ea580c" /><Text className="ml-1 text-orange-600 font-bold text-xs uppercase">CHƯA ĐỒNG BỘ</Text></>
          )}
        </View>
        <View className="flex-row items-center">
          <Text className="text-xs text-blue-700 font-bold uppercase mr-1">Xem chi tiết</Text>
          <Ionicons name="chevron-forward" size={14} color="#1d4ed8" />
        </View>
      </View>
    </TouchableOpacity>
  );

  const canViewSales = ["Cashier", "Manager", "Admin", "SystemAdmin"].includes(role);
  const canViewImports = ["WarehouseStaff", "Manager", "Admin", "SystemAdmin"].includes(role);
  const canManageReceipts = ["WarehouseStaff", "Manager", "Admin", "SystemAdmin"].includes(role);
  const showTabSwitcher = canViewSales && canViewImports;

  return (
    <SafeAreaView testID="invoice-screen" className="flex-1 bg-white">
      <View className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0 bg-white border-b-4 border-black mb-4">
        <View className="flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="font-serif text-2xl sm:text-3xl font-black text-black tracking-tight uppercase">
                Hóa đơn
              </Text>
              <Text className="mt-0.5 text-[10px] sm:text-[11px] tracking-widest text-neutral-600 uppercase">
                Quản lý chứng từ
              </Text>
            </View>
            <View className="w-10 h-10 border-2 border-black items-center justify-center sm:hidden">
              <Ionicons name="receipt-outline" size={20} color="#000" />
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {activeTab === "imports" && canManageReceipts && (
              <TouchableOpacity
                testID="btn-open-create-receipt"
                onPress={() => handleOpenCreateReceipt()}
                className="flex-1 sm:flex-initial bg-black px-4 py-2.5 border-2 border-black flex-row items-center justify-center"
              >
                <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
                <Text className="text-white text-xs font-black uppercase tracking-wider">Lập phiếu nhập</Text>
              </TouchableOpacity>
            )}
            <View className="w-11 h-11 border-2 border-black items-center justify-center hidden sm:flex">
              <Ionicons name="receipt-outline" size={22} color="#000" />
            </View>
          </View>
        </View>

        {showTabSwitcher && (
          <View className="flex-row border-b-2 border-black mt-1">
            <TouchableOpacity
              testID="tab-sales"
              onPress={() => setActiveTab("sales")}
              className={`flex-1 items-center py-2.5 ${activeTab === "sales" ? "border-b-4 border-black" : ""}`}
            >
              <Text className={`font-black uppercase tracking-wider text-xs ${activeTab === "sales" ? "text-black" : "text-gray-400"}`}>
                Phiếu bán
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tab-imports"
              onPress={() => setActiveTab("imports")}
              className={`flex-1 items-center py-2.5 ${activeTab === "imports" ? "border-b-4 border-black" : ""}`}
            >
              <Text className={`font-black uppercase tracking-wider text-xs ${activeTab === "imports" ? "text-black" : "text-gray-400"}`}>
                Phiếu nhập
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {activeTab === "sales" && canViewSales && (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderSalesItem}
          ListEmptyComponent={
            <View className="py-12 items-center justify-center">
              <Ionicons name="document-text-outline" size={44} color="#d1d5db" />
              <Text className="text-gray-400 mt-2 font-bold text-xs uppercase tracking-wider">Không có phiếu bán</Text>
            </View>
          }
        />
      )}

      {activeTab === "imports" && canViewImports && (
        <FlatList
          data={receipts}
          keyExtractor={(item) => item.key}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadData} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderImportItem}
          ListEmptyComponent={
            <View className="py-12 items-center justify-center">
              <Ionicons name="document-text-outline" size={44} color="#d1d5db" />
              <Text className="text-gray-400 mt-2 font-bold text-xs uppercase tracking-wider">Không có phiếu nhập</Text>
            </View>
          }
        />
      )}

      {/* DETAIL MODAL: PHIẾU BÁN */}
      <Modal visible={!!selectedOrder} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[94%] max-w-xl p-5 border-4 border-black max-h-[90%]">
            <View className="flex-row justify-between items-center pb-3 border-b-2 border-black mb-4">
              <View>
                <Text className="text-xl font-black uppercase text-black">Chi tiết phiếu bán</Text>
                <Text className="text-xs text-gray-600 font-mono mt-0.5">{selectedOrder?.offlineId}</Text>
              </View>
              <TouchableOpacity testID="btn-close-order-detail" onPress={() => setSelectedOrder(null)} className="p-1">
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="bg-gray-50 p-4 border border-gray-300 mb-4 flex-col gap-1">
                <Text className="text-xs text-gray-700"><Text className="font-bold">Thời gian:</Text> {selectedOrder ? formatVietnamDateTime(selectedOrder.date) : ""}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Thu ngân:</Text> {selectedOrder?.employee}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Phương thức:</Text> {selectedOrder?.paymentMethod}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Đồng bộ:</Text> {selectedOrder?.isSynced ? "Đã đồng bộ" : "Chưa đồng bộ"}</Text>
              </View>

              <Text className="text-xs font-bold uppercase tracking-wider mb-2 text-black">Danh sách sản phẩm</Text>
              <View className="border border-black mb-4">
                <View className="flex-row bg-black p-2">
                  <Text className="flex-1 text-white text-[11px] font-bold uppercase">Sản phẩm</Text>
                  <Text className="w-12 text-center text-white text-[11px] font-bold uppercase">SL</Text>
                  <Text className="w-20 text-right text-white text-[11px] font-bold uppercase">Đơn giá</Text>
                  <Text className="w-24 text-right text-white text-[11px] font-bold uppercase">Thành tiền</Text>
                </View>
                {(selectedOrder?.details && selectedOrder.details.length > 0) ? (
                  selectedOrder.details.map((item, idx) => (
                    <View key={idx} className="flex-row p-2 border-b border-gray-200 items-center">
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-black">{item.productName}</Text>
                        {item.barcode ? <Text className="text-[10px] text-gray-500 font-mono">{item.barcode}</Text> : null}
                      </View>
                      <Text className="w-12 text-center text-xs font-bold text-black">{item.quantity}</Text>
                      <Text className="w-20 text-right text-xs font-bold text-black">{formatCurrency(item.unitPrice)}</Text>
                      <Text className="w-24 text-right text-xs font-bold text-black">{formatCurrency(item.unitPrice * item.quantity)}</Text>
                    </View>
                  ))
                ) : (
                  <View className="p-4 items-center">
                    <Text className="text-xs text-gray-500 italic">Tổng đơn: {formatCurrency(selectedOrder?.totalAmount || 0)}</Text>
                  </View>
                )}
              </View>

              <View className="flex-row justify-between items-center py-3 border-t-2 border-black">
                <Text className="font-black text-sm uppercase">Tổng thanh toán:</Text>
                <Text className="font-black font-serif text-xl text-black">{formatCurrency(selectedOrder?.totalAmount || 0)}</Text>
              </View>

              <View className="flex-row gap-2 mt-4 pt-3 border-t-2 border-black">
                <TouchableOpacity
                  onPress={() => setSelectedOrder(null)}
                  className="flex-1 py-2.5 border-2 border-gray-400 items-center justify-center"
                >
                  <Text className="text-xs font-bold text-gray-700 uppercase">Đóng</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="btn-print-sales-receipt"
                  onPress={() => handlePrintOrder(selectedOrder!)}
                  className="flex-1 bg-black py-2.5 border-2 border-black items-center justify-center flex-row"
                >
                  <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-black text-white uppercase">In hóa đơn</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL: PHIẾU NHẬP (Section 6A: Product Name, Barcode, Quantity, CostPrice, Subtotal) */}
      <Modal visible={!!selectedReceipt} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[94%] max-w-xl p-5 border-4 border-black max-h-[90%]">
            <View className="flex-row justify-between items-center pb-3 border-b-2 border-black mb-4">
              <View>
                <Text className="text-xl font-black uppercase text-black">Chi tiết phiếu nhập</Text>
                <Text className="text-xs text-gray-600 font-mono mt-0.5">{selectedReceipt?.offlineId}</Text>
              </View>
              <TouchableOpacity testID="btn-close-receipt-detail" onPress={() => setSelectedReceipt(null)} className="p-1">
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="bg-gray-50 p-4 border border-gray-300 mb-4 flex-col gap-1">
                <Text className="text-xs text-gray-700"><Text className="font-bold">Thời gian:</Text> {selectedReceipt ? formatVietnamDateTime(selectedReceipt.date) : ""}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Nhà cung cấp:</Text> {selectedReceipt?.supplier}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Người tạo:</Text> {selectedReceipt?.creator}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Đồng bộ:</Text> {selectedReceipt?.isSynced ? "Đã đồng bộ" : "Chưa đồng bộ"}</Text>
                <Text className="text-xs text-gray-700"><Text className="font-bold">Ghi chú:</Text> {selectedReceipt?.remarks || "Không có"}</Text>
              </View>

              <Text className="text-xs font-bold uppercase tracking-wider mb-2 text-black">Danh sách mặt hàng nhập</Text>
              <View className="border border-black mb-4">
                <View className="flex-row bg-black p-2">
                  <Text className="flex-1 text-white text-[11px] font-bold uppercase">Mặt hàng</Text>
                  <Text className="w-12 text-center text-white text-[11px] font-bold uppercase">SL</Text>
                  <Text className="w-20 text-right text-white text-[11px] font-bold uppercase">Giá nhập</Text>
                  <Text className="w-24 text-right text-white text-[11px] font-bold uppercase">Thành tiền</Text>
                </View>
                {(selectedReceipt?.details && selectedReceipt.details.length > 0) ? (
                  selectedReceipt.details.map((item, idx) => (
                    <View key={idx} className="flex-row p-2 border-b border-gray-200 items-center">
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-black">{item.productName}</Text>
                        {item.barcode ? <Text className="text-[10px] text-gray-500 font-mono">{item.barcode}</Text> : null}
                      </View>
                      <Text className="w-12 text-center text-xs font-bold text-black">{item.quantity}</Text>
                      <Text className="w-20 text-right text-xs font-bold text-black">{formatCurrency(item.costPrice)}</Text>
                      <Text className="w-24 text-right text-xs font-bold text-black">{formatCurrency(item.costPrice * item.quantity)}</Text>
                    </View>
                  ))
                ) : (
                  <View className="p-4 items-center">
                    <Text className="text-xs text-gray-500 italic">Tổng tiền: {formatCurrency(selectedReceipt?.totalAmount || 0)}</Text>
                  </View>
                )}
              </View>

              <View className="flex-row justify-between items-center py-3 border-t-2 border-black">
                <Text className="font-black text-sm uppercase">Tổng tiền:</Text>
                <Text className="font-black font-serif text-xl text-black">{formatCurrency(selectedReceipt?.totalAmount || 0)}</Text>
              </View>

              <View className="flex-row gap-2 mt-4 pt-3 border-t-2 border-black">
                <TouchableOpacity
                  onPress={() => setSelectedReceipt(null)}
                  className="flex-1 py-2.5 border-2 border-gray-400 items-center justify-center"
                >
                  <Text className="text-xs font-bold text-gray-700 uppercase">Đóng</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="btn-print-goods-receipt"
                  onPress={() => handlePrintReceipt(selectedReceipt!)}
                  className="flex-1 bg-black py-2.5 border-2 border-black items-center justify-center flex-row"
                >
                  <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-black text-white uppercase">In phiếu nhập</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CREATE RECEIPT MODAL */}
      <Modal visible={isCreateReceiptOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-center items-center p-4">
          <View className="bg-white w-[94%] max-w-2xl p-5 border-4 border-black max-h-[90%]">
            <View className="flex-row justify-between items-center pb-3 border-b-2 border-black mb-4">
              <Text className="text-xl font-black uppercase text-black">Lập phiếu nhập kho</Text>
              <TouchableOpacity testID="btn-close-create-receipt" onPress={() => setIsCreateReceiptOpen(false)} className="p-1">
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Supplier selector */}
              <Text className="text-xs font-bold uppercase text-black mb-1">Nhà cung cấp *</Text>
              <View className={`flex-row flex-wrap gap-2 mb-1 p-2 border ${receiptFormErrors.supplier ? 'border-red-500' : 'border-transparent'}`}>
                {availableSuppliers.map(s => (
                  <TouchableOpacity
                    key={s.Id}
                    testID={`supplier-opt-${s.Id}`}
                    onPress={() => {
                      setSelectedSupplierId(s.Id);
                      setReceiptFormErrors(prev => ({ ...prev, supplier: undefined }));
                    }}
                    className={`px-3 py-1.5 border-2 border-black ${selectedSupplierId === s.Id ? 'bg-black' : 'bg-white'}`}
                  >
                    <Text className={`text-xs font-bold ${selectedSupplierId === s.Id ? 'text-white' : 'text-black'}`}>{s.Name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {receiptFormErrors.supplier && (
                <Text className="text-red-500 text-xs mb-3 font-semibold" testID="receipt-supplier-error">
                  {receiptFormErrors.supplier}
                </Text>
              )}

              {/* Product search and add */}
              <Text className="text-xs font-bold uppercase text-black mb-1">Chọn sản phẩm nhập</Text>
              <TextInput
                testID="receipt-prod-search-input"
                placeholder=""
                accessibilityLabel="Tìm sản phẩm theo tên để nhập hàng"
                value={receiptProdSearch}
                onChangeText={setReceiptProdSearch}
                className="border-2 border-black p-2 text-xs mb-2"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                <View className="flex-row gap-2">
                  {availableProducts
                    .filter(p => !receiptProdSearch || p.Name.toLowerCase().includes(receiptProdSearch.toLowerCase()))
                    .slice(0, 10)
                    .map(p => (
                      <TouchableOpacity
                        key={p.Id}
                        testID={`add-prod-to-receipt-${p.Id}`}
                        onPress={() => handleAddProdToReceipt(p)}
                        className="border-2 border-black p-2 bg-gray-50 items-center justify-center min-w-[100px]"
                      >
                        <Text className="text-xs font-bold text-black text-center" numberOfLines={1}>{p.Name}</Text>
                        <Text className="text-[10px] text-gray-600">+ Thêm</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </ScrollView>

              {/* Items in receipt */}
              <Text className="text-xs font-bold uppercase text-black mb-1">Chi tiết mặt hàng ({receiptItems.length})</Text>
              {receiptFormErrors.items && (
                <Text className="text-red-500 text-xs mb-2 font-semibold" testID="receipt-items-error">
                  {receiptFormErrors.items}
                </Text>
              )}
              <View className="border border-black mb-4">
                {receiptItems.length === 0 ? (
                  <View className="p-4 items-center">
                    <Text className="text-xs text-gray-500 italic">Chưa có sản phẩm nào trong phiếu nhập</Text>
                  </View>
                ) : (
                  receiptItems.map((item) => {
                    const qVal = parseInt(item.quantityStr ?? String(item.quantity), 10) || 0;
                    const cpVal = parseFloat(item.costPriceStr ?? String(item.costPrice)) || 0;
                    const lineTotal = qVal * cpVal;

                    return (
                      <View key={item.productId} className="p-3 border-b border-gray-200 bg-white">
                        <View className="flex-row items-center justify-between mb-2">
                          <View className="flex-1 mr-2">
                            <Text className="text-xs font-bold text-black" numberOfLines={1}>{item.productName}</Text>
                            {item.barcode ? <Text className="text-[10px] text-gray-500 font-mono">{item.barcode}</Text> : null}
                          </View>
                          <TouchableOpacity
                            onPress={() => setReceiptItems(receiptItems.filter(i => i.productId !== item.productId))}
                            className="p-1"
                            accessibilityLabel={`Xóa ${item.productName}`}
                          >
                            <Ionicons name="trash-outline" size={16} color="#dc2626" />
                          </TouchableOpacity>
                        </View>

                        <View className="flex-row items-center justify-between flex-wrap gap-2">
                          {/* Quantity [-] [input] [+] */}
                          <View className="flex-row items-center">
                            <Text className="text-[11px] text-gray-600 font-bold mr-1.5">SL *:</Text>
                            <TouchableOpacity
                              testID={`dec-receipt-qty-${item.productId}`}
                              onPress={() => handleUpdateItemQuantity(item.productId, Math.max(1, item.quantity - 1))}
                              className="w-7 h-7 border-2 border-black items-center justify-center bg-white"
                            >
                              <Text className="font-bold text-sm text-black">-</Text>
                            </TouchableOpacity>
                            <TextInput
                              testID={`input-receipt-qty-${item.productId}`}
                              keyboardType="number-pad"
                              inputMode="numeric"
                              value={item.quantityStr !== undefined ? item.quantityStr : String(item.quantity)}
                              onChangeText={(text) => handleQuantityTextChange(item.productId, text)}
                              onBlur={() => handleQuantityBlur(item.productId)}
                              selectTextOnFocus={true}
                              className={`w-14 h-7 border-y-2 border-black text-center text-xs font-bold text-black bg-white ${item.error ? 'border-red-500 border-2' : ''}`}
                            />
                            <TouchableOpacity
                              testID={`inc-receipt-qty-${item.productId}`}
                              onPress={() => handleUpdateItemQuantity(item.productId, item.quantity + 1)}
                              className="w-7 h-7 border-2 border-black items-center justify-center bg-white"
                            >
                              <Text className="font-bold text-sm text-black">+</Text>
                            </TouchableOpacity>
                          </View>

                          {/* Cost price input */}
                          <View className="flex-row items-center">
                            <Text className="text-[11px] text-gray-600 font-bold mr-1.5">Giá nhập *:</Text>
                            <TextInput
                              testID={`input-receipt-cost-${item.productId}`}
                              keyboardType="numeric"
                              inputMode="numeric"
                              value={item.costPriceStr !== undefined ? item.costPriceStr : String(item.costPrice)}
                              onChangeText={(text) => handleCostPriceTextChange(item.productId, text)}
                              onBlur={() => handleCostPriceBlur(item.productId)}
                              selectTextOnFocus={true}
                              className="w-24 h-7 border-2 border-black px-2 text-right text-xs font-bold text-black bg-white"
                            />
                          </View>

                          {/* Line subtotal */}
                          <View className="flex-row items-center">
                            <Text className="text-xs font-black text-black">
                              {formatCurrency(lineTotal)}
                            </Text>
                          </View>
                        </View>

                        {/* Inline error for line */}
                        {item.error ? (
                          <Text className="text-red-500 text-[11px] mt-1 font-semibold" testID={`receipt-line-error-${item.productId}`}>
                            {item.error}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </View>

              {/* Remarks */}
              <Text className="text-xs font-bold uppercase text-black mb-1">Ghi chú</Text>
              <TextInput
                placeholder=""
                accessibilityLabel="Ghi chú phiếu nhập"
                value={receiptRemarks}
                onChangeText={setReceiptRemarks}
                className="border-2 border-black p-2 text-xs mb-4"
              />

              <View className="flex-row justify-between items-center py-3 border-t-2 border-black mb-4">
                <Text className="font-black uppercase text-sm">Tổng tiền:</Text>
                <Text className="font-black font-serif text-xl">
                  {formatCurrency(receiptItems.reduce((sum, i) => {
                    const q = parseInt(i.quantityStr ?? String(i.quantity), 10) || 0;
                    const cp = parseFloat(i.costPriceStr ?? String(i.costPrice)) || 0;
                    return sum + q * cp;
                  }, 0))}
                </Text>
              </View>

              <TouchableOpacity
                testID="btn-submit-receipt"
                disabled={isSubmittingReceipt}
                onPress={handleSubmitNewReceipt}
                className="bg-black py-3 border-2 border-black items-center justify-center flex-row"
              >
                {isSubmittingReceipt ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-white font-black uppercase tracking-wider text-sm">Lưu phiếu nhập</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
