import React, { useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, RefreshControl, Dimensions, Platform, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import { 
  getDashboardSummary, 
  getTopProducts, 
  getRevenueChartComparison,
  DashboardSummaryDto,
  TopProductDto,
  RevenueComparisonPointDto
} from "@/services/reportApi";

const screenWidth = Dimensions.get("window").width;
const isDesktop = screenWidth >= 1024;
const isTablet = screenWidth >= 768 && screenWidth < 1024;

type PeriodType = "today" | "7days" | "30days";

export default function DashboardScreen() {
  const [period, setPeriod] = useState<PeriodType>("today");
  
  const [currentSummary, setCurrentSummary] = useState<DashboardSummaryDto | null>(null);
  const [previousSummary, setPreviousSummary] = useState<DashboardSummaryDto | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueComparisonPointDto[] | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductDto[] | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getDateRanges = (p: PeriodType) => {
    const end = new Date(); // now
    let currentStart = new Date();
    let prevStart = new Date();
    let prevEnd = new Date();

    if (p === "today") {
      currentStart.setHours(0, 0, 0, 0);
      
      prevEnd = new Date(currentStart);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 1);
    } else if (p === "7days") {
      currentStart.setDate(end.getDate() - 7);
      
      prevEnd = new Date(currentStart);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 7);
    } else if (p === "30days") {
      currentStart.setDate(end.getDate() - 30);
      
      prevEnd = new Date(currentStart);
      prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - 30);
    }

    return {
      currentStartStr: currentStart.toISOString(),
      currentEndStr: end.toISOString(),
      previousStartStr: prevStart.toISOString(),
      previousEndStr: prevEnd.toISOString(),
    };
  };

  const loadData = async (selectedPeriod = period) => {
    setIsLoading(true);
    setError(null);
    try {
      const { currentStartStr, currentEndStr, previousStartStr, previousEndStr } = getDateRanges(selectedPeriod);

      const [curSumRes, prevSumRes, chartRes, topRes] = await Promise.all([
        getDashboardSummary(currentStartStr, currentEndStr),
        getDashboardSummary(previousStartStr, previousEndStr),
        getRevenueChartComparison(currentStartStr, currentEndStr, previousStartStr, previousEndStr),
        getTopProducts(5, currentStartStr, currentEndStr)
      ]);

      if (curSumRes.isSuccess) setCurrentSummary(curSumRes.data);
      if (prevSumRes.isSuccess) setPreviousSummary(prevSumRes.data);
      if (chartRes.isSuccess) setRevenueData(chartRes.data);
      if (topRes.isSuccess) setTopProducts(topRes.data);

    } catch (e: any) {
      console.error("[Dashboard] Fetch error:", e);
      setError("KHÔNG THỂ TẢI DỮ LIỆU");
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [period])
  );

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "0 ₫";
    return amount.toLocaleString("vi-VN") + " ₫";
  };

  const calculateChange = (cur: number | null | undefined, prev: number | null | undefined) => {
    const c = cur || 0;
    const p = prev || 0;
    if (c === 0 && p === 0) return { percent: 0, text: '0%', up: null };
    if (p === 0 && c > 0) return { percent: null, text: 'MỚI PHÁT SINH', up: true };
    const percent = ((c - p) / p) * 100;
    return {
      percent,
      text: `${Math.abs(percent).toFixed(1)}%`,
      up: percent >= 0
    };
  };

  const renderTrend = (change: { percent: number | null, text: string, up: boolean | null }, suffix = 'so với kỳ trước') => {
    if (change.up === null) {
      return <Text style={{ fontSize: 11, color: '#525252' }}>- {change.text}</Text>;
    }
    return (
      <View className="flex-row items-center">
        <Ionicons name={change.up ? "arrow-up" : "arrow-down"} size={12} color={change.up ? "#16a34a" : "#dc2626"} />
        <Text style={{ fontSize: 11, color: change.up ? '#16a34a' : '#dc2626', marginLeft: 2, fontWeight: 'bold' }}>
          {change.text} <Text style={{ color: '#525252', fontWeight: 'normal' }}>{suffix}</Text>
        </Text>
      </View>
    );
  };

  if (error && !currentSummary) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <Ionicons name="alert-circle-outline" size={48} color="#000" />
        <Text className="mt-4 font-bold" style={{ fontSize: 16 }}>{error}</Text>
        <TouchableOpacity 
          onPress={() => loadData()}
          className="mt-4 px-6 py-2 border-2 border-black bg-black"
        >
          <Text className="text-white font-bold">THỬ LẠI</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // KPIs
  const netRevenue = currentSummary?.netRevenue || 0;
  const revChange = calculateChange(netRevenue, previousSummary?.netRevenue);

  const grossProfit = currentSummary?.grossProfit;
  const gpChange = calculateChange(grossProfit, previousSummary?.grossProfit);

  const completedOrders = currentSummary?.completedOrders || 0;
  const ordChange = calculateChange(completedOrders, previousSummary?.completedOrders);

  const avgOrderVal = currentSummary?.averageOrderValue || 0;
  const avgChange = calculateChange(avgOrderVal, previousSummary?.averageOrderValue);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* HEADER */}
      <View className="px-6 pt-4 pb-3 bg-white border-b-2 border-black">
        <Text style={{ fontFamily: 'serif', fontSize: 28, fontWeight: '900', color: '#000', letterSpacing: -0.5, textTransform: 'uppercase' }}>
          TỔNG QUAN
        </Text>
        <Text className="mt-1" style={{ fontSize: 10, letterSpacing: 3, color: '#525252', textTransform: 'uppercase' }}>
          BÁO CÁO & PHÂN TÍCH KINH DOANH
        </Text>
        <Text className="mt-1" style={{ fontSize: 10, color: '#525252' }}>
          CẬP NHẬT LÚC {new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}, {new Date().toLocaleDateString('vi-VN')}
        </Text>
      </View>

      {/* FILTER */}
      <View className="px-6 py-3 border-b-2 border-black flex-row items-center bg-gray-50" style={{ gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(["today", "7days", "30days"] as PeriodType[]).map(p => {
            const labels: Record<string, string> = { "today": "HÔM NAY", "7days": "7 NGÀY QUA", "30days": "30 NGÀY QUA" };
            const isActive = period === p;
            return (
              <TouchableOpacity 
                key={p}
                onPress={() => setPeriod(p)}
                className={`px-4 py-2 border-[1.5px] border-black ${isActive ? 'bg-black' : 'bg-white'}`}
              >
                <Text className={`font-bold text-xs uppercase tracking-wider ${isActive ? 'text-white' : 'text-black'}`}>
                  {labels[p]}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => loadData()} tintColor="#000" />}
      >
        <View className="p-6">
          {isLoading && !currentSummary ? (
            <View className="py-20 justify-center items-center">
              <ActivityIndicator size="large" color="#000" />
              <Text className="mt-4 font-bold" style={{ fontSize: 12, letterSpacing: 2 }}>ĐANG TẢI DỮ LIỆU...</Text>
            </View>
          ) : (
            <>
              {/* 4 KPIs */}
              <View className="flex-row flex-wrap" style={{ gap: 16, marginBottom: 24 }}>
                {/* 1. DOANH THU THUẦN */}
                <View className={`border-[1.5px] border-black bg-white p-4 ${isDesktop ? 'flex-1' : isTablet ? 'w-[47%]' : 'w-full'}`}>
                  <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    DOANH THU THUẦN
                  </Text>
                  <Text className="text-black mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: 22 }}>
                    {formatCurrency(netRevenue)}
                  </Text>
                  <View className="mt-2">{renderTrend(revChange)}</View>
                </View>

                {/* 2. LỢI NHUẬN GỘP */}
                <View className={`border-[1.5px] border-black bg-black p-4 ${isDesktop ? 'flex-1' : isTablet ? 'w-[47%]' : 'w-full'}`}>
                  <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#a3a3a3', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    LỢI NHUẬN GỘP
                  </Text>
                  {currentSummary?.hasGrossProfitData === false ? (
                    <View className="mt-2">
                      <Text className="text-white font-bold" style={{ fontSize: 13, color: '#f87171' }}>CHƯA ĐỦ DỮ LIỆU GIÁ VỐN</Text>
                      {currentSummary.missingCostSoldProductCount > 0 && (
                        <Text style={{ fontSize: 10, color: '#a3a3a3', marginTop: 4 }}>
                          {currentSummary.missingCostSoldProductCount} sản phẩm đã bán thiếu giá
                        </Text>
                      )}
                    </View>
                  ) : (
                    <>
                      <Text className="text-white mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: 22 }}>
                        {formatCurrency(grossProfit)}
                      </Text>
                      <View className="mt-2 flex-row justify-between items-center">
                        <Text style={{ fontSize: 11, color: '#a3a3a3' }}>
                          Biên LN: {currentSummary?.grossMarginPercent?.toFixed(1) ?? 'N/A'}%
                        </Text>
                      </View>
                      <View className="mt-1">
                        {gpChange.up === null ? 
                          <Text style={{ fontSize: 11, color: '#a3a3a3' }}>- {gpChange.text}</Text> :
                          <View className="flex-row items-center">
                            <Ionicons name={gpChange.up ? "arrow-up" : "arrow-down"} size={12} color={gpChange.up ? "#4ade80" : "#f87171"} />
                            <Text style={{ fontSize: 11, color: gpChange.up ? '#4ade80' : '#f87171', marginLeft: 2, fontWeight: 'bold' }}>
                              {gpChange.text}
                            </Text>
                          </View>
                        }
                      </View>
                    </>
                  )}
                </View>

                {/* 3. ĐƠN HOÀN TẤT */}
                <View className={`border-[1.5px] border-black bg-white p-4 ${isDesktop ? 'flex-1' : isTablet ? 'w-[47%]' : 'w-full'}`}>
                  <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    ĐƠN HOÀN TẤT
                  </Text>
                  <Text className="text-black mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: 22 }}>
                    {completedOrders} đơn
                  </Text>
                  <Text style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>
                    {currentSummary?.cancelledOrders || 0} đơn hủy
                  </Text>
                  <View className="mt-2">{renderTrend(ordChange)}</View>
                </View>

                {/* 4. TRUNG BÌNH/ĐƠN */}
                <View className={`border-[1.5px] border-black bg-white p-4 ${isDesktop ? 'flex-1' : isTablet ? 'w-[47%]' : 'w-full'}`}>
                  <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    TRUNG BÌNH/ĐƠN
                  </Text>
                  <Text className="text-black mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: 22 }}>
                    {formatCurrency(avgOrderVal)}
                  </Text>
                  <View className="mt-2">{renderTrend(avgChange)}</View>
                </View>
              </View>

              {/* KHU VỰC CẦN XỬ LÝ */}
              <View className="border-[1.5px] border-black bg-white mb-6">
                <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50">
                  <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    CẦN XỬ LÝ
                  </Text>
                </View>
                <View className={`flex-row flex-wrap p-4`} style={{ gap: 16 }}>
                  {(!currentSummary || (currentSummary.outOfStockSKUs === 0 && currentSummary.lowStockSKUs === 0 && currentSummary.pendingOrders === 0)) ? (
                    <View className="w-full py-4 items-center">
                      <Text style={{ fontSize: 13, color: '#525252', fontWeight: 'bold' }}>KHÔNG CÓ VẤN ĐỀ CẦN XỬ LÝ</Text>
                      <Text style={{ fontSize: 11, color: '#a3a3a3', marginTop: 4 }}>Dữ liệu được kiểm tra lúc {new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'})}</Text>
                    </View>
                  ) : (
                    <>
                      {currentSummary.outOfStockSKUs > 0 && (
                        <View className="flex-row items-center border-[1.5px] border-red-600 bg-red-50 p-3 flex-1 min-w-[200px]">
                          <Ionicons name="warning-outline" size={24} color="#dc2626" />
                          <View className="ml-3">
                            <Text className="font-black text-red-600" style={{ fontSize: 18 }}>{currentSummary.outOfStockSKUs}</Text>
                            <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: 'bold' }}>SẢN PHẨM HẾT HÀNG</Text>
                          </View>
                        </View>
                      )}
                      {currentSummary.lowStockSKUs > 0 && (
                        <View className="flex-row items-center border-[1.5px] border-orange-500 bg-orange-50 p-3 flex-1 min-w-[200px]">
                          <Ionicons name="alert-circle-outline" size={24} color="#f97316" />
                          <View className="ml-3">
                            <Text className="font-black text-orange-600" style={{ fontSize: 18 }}>{currentSummary.lowStockSKUs}</Text>
                            <Text style={{ fontSize: 11, color: '#ea580c', fontWeight: 'bold' }}>SẢN PHẨM SẮP HẾT</Text>
                          </View>
                        </View>
                      )}
                      {currentSummary.pendingOrders > 0 && (
                        <View className="flex-row items-center border-[1.5px] border-black bg-white p-3 flex-1 min-w-[200px]">
                          <Ionicons name="time-outline" size={24} color="#000" />
                          <View className="ml-3">
                            <Text className="font-black text-black" style={{ fontSize: 18 }}>{currentSummary.pendingOrders}</Text>
                            <Text style={{ fontSize: 11, color: '#000', fontWeight: 'bold' }}>ĐƠN ĐANG CHỜ HIỆN TẠI</Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* CHART & WAREHOUSE OVERVIEW */}
              <View className={isDesktop ? "flex-row" : "flex-col"} style={{ gap: 16, marginBottom: 24 }}>
                
                {/* CHART */}
                <View className={`border-[1.5px] border-black bg-white ${isDesktop ? 'flex-[7]' : 'w-full'}`}>
                  <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50">
                    <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      DOANH THU THEO THỜI GIAN
                    </Text>
                  </View>
                  <View className="p-4 items-center">
                    {(!revenueData || revenueData.filter(d => d.currentPeriodRevenue > 0 || d.previousPeriodRevenue > 0).length === 0) ? (
                      <View className="h-[300px] justify-center items-center">
                        <Text style={{ fontSize: 13, color: '#000', fontWeight: 'bold' }}>CHƯA PHÁT SINH GIAO DỊCH</Text>
                        <Text style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>Dữ liệu bán hàng trong khoảng thời gian này sẽ xuất hiện tại đây.</Text>
                      </View>
                    ) : (
                      <LineChart
                        data={{
                          labels: revenueData.map(d => d.label),
                          datasets: [
                            {
                              data: revenueData.map(d => d.previousPeriodRevenue),
                              color: (opacity = 1) => `rgba(156, 163, 175, 1)`, // gray-400 dashed effect not fully supported, but we use gray color
                              strokeWidth: 2,
                            },
                            {
                              data: revenueData.map(d => d.currentPeriodRevenue),
                              color: (opacity = 1) => `rgba(0, 0, 0, 1)`,
                              strokeWidth: 3,
                            }
                          ],
                          legend: ["Kỳ trước", "Kỳ hiện tại"]
                        }}
                        width={(isDesktop ? (screenWidth * 0.7) : screenWidth) - 80}
                        height={300}
                        yAxisLabel=""
                        yAxisSuffix=" ₫"
                        chartConfig={{
                          backgroundColor: "#ffffff",
                          backgroundGradientFrom: "#ffffff",
                          backgroundGradientTo: "#ffffff",
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(0, 0, 0, 0.1)`,
                          labelColor: (opacity = 1) => `rgba(82, 82, 82, 1)`,
                          propsForDots: { r: "3", strokeWidth: "1", stroke: "#000" },
                        }}
                        bezier
                        style={{ marginVertical: 8 }}
                      />
                    )}
                  </View>
                </View>

                {/* WAREHOUSE OVERVIEW */}
                <View className={`border-[1.5px] border-black bg-white ${isDesktop ? 'flex-[3]' : 'w-full mt-4'}`}>
                  <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50">
                    <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      TỔNG QUAN KHO
                    </Text>
                  </View>
                  <View className="p-5">
                    {currentSummary?.hasInventoryValueData === false && (
                      <View className="mb-4 bg-yellow-50 border border-yellow-400 p-2">
                        <Text style={{ fontSize: 11, color: '#ca8a04', fontWeight: 'bold' }}>GIÁ TRỊ TỒN KHO CHƯA ĐẦY ĐỦ</Text>
                        <Text style={{ fontSize: 10, color: '#a16207' }}>Thiếu giá vốn cho {currentSummary.missingCostInventoryProductCount} sản phẩm.</Text>
                      </View>
                    )}
                    
                    <View className="flex-row justify-between mb-4 pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>Giá trị tồn kho</Text>
                      <Text className="font-black text-black" style={{ fontSize: 14 }}>
                        {currentSummary?.totalInventoryValue !== null ? formatCurrency(currentSummary?.totalInventoryValue) : 'N/A'}
                      </Text>
                    </View>

                    <View className="flex-row justify-between mb-4 pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>SKU ĐANG TỒN</Text>
                      <Text className="font-bold text-black" style={{ fontSize: 14 }}>{currentSummary?.totalSKUs || 0}</Text>
                    </View>

                    <View className="flex-row justify-between mb-4 pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>SKU hết hàng</Text>
                      <Text className={`font-bold ${currentSummary?.outOfStockSKUs ? 'text-red-600' : 'text-black'}`} style={{ fontSize: 14 }}>
                        {currentSummary?.outOfStockSKUs || 0}
                      </Text>
                    </View>

                    <View className="flex-row justify-between pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>SKU sắp hết</Text>
                      <Text className={`font-bold ${currentSummary?.lowStockSKUs ? 'text-orange-500' : 'text-black'}`} style={{ fontSize: 14 }}>
                        {currentSummary?.lowStockSKUs || 0}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* TOP PRODUCTS */}
              <View className="border-[1.5px] border-black bg-white mt-6">
                <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50 flex-row justify-between items-center">
                  <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    TOP SẢN PHẨM BÁN CHẠY
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#000', textDecorationLine: 'underline' }}>XEM TẤT CẢ</Text>
                </View>

                {(!topProducts || topProducts.length === 0) ? (
                  <View className="py-10 justify-center items-center">
                    <Text style={{ fontSize: 13, color: '#525252', fontWeight: 'bold' }}>CHƯA CÓ DỮ LIỆU SẢN PHẨM BÁN RA</Text>
                  </View>
                ) : (
                  <View>
                    {isDesktop || isTablet ? (
                      // TABLE FOR DESKTOP/TABLET
                      <View className="w-full">
                        <View className="flex-row px-4 py-2 bg-gray-100 border-b border-gray-300">
                          <Text className="font-bold flex-[0.5]" style={{ fontSize: 11 }}>#</Text>
                          <Text className="font-bold flex-[3]" style={{ fontSize: 11 }}>Sản phẩm</Text>
                          <Text className="font-bold flex-[1] text-right" style={{ fontSize: 11 }}>Đã bán</Text>
                          <Text className="font-bold flex-[1.5] text-right" style={{ fontSize: 11 }}>Doanh thu</Text>
                          <Text className="font-bold flex-[1] text-right" style={{ fontSize: 11 }}>Tồn kho</Text>
                        </View>
                        {topProducts.map((p, idx) => (
                          <View key={p.productId} className="flex-row px-4 py-3 border-b border-gray-200 items-center">
                            <Text className="font-bold flex-[0.5] text-gray-500" style={{ fontSize: 12 }}>{idx + 1}</Text>
                            <View className="flex-[3]">
                              <Text className="font-bold text-black" style={{ fontSize: 13 }} numberOfLines={1}>{p.productName}</Text>
                              <Text className="text-gray-500" style={{ fontSize: 10 }}>{p.barcode || `SKU-${p.productId}`}</Text>
                            </View>
                            <Text className="font-bold text-black flex-[1] text-right" style={{ fontSize: 13 }}>{p.quantitySold}</Text>
                            <Text className="font-bold text-black flex-[1.5] text-right" style={{ fontSize: 13 }}>{formatCurrency(p.revenue)}</Text>
                            <View className="flex-[1] items-end">
                              <Text className="font-bold text-black" style={{ fontSize: 13 }}>{p.stockQuantity}</Text>
                              {p.stockStatus && (
                                <Text className={`font-bold mt-1 ${p.stockStatus === 'HẾT HÀNG' ? 'text-red-600' : 'text-orange-500'}`} style={{ fontSize: 9 }}>
                                  {p.stockStatus}
                                </Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      // CARD LIST FOR MOBILE
                      <View className="px-4 py-2">
                        {topProducts.map((p, idx) => (
                          <View key={p.productId} className="py-3 border-b border-gray-200">
                            <View className="flex-row justify-between mb-1">
                              <View className="flex-1 flex-row pr-2">
                                <Text className="font-bold text-gray-500 mr-2" style={{ fontSize: 13 }}>#{idx + 1}</Text>
                                <Text className="font-bold text-black flex-1" style={{ fontSize: 13 }}>{p.productName}</Text>
                              </View>
                              <Text className="font-bold text-black text-right" style={{ fontSize: 13 }}>{formatCurrency(p.revenue)}</Text>
                            </View>
                            <View className="flex-row justify-between items-center mt-1">
                              <Text className="text-gray-500" style={{ fontSize: 11 }}>Đã bán: <Text className="font-bold text-black">{p.quantitySold}</Text></Text>
                              <Text className="text-gray-500" style={{ fontSize: 11 }}>
                                Tồn: <Text className="font-bold text-black">{p.stockQuantity}</Text>
                                {p.stockStatus && <Text className={p.stockStatus === 'HẾT HÀNG' ? 'text-red-600' : 'text-orange-500'}> ({p.stockStatus})</Text>}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>

            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
