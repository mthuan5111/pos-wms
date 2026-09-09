import BarcodeScanner from "@/components/BarcodeScanner";
import CheckoutModal from "@/components/CheckoutModal";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import { useCartStore } from "@/store/cartStore";
import { useAuthStore } from "@/store/authStore";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import React, { useState, useEffect } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getLocalProducts,
  getLocalCategories,
  getLocalCustomers,
  LocalCustomerRow,
  getDBConnection,
  getLocalOrderDetails,
} from "@/database/db";
import { Ionicons } from "@expo/vector-icons";
import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

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
}

interface Customer extends LocalCustomerRow {}

export default function PosScreen() {
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

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = products.filter((p: any) => {
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

  const handleScanSuccess = (barcode: string) => {
    const foundProduct = products.find((p) => p.Barcode === barcode);

    if (foundProduct) {
      if (foundProduct.StockQuantity <= 0) {
        if (Platform.OS === "web") {
          window.alert("Sản phẩm đã hết hàng");
        } else {
          Alert.alert("Lỗi", "Sản phẩm đã hết hàng");
        }
        return;
      }
      addToCart({
        productId: foundProduct.Id,
        name: foundProduct.Name,
        price: foundProduct.Price,
      });
    } else {
      if (Platform.OS === "web") {
        window.alert("Không tìm thấy sản phẩm với mã vạch: " + barcode);
      } else {
        Alert.alert("Không tìm thấy sản phẩm với mã vạch: " + barcode);
      }
    }
  };

  const [isCheckoutModalVisible, setIsCheckoutModalVisible] = useState(false);

  const handleCheckoutClick = () => {
    if (items.length === 0) {
      if (Platform.OS === "web") {
        window.alert(
          "Giỏ hàng trống. Vui lòng thêm sản phẩm trước khi thanh toán.",
        );
      } else {
        Alert.alert(
          "Giỏ hàng trống. Vui lòng thêm sản phẩm trước khi thanh toán.",
        );
      }
      return;
    }

    for (const item of items) {
      const prod = products.find((p) => p.Id === item.productId);
      if (prod && prod.StockQuantity < item.quantity) {
        if (Platform.OS === "web") {
          window.alert(
            `Sản phẩm ${prod.Name} chỉ còn ${prod.StockQuantity} trong kho.`,
          );
        } else {
          Alert.alert(
            "Lỗi tồn kho",
            `Sản phẩm ${prod.Name} chỉ còn ${prod.StockQuantity} trong kho.`,
          );
        }
        return;
      }
    }
    
    setIsCheckoutModalVisible(true);
  };

  const handlePrintInvoice = async (offlineReferenceId: string, totalPrice: number, employeeName: string, customerName: string) => {
    try {
      const details = await getLocalOrderDetails(offlineReferenceId);
      const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " đ";
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
              <p>Mã HĐ: ${offlineReferenceId.split("_")[1] || offlineReferenceId}</p>
              <p>Ngày: ${new Date().toLocaleString('vi-VN')}</p>
              <p>Khách hàng: ${customerName}</p>
              <p>Thu ngân: ${employeeName}</p>
            </div>
            <table>
              <tr><th>STT</th><th>Sản phẩm</th><th style="text-align: center;">SL</th><th class="price-col">Đơn giá</th><th class="price-col">Thành tiền</th></tr>
              ${detailsHtml}
            </table>
            <div class="total-section">Tổng cộng: ${formatCurrency(totalPrice)}</div>
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
      console.log(e);
    }
  };

  const handleConfirmCheckout = async (paymentMethod: string, customerGiven: number) => {
    setIsCheckoutModalVisible(false);
    setIsLoading(true);
    try {
      const db = await getDBConnection();
      const offlineReferenceId = `OFFLINE_${Date.now()}`;
      const totalPrice = getTotalPrice();
      const createdAt = new Date().toISOString();

      const cName = selectedCustomer ? selectedCustomer.Name : (customerPhone || "Khách lẻ");
      const eName = user?.name || user?.username || "Không rõ";

      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO LocalOrders (OfflineReferenceId, TotalAmount, CreatedAt, CustomerName, EmployeeName, PaymentMethod) VALUES (?, ?, ?, ?, ?, ?)`,
          [offlineReferenceId, totalPrice, createdAt, cName, eName, paymentMethod],
        );

        for (const item of items) {
          await db.runAsync(
            `INSERT INTO LocalOrderDetails (OfflineReferenceId, ProductId, Quantity, Price) VALUES (?, ?, ?, ?)`,
            [offlineReferenceId, item.productId, item.quantity, item.price],
          );

          const prod = products.find((p) => p.Id === item.productId);
          if (prod) {
            const newStock = prod.StockQuantity - item.quantity;
            await db.runAsync(
              `UPDATE LocalProducts SET StockQuantity = ? WHERE Id = ?`,
              [newStock, item.productId],
            );
          }
        }
      });
      clearCart();
      await loadData();

      // Mở hộp thoại in hóa đơn
      await handlePrintInvoice(offlineReferenceId, totalPrice, eName, cName);

      if (Platform.OS === "web") {
        window.alert(
          `Thanh toán thành công!`
        );
      } else {
        Alert.alert(
          "Thành công",
          `Thanh toán thành công!`
        );
      }
      
      // Trigger sync
      useGlobalSyncStore.getState().requestSync();
    } catch (error) {
      console.error("[Pos] Lỗi khi lưu đơn hàng", error);
      if (Platform.OS === 'web') window.alert("Không thể lưu đơn hàng xuống thiết bị");
      else Alert.alert("Lỗi", "Không thể lưu đơn hàng xuống thiết bị");
    } finally {
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

  return (
    <SafeAreaView className="flex-col md:flex-row flex-1 bg-white">
      {/* Product Panel */}
      <View
        className="flex-1 p-4 md:border-r-2 border-black bg-white"
        onLayout={(event) => {
          setListWidth(event.nativeEvent.layout.width - 32);
        }}
      >
        {/* Search Bar */}
        <View className="flex-row items-center mb-3">
          <View className="flex-1 mr-2">
            <CustomInput
              label="Tìm sản phẩm"
              placeholder="Nhập tên hoặc quét mã sản phẩm..."
              value={query}
              onChangeText={setQuery}
            />
          </View>
          <TouchableOpacity
            onPress={() => setIsScannerVisible(true)}
            className="bg-black w-14 h-14 justify-center items-center"
          >
            <Ionicons name="barcode-outline" size={24} color={"white"} />
          </TouchableOpacity>
        </View>

        {/* Category Filter */}
        <View className="mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-row"
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory(null)}
              className={`px-5 py-2.5 border-2 border-black mr-3 ${selectedCategory === null ? "bg-black" : "bg-white"}`}
            >
              <Text
                className={`font-medium ${selectedCategory === null ? "text-white" : "text-black"}`}
                style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}
              >
                Tất cả
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.Id}
                onPress={() => setSelectedCategory(cat.Id)}
                className={`px-5 py-2.5 border-2 border-black mr-3 ${selectedCategory === cat.Id ? "bg-black" : "bg-white"}`}
              >
                <Text
                  className={`font-medium ${selectedCategory === cat.Id ? "text-white" : "text-black"}`}
                  style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}
                >
                  {cat.Name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Product Count */}
        <View className="flex-row justify-between items-end mb-3 pb-3 border-b-2 border-black">
          <Text style={{ fontSize: 11, letterSpacing: 3, color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>
            Sản phẩm ({filteredProducts.length})
          </Text>
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
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }: { item: any }) => {
              const stock = item.StockQuantity || item.stockquantity || 0;
              const isOutOfStock = stock <= 0;
              return (
                <TouchableOpacity
                  style={{ width: itemWidth, aspectRatio: 0.85 }}
                  className={`mb-3 bg-white border-2 border-black overflow-hidden ${isOutOfStock ? "opacity-50" : ""}`}
                  disabled={isOutOfStock}
                  onPress={() =>
                    addToCart({
                      productId: item.Id || item.id,
                      name: item.Name || item.name,
                      price: item.Price || item.price,
                    })
                  }
                >
                  <View className="flex-1 bg-muted items-center justify-center">
                    <Image
                      source={{ uri: item.ImageUrl || item.imageurl }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                    {isOutOfStock && (
                      <View className="absolute inset-0 bg-white/70 items-center justify-center">
                        <View className="bg-black px-3 py-1">
                          <Text className="text-white font-bold" style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
                            Hết hàng
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View
                    className="p-3 justify-end bg-white border-t-2 border-black"
                    style={{ height: "40%" }}
                  >
                    <Text
                      className="font-bold text-sm text-black"
                      numberOfLines={2}
                    >
                      {item.Name || item.name}
                    </Text>
                    <View className="flex-row justify-between items-center mt-1">
                      <Text className="text-black font-black text-sm" style={{ fontFamily: 'serif' }}>
                        {(item.Price || item.price || 0).toLocaleString()}đ
                      </Text>
                      <Text
                        className={`text-xs font-medium ${stock < 10 ? "text-black font-bold" : "text-muted-foreground"}`}
                        style={{ fontSize: 10, letterSpacing: 1 }}
                      >
                        KHO: {stock}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View className="p-10 items-center justify-center flex-1">
                <Ionicons name="cube-outline" size={48} color="#525252" />
                <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
                <Text style={{ fontSize: 12, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>
                  Không tìm thấy sản phẩm nào
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Cart Panel */}
      <View className="bg-white p-5 justify-between w-full md:w-96 z-10 border-t-2 md:border-t-0 md:border-l-2 border-black h-1/2 md:h-auto">
        <View className="flex-1">
          {/* Cart Header */}
          <View className="flex-row justify-between items-center mb-4 pb-4 border-b-4 border-black">
            <View className="flex-row items-center">
              <Ionicons
                name="cart"
                size={20}
                color="#000"
              />
              <Text className="font-bold text-lg text-black ml-2" style={{ letterSpacing: 1 }}>
                GIỎ HÀNG
              </Text>
            </View>
            <TouchableOpacity
              onPress={clearCart}
              className="border-2 border-black px-3 py-1.5"
            >
              <Text className="text-black font-medium" style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
                Xóa tất cả
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cart Items */}
          <FlatList
            data={items}
            keyExtractor={(item) => item.productId}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View className="mb-3 bg-white p-3 border-2 border-black">
                <Text className="font-bold text-black text-base">
                  {item.name}
                </Text>
                <View className="flex-row justify-between items-center mt-3">
                  <Text className="text-black font-black text-base" style={{ fontFamily: 'serif' }}>
                    {item.price.toLocaleString()}đ
                  </Text>
                  <View className="flex-row items-center border-2 border-black">
                    <TouchableOpacity
                      className="p-2"
                      onPress={() =>
                        updateQuantity(item.productId, item.quantity - 1)
                      }
                    >
                      <Ionicons name="remove" size={16} color={"#000"} />
                    </TouchableOpacity>
                    <Text className="font-black text-base mx-2 w-6 text-center text-black">
                      {item.quantity}
                    </Text>
                    <TouchableOpacity
                      className="p-2"
                      onPress={() =>
                        updateQuantity(item.productId, item.quantity + 1)
                      }
                    >
                      <Ionicons name="add" size={16} color={"#000"} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="p-2 border-l-2 border-black"
                      onPress={() => removeFromCart(item.productId)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={"#000"}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center mt-20">
                <Ionicons name="cart-outline" size={48} color="#525252" />
                <View style={{ width: 40, height: 2, backgroundColor: '#000', marginVertical: 12 }} />
                <Text style={{ fontSize: 12, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>
                  Giỏ hàng trống
                </Text>
                <Text className="text-xs mt-1" style={{ color: '#525252', fontStyle: 'italic' }}>
                  Hãy thêm sản phẩm để thanh toán
                </Text>
              </View>
            }
          />
        </View>

        {/* Cart Footer */}
        <View className="pt-5 border-t-4 border-black mt-2 bg-white">
          <View className="mb-4">
            <CustomInput
              label="Tìm Khách Hàng (SĐT)"
              placeholder="Nhập số điện thoại..."
              keyboardType="phone-pad"
              value={customerPhone}
              onChangeText={(phone) => {
                setCustomerPhone(phone);
                if (phone.length >= 8) {
                    const found = customers.find(c => c.Phone.includes(phone));
                    setSelectedCustomer(found || null);
                } else {
                    setSelectedCustomer(null);
                }
              }}
            />
            {selectedCustomer && (
                <Text className="text-black font-bold mt-1 ml-1">✓ {selectedCustomer.Name}</Text>
            )}
            {!selectedCustomer && customerPhone.length >= 8 && (
                <Text className="font-bold mt-1 ml-1" style={{ color: '#525252' }}>Khách lẻ (Không lưu điểm)</Text>
            )}
          </View>

          {/* Total */}
          <View className="flex-row justify-between items-end mb-5 pb-4 border-b-2 border-black">
            <Text style={{ fontSize: 11, letterSpacing: 3, color: '#525252', textTransform: 'uppercase' }}>
              Tổng thanh toán
            </Text>
            <Text className="font-black text-3xl text-black" style={{ fontFamily: 'serif' }}>
              {getTotalPrice().toLocaleString()}đ
            </Text>
          </View>
          <CustomButton
            title="Thanh toán Offline →"
            onPress={handleCheckoutClick}
            loading={isLoading}
            disabled={items.length === 0}
          />
        </View>
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
        onClose={() => setIsCheckoutModalVisible(false)}
        totalAmount={getTotalPrice()}
        onConfirm={handleConfirmCheckout}
      />
    </SafeAreaView>
  );
}
