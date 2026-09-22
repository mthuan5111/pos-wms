import React, { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, RefreshControl, Platform, Alert, ActivityIndicator, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LineChart } from "react-native-chart-kit";
import {
  getDashboardSummary,
  getTopProducts,
  getRevenueChartComparison,
  getLowStockProducts,
  DashboardSummaryDto,
  TopProductDto,
  RevenueComparisonPointDto,
  LowStockProductDto
} from "@/services/reportApi";
import { useGlobalSyncStore } from "@/store/useGlobalSyncStore";
import { useAuthStore } from "@/store/authStore";
import { getVietnamPeriodRangesUtc, formatVietnamDateTime } from "@/utils/timezone";

type PeriodType = "today" | "7days" | "30days";

export default function DashboardScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 1024;
  const isTablet = windowWidth >= 768 && windowWidth < 1024;

  const [period, setPeriod] = useState<PeriodType>("today");
  const reqSeqRef = useRef(0);

  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const role = user?.role;
  const canCreateReceipt = user?.role === "Admin" || user?.role === "Manager" || user?.role === "WarehouseStaff";

  const [summaryState, setSummaryState] = useState<{loading: boolean, error: string|null, current: DashboardSummaryDto|null, prev: DashboardSummaryDto|null}>({loading: true, error: null, current: null, prev: null});
  const [chartState, setChartState] = useState<{loading: boolean, error: string|null, data: RevenueComparisonPointDto[]|null}>({loading: true, error: null, data: null});
  const [topProductsState, setTopProductsState] = useState<{loading: boolean, error: string|null, data: TopProductDto[]|null}>({loading: true, error: null, data: null});
  const [lowStockState, setLowStockState] = useState<{loading: boolean, error: string|null, data: LowStockProductDto[]|null}>({loading: true, error: null, data: null});
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(new Set());
  const [issueFilter, setIssueFilter] = useState<"all" | "out" | "low" | "missing_price">("all");

  const allIssues = useMemo(() => lowStockState.data || [], [lowStockState.data]);

  const outOfStockCount = useMemo(() => allIssues.filter(i => i.status === "Hết hàng" || i.stockQuantity <= 0).length, [allIssues]);
  const lowStockCount = useMemo(() => allIssues.filter(i => (i.status === "Sắp hết" || (i.stockQuantity > 0 && i.stockQuantity <= (i.lowStockThreshold || 10))) && i.isSalePriceConfigured !== false).length, [allIssues]);
  const missingPriceCount = useMemo(() => allIssues.filter(i => i.status === "Thiếu giá" || i.isSalePriceConfigured === false).length, [allIssues]);

  const displayedIssues = useMemo(() => {
    if (issueFilter === "out") return allIssues.filter(i => i.status === "Hết hàng" || i.stockQuantity <= 0);
    if (issueFilter === "low") return allIssues.filter(i => (i.status === "Sắp hết" || (i.stockQuantity > 0 && i.stockQuantity <= (i.lowStockThreshold || 10))) && i.isSalePriceConfigured !== false);
    if (issueFilter === "missing_price") return allIssues.filter(i => i.status === "Thiếu giá" || i.isSalePriceConfigured === false);
    return allIssues;
  }, [allIssues, issueFilter]);

  const actionableIssues = useMemo(() => {
    if (issueFilter === "missing_price") return [];
    return displayedIssues.filter(i => i.stockQuantity <= (i.lowStockThreshold || 10));
  }, [displayedIssues, issueFilter]);

  const toggleSelectIssue = (id: number) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (actionableIssues.length === 0) return;
    const allActionableSelected = actionableIssues.every(i => selectedIssueIds.has(i.productId));
    if (allActionableSelected) {
      setSelectedIssueIds(prev => {
        const next = new Set(prev);
        actionableIssues.forEach(i => next.delete(i.productId));
        return next;
      });
    } else {
      setSelectedIssueIds(prev => {
        const next = new Set(prev);
        actionableIssues.forEach(i => next.add(i.productId));
        return next;
      });
    }
  };

  const handleBatchCreateReceipt = () => {
    if (!lowStockState.data) return;
    const selected = lowStockState.data.filter(i => selectedIssueIds.has(i.productId) && i.stockQuantity <= (i.lowStockThreshold || 10));
    if (selected.length === 0) return;
    navigation.navigate(role === "WarehouseStaff" ? "WarehouseInvoice" : "Invoice", {
      tab: "imports",
      openCreateReceipt: true,
      prefillProducts: selected.map(i => ({
        productId: i.productId,
        productName: i.productName,
        barcode: i.barcode,
        quantity: Math.max(10, (i.lowStockThreshold || 5) * 2),
        costPrice: 0
      }))
    });
  };

  const getDateRanges = (p: PeriodType) => {
    return getVietnamPeriodRangesUtc(p);
  };

  const loadData = useCallback(async (selectedPeriod = period) => {
    reqSeqRef.current += 1;
    const currentSeq = reqSeqRef.current;

    setSummaryState(s => ({ ...s, loading: true, error: null }));
    setChartState(s => ({ ...s, loading: true, error: null }));
    setTopProductsState(s => ({ ...s, loading: true, error: null }));
    setLowStockState(s => ({ ...s, loading: true, error: null }));

    const { currentStartStr, currentEndStr, previousStartStr, previousEndStr } = getDateRanges(selectedPeriod);

    // Run independently
    Promise.allSettled([
      getDashboardSummary(currentStartStr, currentEndStr),
      getDashboardSummary(previousStartStr, previousEndStr)
    ]).then(results => {
      if (reqSeqRef.current !== currentSeq) return;
      const curSumRes = results[0].status === 'fulfilled' ? results[0].value : null;
      const prevSumRes = results[1].status === 'fulfilled' ? results[1].value : null;

      if (!curSumRes?.isSuccess) {
         setSummaryState(s => ({ ...s, loading: false, error: "Lỗi tải tóm tắt", current: null }));
      } else {
         setSummaryState({ loading: false, error: null, current: curSumRes.data, prev: prevSumRes?.isSuccess ? prevSumRes.data : null });
      }
    });

    getRevenueChartComparison(currentStartStr, currentEndStr, previousStartStr, previousEndStr)
      .then(res => {
        if (reqSeqRef.current !== currentSeq) return;
        if (res.isSuccess) setChartState({ loading: false, error: null, data: res.data });
        else setChartState({ loading: false, error: "Lỗi biểu đồ", data: null });
      })
      .catch((err) => {
        if (reqSeqRef.current !== currentSeq) return;
        console.warn("[Dashboard] chart comparison error:", err);
        setChartState({ loading: false, error: "Lỗi biểu đồ", data: null });
      });

    getTopProducts(5, currentStartStr, currentEndStr)
      .then(res => {
        if (reqSeqRef.current !== currentSeq) return;
        if (res.isSuccess) setTopProductsState({ loading: false, error: null, data: res.data });
        else setTopProductsState({ loading: false, error: "Lỗi top SP", data: null });
      })
      .catch(() => {
        if (reqSeqRef.current !== currentSeq) return;
        setTopProductsState({ loading: false, error: "Lỗi top SP", data: null });
      });

    getLowStockProducts(1000)
      .then(res => {
        if (reqSeqRef.current !== currentSeq) return;
        if (res.isSuccess) {
          const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
          setLowStockState({ loading: false, error: null, data: list });
        } else {
          setLowStockState({ loading: false, error: "Lỗi tải hàng cần xử lý", data: null });
        }
      })
      .catch(() => {
        if (reqSeqRef.current !== currentSeq) return;
        setLowStockState({ loading: false, error: "Lỗi tải hàng cần xử lý", data: null });
      });

  }, [period]);

  // Sync listen
  const { lastSyncAt } = useGlobalSyncStore();

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData, lastSyncAt])
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

  const currentSummary = summaryState.current;
  const previousSummary = summaryState.prev;

  if (summaryState.error && !currentSummary) {
    return (
      <SafeAreaView className="flex-1 bg-white justify-center items-center">
        <Ionicons name="alert-circle-outline" size={48} color="#000" />
        <Text className="mt-4 font-bold" style={{ fontSize: 16 }}>{summaryState.error}</Text>
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
      <View className="px-4 sm:px-6 pt-4 pb-3 bg-white border-b-2 border-black">
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
      <View className="px-4 sm:px-6 py-3 border-b-2 border-black flex-row items-center bg-gray-50" style={{ gap: 8 }}>
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
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={summaryState.loading} onRefresh={() => loadData()} tintColor="#000" />}
      >
        <View className="p-4 sm:p-6">
          {summaryState.loading && !currentSummary ? (
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

              {/* KHU VỰC CẦN XỬ LÝ (Section 9) */}
              <View className="border-[1.5px] border-black bg-white mb-6">
                <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50 flex-row justify-between items-center flex-wrap gap-2">
                  <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    DANH SÁCH CẦN XỬ LÝ
                  </Text>
                  {canCreateReceipt && selectedIssueIds.size > 0 && (
                    <TouchableOpacity
                      onPress={handleBatchCreateReceipt}
                      className="bg-black px-3 py-1.5 border border-black flex-row items-center"
                    >
                      <Ionicons name="cart-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                      <Text className="text-white text-xs font-bold uppercase">
                        Lập phiếu nhập các mặt hàng đã chọn ({selectedIssueIds.size})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 4 Filter Tabs */}
                <View className="flex-row flex-wrap p-4 border-b border-gray-200" style={{ gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("all")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "all" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "all" ? "text-white" : "text-black"}`}>
                      Tất cả ({allIssues.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("out")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "out" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "out" ? "text-white" : "text-black"}`}>
                      Hết hàng ({outOfStockCount})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("low")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "low" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "low" ? "text-white" : "text-black"}`}>
                      Sắp hết ({lowStockCount})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("missing_price")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "missing_price" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "missing_price" ? "text-white" : "text-black"}`}>
                      Thiếu giá ({missingPriceCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Detailed List */}
                <View className="p-4">
                  {lowStockState.loading ? (
                    <View className="py-6 justify-center items-center">
                      <ActivityIndicator color="#000" />
                      <Text className="mt-2 text-xs text-gray-500 font-bold">ĐANG TẢI DANH SÁCH CẦN XỬ LÝ...</Text>
                    </View>
                  ) : displayedIssues.length === 0 ? (
                    <View className="py-6 items-center">
                      <Ionicons name="checkmark-circle-outline" size={32} color="#16a34a" />
                      <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: 'bold', marginTop: 4 }}>
                        KHÔNG CÓ MẶT HÀNG NÀO TRONG NHÓM NÀY
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {/* Select all header */}
                      {canCreateReceipt && actionableIssues.length > 0 && (
                        <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-gray-200">
                          <TouchableOpacity onPress={toggleSelectAll} className="flex-row items-center">
                            <Ionicons
                              name={actionableIssues.every(i => selectedIssueIds.has(i.productId)) ? "checkbox" : "square-outline"}
                              size={18}
                              color="#000"
                            />
                            <Text className="ml-2 text-xs font-bold text-black">
                              Chọn tất cả ({actionableIssues.length})
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Scrollable Container */}
                      <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                        {displayedIssues.map((item, idx) => {
                          const isOut = item.stockQuantity <= 0;
                          const isMissingPrice = item.isSalePriceConfigured === false || item.status === "Thiếu giá";
                          const isSelected = selectedIssueIds.has(item.productId);
                          const isActionable = item.stockQuantity <= (item.lowStockThreshold || 10);
                          return (
                            <View
                              key={item.productId || idx}
                              className="flex-row flex-wrap items-center justify-between py-3 border-b border-gray-200"
                              style={{ gap: 8 }}
                            >
                              <View className="flex-row items-center flex-1 min-w-[200px]">
                                {canCreateReceipt && isActionable && (
                                  <TouchableOpacity onPress={() => toggleSelectIssue(item.productId)} className="mr-3">
                                    <Ionicons
                                      name={isSelected ? "checkbox" : "square-outline"}
                                      size={20}
                                      color="#000"
                                    />
                                  </TouchableOpacity>
                                )}
                                <View className="flex-1">
                                  <View className="flex-row items-center flex-wrap">
                                    <Text className="font-bold text-sm text-black">{item.productName}</Text>
                                    {isMissingPrice ? (
                                      <View className="ml-2 px-2 py-0.5 border bg-amber-100 border-amber-500">
                                        <Text className="text-[10px] font-bold text-amber-700">
                                          THIẾU GIÁ
                                        </Text>
                                      </View>
                                    ) : (
                                      <View className={`ml-2 px-2 py-0.5 border ${isOut ? 'bg-red-100 border-red-500' : 'bg-orange-100 border-orange-500'}`}>
                                        <Text className={`text-[10px] font-bold ${isOut ? 'text-red-700' : 'text-orange-700'}`}>
                                          {isOut ? "HẾT HÀNG" : "SẮP HẾT"}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                  <View className="flex-row items-center mt-1 flex-wrap">
                                    <Text className="text-xs text-gray-500 mr-3">Mã: <Text className="font-mono text-black font-semibold">{item.barcode || 'Chưa có'}</Text></Text>
                                    <Text className="text-xs text-gray-500 mr-3">Tồn: <Text className={`font-bold ${isOut ? 'text-red-600' : 'text-orange-600'}`}>{item.stockQuantity}</Text> (Ngưỡng: {item.lowStockThreshold})</Text>
                                    <Text className="text-xs text-gray-500">NCC: <Text className="text-black font-semibold">{item.supplierName || 'Chưa có'}</Text></Text>
                                  </View>
                                </View>
                              </View>

                              <View className="flex-row items-center" style={{ gap: 8 }}>
                                <TouchableOpacity
                                  onPress={() => {
                                    (navigation as any).navigate("Inventory", {
                                      tab: "products",
                                      targetProductId: item.productId,
                                      targetBarcode: item.barcode,
                                      focusField: isMissingPrice ? "price" : (isOut ? "price" : "lowStockThreshold")
                                    });
                                  }}
                                  className="border border-black px-3 py-1.5 bg-white"
                                  accessibilityLabel={`Xem chi tiết sản phẩm ${item.productName}`}
                                >
                                  <Text className="text-xs font-bold text-black uppercase">
                                    {isMissingPrice ? "CẬP NHẬT GIÁ" : "XEM"}
                                  </Text>
                                </TouchableOpacity>

                                {canCreateReceipt && isActionable && (
                                  <TouchableOpacity
                                    onPress={() => {
                                      navigation.navigate(role === "WarehouseStaff" ? "WarehouseInvoice" : "Invoice", {
                                        tab: "imports",
                                        openCreateReceipt: true,
                                        prefillProducts: [{
                                          productId: item.productId,
                                          productName: item.productName,
                                          barcode: item.barcode,
                                          quantity: Math.max(10, (item.lowStockThreshold || 5) * 2),
                                          costPrice: 0
                                        }]
                                      });
                                    }}
                                    className="border border-black px-3 py-1.5 bg-black"
                                    accessibilityLabel={`Thêm vào phiếu nhập ${item.productName}`}
                                  >
                                    <Text className="text-xs font-bold text-white uppercase">Thêm vào phiếu nhập</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    </View>
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
                    {chartState.loading ? (
                      <View className="h-[300px] justify-center items-center">
                        <ActivityIndicator color="#000" />
                        <Text className="mt-2 text-xs font-bold text-gray-500 tracking-widest">ĐANG TẢI BIỂU ĐỒ...</Text>
                      </View>
                    ) : chartState.error ? (
                      <View className="h-[300px] justify-center items-center">
                        <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: 'bold' }}>{chartState.error}</Text>
                      </View>
                    ) : (!chartState.data || chartState.data.filter(d => d.currentPeriodRevenue > 0 || d.previousPeriodRevenue > 0).length === 0) ? (
                      <View className="h-[300px] justify-center items-center">
                        <Text style={{ fontSize: 13, color: '#000', fontWeight: 'bold' }}>CHƯA PHÁT SINH GIAO DỊCH</Text>
                        <Text style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>Dữ liệu bán hàng trong khoảng thời gian này sẽ xuất hiện tại đây.</Text>
                      </View>
                    ) : (
                      <LineChart
                        data={{
                          labels: chartState.data.map(d => d.label),
                          datasets: [
                            {
                              data: chartState.data.map(d => d.previousPeriodRevenue),
                              color: (opacity = 1) => `rgba(156, 163, 175, 1)`,
                              strokeWidth: 2,
                            },
                            {
                              data: chartState.data.map(d => d.currentPeriodRevenue),
                              color: (opacity = 1) => `rgba(0, 0, 0, 1)`,
                              strokeWidth: 3,
                            }
                          ],
                          legend: ["Kỳ trước", "Kỳ hiện tại"]
                        }}
                        width={Math.max(300, (isDesktop ? (windowWidth * 0.7) : windowWidth) - 80)}
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
                        {formatCurrency(currentSummary?.totalInventoryValue || 0)}
                      </Text>
                    </View>

                    <View className="flex-row justify-between mb-4 pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>Mặt hàng còn hàng</Text>
                      <Text className="font-bold text-black" style={{ fontSize: 14 }}>{currentSummary?.totalSKUs || 0}</Text>
                    </View>

                    <View className="flex-row justify-between mb-4 pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>Mặt hàng hết hàng</Text>
                      <Text className={`font-bold ${currentSummary?.outOfStockSKUs ? 'text-red-600' : 'text-black'}`} style={{ fontSize: 14 }}>
                        {currentSummary?.outOfStockSKUs || 0}
                      </Text>
                    </View>

                    <View className="flex-row justify-between pb-2 border-b border-gray-200">
                      <Text style={{ fontSize: 13, color: '#525252' }}>Mặt hàng sắp hết</Text>
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
                </View>

                {topProductsState.loading ? (
                  <View className="py-10 justify-center items-center">
                    <ActivityIndicator color="#000" />
                    <Text className="mt-2 text-xs font-bold text-gray-500 tracking-widest">ĐANG TẢI TOP SẢN PHẨM...</Text>
                  </View>
                ) : topProductsState.error ? (
                  <View className="py-10 justify-center items-center">
                    <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: 'bold' }}>{topProductsState.error}</Text>
                  </View>
                ) : (!topProductsState.data || topProductsState.data.length === 0) ? (
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
                        {topProductsState.data.map((p, idx) => (
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
                        {topProductsState.data.map((p, idx) => (
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
