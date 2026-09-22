import apiClient from "./apiClient";

export interface GoodsReceiptDetailDto {
  productId?: number;
  ProductId?: number;
  quantity?: number;
  Quantity?: number;
  costPrice?: number;
  CostPrice?: number;
}

export interface GoodsReceiptSyncRequestDto {
  offlineReferenceId?: string;
  OfflineReferenceId?: string;
  supplierId?: number;
  SupplierId?: number;
  userId?: number;
  UserId?: number;
  remarks?: string;
  Remarks?: string;
  details?: GoodsReceiptDetailDto[];
  Details?: GoodsReceiptDetailDto[];
}

export const syncOfflineGoodsReceipt = async (data: GoodsReceiptSyncRequestDto) => {
  const response = await apiClient.post("/GoodsReceipts/sync", data);
  return response.data;
};

export const createGoodsReceipt = async (data: any) => {
  const response = await apiClient.post("/GoodsReceipts", data);
  return response.data;
};

export const getServerReceipts = async () => {
  const response = await apiClient.get("/GoodsReceipts");
  return response.data;
};

export const getServerReceiptById = async (id: number) => {
  const response = await apiClient.get(`/GoodsReceipts/${id}`);
  return response.data;
};
