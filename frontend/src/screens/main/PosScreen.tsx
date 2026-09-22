import BarcodeScanner from "@/components/BarcodeScanner";
import CheckoutModal from "@/components/CheckoutModal";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { useModalStore } from "@/store/useModalStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { useCacheInvalidationStore } from "@/store/useCacheInvalidationStore";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  Platform,
  Alert,
  Image,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  getLocalProducts,
  getLocalCategories,
  getLocalCustomers,
  LocalCustomerRow,
  getDBConnection,
  getLocalOrderDetails,
} from "@/database/db";
import { Ionicons } from "@expo/vector-icons";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useShiftStore } from "@/store/useShiftStore";
import { generateSalesReceiptHtml, SalesReceiptPrintData } from "@/utils/printTemplates";
import { printDocument } from "@/utils/printService";

interface Category {
  Id: number;
  Name: string;
}

interface Product {
  Id: string;
  CategoryId: number;
  Name: string;
  Price: number;
  Barcode: string;
  StockQuantity: number;
  ImageUrl?: string;
  IsSalePriceConfigured?: boolean | number;
  LowStockThreshold?: number;
  IsActive?: boolean | number;
  isActive?: boolean;
}

interface Customer extends LocalCustomerRow {}

export default function PosScreen() {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const currentShift = useShiftStore((state) => state.currentShift);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { user } = useAuthStore();
  const {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalPrice,
  } = useCartStore();

  const loadData = async () => {
    try {
      const cats = await getLocalCategories();
      setCategories(cats as Category[]);
      const prods = await getLocalProducts();
      setProducts(prods as Product[]);
      const custs = await getLocalCustomers();
      setCustomers(custs as Customer[]);
    } catch (error) {
      console.error("[Pos] Lỗi khi tải dữ liệu:", error);
    }
  };

  const isFocused = useIsFocused();
  const { lastSyncAt } = useGlobalSyncStore();
  const productVersion = useCacheInvalidationStore(state => state.productVersion);
  const posVersion = useCacheInvalidationStore(state => state.posVersion);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused, lastSyncAt, productVersion, posVersion]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [lastSyncAt, productVersion, posVersion])
  );

  const filteredProducts = products.filter((p: any) => {
    if (p.IsActive === false || p.isActive === false) return false;
    const name = p.Name || p.name || "";
    const barcode = p.Barcode || p.barcode || "";
    const categoryId = p.CategoryId || p.categoryid;

    const matchesQuery =
      name.toLowerCase().includes(query.toLowerCase()) ||
      barcode.includes(query);
    const matchesCategory =
      selectedCategory === null || categoryId === selectedCategory;

    return matchesQuery && matchesCategory;
  });

  const [cartQtyStrings, setCartQtyStrings] = useState<Record<string, string>>({});
  const [cartErrors, setCartErrors] = useState<Record<string, string>>({});

  const handleCartQtyChange = (productId: string, text: string) => {
    setCartQtyStrings(prev => ({ ...prev, [productId]: text }));
    if (text.trim() === "") {
      setCartErrors(prev => ({ ...prev, [productId]: "Số lượng không được để trống." }));
      return;
    }
    const parsed = parseInt(text.trim(), 10);
    if (isNaN(parsed) || text.includes('.') || text.includes(',')) {
      setCartErrors(prev => ({ ...prev, [productId]: "Số lượng phải là số nguyên." }));
      return;
    }
    if (parsed <= 0) {
      setCartErrors(prev => ({ ...prev, [productId]: "Số lượng phải lớn hơn 0." }));
      updateQuantity(productId, parsed);
      return;
    }
    const prod = products.find(p => p.Id === productId);
    if (prod && prod.StockQuantity < parsed) {
      setCartErrors(prev => ({ ...prev, [productId]: `Vượt tồn kho (chỉ còn ${prod.StockQuantity}).` }));
      updateQuantity(productId, parsed);
      return;
    }
    setCartErrors(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    updateQuantity(productId, parsed);
  };

  const handleCartQtyBlur = (productId: string) => {
    const raw = cartQtyStrings[productId]?.trim();
    const parsed = parseInt(raw || "0", 10);
    const prod = products.find(p => p.Id === productId);
    if (!raw || isNaN(parsed) || parsed <= 0) {
      setCartErrors(prev => ({ ...prev, [productId]: "Số lượng phải lớn hơn 0." }));
      return;
    }
    if (prod && prod.StockQuantity < parsed) {
      setCartErrors(prev => ({ ...prev, [productId]: `Vượt tồn kho (chỉ còn ${prod.StockQuantity}).` }));
    } else {
      setCartErrors(prev => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    setCartQtyStrings(prev => ({ ...prev, [productId]: String(parsed) }));
    updateQuantity(productId, parsed);
  };

  const handleCartQtyStep = (productId: string, step: number) => {
    const currentItem = items.find(i => i.productId === productId);
    if (!currentItem) return;
    const nextVal = currentItem.quantity + step;
    if (nextVal <= 0) {
      setCartErrors(prev => ({ ...prev, [productId]: "Số lượng phải lớn hơn 0." }));
      setCartQtyStrings(prev => ({ ...prev, [productId]: String(nextVal) }));
      updateQuantity(productId, nextVal);
      return;
    }
    const prod = products.find(p => p.Id === productId);
    if (prod && prod.StockQuantity < nextVal) {
      setCartErrors(prev => ({ ...prev, [productId]: `Vượt tồn kho (chỉ còn ${prod.StockQuantity}).` }));
      setCartQtyStrings(prev => ({ ...prev, [productId]: String(nextVal) }));
      updateQuantity(productId, nextVal);
      return;
    }
    setCartErrors(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setCartQtyStrings(prev => ({ ...prev, [productId]: String(nextVal) }));
    updateQuantity(productId, nextVal);
  };

  const handleScanSuccess = (barcode: string) => {
    const foundProduct = products.find((p: any) => p.Barcode === barcode && p.IsActive !== false && p.isActive !== false);

    if (foundProduct) {
      const isUnconfigured = (foundProduct as any).IsSalePriceConfigured === 0 || (foundProduct as any).IsSalePriceConfigured === false || (foundProduct as any).isSalePriceConfigured === false;
      if (isUnconfigured) {
        useModalStore.getState().showModal({
          title: "Chưa cấu hình giá",
          message: `Sản phẩm "${foundProduct.Name}" chưa được cấu hình giá bán nên không thể bán tại quầy POS.`,
          type: "error"
        });
        return;
      }
      if (foundProduct.StockQuantity <= 0) {
        useModalStore.getState().showModal({ title: "Lỗi", message: "Sản phẩm đã hết hàng", type: "error" });
        return;
      }
      addToCart({
        productId: foundProduct.Id,
        name: foundProduct.Name,
        price: foundProduct.Price,
      });
      const nextQ = (items.find(i => i.productId === foundProduct.Id)?.quantity || 0) + 1;
      setCartQtyStrings(prev => ({ ...prev, [foundProduct.Id]: String(nextQ) }));
    } else {
      useModalStore.getState().showModal({ title: "Không tìm thấy", message: "Không tìm thấy sản phẩm với mã vạch: " + barcode, type: "error" });
    }
  };

  const [isCheckoutModalVisible, setIsCheckoutModalVisible] = useState(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const isCheckingOutRef = useRef(false);

  const handleCheckoutClick = () => {
    if (items.length === 0) {
      return;
    }

    if (Object.keys(cartErrors).some(k => !!cartErrors[k])) {
      return;
    }

    let hasError = false;
    for (const item of items) {
      if (item.quantity <= 0) {
        setCartErrors(prev => ({ ...prev, [item.productId]: "Số lượng phải lớn hơn 0." }));
        hasError = true;
      }
      const prod = products.find((p) => p.Id === item.productId);
      if (prod) {
        const isUnconfigured = (prod as any).IsSalePriceConfigured === 0 || (prod as any).IsSalePriceConfigured === false || (prod as any).isSalePriceConfigured === false;
        if (isUnconfigured) {
          setCartErrors(prev => ({ ...prev, [item.productId]: "Sản phẩm chưa cấu hình giá bán." }));
          hasError = true;
        } else if (prod.StockQuantity < item.quantity) {
          setCartErrors(prev => ({ ...prev, [item.productId]: `Vượt tồn kho (chỉ còn ${prod.StockQuantity}).` }));
          hasError = true;
        }
      }
    }

    if (hasError) {
      return;
    }

    setIsCheckoutModalVisible(true);
  };

  const handlePrintInvoice = async (
    offlineReferenceId: string,
    totalPrice: number,
    employeeName: string,
    customerName: string,
    paymentMethod: string,
    customerGiven: number,
    snapshotItems?: any[]
  ) => {
    try {
      let printItems = snapshotItems;
      if (!printItems || printItems.length === 0) {
        const details = await getLocalOrderDetails(offlineReferenceId);
        printItems = details.map((d, idx) => {
          const prod = products.find(p => String(p.Id) === String(d.ProductId));
          return {
            stt: idx + 1,
            productName: prod?.Name || d.ProductName || `SP #${d.ProductId}`,
            barcode: prod?.Barcode || "",
            quantity: d.Quantity,
            unitPrice: d.Price || d.UnitPrice || 0,
            lineTotal: d.Quantity * (d.Price || d.UnitPrice || 0),
          };
        });
      }

      const receiptData: SalesReceiptPrintData = {
        storeName: "POS & WMS STORE",
        storeAddress: "Hệ thống Quản lý Bán hàng & Kho",
        title: "HÓA ĐƠN BÁN HÀNG",
        receiptNumber: offlineReferenceId.replace('ORD_', '').substring(0, 16),
        createdAt: new Date().toISOString(),
        cashierName: employeeName,
        customerName: customerName,
        paymentMethod: paymentMethod,
        items: printItems,
        subtotal: totalPrice,
        totalAmount: totalPrice,
        customerGivenAmount: customerGiven > 0 ? customerGiven : totalPrice,
        changeAmount: Math.max(0, customerGiven - totalPrice),
      };

      await printDocument({
        html: generateSalesReceiptHtml(receiptData),
        title: `Hóa đơn ${offlineReferenceId}`,
      });
    } catch (e) {
      console.error('[PosScreen] Lỗi khi in hóa đơn:', e);
    }
  };

  const handleConfirmCheckout = async (paymentMethod: string, customerGiven: number) => {
    if (isSubmittingCheckout || isCheckingOutRef.current) return;
    isCheckingOutRef.current = true;
    setIsSubmittingCheckout(true);
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const offlineReferenceId =
        typeof crypto !== "undefined" && (crypto as any).randomUUID
          ? (crypto as any).randomUUID()
          : `ORD_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const totalPrice = getTotalPrice();
      const createdAt = new Date().toISOString();

      const cName = selectedCustomer ? selectedCustomer.Name : (customerPhone || "Khách lẻ");
      let custId = selectedCustomer ? selectedCustomer.Id : null;
      if (!custId && customers && customers.length > 0) {
        const defaultCust = customers.find(c => c.Phone === "0000000000" || c.Name === "Khách lẻ");
        if (defaultCust) {
          custId = defaultCust.Id;
        }
      }
      const eName = user?.name || user?.username || "Không rõ";
      const shiftId = currentShift?.id || (currentShift as any)?.Id || null;

      // Build rich snapshot before cart is cleared
      const printSnapshotItems = items.map((item, idx) => ({
        stt: idx + 1,
        productName: item.name,
        barcode: products.find((p) => p.Id === item.productId)?.Barcode || "",
        quantity: item.quantity,
        unitPrice: item.price,
        lineTotal: item.quantity * item.price,
      }));

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO LocalOrders (OfflineReferenceId, CustomerId, TotalAmount, CreatedAt, CustomerName, EmployeeName, PaymentMethod, OwnerUserId, SyncStatus, ShiftId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
          [offlineReferenceId, custId, totalPrice, createdAt, cName, eName, paymentMethod, user?.id || null, shiftId],
        );

        for (const item of items) {
          await db.runAsync(
            `INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price) VALUES (?, ?, ?, ?)`,
            [offlineReferenceId, item.productId, item.quantity, item.price],
          );

          const prod = products.find((p) => p.Id === item.productId);
          if (prod) {
            const newStock = Math.max(0, prod.StockQuantity - item.quantity);
            await db.runAsync(
              `UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?`,
              [newStock, item.productId],
            );
          }
        }
      });
      setIsCheckoutModalVisible(false);
      clearCart();
      await loadData();

      // Mở hộp thoại in hóa đơn với dữ liệu đầy đủ
      await handlePrintInvoice(offlineReferenceId, totalPrice, eName, cName, paymentMethod, customerGiven, printSnapshotItems);

      useModalStore.getState().showModal({ title: "Thành công", message: "Thanh toán thành công!", type: "success" });

      // Trigger sync
      useCacheInvalidationStore.getState().invalidatePos();
      useCacheInvalidationStore.getState().invalidateInventory();
      useCacheInvalidationStore.getState().invalidateProduct();
      useGlobalSyncStore.getState().syncNow("order-created");
    } catch (error) {
      console.error("[Pos] Lỗi khi lưu đơn hàng", error);
      useModalStore.getState().showModal({ title: "Lỗi", message: "Không thể lưu đơn hàng xuống thiết bị", type: "error" });
    } finally {
      isCheckingOutRef.current = false;
      setIsSubmittingCheckout(false);
      setIsLoading(false);
    }
  };

  //Tạo lưới cho flatlist
  const [listWidth, setListWidth] = useState<number>(0);
  const DESIRED_ITEM_WIDTH = 140;
  const gap = 12;
  const numColumns =
    listWidth > 0
      ? Math.max(2, Math.floor((listWidth + gap) / (DESIRED_ITEM_WIDTH + gap)))
      : 3;
  const itemWidth = (listWidth - (numColumns - 1) * 12) / numColumns;

  const cartItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const showProductsPanel = isDesktop || mobileTab === 'products';
  const showCartPanel = isDesktop || mobileTab === 'cart';

  return (
    <SafeAreaView testID="pos-screen" className="flex-1 bg-white">
      {/* Mobile Tab Switcher */}
      {!isDesktop && (
        <View className="flex-row border-b-2 border-black bg-white">
          <TouchableOpacity
            testID="pos-tab-products"
            onPress={() => setMobileTab('products')}
            className={`flex-1 py-3 items-center border-r-2 border-black ${mobileTab === 'products' ? 'bg-black' : 'bg-white'}`}
          >
            <Text className={`font-bold text-xs uppercase tracking-wider ${mobileTab === 'products' ? 'text-white' : 'text-black'}`}>
              Sản phẩm ({filteredProducts.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="pos-tab-cart"
            onPress={() => setMobileTab('cart')}
            className={`flex-1 py-3 items-center flex-row justify-center ${mobileTab === 'cart' ? 'bg-black' : 'bg-white'}`}
          >
            <Ionicons name="cart-outline" size={16} color={mobileTab === 'cart' ? '#fff' : '#000'} style={{ marginRight: 6 }} />
            <Text className={`font-bold text-xs uppercase tracking-wider ${mobileTab === 'cart' ? 'text-white' : 'text-black'}`}>
              Giỏ hàng ({cartItemCount})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content Area */}
      <View className="flex-1 flex-col md:flex-row">
        {/* Product Catalog Panel */}
        {showProductsPanel && (
          <View
            className="flex-1 p-3 sm:p-4 md:border-r-2 border-black bg-white"
            onLayout={(event) => {
              setListWidth(event.nativeEvent.layout.width - 32);
            }}
          >
            {/* Search Bar with Barcode Scanner */}
            <View className="flex-row items-center mb-3">
              <View className="flex-1 flex-row items-center border-2 border-black bg-white px-3 h-12 mr-2">
                <Ionicons name="search-outline" size={20} color="#525252" style={{ marginRight: 8 }} />
                <TextInput
                  testID="pos-search-input"
                  placeholder="Tìm tên hoặc quét mã..."
                  placeholderTextColor="#737373"
                  value={query}
                  onChangeText={setQuery}
                  className="flex-1 text-sm text-black font-medium h-full"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery("")} className="p-1">
                    <Ionicons name="close-circle" size={18} color="#737373" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                testID="pos-barcode-btn"
                onPress={() => setIsScannerVisible(true)}
                className="bg-black w-12 h-12 justify-center items-center border-2 border-black"
                accessibilityLabel="Quét mã vạch"
              >
                <Ionicons name="barcode-outline" size={22} color="white" />
              </TouchableOpacity>
            </View>

            {/* Category Filter */}
            <View className="mb-3">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="flex-row"
              >
                <TouchableOpacity
                  onPress={() => setSelectedCategory(null)}
                  className={`px-4 py-2 border-2 border-black mr-2 ${selectedCategory === null ? "bg-black" : "bg-white"}`}
                >
                  <Text
                    className={`font-semibold ${selectedCategory === null ? "text-white" : "text-black"}`}
                    style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}
                  >
                    Tất cả
                  </Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.Id}
                    onPress={() => setSelectedCategory(cat.Id)}
                    className={`px-4 py-2 border-2 border-black mr-2 ${selectedCategory === cat.Id ? "bg-black" : "bg-white"}`}
                  >
                    <Text
                      className={`font-semibold ${selectedCategory === cat.Id ? "text-white" : "text-black"}`}
                      style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}
                    >
                      {cat.Name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Product Count Header */}
            <View className="flex-row justify-between items-center mb-2 pb-2 border-b-2 border-black">
              <Text style={{ fontSize: 11, letterSpacing: 2, color: '#000', textTransform: 'uppercase', fontWeight: '800' }}>
                Sản phẩm ({filteredProducts.length})
              </Text>
              {query ? (
                <Text style={{ fontSize: 10, color: '#525252', fontStyle: 'italic' }}>
                  Lọc: "{query}"
                </Text>
              ) : null}
            </View>

            {listWidth > 0 && (
              <FlatList
                key={numColumns}
                data={filteredProducts}
                keyExtractor={(item: any) =>
                  item.Id || item.id || Math.random().toString()
                }
                numColumns={numColumns}
                columnWrapperStyle={{
                  gap: gap,
                }}
                contentContainerStyle={{
                  paddingBottom: !isDesktop && cartItemCount > 0 ? 80 : 20,
                }}
                renderItem={({ item }: { item: any }) => {
                  const stock = item.StockQuantity || item.stockquantity || 0;
                  const isOutOfStock = stock <= 0;
                  const isMissingPrice = item.IsSalePriceConfigured === false || item.isSalePriceConfigured === false;
                  return (
                    <TouchableOpacity
                      style={{ width: itemWidth, aspectRatio: 0.82 }}
                      className={`mb-3 bg-white border-2 border-black overflow-hidden ${isOutOfStock || isMissingPrice ? "opacity-60" : ""}`}
                      disabled={isOutOfStock}
                      onPress={() => {
                        if (isMissingPrice) {
                          useModalStore.getState().showModal({
                            title: "Chưa cấu hình giá",
                            message: `Sản phẩm "${item.Name || item.name}" chưa được cấu hình giá bán nên không thể bán tại quầy POS.`,
                            type: "error"
                          });
                          return;
                        }
                        addToCart({
                          productId: item.Id || item.id,
                          name: item.Name || item.name,
                          price: item.Price || item.price,
                        });
                        const nextQ = (items.find(i => i.productId === (item.Id || item.id))?.quantity || 0) + 1;
                        setCartQtyStrings(prev => ({ ...prev, [item.Id || item.id]: String(nextQ) }));
                      }}
                    >
                      <View className="flex-1 bg-gray-100 items-center justify-center">
                        <Image
                          source={{ uri: item.ImageUrl || item.imageurl || 'https://via.placeholder.com/400x400.png?text=POS' }}
                          style={{ width: "100%", height: "100%" }}
                          resizeMode="cover"
                        />
                        {isOutOfStock && (
                          <View className="absolute inset-0 bg-white/75 items-center justify-center">
                            <View className="bg-black px-2.5 py-1">
                              <Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>
                                Hết hàng
                              </Text>
                            </View>
                          </View>
                        )}
                        {isMissingPrice && !isOutOfStock && (
                          <View className="absolute inset-0 bg-white/75 items-center justify-center">
                            <View className="bg-amber-600 px-2.5 py-1">
                              <Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>
                                THIẾU GIÁ
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>

                      <View
                        className="p-2.5 justify-between bg-white border-t-2 border-black"
                        style={{ height: "42%" }}
                      >
                        <Text
                          className="font-bold text-xs sm:text-sm text-black"
                          numberOfLines={2}
                        >
                          {item.Name || item.name}
                        </Text>
                        <View className="flex-row justify-between items-center mt-1 flex-wrap">
                          <Text className="text-black font-black text-xs sm:text-sm" style={{ fontFamily: 'serif' }}>
                            {isMissingPrice ? "Chưa có giá" : `${(item.Price || item.price || 0).toLocaleString()}đ`}
                          </Text>
                          <Text
                            className={`font-semibold ${stock < 10 ? "text-black font-bold" : "text-gray-500"}`}
                            style={{ fontSize: 9, letterSpacing: 0.5 }}
                          >
                            KHO: {stock}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View className="items-center justify-center py-12">
                    <Ionicons name="cube-outline" size={40} color="#737373" />
                    <View style={{ width: 32, height: 2, backgroundColor: '#000', marginVertical: 8 }} />
                    <Text style={{ fontSize: 11, letterSpacing: 2, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      Không tìm thấy sản phẩm
                    </Text>
                  </View>
                }
              />
            )}

            {/* Mobile Bottom Quick-Cart Summary Bar */}
            {!isDesktop && cartItemCount > 0 && (
              <View
                className="bg-black p-3 px-4 flex-row justify-between items-center border-t-2 border-black"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingBottom: Math.max(10, insets.bottom),
                }}
              >
                <View className="flex-row items-center">
                  <Ionicons name="cart" size={20} color="#fff" />
                  <Text className="text-white font-black text-xs uppercase ml-2">
                    {cartItemCount} SP | {getTotalPrice().toLocaleString()}đ
                  </Text>
                </View>
                <TouchableOpacity
                  testID="pos-mobile-open-cart-btn"
                  onPress={() => setMobileTab('cart')}
                  className="bg-white px-3 py-1.5 border border-black"
                >
                  <Text className="text-black font-black text-xs uppercase">Xem giỏ hàng →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Cart Panel */}
        {showCartPanel && (
          <View
            className={`bg-white p-4 sm:p-5 justify-between ${isDesktop ? 'w-96 border-l-2 border-black h-full' : 'flex-1'}`}
          >
            <View className="flex-1">
              {/* Cart Header */}
              <View className="flex-row justify-between items-center mb-3 pb-3 border-b-2 border-black">
                <View className="flex-row items-center">
                  <Ionicons name="cart" size={20} color="#000" />
                  <Text className="font-black text-base text-black ml-2 uppercase tracking-wider">
                    GIỎ HÀNG ({cartItemCount})
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  {!isDesktop && (
                    <TouchableOpacity
                      onPress={() => setMobileTab('products')}
                      className="border border-black px-2.5 py-1 bg-gray-100"
                    >
                      <Text className="text-black font-bold text-[10px] uppercase">
                        + Chọn thêm
                      </Text>
                    </TouchableOpacity>
                  )}
                  {items.length > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        clearCart();
                        setCartErrors({});
                        setCartQtyStrings({});
                      }}
                      className="border border-black px-2.5 py-1 bg-white"
                    >
                      <Text className="text-red-600 font-bold text-[10px] uppercase">
                        Xóa tất cả
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Cart Items List */}
              <FlatList
                data={items}
                keyExtractor={(item) => item.productId}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
                renderItem={({ item }) => {
                  const currentVal = cartQtyStrings[item.productId] !== undefined ? cartQtyStrings[item.productId] : String(item.quantity);
                  const err = cartErrors[item.productId];

                  return (
                    <View className={`mb-3 bg-white p-3 border-2 ${err ? 'border-red-500' : 'border-black'}`}>
                      <Text className="font-bold text-black text-sm">
                        {item.name}
                      </Text>
                      <View className="flex-row justify-between items-center mt-2 flex-wrap gap-2">
                        <Text className="text-black font-black text-sm" style={{ fontFamily: 'serif' }}>
                          {(item.price * (parseInt(currentVal, 10) || 0)).toLocaleString()}đ
                        </Text>
                        <View className="flex-row items-center border-2 border-black">
                          <TouchableOpacity
                            testID={`dec-cart-qty-${item.productId}`}
                            className="p-1.5"
                            onPress={() => handleCartQtyStep(item.productId, -1)}
                          >
                            <Ionicons name="remove" size={14} color={"#000"} />
                          </TouchableOpacity>
                          <TextInput
                            testID={`input-cart-qty-${item.productId}`}
                            keyboardType="number-pad"
                            inputMode="numeric"
                            value={currentVal}
                            onChangeText={(t: string) => handleCartQtyChange(item.productId, t)}
                            onBlur={() => handleCartQtyBlur(item.productId)}
                            selectTextOnFocus={true}
                            className="font-black text-sm w-10 text-center text-black px-0.5 py-0.5"
                          />
                          <TouchableOpacity
                            testID={`inc-cart-qty-${item.productId}`}
                            className="p-1.5"
                            onPress={() => handleCartQtyStep(item.productId, 1)}
                          >
                            <Ionicons name="add" size={14} color={"#000"} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            className="p-1.5 border-l-2 border-black"
                            onPress={() => {
                              removeFromCart(item.productId);
                              setCartErrors(prev => {
                                const next = { ...prev };
                                delete next[item.productId];
                                return next;
                              });
                              setCartQtyStrings(prev => {
                                const next = { ...prev };
                                delete next[item.productId];
                                return next;
                              });
                            }}
                          >
                            <Ionicons name="trash-outline" size={14} color={"#000"} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {err ? (
                        <Text className="text-red-500 text-xs mt-1 font-semibold" testID={`cart-error-${item.productId}`}>
                          {err}
                        </Text>
                      ) : null}
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View className="items-center justify-center py-8">
                    <Ionicons name="cart-outline" size={36} color="#737373" />
                    <View style={{ width: 32, height: 2, backgroundColor: '#000', marginVertical: 8 }} />
                    <Text style={{ fontSize: 11, letterSpacing: 2, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      Giỏ hàng trống
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: '#737373', fontStyle: 'italic' }}>
                      Hãy thêm sản phẩm để thanh toán
                    </Text>
                  </View>
                }
              />
            </View>

            {/* Cart Footer */}
            <View
              className="pt-4 border-t-2 border-black bg-white"
              style={{
                paddingBottom: !isDesktop ? Math.max(12, insets.bottom) : 0,
              }}
            >
              {/* Total Row */}
              <View className="flex-row justify-between items-end mb-4 pb-3 border-b-2 border-black">
                <Text style={{ fontSize: 11, letterSpacing: 2, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  Tổng thanh toán
                </Text>
                <Text className="font-black text-2xl sm:text-3xl text-black" style={{ fontFamily: 'serif' }}>
                  {getTotalPrice().toLocaleString()}đ
                </Text>
              </View>
              <CustomButton
                testID="pos-checkout-offline-btn"
                title="Thanh toán"
                onPress={handleCheckoutClick}
                loading={isLoading}
                disabled={items.length === 0}
              />
            </View>
          </View>
        )}
      </View>

      {/* Scanner Modal */}
      <Modal visible={isScannerVisible} animationType="slide">
        <BarcodeScanner
          onScanSuccess={handleScanSuccess}
          onClose={() => setIsScannerVisible(false)}
        />
      </Modal>

      {/* Checkout Modal */}
      <CheckoutModal
        visible={isCheckoutModalVisible}
        onClose={() => !isSubmittingCheckout && setIsCheckoutModalVisible(false)}
        totalAmount={getTotalPrice()}
        onConfirm={handleConfirmCheckout}
        isSubmitting={isSubmittingCheckout}
      />
    </SafeAreaView>
  );
}
