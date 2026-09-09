import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  getDBConnection,
  LocalSupplierRow
} from "@/database/db";
import CustomButton from "@/components/CustomButton";
import CustomInput from "@/components/CustomInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import * as ImagePicker from 'expo-image-picker';
import apiClient from "@/services/apiClient";
import { useAuthStore } from "@/store/authStore";

interface Category extends LocalCategoryRow {}
interface Product extends LocalProductRow {
  CategoryName?: string;
}

export default function ProductsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const [isEditModalVisible, SetIsEditModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState<string>("");

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "", barcode: "", price: "", categoryId: "", stock: "", imageUrl: "",
  });

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
        return;
    }
    
    // Default search mode logic
    const foundProduct = products.find((p) => p.Barcode === barcode);
    if (foundProduct) {
        handleOpenEdit(foundProduct);
    } else {
        setSearchQuery(barcode); // Set search query if not found directly
        if (Platform.OS === 'web') {
            window.alert('Không tìm thấy sản phẩm với mã vạch: ' + barcode);
        } else {
            Alert.alert('Lỗi', 'Không tìm thấy sản phẩm với mã vạch: ' + barcode);
        }
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [productsData, categoriesData] = await Promise.all([
        getLocalProducts(),
        getLocalCategories(),
      ]);
      const categoryMap = new Map(categoriesData.map((c) => [c.Id, c.Name]));
      const enrichedProducts = productsData.map((p) => ({
        ...p,
        CategoryName: categoryMap.get(p.CategoryId) || "Không xác định",
      }));
      setProducts(enrichedProducts);
      setCategories([{ Id: -1, Name: "Tất cả" }, ...categoriesData]);
    } catch (error) {
      console.error("[Inventory] Lỗi tải dữ liệu kho:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (product.Barcode && product.Barcode.includes(searchQuery));
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
    SetIsEditModalVisible(true);
  };

  const handleStockChange = (amount: number) => {
    const currentVal = parseInt(newStock, 10) || 0;
    const nextVal = currentVal + amount;
    if (nextVal >= 0) {
      setNewStock(nextVal.toString());
    }
  };

  const handleSaveStock = async () => {
    if (!selectedProduct) return;
    const stockValue = parseInt(newStock, 10);
    if (isNaN(stockValue) || stockValue < 0) return;
    
    const diff = stockValue - selectedProduct.StockQuantity;
    if (diff !== 0) {
      setIsLoading(true);
      try {
          await updateLocalProductStock(selectedProduct.Id, stockValue);
          
          if (diff > 0) {
              const db = await getDBConnection();
              const suppliers = await db.getAllAsync<LocalSupplierRow>("SELECT * FROM LocalSuppliers LIMIT 1");
              const supplier = suppliers.length > 0 ? suppliers[0] : { Id: 1, Name: "Nhập nhanh (Chưa rõ nhà cung cấp)" };
              
              const offlineReferenceId = `GR_${Date.now()}`;
              await insertLocalGoodsReceipt(
                  offlineReferenceId,
                  supplier.Id,
                  supplier.Name,
                  user?.id || 0,
                  diff * selectedProduct.Price, // CostPrice usually same as Price for demo
                  "Nhập nhanh từ màn hình Sản phẩm",
                  [{ productId: selectedProduct.Id, quantity: diff, costPrice: selectedProduct.Price }]
              );
          }
          
          SetIsEditModalVisible(false);
          await loadData();
      } catch (error) {
          console.error("[Inventory] Lỗi khi lưu tồn kho:", error);
          if(Platform.OS === 'web') window.alert("Lỗi khi lưu tồn kho");
          else Alert.alert("Lỗi", "Không thể lưu thay đổi tồn kho.");
      } finally {
          setIsLoading(false);
      }
    } else {
      SetIsEditModalVisible(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    if (Platform.OS === 'web') {
        if(window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm ${product.Name}?`)){
            deleteLocalProduct(product.Id).then(loadData);
        }
    } else {
        Alert.alert(
        "Xác nhận xóa",
        `Bạn có chắc chắn muốn xóa sản phẩm ${product.Name}?`,
        [
            { text: "Hủy", style: "cancel" },
            {
            text: "Xóa", style: "destructive",
            onPress: async () => {
                setIsLoading(true);
                await deleteLocalProduct(product.Id);
                await loadData();
                setIsLoading(false);
            },
            },
        ]
        );
    }
  };

  const handlePickImage = async () => {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
          if (Platform.OS === 'web') window.alert("Bạn cần cấp quyền sử dụng camera!");
          else Alert.alert("Lỗi", "Bạn cần cấp quyền sử dụng camera!");
          return;
      }
      
      const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
          try {
              setIsLoading(true);
              const { uploadProductImage } = require('@/services/productApi');
              const asset = result.assets[0];
              const fileName = asset.uri.split('/').pop() || 'photo.jpg';
              let finalUri = asset.uri;

              if (Platform.OS === 'web') {
                  const res = await fetch(asset.uri);
                  const blob = await res.blob();
                  const file = new File([blob], fileName, { type: blob.type });
                  const formData = new FormData();
                  formData.append('file', file);
                  
                  const response = await apiClient.post("/Products/upload-image", formData);
                  setNewProduct(prev => ({ ...prev, imageUrl: response.data.data }));
              } else {
                  const res = await uploadProductImage(asset.uri, fileName, 'image/jpeg');
                  if (res.isSuccess) {
                      setNewProduct(prev => ({ ...prev, imageUrl: res.data }));
                  }
              }
          } catch (e) {
              console.error(e);
              if (Platform.OS === 'web') window.alert("Lỗi tải ảnh lên Cloudinary");
              else Alert.alert("Lỗi", "Không thể tải ảnh lên server");
          } finally {
              setIsLoading(false);
          }
      }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.categoryId || !newProduct.price || !newProduct.stock) {
      if(Platform.OS !== 'web') Alert.alert("Lỗi", "Vui lòng nhập đầy đủ thông tin bắt buộc (Tên, Giá, Tồn kho, Danh mục)");
      else window.alert("Lỗi: Vui lòng nhập đầy đủ thông tin bắt buộc (Tên, Giá, Tồn kho, Danh mục)");
      return;
    }
    setIsLoading(true);
    try {
        // Mạng yêu cầu để đồng bộ trực tiếp lên Cloud
        const payload = {
            categoryId: parseInt(newProduct.categoryId, 10),
            name: newProduct.name,
            barcode: newProduct.barcode || `POS_${Date.now()}`,
            price: parseFloat(newProduct.price),
            isActive: true,
            imageUrl: newProduct.imageUrl
        };
        const createRes = await apiClient.post('/Products', payload);
        const serverId = createRes.data.data; // The returned integer ID
        
        // Lưu vào Local
        await insertLocalProduct(
            serverId.toString(),
            payload.categoryId,
            payload.name,
            payload.price,
            payload.barcode,
            parseInt(newProduct.stock, 10),
            payload.imageUrl || undefined
        );
        
        setIsAddModalVisible(false);
        setNewProduct({ name: "", barcode: "", price: "", categoryId: "", stock: "", imageUrl: "" });
        
        if (Platform.OS === 'web') window.alert("Đã thêm và đồng bộ sản phẩm thành công!");
        else Alert.alert("Thành công", "Đã thêm và đồng bộ sản phẩm thành công!");
        
        await loadData();
    } catch (e) {
        if(Platform.OS !== 'web') Alert.alert("Lỗi", "Không thể tạo sản phẩm mới. Vui lòng kiểm tra kết nối mạng.");
        else window.alert("Không thể tạo sản phẩm mới. Vui lòng kiểm tra kết nối mạng.");
    } finally {
        setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => amount.toLocaleString("vi-VN") + " đ";

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 py-2 bg-white">
        <View className="flex-row items-center mb-1">
            <View className="flex-row items-center border-b-2 border-black flex-1 mr-2 pb-2">
              <Ionicons name="search" size={18} color="#000" />
              <TextInput
                  className="flex-1 ml-3 h-10 text-base text-black"
                  placeholder="Tìm theo tên hoặc mã vạch..."
                  placeholderTextColor="#525252"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  clearButtonMode="while-editing"
                  style={{ fontStyle: 'italic' }}
              />
              {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close" size={18} color="#000" />
                  </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={() => { setScannerMode("search"); setIsScannerVisible(true); }} className="bg-black w-12 h-12 justify-center items-center">
                <Ionicons name="barcode-outline" size={22} color={"white"} />
            </TouchableOpacity>
            {canManageProducts && (
            <TouchableOpacity onPress={() => setIsAddModalVisible(true)} className="bg-black w-12 h-12 justify-center items-center ml-2">
                <Ionicons name="add" size={24} color={"white"} />
            </TouchableOpacity>
            )}
        </View>
      </View>

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
              <TouchableOpacity onPress={() => setSelectedCategoryId(item.Id)} className={`border-2 border-black px-5 py-2.5 mr-3 ${isSelected ? "bg-black" : "bg-white"}`}>
                <Text className={`font-semibold ${isSelected ? "text-white" : "text-black"}`} style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
                  {item.Name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.Id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshing={isLoading}
        onRefresh={loadData}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isLowStock = item.StockQuantity < 10;
          const isOutOfStock = item.StockQuantity === 0;

          return (
            <View className="bg-white p-4 mb-4 border-2 border-black flex flex-row items-center">
              <View className="relative">
                <Image source={{ uri: item.ImageUrl }} className="w-24 h-24 bg-muted" resizeMode="cover" />
                {isOutOfStock && (
                  <View className="absolute inset-0 bg-white/70 items-center justify-center">
                    <View className="bg-black px-2 py-1"><Text className="text-white font-bold" style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>HẾT HÀNG</Text></View>
                  </View>
                )}
              </View>

              <View className="flex-1 ml-4 justify-center">
                <View className="flex-row items-center mb-1">
                  <View className="border border-black px-2 py-0.5 mr-2">
                    <Text className="text-black font-bold" style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{item.CategoryName}</Text>
                  </View>
                  <Text className="flex-1" style={{ fontSize: 10, color: '#525252', letterSpacing: 1 }} numberOfLines={1}>{item.Barcode}</Text>
                </View>
                <Text className="font-bold text-base text-black mb-1" numberOfLines={2}>{item.Name}</Text>
                <Text className="text-black font-black mb-2" style={{ fontFamily: 'serif', fontSize: 16 }}>{formatCurrency(item.Price)}</Text>
                <View className="flex-row items-center mb-1">
                  <Text style={{ fontSize: 10, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>Tồn kho:</Text>
                  <Text className="font-black text-base ml-1 text-black" style={{ fontFamily: 'serif' }}>{item.StockQuantity}</Text>
                  {isLowStock && !isOutOfStock && (<Text className="ml-2 text-black font-bold" style={{ fontSize: 9, letterSpacing: 1 }}>● THẤP</Text>)}
                </View>
                <View className="flex-row items-center">
                  <Text style={{ fontSize: 10, letterSpacing: 2, color: '#525252', textTransform: 'uppercase' }}>Nhà CC:</Text>
                  <Text className="font-bold text-xs ml-1 text-black">Hệ thống (Mặc định)</Text>
                </View>
              </View>
              
              <View className="flex-col">
                {canEditStock && (
                  <TouchableOpacity onPress={() => handleOpenEdit(item)} className="border-2 border-black h-10 w-10 items-center justify-center ml-2 mb-2">
                    <Ionicons name="create-outline" size={18} color="#000" />
                  </TouchableOpacity>
                )}
                {canManageProducts && (
                  <TouchableOpacity onPress={() => handleDeleteProduct(item)} className="bg-black h-10 w-10 items-center justify-center ml-2">
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
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

      {/* Edit Modal */}
      <Modal visible={isEditModalVisible} transparent={true} animationType="fade" onRequestClose={() => SetIsEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-lg font-black text-black" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>Cập nhật kho</Text>
              <TouchableOpacity onPress={() => SetIsEditModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center"><Ionicons name="close" size={18} color="#000" /></TouchableOpacity>
            </View>
            {selectedProduct && (
              <View className="border-2 border-black p-4 mb-6 flex-row items-center">
                <Image source={{ uri: selectedProduct.ImageUrl }} className="w-16 h-16 mr-3" />
                <View className="flex-1">
                  <Text className="font-bold text-black mb-1">{selectedProduct.Name}</Text>
                  <Text style={{ fontSize: 10, color: '#525252', letterSpacing: 1 }}>MÃ: {selectedProduct.Barcode}</Text>
                </View>
              </View>
            )}
            <Text className="text-black font-bold text-center mb-3" style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' }}>Số lượng tồn kho mới</Text>
            <View className="flex-row items-center justify-center mb-8">
              <TouchableOpacity onPress={() => handleStockChange(-1)} className="w-14 h-14 border-2 border-black items-center justify-center"><Ionicons name="remove" size={24} color="#000" /></TouchableOpacity>
              <TextInput className="border-b-4 border-black px-2 h-14 w-28 mx-4 text-2xl font-black text-black bg-white text-center" keyboardType="number-pad" value={newStock} onChangeText={setNewStock} selectTextOnFocus maxLength={5} style={{ fontFamily: 'serif' }} />
              <TouchableOpacity onPress={() => handleStockChange(1)} className="w-14 h-14 border-2 border-black items-center justify-center"><Ionicons name="add" size={24} color="#000" /></TouchableOpacity>
            </View>
            <CustomButton title="Lưu thay đổi →" onPress={handleSaveStock} loading={isLoading} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Product Modal */}
      <Modal visible={isAddModalVisible} transparent={true} animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 bg-black/70 justify-end sm:justify-center items-center">
          <View className="bg-white p-6 w-full max-w-md border-t-4 border-black sm:border-2">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="font-black text-black" style={{ fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>Thêm sản phẩm</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)} className="w-8 h-8 border-2 border-black items-center justify-center"><Ionicons name="close" size={18} color="#000" /></TouchableOpacity>
            </View>
            
            <View className="flex-row items-end mb-4">
              <View className="flex-1 mr-2">
                <CustomInput label="Tên sản phẩm" placeholder="VD: Nước suối" value={newProduct.name} onChangeText={(t) => setNewProduct({...newProduct, name: t})} />
              </View>
              <TouchableOpacity onPress={handlePickImage} className="w-14 h-14 bg-gray-200 border-2 border-black justify-center items-center mb-4">
                  {newProduct.imageUrl ? (
                      <Image source={{ uri: newProduct.imageUrl }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                      <Ionicons name="camera" size={24} color="#000" />
                  )}
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-3">
                <View className="flex-1"><CustomInput label="Giá bán" placeholder="VD: 15000" keyboardType="numeric" value={newProduct.price} onChangeText={(t) => setNewProduct({...newProduct, price: t})} /></View>
                <View className="flex-1"><CustomInput label="Tồn kho đầu kỳ" placeholder="VD: 100" keyboardType="numeric" value={newProduct.stock} onChangeText={(t) => setNewProduct({...newProduct, stock: t})} /></View>
            </View>
            
            <Text className="text-black font-bold mb-1 mt-2" style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>Danh mục</Text>
            <View className="flex-row flex-wrap mb-4">
                {categories.filter(cat => cat.Id !== -1).map(cat => (
                    <TouchableOpacity 
                        key={cat.Id} 
                        onPress={() => setNewProduct({...newProduct, categoryId: cat.Id.toString()})}
                        className={`px-3 py-1 mr-2 mb-2 border border-black ${newProduct.categoryId === cat.Id.toString() ? 'bg-black' : 'bg-white'}`}
                    >
                        <Text className={`text-xs font-bold ${newProduct.categoryId === cat.Id.toString() ? 'text-white' : 'text-black'}`}>{cat.Name}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View className="flex-row items-end">
                <View className="flex-1">
                    <CustomInput label="Mã vạch (Tùy chọn, để trống tự tạo)" placeholder="VD: 893..." value={newProduct.barcode} onChangeText={(t) => setNewProduct({...newProduct, barcode: t})} />
                </View>
                <TouchableOpacity onPress={() => { setScannerMode("add"); setIsScannerVisible(true); }} className="w-12 h-12 bg-black justify-center items-center mb-4 ml-2">
                    <Ionicons name="barcode" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <View className="mt-2"><CustomButton title="Thêm sản phẩm →" onPress={handleAddProduct} loading={isLoading} /></View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isScannerVisible} animationType="slide">
        <BarcodeScanner onScanSuccess={handleScanSuccess} onClose={() => setIsScannerVisible(false)} />
      </Modal>
    </View>
  );
}
