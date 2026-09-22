import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  getLocalProducts,
  getLocalCategories,
  LocalCategoryRow,
  LocalProductRow,
  updateLocalProductStock,
  deleteLocalProduct,
  insertLocalProduct,
  insertLocalGoodsReceipt,
  recordStockAdjustment,
  getDBConnection,
  LocalSupplierRow
} from "@/database/db";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import * as ImagePicker from 'expo-image-picker';
import apiClient from "@/services/apiClient";
import { useAuthStore } from "@/store/authStore";
import { useModalStore } from "@/store/useModalStore";
import { uploadImageToCloudinary } from "@/services/imageUploadService";
import { parseApiError } from "@/utils/errorParser";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import ImageCropperModal from "@/components/ImageCropperModal";
import CameraCaptureModal from "@/components/CameraCaptureModal";
import DeactivateModal from "@/components/DeactivateModal";
import FieldLabel, { FieldError } from "@/components/FieldLabel";

interface Category extends LocalCategoryRow {}
interface Product extends LocalProductRow {
  CategoryName?: string;
  SupplierName?: string;
}

interface ProductsTabProps {
  initialSearch?: string;
  targetProductId?: number | string;
  targetBarcode?: string;
  focusField?: "price" | "lowStockThreshold";
}

export default function ProductsTab({
  initialSearch = "",
  targetProductId,
  targetBarcode,
  focusField,
}: ProductsTabProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<LocalSupplierRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const priceInputRef = useRef<any>(null);
  const thresholdInputRef = useRef<any>(null);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  const [isEditModalVisible, SetIsEditModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<string>("");
  const [adjustmentReason, setAdjustmentReason] = useState<string>("");
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [isSubmittingStock, setIsSubmittingStock] = useState<boolean>(false);
  const isSubmittingStockRef = useRef<boolean>(false);

  // Add Product State
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    barcode: "",
    price: "",
    costPrice: "",
    categoryId: "",
    stock: "",
    imageUrl: "",
    supplierId: "",
    lowStockThreshold: "10",
  });
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    price?: string;
    costPrice?: string;
    categoryId?: string;
    supplierId?: string;
    stock?: string;
    barcode?: string;
    imageUrl?: string;
    lowStockThreshold?: string;
  }>({});

  const [categorySearch, setCategorySearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  // Camera & Cropper State
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cropperVisible, setCropperVisible] = useState(false);
  const [cropperRawUri, setCropperRawUri] = useState("");
  const [cropperTarget, setCropperTarget] = useState<"new" | "edit">("new");

  // Deactivate Modal State
  const [deactivateTarget, setDeactivateTarget] = useState<Product | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Edit Product Modal State
  const [isProductEditModalVisible, setIsProductEditModalVisible] = useState(false);
  const [editProductForm, setEditProductForm] = useState({
    id: "",
    name: "",
    barcode: "",
    price: "",
    categoryId: "",
    supplierId: "",
    imageUrl: "",
    lowStockThreshold: "10",
  });
  const [editErrors, setEditErrors] = useState<{ name?: string; price?: string; lowStockThreshold?: string }>({});

  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [scannerMode, setScannerMode] = useState<"search" | "add">("search");

  const { user } = useAuthStore();
  const role = user?.role || "";

  const canEditStock = ["Admin", "Manager", "WarehouseStaff"].includes(role);
  const canManageProducts = ["Admin", "Manager"].includes(role);

  const handleScanSuccess = (barcode: string) => {
    setIsScannerVisible(false);

    if (scannerMode === "add") {
      setNewProduct(prev => ({ ...prev, barcode: barcode }));
      if (formErrors.barcode) {
        setFormErrors(prev => ({ ...prev, barcode: undefined }));
      }
      return;
    }

    const foundProduct = products.find((p) => p.Barcode === barcode);
    if (foundProduct) {
      handleOpenEdit(foundProduct);
    } else {
      setSearchQuery(barcode);
      useModalStore.getState().showModal({
        title: "Thông báo",
        message: 'Không tìm thấy sản phẩm với mã vạch: ' + barcode,
        type: "info"
      });
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [productsData, categoriesData, suppliersData] = await Promise.all([
        getLocalProducts(),
        getLocalCategories(),
        getDBConnection().then(db => db.getAllAsync<LocalSupplierRow>("SELECT * FROM LocalSuppliers")),
      ]);
      const categoryMap = new Map(categoriesData.map((c) => [c.Id, c.Name]));
      const supplierMap = new Map(suppliersData.map((s) => [s.Id, s.Name]));

      const enrichedProducts = productsData.map((p) => ({
        ...p,
        CategoryName: categoryMap.get(p.CategoryId) || "Không xác định",
        SupplierName: p.SupplierId ? supplierMap.get(p.SupplierId) : undefined,
      }));
      setProducts(enrichedProducts);
      setCategories([{ Id: -1, Name: "Tất cả" }, ...categoriesData]);
      setSuppliers(suppliersData);
    } catch (error) {
      console.error("[Inventory] Lỗi tải dữ liệu kho:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        product.Name.toLowerCase().includes(query) ||
        (product.Barcode && product.Barcode.toLowerCase().includes(query)) ||
        String(product.Id) === query;
      const matchesCategory =
        selectedCategoryId === null ||
        selectedCategoryId === -1 ||
        product.CategoryId === selectedCategoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategoryId]);

  const handleOpenEdit = (product: Product) => {
    setSelectedProduct(product);
    setNewStock(product.StockQuantity.toString());
    setAdjustmentReason("");
    setAdjustmentError(null);
    SetIsEditModalVisible(true);
  };

  const handleStockChange = (amount: number) => {
    const currentVal = parseInt(newStock, 10) || 0;
    const nextVal = Math.max(0, currentVal + amount);
    setNewStock(nextVal.toString());
    setAdjustmentError(null);
  };

  const handleSaveStock = async () => {
    if (!selectedProduct) return;
    if (isSubmittingStock || isSubmittingStockRef.current) return;

    const stockValue = parseInt(newStock, 10);
    if (isNaN(stockValue) || stockValue < 0) {
      setAdjustmentError("Số lượng tồn kho mới không hợp lệ.");
      return;
    }

    const diff = stockValue - selectedProduct.StockQuantity;
    if (diff === 0) {
      setAdjustmentError("Số lượng tồn kho mới không thay đổi so với hiện tại.");
      return;
    }

    const trimmedReason = adjustmentReason.trim();
    if (!trimmedReason) {
      setAdjustmentError("Vui lòng nhập lý do điều chỉnh tồn kho.");
      return;
    }

    isSubmittingStockRef.current = true;
    setIsSubmittingStock(true);
    setAdjustmentError(null);
    try {
      const offlineReferenceId =
        typeof crypto !== "undefined" && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `ADJ_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      await recordStockAdjustment(
        offlineReferenceId,
        selectedProduct.Id,
        diff,
        trimmedReason,
        user?.id || 0
      );

      await updateLocalProductStock(selectedProduct.Id, stockValue);

      useCacheInvalidationStore.getState().invalidateProduct();
      useCacheInvalidationStore.getState().invalidateInventory();
      useCacheInvalidationStore.getState().invalidatePos();

      useGlobalSyncStore.getState().syncNow("stock-adjustment-created");

      SetIsEditModalVisible(false);
      await loadData();

      useModalStore.getState().showModal({
        title: "Thành công",
        message: `Đã điều chỉnh tồn kho sản phẩm "${selectedProduct.Name}" (${diff > 0 ? "+" : ""}${diff}) thành công.`,
        type: "success",
      });
    } catch (error: any) {
      console.error("[Inventory] Lỗi khi lưu điều chỉnh tồn kho:", error);
      setAdjustmentError(error?.message || "Lỗi khi lưu điều chỉnh tồn kho");
    } finally {
      isSubmittingStockRef.current = false;
      setIsSubmittingStock(false);
    }
  };

  // Section 5: Deactivate with Reason
  const handleOpenDeactivate = (product: Product) => {
    setDeactivateTarget(product);
  };

  const handleConfirmDeactivate = async (reason: string) => {
    if (!deactivateTarget) return;
    setIsDeactivating(true);
    try {
      await apiClient.put(`/Products/${deactivateTarget.Id}/deactivate`, { reason });
      await deleteLocalProduct(deactivateTarget.Id.toString());
      useCacheInvalidationStore.getState().invalidateProduct();
      useCacheInvalidationStore.getState().invalidatePos();
      setDeactivateTarget(null);
      await loadData();
      useModalStore.getState().showModal({
        title: "Thành công",
        message: "Đã ngừng kinh doanh sản phẩm. Sản phẩm không còn xuất hiện ở màn hình bán hàng; dữ liệu lịch sử vẫn được bảo toàn.",
        type: "success"
      });
    } catch (e: any) {
      const apiError = parseApiError(e);
      useModalStore.getState().showModal({
        title: apiError.title || "Lỗi",
        message: apiError.message || "Không thể ngừng kinh doanh sản phẩm.",
        type: "error"
      });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleReactivateProduct = async (product: Product) => {
    try {
      useModalStore.getState().setLoading(true);
      await apiClient.put(`/Products/${product.Id}/reactivate`);
      useCacheInvalidationStore.getState().invalidateProduct();
      useCacheInvalidationStore.getState().invalidatePos();
      await loadData();
      useModalStore.getState().showModal({
        title: "Thành công",
        message: `Đã kích hoạt lại sản phẩm "${product.Name}".`,
        type: "success"
      });
    } catch (e: any) {
      const apiError = parseApiError(e);
      useModalStore.getState().showModal({
        title: apiError.title || "Lỗi",
        message: apiError.message || "Không thể kích hoạt lại sản phẩm.",
        type: "error"
      });
    } finally {
      useModalStore.getState().setLoading(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    useModalStore.getState().showModal({
      title: "Xóa vĩnh viễn sản phẩm",
      message: `Bạn có chắc chắn muốn xóa vĩnh viễn sản phẩm "${product.Name}"? Hành động này không thể hoàn tác nếu sản phẩm chưa phát sinh chứng từ.`,
      type: "confirm",
      destructive: true,
      confirmText: "Xóa vĩnh viễn",
      onConfirm: async () => {
        try {
          useModalStore.getState().setLoading(true);
          await apiClient.delete(`/Products/${product.Id}`);
          await deleteLocalProduct(product.Id.toString());
          useCacheInvalidationStore.getState().invalidateProduct();
          useCacheInvalidationStore.getState().invalidatePos();
          await loadData();
          useModalStore.getState().showModal({ title: "Thành công", message: "Đã xóa vĩnh viễn sản phẩm.", type: "success" });
        } catch (e: any) {
          useModalStore.getState().setLoading(false);
          // If deletion failed due to linked invoices or receipts, prompt business flow
          useModalStore.getState().showModal({
            title: "Không thể xóa vĩnh viễn",
            message: "Không thể xóa vĩnh viễn sản phẩm này vì đã phát sinh chứng từ. Bạn có thể chọn Ngừng kinh doanh để ẩn sản phẩm khỏi màn hình bán hàng nhưng vẫn giữ nguyên hóa đơn, phiếu nhập và báo cáo lịch sử.",
            type: "confirm",
            destructive: true,
            confirmText: "Ngừng kinh doanh",
            onConfirm: () => handleOpenDeactivate(product)
          });
        }
      }
    });
  };

  useEffect(() => {
    if (!products || products.length === 0) return;
    if (targetProductId || targetBarcode) {
      const found = products.find(p =>
        (targetProductId && (String(p.Id) === String(targetProductId))) ||
        (targetBarcode && p.Barcode && p.Barcode.toLowerCase() === targetBarcode.toLowerCase())
      );
      if (found) {
        handleOpenProductEdit(found);
        setTimeout(() => {
          if (focusField === "price") {
            priceInputRef.current?.focus?.();
          } else if (focusField === "lowStockThreshold") {
            thresholdInputRef.current?.focus?.();
          }
        }, 300);
      }
    }
  }, [targetProductId, targetBarcode, focusField, products]);

  const handleOpenProductEdit = (product: Product) => {
    setEditProductForm({
      id: product.Id,
      name: product.Name,
      barcode: product.Barcode,
      price: product.Price.toString(),
      categoryId: product.CategoryId ? product.CategoryId.toString() : "",
      supplierId: product.SupplierId ? product.SupplierId.toString() : "",
      imageUrl: product.ImageUrl || "",
      lowStockThreshold: (product.LowStockThreshold !== undefined && product.LowStockThreshold !== null) ? product.LowStockThreshold.toString() : "10",
    });
    setEditErrors({});
    setIsProductEditModalVisible(true);
  };

  const handleSaveProductEdit = async () => {
    const errors: typeof editErrors = {};
    if (!editProductForm.name.trim()) {
      errors.name = "Vui lòng nhập tên sản phẩm.";
    }
    const priceVal = parseFloat(editProductForm.price);
    if (editProductForm.price === "" || isNaN(priceVal) || priceVal < 0) {
      errors.price = "Giá bán không được nhỏ hơn 0.";
    }

    const thresholdVal = parseInt(editProductForm.lowStockThreshold.trim(), 10);
    if (editProductForm.lowStockThreshold.trim() === "" || isNaN(thresholdVal) || thresholdVal < 0 || editProductForm.lowStockThreshold.includes('.') || editProductForm.lowStockThreshold.includes(',')) {
      errors.lowStockThreshold = "Ngưỡng sắp hết phải là số nguyên lớn hơn hoặc bằng 0.";
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setEditErrors({});

    setIsLoading(true);
    try {
      let finalImageUrl = editProductForm.imageUrl;
      if (editProductForm.imageUrl && (editProductForm.imageUrl.startsWith("file:") || editProductForm.imageUrl.startsWith("blob:") || editProductForm.imageUrl.startsWith("data:"))) {
        const uploadResult = await uploadImageToCloudinary(editProductForm.imageUrl);
        if (uploadResult.isSuccess && uploadResult.url) {
          finalImageUrl = uploadResult.url;
        }
      }

      const payload = {
        name: editProductForm.name.trim(),
        barcode: editProductForm.barcode.trim(),
        price: parseFloat(editProductForm.price),
        categoryId: editProductForm.categoryId ? parseInt(editProductForm.categoryId, 10) : null,
        supplierId: editProductForm.supplierId ? parseInt(editProductForm.supplierId, 10) : null,
        imageUrl: finalImageUrl.trim() || null,
        isActive: true,
        lowStockThreshold: thresholdVal,
        isSalePriceConfigured: true,
      };

      await apiClient.put(`/Products/${editProductForm.id}`, payload);

      const db = await getDBConnection();
      await db.runAsync(
        "UPDATE LocalProducts SET Name = ?, Barcode = ?, Price = ?, CategoryId = ?, SupplierId = ?, ImageUrl = ?, LowStockThreshold = ?, IsSalePriceConfigured = 1 WHERE Id = ?",
        [payload.name, payload.barcode, payload.price, payload.categoryId || 1, payload.supplierId, payload.imageUrl, payload.lowStockThreshold, editProductForm.id]
      );

      setIsProductEditModalVisible(false);
      useCacheInvalidationStore.getState().invalidateProduct();
      useCacheInvalidationStore.getState().invalidateInventory();
      useCacheInvalidationStore.getState().invalidatePos();
      useModalStore.getState().showModal({
        title: "Thành công",
        message: "Đã cập nhật thông tin sản phẩm thành công!",
        type: "success"
      });
      await loadData();
    } catch (e: any) {
      const apiError = parseApiError(e);
      useModalStore.getState().showModal({
        title: apiError.title || "Lỗi",
        message: apiError.message,
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickImage = async (mode: 'camera' | 'library' = 'library') => {
    try {
      if (mode === 'camera') {
        if (Platform.OS === 'web') {
          setCameraVisible(true);
          return;
        }
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
          useModalStore.getState().showModal({
            title: "Quyền camera",
            message: "Bạn cần cấp quyền sử dụng camera trong cài đặt thiết bị.",
            type: "error"
          });
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          setCropperRawUri(result.assets[0].uri);
          setCropperTarget("new");
          setCropperVisible(true);
        }
      } else {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          setCropperRawUri(result.assets[0].uri);
          setCropperTarget("new");
          setCropperVisible(true);
        }
      }
    } catch (err: any) {
      console.warn("Lỗi chọn ảnh:", err);
    }
  };

  // Section 3: INLINE VALIDATION FOR ADD PRODUCT
  const handleAddProduct = async () => {
    const errors: typeof formErrors = {};
    const trimmedName = newProduct.name.trim();
    if (!trimmedName) {
      errors.name = "Vui lòng nhập tên sản phẩm.";
    }

    const salePrice = parseFloat(newProduct.price);
    if (newProduct.price.trim() === "" || isNaN(salePrice) || salePrice < 0) {
      errors.price = "Giá bán không được nhỏ hơn 0.";
    }

    const costPriceVal = parseFloat(newProduct.costPrice);
    if (newProduct.costPrice.trim() === "" || isNaN(costPriceVal) || costPriceVal < 0) {
      errors.costPrice = "Giá nhập không được nhỏ hơn 0.";
    }

    if (!newProduct.categoryId) {
      errors.categoryId = "Vui lòng chọn danh mục.";
    }

    if (!newProduct.supplierId) {
      errors.supplierId = "Vui lòng chọn nhà cung cấp.";
    }

    const trimmedStock = newProduct.stock.trim();
    if (!trimmedStock) {
      errors.stock = "Tồn đầu kỳ không được để trống.";
    } else {
      const initialStock = parseInt(trimmedStock, 10);
      if (isNaN(initialStock) || initialStock < 0 || trimmedStock.includes('.') || trimmedStock.includes(',')) {
        errors.stock = "Tồn đầu kỳ không được nhỏ hơn 0.";
      }
    }

    const thresholdVal = parseInt(newProduct.lowStockThreshold.trim(), 10);
    if (!newProduct.lowStockThreshold.trim() || isNaN(thresholdVal) || thresholdVal < 0 || newProduct.lowStockThreshold.includes('.') || newProduct.lowStockThreshold.includes(',')) {
      errors.lowStockThreshold = "Ngưỡng sắp hết phải là số nguyên lớn hơn hoặc bằng 0.";
    }

    const trimmedBarcode = newProduct.barcode.trim();
    if (!trimmedBarcode) {
      errors.barcode = "Vui lòng nhập hoặc quét mã vạch.";
    } else {
      const isDuplicate = products.some(p => p.Barcode && p.Barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase());
      if (isDuplicate) {
        errors.barcode = "Mã vạch này đã được sử dụng.";
      }
    }

    if (!newProduct.imageUrl || !newProduct.imageUrl.trim()) {
      errors.imageUrl = "Vui lòng chọn hoặc chụp ảnh sản phẩm.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    setIsLoading(true);
    try {
      let finalImageUrl = "";
      if (newProduct.imageUrl.startsWith("file:") || newProduct.imageUrl.startsWith("blob:") || newProduct.imageUrl.startsWith("data:")) {
        const uploadResult = await uploadImageToCloudinary(newProduct.imageUrl);
        if (!uploadResult.isSuccess) {
          setIsLoading(false);
          useModalStore.getState().showModal({
            title: "Lỗi tải ảnh",
            message: "Không thể tải ảnh sản phẩm lên máy chủ. Vui lòng thử lại.",
            type: "error"
          });
          return;
        }
        finalImageUrl = uploadResult.url || "";
      } else {
        finalImageUrl = newProduct.imageUrl.trim();
      }

      const initialStock = parseInt(newProduct.stock.trim(), 10);

      const payload = {
        categoryId: parseInt(newProduct.categoryId, 10),
        supplierId: parseInt(newProduct.supplierId, 10),
        name: trimmedName,
        barcode: trimmedBarcode,
        price: salePrice,
        costPrice: costPriceVal,
        isActive: true,
        imageUrl: finalImageUrl,
        lowStockThreshold: thresholdVal,
        isSalePriceConfigured: true,
      };

      const createRes = await apiClient.post('/Products', payload);
      let serverId: number;
      let serverProduct: any = null;

      if (typeof createRes.data.data === 'object' && createRes.data.data !== null && createRes.data.data.id) {
        serverId = createRes.data.data.id;
        serverProduct = createRes.data.data;
      } else {
        serverId = createRes.data.data;
        const prodRes = await apiClient.get(`/Products/${serverId}`);
        serverProduct = prodRes.data.data;
      }

      await insertLocalProduct(
        serverId.toString(),
        serverProduct.categoryId || serverProduct.CategoryId || payload.categoryId,
        serverProduct.name || serverProduct.Name || payload.name,
        serverProduct.price || serverProduct.Price || payload.price,
        serverProduct.barcode || serverProduct.Barcode || payload.barcode,
        0,
        serverProduct.imageUrl || serverProduct.ImageUrl || payload.imageUrl || undefined,
        serverProduct.supplierId || serverProduct.SupplierId || payload.supplierId,
        thresholdVal,
        true
      );

      let inventorySuccess = true;
      try {
        await updateLocalProductStock(serverId.toString(), initialStock);

        if (initialStock > 0) {
          const selectedSupplier = suppliers.find(s => s.Id.toString() === newProduct.supplierId);
          const offlineReferenceId = typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : `GR_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await insertLocalGoodsReceipt(
            offlineReferenceId,
            selectedSupplier?.Id || parseInt(newProduct.supplierId, 10),
            selectedSupplier?.Name || "Nhà cung cấp",
            useAuthStore.getState().user?.id || 0,
            initialStock * costPriceVal,
            "Nhập tồn kho ban đầu",
            [{ productId: serverId.toString(), quantity: initialStock, costPrice: costPriceVal }]
          );
          useGlobalSyncStore.getState().syncNow("product-opening-stock-created");
        }
      } catch (e) {
        inventorySuccess = false;
      }

      setIsAddModalVisible(false);
      setNewProduct({ name: "", barcode: "", price: "", costPrice: "", categoryId: "", stock: "", imageUrl: "", supplierId: "", lowStockThreshold: "10" });
      setCategorySearch("");
      setSupplierSearch("");
      setFormErrors({});

      useModalStore.getState().showModal({
        title: "Thành công",
        message: inventorySuccess ? "Đã thêm sản phẩm thành công!" : "Sản phẩm đã được tạo nhưng tồn kho đầu kỳ chưa được ghi nhận.",
        type: "success"
      });

      useCacheInvalidationStore.getState().invalidateProduct();
      useCacheInvalidationStore.getState().invalidateGoodsReceipt();
      await loadData();
    } catch (e: any) {
      const apiError = parseApiError(e);
      if (apiError.message?.toLowerCase().includes("mã vạch") || apiError.message?.toLowerCase().includes("barcode")) {
        setFormErrors(prev => ({ ...prev, barcode: "Mã vạch này đã được sử dụng." }));
      } else {
        useModalStore.getState().showModal({
          title: apiError.title || "Lỗi",
          message: apiError.message || "Không thể tạo sản phẩm.",
          type: "error"
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " ₫";

  return (
    <View className="flex-1 bg-white">
      {/* Search and Filters */}
      <View className="px-6 py-2 bg-white">
        <View className="flex-row items-center mb-1">
          <View className="flex-row items-center border-b-2 border-black flex-1 mr-2 pb-2">
            <Ionicons name="search" size={18} color="#000" />
            <TextInput
              className="flex-1 ml-3 h-10 text-base text-black"
              placeholder=""
              accessibilityLabel="Tìm kiếm theo tên hoặc mã vạch"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} accessibilityLabel="Xóa tìm kiếm">
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => { setScannerMode("search"); setIsScannerVisible(true); }}
            className="bg-black w-12 h-12 justify-center items-center"
            accessibilityLabel="Quét mã vạch tìm kiếm"
          >
            <Ionicons name="barcode-outline" size={22} color="white" />
          </TouchableOpacity>
          {canManageProducts && (
            <TouchableOpacity
              testID="add-product-button"
              accessibilityLabel="Thêm sản phẩm"
              onPress={() => {
                setFormErrors({});
                setIsAddModalVisible(true);
              }}
              className="bg-black w-12 h-12 justify-center items-center ml-2"
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Pills */}
      <View className="bg-white pb-3 border-b-2 border-black">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item.Id.toString()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}
          renderItem={({ item }) => {
            const isSelected = (selectedCategoryId === null && item.Id === -1) || selectedCategoryId === item.Id;
            return (
              <TouchableOpacity
                onPress={() => setSelectedCategoryId(isSelected ? null : item.Id)}
                className={`border-2 border-black px-5 py-2.5 mr-3 ${isSelected ? "bg-black" : "bg-white"}`}
              >
                <Text className={`font-semibold ${isSelected ? "text-white" : "text-black"}`} style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                  {item.Name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Product List */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.Id}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        refreshing={isLoading}
        onRefresh={loadData}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const threshold = item.LowStockThreshold ?? 10;
          const isMissingPrice = (item as any).IsSalePriceConfigured === 0 || (item as any).IsSalePriceConfigured === false || (item as any).isSalePriceConfigured === false;
          const isOutOfStock = item.StockQuantity <= 0;
          const isLowStock = item.StockQuantity > 0 && item.StockQuantity <= threshold;
          const isInactive = (item as any).IsActive === false || (item as any).isActive === false;

          return (
            <View className={`p-3 sm:p-4 mb-3 sm:mb-4 border-2 border-black flex flex-row items-center ${isInactive ? 'bg-gray-100 opacity-75' : 'bg-white'}`}>
              <View className="relative">
                <Image
                  source={{ uri: item.ImageUrl || 'https://via.placeholder.com/800x800.png?text=POS' }}
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100"
                  resizeMode="cover"
                />
                {isOutOfStock && !isInactive && (
                  <View className="absolute inset-0 bg-white/70 items-center justify-center">
                    <View className="bg-black px-2 py-1">
                      <Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>HẾT HÀNG</Text>
                    </View>
                  </View>
                )}
              </View>

              <View className="flex-1 ml-3 sm:ml-4 justify-center">
                <View className="flex-row items-center mb-1 flex-wrap">
                  <View className="border border-black px-2 py-0.5 mr-2">
                    <Text className="text-black font-bold" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{item.CategoryName}</Text>
                  </View>
                  {isInactive && (
                    <View className="bg-black px-2 py-0.5 mr-2">
                      <Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>NGỪNG KD</Text>
                    </View>
                  )}
                  {isMissingPrice && !isInactive && (
                    <View className="bg-amber-600 px-2 py-0.5 mr-2">
                      <Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>THIẾU GIÁ</Text>
                    </View>
                  )}
                  <Text className="flex-1" style={{ fontSize: 10, color: '#525252', letterSpacing: 1 }} numberOfLines={1}>{item.Barcode}</Text>
                </View>
                <Text className="font-bold text-base text-black mb-1" numberOfLines={2}>{item.Name}</Text>
                <Text className="text-black font-black mb-2" style={{ fontFamily: 'serif', fontSize: 16 }}>
                  {isMissingPrice ? "Chưa cấu hình giá" : formatCurrency(item.Price)}
                </Text>
                <View className="flex-row items-center mb-1">
                  <Text style={{ fontSize: 10, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>Tồn kho:</Text>
                  <Text className="font-black text-base ml-1 text-black" style={{ fontFamily: 'serif' }}>{item.StockQuantity}</Text>
                  <Text className="ml-2 text-gray-500 font-semibold text-xs">(Ngưỡng: {threshold})</Text>
                  {isLowStock && !isOutOfStock && !isInactive && (
                    <Text className="ml-2 text-amber-600 font-bold" style={{ fontSize: 9, letterSpacing: 1 }}>● SẮP HẾT</Text>
                  )}
                </View>
                <View className="flex-row items-center">
                  <Text style={{ fontSize: 10, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>Nhà CC:</Text>
                  <Text className="font-bold text-xs ml-1 text-black" numberOfLines={1}>
                    {suppliers.find(s => s.Id === item.SupplierId)?.Name || item.SupplierName || "Chưa có"}
                  </Text>
                </View>
              </View>

              <View className="flex-col">
                {canManageProducts && (
                  <TouchableOpacity
                    onPress={() => handleOpenProductEdit(item)}
                    className="border-2 border-black h-9 w-9 items-center justify-center ml-2 mb-1.5 bg-white"
                    accessibilityLabel={`edit-product-${item.Id}`}
                  >
                    <Ionicons name="create-outline" size={16} color="#000" />
                  </TouchableOpacity>
                )}
                {canEditStock && (
                  <TouchableOpacity
                    testID={`edit-stock-btn-${item.Id}`}
                    accessibilityLabel={`adjust-stock-${item.Id}`}
                    onPress={() => handleOpenEdit(item)}
                    className="border-2 border-black h-9 w-9 items-center justify-center ml-2 mb-1.5 bg-gray-100"
                  >
                    <Ionicons name="cube-outline" size={16} color="#000" />
                  </TouchableOpacity>
                )}
                {canManageProducts && isInactive ? (
                  <TouchableOpacity
                    onPress={() => handleReactivateProduct(item)}
                    className="bg-black h-9 w-9 items-center justify-center ml-2"
                    accessibilityLabel={`reactivate-${item.Id}`}
                  >
                    <Ionicons name="refresh-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                ) : canManageProducts ? (
                  <TouchableOpacity
                    onPress={() => handleDeleteProduct(item)}
                    className="bg-black h-9 w-9 items-center justify-center ml-2"
                    accessibilityLabel={`delete-product-${item.Id}`}
                  >
                    <Ionicons name="trash-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center mt-20">
            <Ionicons name="cube-outline" size={48} color="#525252" />
            <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
            <Text className="font-bold text-lg text-black">Không tìm thấy sản phẩm</Text>
          </View>
        }
      />

      {/* Stock Adjustment Modal */}
      <Modal visible={isEditModalVisible} transparent={true} animationType="fade" onRequestClose={() => !isSubmittingStock && SetIsEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2" testID="stock-adjust-modal">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-black text-black" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Điều chỉnh tồn kho</Text>
              <TouchableOpacity
                disabled={isSubmittingStock}
                onPress={() => SetIsEditModalVisible(false)}
                className="w-8 h-8 border-2 border-black items-center justify-center"
                testID="stock-adjust-close-btn"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            {selectedProduct && (
              <View className="border-2 border-black p-4 mb-4 flex-row items-center bg-gray-50">
                <Image source={{ uri: selectedProduct.ImageUrl }} className="w-14 h-14 mr-3 bg-white" />
                <View className="flex-1">
                  <Text className="font-bold text-black text-sm mb-0.5">{selectedProduct.Name}</Text>
                  <Text style={{ fontSize: 10, color: '#525252', letterSpacing: 1 }}>MÃ: {selectedProduct.Barcode}</Text>
                  <View className="flex-row items-center mt-1">
                    <Text style={{ fontSize: 11, color: '#525252' }}>Tồn kho hiện tại: </Text>
                    <Text className="font-black text-sm text-black" testID="stock-adjust-current-stock">{selectedProduct.StockQuantity}</Text>
                  </View>
                </View>
              </View>
            )}

            <Text className="text-black font-bold text-center mb-2" style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Tồn mới *</Text>
            <View className="flex-row items-center justify-center mb-2">
              <TouchableOpacity
                disabled={isSubmittingStock}
                onPress={() => handleStockChange(-1)}
                className="w-12 h-12 border-2 border-black items-center justify-center bg-white"
                testID="stock-adjust-minus-btn"
              >
                <Ionicons name="remove" size={20} color="#000" />
              </TouchableOpacity>
              <TextInput
                className="border-b-4 border-black px-2 h-12 w-28 mx-3 text-2xl font-black text-black bg-white text-center"
                keyboardType="numeric"
                value={newStock}
                onChangeText={(t) => {
                  setNewStock(t);
                  setAdjustmentError(null);
                }}
                selectTextOnFocus
                maxLength={6}
                editable={!isSubmittingStock}
                style={{ fontFamily: 'serif' }}
                testID="stock-adjust-new-stock-input"
              />
              <TouchableOpacity
                disabled={isSubmittingStock}
                onPress={() => handleStockChange(1)}
                className="w-12 h-12 border-2 border-black items-center justify-center bg-white"
                testID="stock-adjust-plus-btn"
              >
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <View className="items-center mb-4">
                <Text style={{ fontSize: 11, color: '#525252' }} testID="stock-adjust-delta-text">
                  Chênh lệch: {((parseInt(newStock, 10) || 0) - selectedProduct.StockQuantity) > 0 ? '+' : ''}
                  {(parseInt(newStock, 10) || 0) - selectedProduct.StockQuantity}
                </Text>
              </View>
            )}

            <View className="mb-4">
              <FieldLabel label="Lý do *" />
              <TextInput
                className={`border-2 ${adjustmentError ? 'border-red-500' : 'border-black'} p-3 text-sm text-black bg-white`}
                placeholder=""
                value={adjustmentReason}
                onChangeText={(t) => {
                  setAdjustmentReason(t);
                  setAdjustmentError(null);
                }}
                editable={!isSubmittingStock}
                testID="stock-adjust-reason-input"
              />
              {adjustmentError && <FieldError error={adjustmentError} />}
            </View>

            <CustomButton
              title={isSubmittingStock ? "Đang lưu..." : "Xác nhận điều chỉnh →"}
              onPress={handleSaveStock}
              loading={isSubmittingStock}
              disabled={isSubmittingStock}
              testID="stock-adjust-submit-btn"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Product Modal (Section 3: INLINE VALIDATION, Section 4: CAMERA & CROP) */}
      <Modal visible={isAddModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-center items-center">
          <View className="bg-white w-full max-w-2xl border-t-4 border-black sm:border-2" style={{ maxHeight: '90%' }}>
            <View className="flex-row justify-between items-center p-4 border-b-2 border-black bg-white z-10">
              <Text className="font-black text-black" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>Thêm sản phẩm</Text>
              <TouchableOpacity
                accessibilityLabel="close-add-product"
                testID="close-add-product"
                onPress={() => setIsAddModalVisible(false)}
                className="w-8 h-8 border-2 border-black items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView className="p-4" contentContainerStyle={{ paddingBottom: 24 }}>
              {/* TÊN SẢN PHẨM */}
              <View className="mb-4">
                <CustomInput
                  label="Tên sản phẩm *"
                  value={newProduct.name}
                  error={formErrors.name}
                  onChangeText={(t) => {
                    setNewProduct({ ...newProduct, name: t });
                    if (formErrors.name) setFormErrors(prev => ({ ...prev, name: undefined }));
                  }}
                />
              </View>

              {/* ẢNH SẢN PHẨM (Section 4 & 4A: Chụp ảnh & Chọn từ thư viện) */}
              <View className="mb-4 border-2 border-black p-3 bg-gray-50">
                <FieldLabel label="Ảnh sản phẩm *" />
                <View className="flex-row items-center">
                  {newProduct.imageUrl ? (
                    <View className="relative mr-4">
                      <Image source={{ uri: newProduct.imageUrl }} className="w-24 h-24 border-2 border-black bg-white" resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => {
                          setNewProduct(prev => ({ ...prev, imageUrl: "" }));
                        }}
                        className="absolute -top-2 -right-2 bg-red-600 w-6 h-6 rounded-full items-center justify-center border border-white"
                        accessibilityLabel="Xóa ảnh"
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View className={`w-24 h-24 bg-gray-200 border-2 ${formErrors.imageUrl ? 'border-red-500' : 'border-dashed border-black'} justify-center items-center mr-4`}>
                      <Ionicons name="image-outline" size={32} color="#666" />
                    </View>
                  )}
                  <View className="flex-1">
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handlePickImage('camera')}
                        className="border-2 border-black px-3 py-2 bg-black flex-row items-center"
                        accessibilityLabel="Chụp ảnh sản phẩm"
                      >
                        <Ionicons name="camera-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                        <Text className="text-xs font-bold uppercase text-white">Chụp ảnh</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handlePickImage('library')}
                        className="border-2 border-black px-3 py-2 bg-white flex-row items-center"
                        accessibilityLabel="Chọn ảnh từ thư viện"
                      >
                        <Ionicons name="images-outline" size={16} color="#000" style={{ marginRight: 4 }} />
                        <Text className="text-xs font-bold uppercase text-black">Chọn ảnh</Text>
                      </TouchableOpacity>
                    </View>
                    <Text className="text-[11px] text-gray-500 mt-2">Hỗ trợ JPG, PNG (tối đa 5MB). Tỷ lệ vuông 1:1.</Text>
                    {formErrors.imageUrl && <FieldError error={formErrors.imageUrl} />}
                  </View>
                </View>
              </View>

              {/* GIÁ BÁN & GIÁ NHẬP */}
              <View className="flex-col md:flex-row gap-4 mb-4">
                <View className="flex-1">
                  <CustomInput
                    label="Giá bán *"
                    keyboardType="numeric"
                    value={newProduct.price}
                    error={formErrors.price}
                    onChangeText={(t) => {
                      setNewProduct({ ...newProduct, price: t });
                      if (formErrors.price) setFormErrors(prev => ({ ...prev, price: undefined }));
                    }}
                  />
                </View>
                <View className="flex-1">
                  <CustomInput
                    label="Giá nhập *"
                    keyboardType="numeric"
                    value={newProduct.costPrice}
                    error={formErrors.costPrice}
                    onChangeText={(t) => {
                      setNewProduct({ ...newProduct, costPrice: t });
                      if (formErrors.costPrice) setFormErrors(prev => ({ ...prev, costPrice: undefined }));
                    }}
                  />
                </View>
              </View>

              {/* DANH MỤC VÀ NHÀ CUNG CẤP */}
              <View className="flex-col md:flex-row gap-4 mb-4">
                <View className="flex-1">
                  <FieldLabel label="Danh mục *" />
                  <TextInput
                    className="border border-black p-2 text-xs bg-white mb-2"
                    placeholder=""
                    accessibilityLabel="Tìm danh mục"
                    value={categorySearch}
                    onChangeText={setCategorySearch}
                  />
                  <ScrollView style={{ maxHeight: 110 }} className={`border ${formErrors.categoryId ? 'border-red-500' : 'border-gray-300'} p-2 bg-gray-50`}>
                    {categories
                      .filter(cat => cat.Id !== -1 && cat.Name.toLowerCase().includes(categorySearch.toLowerCase()))
                      .map(cat => (
                        <TouchableOpacity
                          key={cat.Id}
                          onPress={() => {
                            setNewProduct({ ...newProduct, categoryId: cat.Id.toString() });
                            if (formErrors.categoryId) setFormErrors(prev => ({ ...prev, categoryId: undefined }));
                          }}
                          className={`px-3 py-1.5 mb-1 border border-black ${newProduct.categoryId === cat.Id.toString() ? 'bg-black' : 'bg-white'}`}
                        >
                          <Text className={`text-xs font-bold ${newProduct.categoryId === cat.Id.toString() ? 'text-white' : 'text-black'}`}>{cat.Name}</Text>
                        </TouchableOpacity>
                      ))}
                    {categories.filter(cat => cat.Id !== -1 && cat.Name.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                      <Text className="text-xs text-gray-500 italic p-2">Không tìm thấy danh mục</Text>
                    )}
                  </ScrollView>
                  {formErrors.categoryId && <FieldError error={formErrors.categoryId} />}
                </View>

                <View className="flex-1">
                  <FieldLabel label="Nhà cung cấp *" />
                  <TextInput
                    className="border border-black p-2 text-xs bg-white mb-2"
                    placeholder=""
                    accessibilityLabel="Tìm nhà cung cấp"
                    value={supplierSearch}
                    onChangeText={setSupplierSearch}
                  />
                  <ScrollView style={{ maxHeight: 110 }} className={`border ${formErrors.supplierId ? 'border-red-500' : 'border-gray-300'} p-2 bg-gray-50`}>
                    {suppliers
                      .filter(sup => sup.Name.toLowerCase().includes(supplierSearch.toLowerCase()))
                      .map(sup => (
                        <TouchableOpacity
                          key={sup.Id}
                          onPress={() => {
                            setNewProduct({ ...newProduct, supplierId: sup.Id.toString() });
                            if (formErrors.supplierId) setFormErrors(prev => ({ ...prev, supplierId: undefined }));
                          }}
                          className={`px-3 py-1.5 mb-1 border border-black ${newProduct.supplierId === sup.Id.toString() ? 'bg-black' : 'bg-white'}`}
                        >
                          <Text className={`text-xs font-bold ${newProduct.supplierId === sup.Id.toString() ? 'text-white' : 'text-black'}`}>{sup.Name}</Text>
                        </TouchableOpacity>
                      ))}
                    {suppliers.filter(sup => sup.Name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                      <Text className="text-xs text-gray-500 italic p-2">Không tìm thấy nhà cung cấp</Text>
                    )}
                  </ScrollView>
                  {formErrors.supplierId && <FieldError error={formErrors.supplierId} />}
                </View>
              </View>

              {/* TỒN ĐẦU KỲ - MÃ VẠCH */}
              <View className="flex-col md:flex-row gap-4 mb-4">
                <View className="flex-1">
                  <CustomInput
                    label="Tồn đầu kỳ *"
                    keyboardType="numeric"
                    inputMode="numeric"
                    value={newProduct.stock}
                    error={formErrors.stock}
                    onChangeText={(t) => {
                      setNewProduct({ ...newProduct, stock: t });
                      if (formErrors.stock) setFormErrors(prev => ({ ...prev, stock: undefined }));
                    }}
                  />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-end">
                    <View className="flex-1">
                      <CustomInput
                        label="Mã vạch *"
                        value={newProduct.barcode}
                        error={formErrors.barcode}
                        onChangeText={(t) => {
                          setNewProduct({ ...newProduct, barcode: t });
                          if (formErrors.barcode) setFormErrors(prev => ({ ...prev, barcode: undefined }));
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => { setScannerMode("add"); setIsScannerVisible(true); }}
                      className="w-12 h-12 bg-black justify-center items-center mb-4 ml-2 border-2 border-black"
                      accessibilityLabel="Quét mã vạch cho sản phẩm mới"
                    >
                      <Ionicons name="barcode" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* NGƯỠNG SẮP HẾT */}
              <View className="mb-4">
                <CustomInput
                  label="Ngưỡng sắp hết *"
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={newProduct.lowStockThreshold}
                  error={formErrors.lowStockThreshold}
                  onChangeText={(t) => {
                    setNewProduct({ ...newProduct, lowStockThreshold: t });
                    if (formErrors.lowStockThreshold) setFormErrors(prev => ({ ...prev, lowStockThreshold: undefined }));
                  }}
                />
              </View>
            </ScrollView>

            <View className="p-4 border-t-2 border-black bg-white">
              <CustomButton title="THÊM SẢN PHẨM" onPress={handleAddProduct} loading={isLoading} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Product Info Modal */}
      <Modal visible={isProductEditModalVisible} transparent={true} animationType="slide" onRequestClose={() => setIsProductEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-lg border-t-4 border-black sm:border-2 max-h-[90vh]">
            <View className="flex-row justify-between items-center mb-4 border-b-2 border-black pb-3">
              <Text className="text-base font-black text-black uppercase tracking-widest">Sửa thông tin sản phẩm</Text>
              <TouchableOpacity onPress={() => setIsProductEditModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center">
                <Ionicons name="close" size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4">
                <CustomInput
                  label="Tên sản phẩm *"
                  value={editProductForm.name}
                  error={editErrors.name}
                  onChangeText={(t) => {
                    setEditProductForm({ ...editProductForm, name: t });
                    if (editErrors.name) setEditErrors(prev => ({ ...prev, name: undefined }));
                  }}
                />
              </View>

              <View className="mb-4">
                <CustomInput
                  label="Mã vạch"
                  value={editProductForm.barcode}
                  onChangeText={(t) => setEditProductForm({ ...editProductForm, barcode: t })}
                />
              </View>

              <View className="mb-4">
                <CustomInput
                  ref={priceInputRef}
                  label="Giá bán *"
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={editProductForm.price}
                  error={editErrors.price}
                  onChangeText={(t) => {
                    setEditProductForm({ ...editProductForm, price: t });
                    if (editErrors.price) setEditErrors(prev => ({ ...prev, price: undefined }));
                  }}
                />
              </View>

              <View className="mb-4">
                <CustomInput
                  ref={thresholdInputRef}
                  label="Ngưỡng sắp hết *"
                  keyboardType="numeric"
                  inputMode="numeric"
                  value={editProductForm.lowStockThreshold}
                  error={editErrors.lowStockThreshold}
                  onChangeText={(t) => {
                    setEditProductForm({ ...editProductForm, lowStockThreshold: t });
                    if (editErrors.lowStockThreshold) setEditErrors(prev => ({ ...prev, lowStockThreshold: undefined }));
                  }}
                />
              </View>

              {/* Danh mục */}
              <View className="mb-4">
                <FieldLabel label="Danh mục" />
                <View className="flex-row flex-wrap">
                  {categories.filter(c => c.Id !== -1).map((cat) => (
                    <TouchableOpacity
                      key={cat.Id}
                      onPress={() => setEditProductForm({ ...editProductForm, categoryId: cat.Id.toString() })}
                      className={`px-3 py-2 mr-2 mb-2 border border-black ${editProductForm.categoryId === cat.Id.toString() ? "bg-black" : "bg-white"}`}
                    >
                      <Text className={`text-xs font-bold ${editProductForm.categoryId === cat.Id.toString() ? "text-white" : "text-black"}`}>
                        {cat.Name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Nhà cung cấp */}
              <View className="mb-4">
                <FieldLabel label="Nhà cung cấp" />
                <View className="flex-row flex-wrap">
                  {suppliers.map((sup) => (
                    <TouchableOpacity
                      key={sup.Id}
                      onPress={() => {
                        const newSupId = editProductForm.supplierId === sup.Id.toString() ? "" : sup.Id.toString();
                        setEditProductForm({ ...editProductForm, supplierId: newSupId });
                      }}
                      className={`px-3 py-2 mr-2 mb-2 border border-black ${editProductForm.supplierId === sup.Id.toString() ? "bg-black" : "bg-white"}`}
                    >
                      <Text className={`text-xs font-bold ${editProductForm.supplierId === sup.Id.toString() ? "text-white" : "text-black"}`}>
                        {sup.Name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View className="pt-4 border-t-2 border-black">
              <CustomButton title="LƯU THAY ĐỔI" onPress={handleSaveProductEdit} loading={isLoading} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Barcode Scanner Modal */}
      <Modal visible={isScannerVisible} animationType="slide">
        <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setIsScannerVisible(false)} />
      </Modal>

      {/* Web / Mobile Camera Capture Modal */}
      <CameraCaptureModal
        visible={cameraVisible}
        onCapture={(capturedUri) => {
          setCameraVisible(false);
          setCropperRawUri(capturedUri);
          setCropperTarget("new");
          setCropperVisible(true);
        }}
        onCancel={() => setCameraVisible(false)}
      />

      {/* Image Cropper Modal (1:1 with pan, zoom, reset, white background) */}
      <ImageCropperModal
        visible={cropperVisible}
        imageUri={cropperRawUri}
        onConfirm={(croppedUri) => {
          if (cropperTarget === "new") {
            setNewProduct(prev => ({ ...prev, imageUrl: croppedUri }));
            if (formErrors.imageUrl) {
              setFormErrors(prev => ({ ...prev, imageUrl: undefined }));
            }
          } else {
            setEditProductForm(prev => ({ ...prev, imageUrl: croppedUri }));
          }
          setCropperVisible(false);
        }}
        onCancel={() => setCropperVisible(false)}
        onReplace={() => {
          setCropperVisible(false);
          handlePickImage('library');
        }}
      />

      {/* Deactivate Modal with Required Reason (Section 5) */}
      <DeactivateModal
        visible={!!deactivateTarget}
        title="Ngừng kinh doanh sản phẩm"
        itemName={deactivateTarget?.Name || ""}
        entityType="product"
        isLoading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </View>
  );
}
