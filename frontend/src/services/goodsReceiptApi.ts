import apiClient from "./apiClient";

export interface GoodsReceiptDetailDto {
  ProductId: number;
  Quantity: number;
  CostPrice: number;
}

export interface GoodsReceiptSyncRequestDto {
  OfflineReferenceId: string;
  SupplierId: number;
  UserId: number;
  Remarks: string;
  Details: GoodsReceiptDetailDto[];
}

export const syncOfflineGoodsReceipt = async (data: GoodsReceiptSyncRequestDto) => {
  const response = await apiClient.post("/GoodsReceipts", data);
  return response.data;
};

export const getServerReceipts = async () => {
  const response = await apiClient.get("/GoodsReceipts");
  return response.data;
};
