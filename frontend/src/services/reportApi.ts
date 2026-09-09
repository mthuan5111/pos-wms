import apiClient from "./apiClient";

export interface DashboardSummaryDto {
  netRevenue: number;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  hasGrossProfitData: boolean;
  missingCostSoldProductCount: number;

  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;

  totalInventoryValue: number | null;
  hasInventoryValueData: boolean;
  missingCostInventoryProductCount: number;
  totalSKUs: number;
  outOfStockSKUs: number;
  lowStockSKUs: number;

  pendingOrders: number;

  supportsDiscounts: boolean;
  supportsReturns: boolean;
}

export interface TopProductDto {
  productId: number;
  productName: string;
  barcode: string;
  quantitySold: number;
  revenue: number;
  stockQuantity: number;
  stockStatus: string | null;
}

export interface RevenueComparisonPointDto {
  label: string;
  currentPeriodTimestamp: string | null;
  previousPeriodTimestamp: string | null;
  currentPeriodRevenue: number;
  previousPeriodRevenue: number;
}

export const getDashboardSummary = async (startDate?: string, endDate?: string) => {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  
  const response = await apiClient.get(`/Reports/summary?${params.toString()}`);
  return response.data; // Usually wrapped in ApiResponse
};

export const getTopProducts = async (limit: number = 5, startDate?: string, endDate?: string) => {
  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  const response = await apiClient.get(`/Reports/top-products?${params.toString()}`);
  return response.data;
};

export const getRevenueChartData = async (startDate: string, endDate: string) => {
  const params = new URLSearchParams();
  params.append("startDate", startDate);
  params.append("endDate", endDate);

  const response = await apiClient.get(`/Reports/revenue-chart?${params.toString()}`);
  return response.data;
};

export const getRevenueChartComparison = async (currentStart: string, currentEnd: string, previousStart: string, previousEnd: string) => {
  const params = new URLSearchParams();
  params.append("currentStart", currentStart);
  params.append("currentEnd", currentEnd);
  params.append("previousStart", previousStart);
  params.append("previousEnd", previousEnd);

  const response = await apiClient.get(`/Reports/revenue-chart-comparison?${params.toString()}`);
  return response.data;
};

export const getPurchaseSummary = async (startDate?: string, endDate?: string) => {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  
  const response = await apiClient.get(`/Reports/purchase-summary?${params.toString()}`);
  return response.data;
};

export const getLowStockProducts = async (threshold: number = 10) => {
  const response = await apiClient.get(`/Reports/low-stock?threshold=${threshold}`);
  return response.data;
};
