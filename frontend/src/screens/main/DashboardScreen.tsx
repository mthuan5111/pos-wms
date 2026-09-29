import React, { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, RefreshControl, Platform, Alert, ActivityIndicator, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import DashboardChart from "../../components/DashboardChart";
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
import { useDemoSandboxStore } from "@/store/useDemoSandboxStore";
import { getDBConnection, getLocalProducts } from "@/database/db";
import { getVietnamPeriodRangesUtc, formatVietnamDateTime } from "@/utils/timezone";
import { isDemoRole } from "@/utils/roleUtils";

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
  const isDemo = isDemoRole(role);
  const canViewReports = role === "Admin" || role === "Manager";
  const inFlightRef = useRef(false);
  const canCreateReceipt = user?.role === "Admin" || user?.role === "Manager" || user?.role === "WarehouseStaff";

  // Demo Sandbox State
  const [demoOrders, setDemoOrders] = useState<any[]>([]);
  const [demoProducts, setDemoProducts] = useState<any[]>([]);
  const [demoLoading, setDemoLoading] = useState(isDemo);

  const demoSessionId = useDemoSandboxStore(s => s.demoSessionId);
  const sandboxStockDeltas = useDemoSandboxStore(s => s.sandboxStockDeltas);
  const activeShift = useDemoSandboxStore(s => s.activeShift);
  const completedSteps = useDemoSandboxStore(s => s.completedSteps);
  const pendingSyncCount = useDemoSandboxStore(s => s.pendingSyncCount);
  const setGuideModalVisible = useDemoSandboxStore(s => s.setGuideModalVisible);

  const [summaryState, setSummaryState] = useState<{ loading: boolean, error: string | null, current: DashboardSummaryDto | null, prev: DashboardSummaryDto | null }>({ loading: canViewReports, error: null, current: null, prev: null });
  const [chartState, setChartState] = useState<{ loading: boolean, error: string | null, data: RevenueComparisonPointDto[] | null }>({ loading: canViewReports, error: null, data: null });
  const [topProductsState, setTopProductsState] = useState<{ loading: boolean, error: string | null, data: TopProductDto[] | null }>({ loading: canViewReports, error: null, data: null });
  const [lowStockState, setLowStockState] = useState<{ loading: boolean, error: string | null, data: LowStockProductDto[] | null }>({ loading: canViewReports, error: null, data: null });
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

  // Demo Sandbox Computations
  const filteredDemoOrders = useMemo(() => {
    if (!isDemo || demoOrders.length === 0) return [];
    const { currentStartStr, currentEndStr } = getDateRanges(period);
    const startMs = new Date(currentStartStr).getTime();
    const endMs = new Date(currentEndStr).getTime();
    return demoOrders.filter(o => {
      const t = new Date(o.CreatedAt).getTime();
      return !isNaN(t) && t >= startMs && t <= endMs;
    });
  }, [isDemo, demoOrders, period]);

  const demoOrdersCount = filteredDemoOrders.length;
  const demoTotalAmount = useMemo(() => {
    return filteredDemoOrders.reduce((sum, o) => sum + Number(o.TotalAmount || 0), 0);
  }, [filteredDemoOrders]);

  const demoAllIssues = useMemo(() => {
    if (!isDemo) return [];
    return demoProducts.filter(p => p.status !== "Bình thường");
  }, [isDemo, demoProducts]);

  const demoOutOfStockCount = useMemo(() => {
    return demoProducts.filter(p => p.status === "Hết hàng").length;
  }, [demoProducts]);

  const demoLowStockCount = useMemo(() => {
    return demoProducts.filter(p => p.status === "Sắp hết").length;
  }, [demoProducts]);

  const demoMissingPriceCount = useMemo(() => {
    return demoProducts.filter(p => p.status === "Thiếu giá").length;
  }, [demoProducts]);

  const displayedDemoIssues = useMemo(() => {
    if (issueFilter === "out") return demoProducts.filter(p => p.status === "Hết hàng");
    if (issueFilter === "low") return demoProducts.filter(p => p.status === "Sắp hết");
    if (issueFilter === "missing_price") return demoProducts.filter(p => p.status === "Thiếu giá");
    return demoAllIssues;
  }, [demoProducts, demoAllIssues, issueFilter]);

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
    // Role Demo: Load local SQLite sandbox data, do NOT call production Reports API to avoid 403
    if (isDemo) {
      setDemoLoading(true);
      try {
        const db = await getDBConnection();
        const sessionId = useDemoSandboxStore.getState().demoSessionId || await useDemoSandboxStore.getState().initSession();

        // 1. Load sandbox orders for current demo session
        const orders = await db.getAllAsync<any>(
          'SELECT * FROM DemoSandboxOrders WHERE SessionId = ? ORDER BY CreatedAt DESC',
          [sessionId]
        );
        setDemoOrders(orders || []);

        // 2. Load local products and compute effective stock
        const localProds = await getLocalProducts();
        const deltas = useDemoSandboxStore.getState().sandboxStockDeltas || {};
        const prodsWithEff = (localProds || []).map(p => {
          const delta = deltas[p.Id] || 0;
          const effStock = Math.max(0, p.StockQuantity + delta);
          const lowThresh = p.LowStockThreshold || 10;
          const isSalePriceConfigured = p.IsSalePriceConfigured !== 0 && (p.Price != null && p.Price > 0);
          let status: "Hết hàng" | "Sắp hết" | "Bình thường" | "Thiếu giá" = "Bình thường";
          if (!isSalePriceConfigured) {
            status = "Thiếu giá";
          } else if (effStock <= 0) {
            status = "Hết hàng";
          } else if (effStock <= lowThresh) {
            status = "Sắp hết";
          }
          return {
            productId: typeof p.Id === 'number' ? p.Id : parseInt(p.Id, 10) || 0,
            rawId: p.Id,
            productName: p.Name,
            barcode: p.Barcode,
            price: p.Price,
            stockQuantity: effStock,
            lowStockThreshold: lowThresh,
            isSalePriceConfigured,
            status,
            supplierName: p.SupplierId ? `NCC #${p.SupplierId}` : 'Chưa có'
          };
        });
        setDemoProducts(prodsWithEff);
      } catch (err) {
        console.error('[Dashboard] Error loading demo sandbox data:', err);
      } finally {
        setDemoLoading(false);
      }
      return;
    }

    // Nếu role không có quyền báo cáo (Cashier, WarehouseStaff), không gọi API Reports để tránh 403
    if (!canViewReports) {
      setSummaryState({ loading: false, error: null, current: null, prev: null });
      setChartState({ loading: false, error: null, data: null });
      setTopProductsState({ loading: false, error: null, data: null });
      setLowStockState({ loading: false, error: null, data: null });
      return;
    }

    if (inFlightRef.current) {
      console.log("[Dashboard] Yêu cầu đang được xử lý, bỏ qua lần gọi trùng lặp.");
      return;
    }

    inFlightRef.current = true;
    reqSeqRef.current += 1;
    const currentSeq = reqSeqRef.current;

    setSummaryState(s => ({ ...s, loading: true, error: null }));
    setChartState(s => ({ ...s, loading: true, error: null }));
    setTopProductsState(s => ({ ...s, loading: true, error: null }));
    setLowStockState(s => ({ ...s, loading: true, error: null }));

    const { currentStartStr, currentEndStr, previousStartStr, previousEndStr } = getDateRanges(selectedPeriod);

    try {
      await Promise.allSettled([
        // 1. Tóm tắt kinh doanh (Summary)
        Promise.allSettled([
          getDashboardSummary(currentStartStr, currentEndStr),
          getDashboardSummary(previousStartStr, previousEndStr)
        ]).then(results => {
          if (reqSeqRef.current !== currentSeq) return;
          const curSumRes = results[0].status === 'fulfilled' ? results[0].value : null;
          const prevSumRes = results[1].status === 'fulfilled' ? results[1].value : null;

          if (!curSumRes?.isSuccess) {
            const isForbidden = (results[0] as any)?.reason?.response?.status === 403;
            setSummaryState({
              loading: false,
              error: isForbidden ? "Không có quyền truy cập dữ liệu tóm tắt kinh doanh" : "Không thể tải dữ liệu tóm tắt",
              current: null,
              prev: null
            });
          } else {
            setSummaryState({
              loading: false,
              error: null,
              current: curSumRes.data,
              prev: prevSumRes?.isSuccess ? prevSumRes.data : null
            });
          }
        }),

        // 2. Biểu đồ doanh thu (Revenue Chart)
        getRevenueChartComparison(currentStartStr, currentEndStr, previousStartStr, previousEndStr)
          .then(res => {
            if (reqSeqRef.current !== currentSeq) return;
            if (res.isSuccess) setChartState({ loading: false, error: null, data: res.data });
            else setChartState({ loading: false, error: "Không thể tải biểu đồ doanh thu", data: null });
          })
          .catch((err) => {
            if (reqSeqRef.current !== currentSeq) return;
            const isForbidden = err?.response?.status === 403;
            setChartState({
              loading: false,
              error: isForbidden ? "Không có quyền xem biểu đồ" : "Không thể tải biểu đồ doanh thu",
              data: null
            });
          }),

        // 3. Top sản phẩm bán chạy (Top Products)
        getTopProducts(5, currentStartStr, currentEndStr)
          .then(res => {
            if (reqSeqRef.current !== currentSeq) return;
            if (res.isSuccess) setTopProductsState({ loading: false, error: null, data: res.data });
            else setTopProductsState({ loading: false, error: "Không thể tải sản phẩm bán chạy", data: null });
          })
          .catch((err) => {
            if (reqSeqRef.current !== currentSeq) return;
            const isForbidden = err?.response?.status === 403;
            setTopProductsState({
              loading: false,
              error: isForbidden ? "Không có quyền xem sản phẩm bán chạy" : "Không thể tải sản phẩm bán chạy",
              data: null
            });
          }),

        // 4. Hàng tồn kho cần xử lý (Low Stock)
        getLowStockProducts(1000)
          .then(res => {
            if (reqSeqRef.current !== currentSeq) return;
            if (res.isSuccess) {
              const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
              setLowStockState({ loading: false, error: null, data: list });
            } else {
              setLowStockState({ loading: false, error: "Không thể tải hàng tồn kho cần xử lý", data: null });
            }
          })
          .catch((err) => {
            if (reqSeqRef.current !== currentSeq) return;
            const isForbidden = err?.response?.status === 403;
            setLowStockState({
              loading: false,
              error: isForbidden ? "Không có quyền xem hàng cần xử lý" : "Không thể tải hàng tồn kho cần xử lý",
              data: null
            });
          })
      ]);
    } finally {
      inFlightRef.current = false;
    }
  }, [period, canViewReports, isDemo]);

  // Sync listen - only on focus or manual refresh, not looped
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  React.useEffect(() => {
    if (isDemo) {
      loadData();
    }
  }, [demoSessionId, sandboxStockDeltas, isDemo, loadData]);

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
      <View className="px-4 sm:px-6 pt-4 pb-3 bg-white border-b-2 border-black flex-row justify-between items-center flex-wrap gap-2">
        <View>
          <Text style={{ fontFamily: 'serif', fontSize: 28, fontWeight: '900', color: '#000', letterSpacing: -0.5, textTransform: 'uppercase' }}>
            TỔNG QUAN
          </Text>
          <Text className="mt-1" style={{ fontSize: 10, letterSpacing: 3, color: '#525252', textTransform: 'uppercase' }}>
            BÁO CÁO & PHÂN TÍCH KINH DOANH
          </Text>
          <Text className="mt-1" style={{ fontSize: 10, color: '#525252' }}>
            CẬP NHẬT LÚC {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, {new Date().toLocaleDateString('vi-VN')}
          </Text>
        </View>

        {isDemo && (
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              testID="btn-dashboard-guide"
              onPress={() => setGuideModalVisible(true)}
              className="bg-black px-3 py-2 border border-black flex-row items-center"
              accessibilityLabel="Mở hướng dẫn trải nghiệm"
            >
              <Ionicons name="help-circle-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
              <Text className="text-white text-xs font-bold uppercase">Hướng dẫn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="btn-dashboard-refresh"
              onPress={() => loadData()}
              className="bg-white px-3 py-2 border-2 border-black flex-row items-center"
              accessibilityLabel="Làm mới dữ liệu trải nghiệm"
            >
              <Ionicons name="refresh" size={16} color="#000" style={{ marginRight: 4 }} />
              <Text className="text-black text-xs font-bold uppercase">Làm mới</Text>
            </TouchableOpacity>
          </View>
        )}
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
        refreshControl={<RefreshControl refreshing={isDemo ? demoLoading : summaryState.loading} onRefresh={() => loadData()} tintColor="#000" />}
      >
        <View className="p-4 sm:p-6">
          {/* Demo Sandbox Alert Card */}
          {isDemo && (
            <View className="mb-6 p-4 border-2 border-black bg-neutral-50">
              <View className="flex-row items-center justify-between flex-wrap gap-2 mb-2">
                <View className="flex-row items-center">
                  <Ionicons name="sparkles" size={20} color="#000" />
                  <Text className="ml-2 font-black text-sm uppercase tracking-wider text-black">
                    DASHBOARD TRẢI NGHIỆM POS & WMS
                  </Text>
                </View>
                <View className="px-2.5 py-0.5 bg-black">
                  <Text className="text-white font-bold text-[10px] uppercase tracking-wider">SANDBOX ISOLATED</Text>
                </View>
              </View>
              <Text className="text-xs text-neutral-700 leading-relaxed mb-3">
                Các số liệu bên dưới được tổng hợp từ dữ liệu trải nghiệm và không ảnh hưởng dữ liệu vận hành thực tế. Bạn có thể tự do mở ca, tạo đơn bán hàng, kiểm tra hóa đơn và điều chỉnh tồn kho.
              </Text>
              <View className="flex-row flex-wrap items-center gap-2 pt-2 border-t border-neutral-200">
                <TouchableOpacity
                  onPress={() => setGuideModalVisible(true)}
                  className="bg-black px-3 py-1.5 flex-row items-center"
                >
                  <Ionicons name="book-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text className="text-white text-xs font-bold uppercase">Quy trình trải nghiệm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate("POS")}
                  className="bg-white border border-black px-3 py-1.5 flex-row items-center"
                >
                  <Ionicons name="cart-outline" size={14} color="#000" style={{ marginRight: 4 }} />
                  <Text className="text-black text-xs font-bold uppercase">Thử bán hàng POS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => navigation.navigate("Inventory")}
                  className="bg-white border border-black px-3 py-1.5 flex-row items-center"
                >
                  <Ionicons name="cube-outline" size={14} color="#000" style={{ marginRight: 4 }} />
                  <Text className="text-black text-xs font-bold uppercase">Quản lý kho</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Inline Summary Error for Admin/Manager */}
          {summaryState.error && !isDemo && (
            <View className="mb-5 p-3.5 bg-neutral-100 border-2 border-black flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 mr-3">
                <Ionicons name="alert-circle-outline" size={20} color="#000" style={{ marginRight: 8 }} />
                <Text className="text-black text-xs font-bold leading-tight">{summaryState.error}</Text>
              </View>
              <TouchableOpacity
                onPress={() => loadData()}
                className="px-3.5 py-1.5 bg-black border border-black"
              >
                <Text className="text-white text-xs font-bold uppercase tracking-wider">Thử lại</Text>
              </TouchableOpacity>
            </View>
          )}

          {summaryState.loading && !currentSummary && canViewReports ? (
            <View className="py-20 justify-center items-center">
              <ActivityIndicator size="large" color="#000" />
              <Text className="mt-4 font-bold" style={{ fontSize: 12, letterSpacing: 2 }}>ĐANG TẢI DỮ LIỆU...</Text>
            </View>
          ) : (
            <>
              {/* 4 KPIs */}
              <View className="flex-row flex-wrap" style={{ gap: 12, marginBottom: 20 }}>
                {isDemo ? (
                  <>
                    {/* 1. ĐƠN HÀNG TRẢI NGHIỆM */}
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        ĐƠN HÀNG TRẢI NGHIỆM
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontSize: isDesktop ? 22 : 18 }}>
                        {demoOrdersCount} đơn
                      </Text>
                      <View className="mt-2">
                        <Text style={{ fontSize: 11, color: '#525252' }}>
                          Đơn được tạo trong phiên trải nghiệm
                        </Text>
                      </View>
                    </View>

                    {/* 2. GIÁ TRỊ ĐƠN TRẢI NGHIỆM */}
                    <View className={`border-[1.5px] border-black bg-black p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#a3a3a3', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        GIÁ TRỊ ĐƠN TRẢI NGHIỆM
                      </Text>
                      <Text className="text-white mt-2 font-black" style={{ fontSize: isDesktop ? 22 : 18 }}>
                        {formatCurrency(demoTotalAmount)}
                      </Text>
                      <View className="mt-2">
                        <Text style={{ fontSize: 11, color: '#a3a3a3' }}>
                          Tổng giá trị đơn trong dữ liệu trải nghiệm
                        </Text>
                      </View>
                    </View>

                    {/* 3. SẢN PHẨM ĐANG QUẢN LÝ */}
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        SẢN PHẨM ĐANG QUẢN LÝ
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontSize: isDesktop ? 22 : 18 }}>
                        {demoProducts.length} sản phẩm
                      </Text>
                      <View className="mt-2">
                        <Text style={{ fontSize: 11, color: '#525252' }}>
                          Sản phẩm có sẵn để trải nghiệm bán hàng
                        </Text>
                      </View>
                    </View>

                    {/* 4. CẢNH BÁO TỒN KHO TRẢI NGHIỆM */}
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        CẢNH BÁO TỒN KHO TRẢI NGHIỆM
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontSize: isDesktop ? 22 : 18 }}>
                        {demoOutOfStockCount + demoLowStockCount} sản phẩm
                      </Text>
                      <View className="mt-2">
                        <Text style={{ fontSize: 11, color: '#525252' }}>
                          Sản phẩm cần chú ý trong dữ liệu trải nghiệm
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    {/* 1. DOANH THU THUẦN */}
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        DOANH THU THUẦN
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontSize: isDesktop ? 22 : 18 }}>
                        {formatCurrency(netRevenue)}
                      </Text>
                      <View className="mt-2">
                        {renderTrend(revChange)}
                      </View>
                    </View>

                    {/* 2. LỢI NHUẬN GỘP */}
                    <View className={`border-[1.5px] border-black bg-black p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#a3a3a3', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        LỢI NHUẬN GỘP
                      </Text>
                      {currentSummary?.hasGrossProfitData === false || grossProfit == null ? (
                        <View className="mt-2">
                          <Text className="text-white font-bold" style={{ fontSize: isDesktop ? 13 : 11, color: '#94a3b8' }}>
                            CHƯA ĐỦ DỮ LIỆU GIÁ VỐN
                          </Text>
                          <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                            {`${currentSummary?.missingCostSoldProductCount || 0} sản phẩm đã bán thiếu giá`}
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Text className="text-white mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: isDesktop ? 22 : 18 }}>
                            {formatCurrency(grossProfit)}
                          </Text>
                          <View className="mt-2 flex-row justify-between items-center">
                            <Text style={{ fontSize: 11, color: '#a3a3a3' }}>
                              Biên LN: {currentSummary?.grossMarginPercent != null ? currentSummary.grossMarginPercent.toFixed(1) + '%' : '0%'}
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
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        ĐƠN HOÀN TẤT
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: isDesktop ? 22 : 18 }}>
                        {`${completedOrders} đơn`}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#525252', marginTop: 4 }}>
                        {`${currentSummary?.cancelledOrders || 0} đơn hủy`}
                      </Text>
                      <View className="mt-2">{renderTrend(ordChange)}</View>
                    </View>

                    {/* 4. TRUNG BÌNH/ĐƠN */}
                    <View className={`border-[1.5px] border-black bg-white p-3.5 sm:p-4 ${isDesktop ? 'flex-1 min-w-[200px]' : 'w-[47%] min-w-[140px] flex-1'}`}>
                      <Text style={{ fontSize: 10, letterSpacing: 1.5, color: '#525252', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        TRUNG BÌNH/ĐƠN
                      </Text>
                      <Text className="text-black mt-2 font-black" style={{ fontFamily: 'sans-serif', fontSize: isDesktop ? 22 : 18 }}>
                        {formatCurrency(avgOrderVal)}
                      </Text>
                      <View className="mt-2">
                        {renderTrend(avgChange)}
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* KHU VỰC CẦN XỬ LÝ (Section 9) */}
              <View className="border-[1.5px] border-black bg-white mb-6">
                <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50 flex-row justify-between items-center flex-wrap gap-2">
                  <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    DANH SÁCH CẦN XỬ LÝ
                  </Text>
                  {canCreateReceipt && !isDemo && selectedIssueIds.size > 0 && (
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
                  {isDemo && (
                    <TouchableOpacity
                      onPress={() => navigation.navigate("Inventory")}
                      className="bg-black px-3 py-1.5 border border-black flex-row items-center"
                    >
                      <Ionicons name="cube-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                      <Text className="text-white text-xs font-bold uppercase">Đi đến kho hàng</Text>
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
                      Tất cả ({isDemo ? demoAllIssues.length : allIssues.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("out")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "out" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "out" ? "text-white" : "text-black"}`}>
                      Hết hàng ({isDemo ? demoOutOfStockCount : outOfStockCount})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("low")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "low" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "low" ? "text-white" : "text-black"}`}>
                      Sắp hết ({isDemo ? demoLowStockCount : lowStockCount})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setIssueFilter("missing_price")}
                    className={`px-3 py-1.5 border-[1.5px] border-black ${issueFilter === "missing_price" ? "bg-black" : "bg-white"}`}
                  >
                    <Text className={`text-xs font-bold uppercase ${issueFilter === "missing_price" ? "text-white" : "text-black"}`}>
                      Thiếu giá ({isDemo ? demoMissingPriceCount : missingPriceCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Detailed List */}
                <View className="p-4">
                  {isDemo ? (
                    displayedDemoIssues.length === 0 ? (
                      <View className="py-8 items-center justify-center px-4">
                        <Ionicons name="checkmark-circle-outline" size={36} color="#16a34a" />
                        <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: 'bold', marginTop: 6, textAlign: 'center' }}>
                          Chưa có sản phẩm cần xử lý trong dữ liệu trải nghiệm.
                        </Text>
                        <Text style={{ fontSize: 11, color: '#525252', marginTop: 4, textAlign: 'center' }}>
                          Tất cả sản phẩm mẫu hiện có trạng thái tồn kho và giá bán an toàn.
                        </Text>
                        <TouchableOpacity
                          onPress={() => navigation.navigate("Inventory")}
                          className="mt-4 bg-black px-4 py-2 border border-black flex-row items-center"
                        >
                          <Ionicons name="cube-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                          <Text className="text-white text-xs font-bold uppercase">ĐI ĐẾN KHO HÀNG</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
                        {displayedDemoIssues.map((item, idx) => {
                          const isOut = item.status === "Hết hàng";
                          const isMissingPrice = item.status === "Thiếu giá";
                          return (
                            <View
                              key={item.rawId || idx}
                              className="flex-row flex-wrap items-center justify-between py-3 border-b border-gray-200"
                              style={{ gap: 8 }}
                            >
                              <View className="flex-row items-center flex-1 min-w-[200px]">
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
                                    <Text className="text-xs text-gray-500">Giá bán: <Text className="text-black font-semibold">{item.price ? formatCurrency(item.price) : 'Chưa thiết lập'}</Text></Text>
                                  </View>
                                </View>
                              </View>

                              <View className="flex-row items-center" style={{ gap: 8 }}>
                                <TouchableOpacity
                                  onPress={() => {
                                    (navigation as any).navigate("Inventory", {
                                      tab: "products",
                                      targetProductId: item.rawId,
                                      targetBarcode: item.barcode,
                                    });
                                  }}
                                  className="border border-black px-3 py-1.5 bg-white"
                                  accessibilityLabel={`Xem chi tiết sản phẩm ${item.productName}`}
                                >
                                  <Text className="text-xs font-bold text-black uppercase">
                                    XEM
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )
                  ) : lowStockState.loading ? (
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
                          <TouchableOpacity
                            onPress={toggleSelectAll}
                            accessibilityRole="checkbox"
                            accessibilityLabel="Chọn tất cả mặt hàng cần xử lý"
                            className="flex-row items-center"
                          >
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
                                  <TouchableOpacity
                                    onPress={() => toggleSelectIssue(item.productId)}
                                    accessibilityRole="checkbox"
                                    accessibilityLabel={`Chọn mặt hàng ${item.productName}`}
                                    className="mr-3"
                                  >
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

              {/* DEMO-SPECIFIC SECTIONS: HOẠT ĐỘNG TRẢI NGHIỆM & VẬN HÀNH SHOWCASE */}
              {isDemo && (
                <>
                  {/* HOẠT ĐỘNG TRẢI NGHIỆM */}
                  <View className="border-[1.5px] border-black bg-white mb-6">
                    <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50 flex-row justify-between items-center flex-wrap gap-2">
                      <View>
                        <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                          HOẠT ĐỘNG TRẢI NGHIỆM
                        </Text>
                        <Text style={{ fontSize: 10, color: '#525252', marginTop: 2 }}>
                          Khám phá quy trình vận hành bán lẻ và quản lý kho toàn diện
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setGuideModalVisible(true)}
                        className="border border-black px-3 py-1 bg-white flex-row items-center"
                      >
                        <Ionicons name="information-circle-outline" size={14} color="#000" style={{ marginRight: 4 }} />
                        <Text className="text-black text-xs font-bold uppercase">Chi tiết hướng dẫn</Text>
                      </TouchableOpacity>
                    </View>

                    <View className="p-4 flex-col" style={{ gap: 10 }}>
                      {/* Step 1: Mở ca trải nghiệm */}
                      <View className="p-3 border border-gray-200 flex-row items-center justify-between flex-wrap gap-2">
                        <View className="flex-row items-center flex-1 min-w-[220px]">
                          <View className="w-8 h-8 rounded-full border border-black items-center justify-center mr-3 bg-gray-50">
                            <Text className="font-bold text-xs">1</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-sm text-black">Mở ca trải nghiệm</Text>
                            <Text className="text-xs text-gray-500">Khai báo số tiền đầu ca để kích hoạt quầy thu ngân.</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <View className={`px-2.5 py-1 border ${activeShift?.status === 'Open' ? 'bg-emerald-50 border-emerald-500' : (completedSteps['shift'] || completedSteps['openShift']) ? 'bg-blue-50 border-blue-500' : 'bg-gray-100 border-gray-300'}`}>
                            <Text className={`text-[10px] font-bold ${activeShift?.status === 'Open' ? 'text-emerald-700' : (completedSteps['shift'] || completedSteps['openShift']) ? 'text-blue-700' : 'text-gray-600'}`}>
                              {activeShift?.status === 'Open' ? 'ĐANG CÓ CA MỞ' : (completedSteps['shift'] || completedSteps['openShift']) ? 'ĐÃ THỰC HIỆN' : 'CHƯA THỰC HIỆN'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Statistics")}
                            className="bg-black px-3 py-1.5 border border-black"
                          >
                            <Text className="text-white text-xs font-bold uppercase">
                              {activeShift?.status === 'Open' ? 'Xem ca' : 'Mở ca'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 2: Tạo đơn bán hàng */}
                      <View className="p-3 border border-gray-200 flex-row items-center justify-between flex-wrap gap-2">
                        <View className="flex-row items-center flex-1 min-w-[220px]">
                          <View className="w-8 h-8 rounded-full border border-black items-center justify-center mr-3 bg-gray-50">
                            <Text className="font-bold text-xs">2</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-sm text-black">Tạo đơn bán hàng</Text>
                            <Text className="text-xs text-gray-500">Chọn mặt hàng, quét mã vạch và thanh toán thử nghiệm.</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <View className={`px-2.5 py-1 border ${(demoOrdersCount > 0 || completedSteps['pos']) ? 'bg-blue-50 border-blue-500' : 'bg-gray-100 border-gray-300'}`}>
                            <Text className={`text-[10px] font-bold ${(demoOrdersCount > 0 || completedSteps['pos']) ? 'text-blue-700' : 'text-gray-600'}`}>
                              {(demoOrdersCount > 0 || completedSteps['pos']) ? `ĐÃ THỰC HIỆN (${demoOrdersCount} ĐƠN)` : 'CHƯA THỰC HIỆN'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("POS")}
                            className="bg-black px-3 py-1.5 border border-black"
                          >
                            <Text className="text-white text-xs font-bold uppercase">Bán hàng</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 3: Theo dõi tồn kho */}
                      <View className="p-3 border border-gray-200 flex-row items-center justify-between flex-wrap gap-2">
                        <View className="flex-row items-center flex-1 min-w-[220px]">
                          <View className="w-8 h-8 rounded-full border border-black items-center justify-center mr-3 bg-gray-50">
                            <Text className="font-bold text-xs">3</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-sm text-black">Theo dõi tồn kho</Text>
                            <Text className="text-xs text-gray-500">Xem mức tồn, lập phiếu nhập kho hoặc kiểm kê hàng.</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <View className={`px-2.5 py-1 border ${(completedSteps['receipt'] || completedSteps['adjust'] || completedSteps['inventory']) ? 'bg-blue-50 border-blue-500' : 'bg-gray-100 border-gray-300'}`}>
                            <Text className={`text-[10px] font-bold ${(completedSteps['receipt'] || completedSteps['adjust'] || completedSteps['inventory']) ? 'text-blue-700' : 'text-gray-600'}`}>
                              {(completedSteps['receipt'] || completedSteps['adjust'] || completedSteps['inventory']) ? 'ĐÃ THỰC HIỆN' : 'CHƯA THỰC HIỆN'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Inventory")}
                            className="bg-black px-3 py-1.5 border border-black"
                          >
                            <Text className="text-white text-xs font-bold uppercase">Kho hàng</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 4: Xem hóa đơn đã tạo */}
                      <View className="p-3 border border-gray-200 flex-row items-center justify-between flex-wrap gap-2">
                        <View className="flex-row items-center flex-1 min-w-[220px]">
                          <View className="w-8 h-8 rounded-full border border-black items-center justify-center mr-3 bg-gray-50">
                            <Text className="font-bold text-xs">4</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-sm text-black">Xem hóa đơn đã tạo</Text>
                            <Text className="text-xs text-gray-500">Tra cứu chứng từ bán hàng và phiếu nhập trong phiên.</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <View className={`px-2.5 py-1 border ${(completedSteps['invoice'] || demoOrdersCount > 0) ? 'bg-blue-50 border-blue-500' : 'bg-gray-100 border-gray-300'}`}>
                            <Text className={`text-[10px] font-bold ${(completedSteps['invoice'] || demoOrdersCount > 0) ? 'text-blue-700' : 'text-gray-600'}`}>
                              {(completedSteps['invoice'] || demoOrdersCount > 0) ? 'ĐÃ THỰC HIỆN' : 'CHƯA THỰC HIỆN'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Invoice")}
                            className="bg-black px-3 py-1.5 border border-black"
                          >
                            <Text className="text-white text-xs font-bold uppercase">Hóa đơn</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Step 5: Kết ca và kiểm tra báo cáo */}
                      <View className="p-3 border border-gray-200 flex-row items-center justify-between flex-wrap gap-2">
                        <View className="flex-row items-center flex-1 min-w-[220px]">
                          <View className="w-8 h-8 rounded-full border border-black items-center justify-center mr-3 bg-gray-50">
                            <Text className="font-bold text-xs">5</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-sm text-black">Kết ca và kiểm tra báo cáo</Text>
                            <Text className="text-xs text-gray-500">Kiểm tiền thực tế, đối soát chênh lệch và in phiếu kết ca.</Text>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <View className={`px-2.5 py-1 border ${completedSteps['closeShift'] ? 'bg-emerald-50 border-emerald-500' : activeShift?.status === 'Open' ? 'bg-amber-50 border-amber-500' : 'bg-gray-100 border-gray-300'}`}>
                            <Text className={`text-[10px] font-bold ${completedSteps['closeShift'] ? 'text-emerald-700' : activeShift?.status === 'Open' ? 'text-amber-700' : 'text-gray-600'}`}>
                              {completedSteps['closeShift'] ? 'ĐÃ THỰC HIỆN' : activeShift?.status === 'Open' ? 'ĐANG CÓ CA MỞ' : 'CHƯA THỰC HIỆN'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Statistics")}
                            className="bg-black px-3 py-1.5 border border-black"
                          >
                            <Text className="text-white text-xs font-bold uppercase">Báo cáo ca</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* DEMO OPERATIONAL SHOWCASE */}
                  <View className={isDesktop ? "flex-row" : "flex-col"} style={{ gap: 16, marginBottom: 24 }}>
                    {/* TỔNG QUAN CA TRẢI NGHIỆM */}
                    <View className={`border-[1.5px] border-black bg-white ${isDesktop ? 'flex-[6]' : 'w-full'}`}>
                      <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50 flex-row justify-between items-center">
                        <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                          PHIÊN THU NGÂN TRẢI NGHIỆM
                        </Text>
                        <View className={`px-2 py-0.5 border ${activeShift?.status === 'Open' ? 'bg-emerald-100 border-emerald-500' : 'bg-gray-100 border-gray-400'}`}>
                          <Text className={`text-[10px] font-bold ${activeShift?.status === 'Open' ? 'text-emerald-800' : 'text-gray-700'}`}>
                            {activeShift?.status === 'Open' ? 'CA ĐANG MỞ' : 'CHƯA MỞ CA'}
                          </Text>
                        </View>
                      </View>
                      <View className="p-4">
                        {activeShift?.status === 'Open' ? (
                          <>
                            <View className="flex-row justify-between py-2 border-b border-gray-100">
                              <Text className="text-xs text-gray-500">Mã ca:</Text>
                              <Text className="text-xs font-mono font-bold text-black">{activeShift.shiftCode}</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-gray-100">
                              <Text className="text-xs text-gray-500">Giờ mở ca:</Text>
                              <Text className="text-xs font-bold text-black">{formatVietnamDateTime(activeShift.startedAt)}</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-gray-100">
                              <Text className="text-xs text-gray-500">Tiền đầu ca:</Text>
                              <Text className="text-xs font-bold text-black">{formatCurrency(activeShift.startingCash)}</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-gray-100">
                              <Text className="text-xs text-gray-500">Doanh số ca:</Text>
                              <Text className="text-xs font-bold text-black">{formatCurrency(activeShift.totalRevenue)} ({activeShift.orderCount} đơn)</Text>
                            </View>
                            <View className="flex-row justify-between py-2 border-b border-gray-100">
                              <Text className="text-xs text-gray-500">Tiền mặt dự kiến:</Text>
                              <Text className="text-xs font-black text-black">{formatCurrency(activeShift.startingCash + activeShift.cashRevenue)}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => navigation.navigate("Statistics")}
                              className="mt-3 bg-black py-2 items-center border border-black"
                            >
                              <Text className="text-white text-xs font-bold uppercase">Vào quản lý ca & kết ca</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <View className="py-4 items-center">
                            <Ionicons name="storefront-outline" size={36} color="#525252" />
                            <Text className="font-bold text-xs text-black mt-2 text-center">
                              Chưa có ca làm việc nào đang mở
                            </Text>
                            <Text className="text-xs text-gray-500 mt-1 text-center">
                              Hãy mở ca để liên kết các giao dịch bán hàng và kiểm đếm tiền mặt cuối ca.
                            </Text>
                            <TouchableOpacity
                              onPress={() => navigation.navigate("Statistics")}
                              className="mt-3 bg-black px-4 py-2 border border-black"
                            >
                              <Text className="text-white text-xs font-bold uppercase">Mở ca làm việc</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* THÔNG TIN PHIÊN SANDBOX */}
                    <View className={`border-[1.5px] border-black bg-white ${isDesktop ? 'flex-[4]' : 'w-full'}`}>
                      <View className="px-4 py-3 border-b-[1.5px] border-black bg-gray-50">
                        <Text style={{ fontSize: 12, letterSpacing: 1.5, color: '#000', textTransform: 'uppercase', fontWeight: 'bold' }}>
                          DỮ LIỆU & BẢO MẬT
                        </Text>
                      </View>
                      <View className="p-4">
                        <View className="flex-row items-center mb-3">
                          <Ionicons name="shield-checkmark-outline" size={18} color="#15803d" />
                          <Text className="text-xs font-bold text-green-700 ml-1.5">Cách ly dữ liệu an toàn</Text>
                        </View>
                        <Text className="text-xs text-gray-600 mb-3 leading-relaxed">
                          Toàn bộ đơn hàng, phiếu nhập và ca làm việc được lưu trữ tại thiết bị theo phiên sandbox, không ghi đè vào cơ sở dữ liệu thật.
                        </Text>

                        <View className="bg-gray-50 p-2.5 border border-gray-200 mb-3">
                          <Text className="text-[10px] text-gray-500 uppercase font-bold">Mã phiên Sandbox:</Text>
                          <Text className="text-xs font-mono font-bold text-black" numberOfLines={1}>
                            {demoSessionId || 'Đang khởi tạo...'}
                          </Text>
                          <Text className="text-[10px] text-gray-500 uppercase font-bold mt-2">Chứng từ ngoại tuyến:</Text>
                          <Text className="text-xs font-bold text-black">
                            {pendingSyncCount} chứng từ đã tạo
                          </Text>
                        </View>

                        <View className="flex-row gap-2">
                          <TouchableOpacity
                            onPress={() => navigation.navigate("POS")}
                            className="flex-1 bg-black py-2 items-center border border-black"
                          >
                            <Text className="text-white text-[11px] font-bold uppercase">Bán hàng</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Inventory")}
                            className="flex-1 bg-white py-2 items-center border border-black"
                          >
                            <Text className="text-black text-[11px] font-bold uppercase">Kho hàng</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </>
              )}

              {/* ADMIN & MANAGER FINANCIAL SECTIONS: CHART, WAREHOUSE OVERVIEW, TOP PRODUCTS */}
              {!isDemo && (
                <>
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
                          <DashboardChart
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

            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
