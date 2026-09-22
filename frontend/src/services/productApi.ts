import apiClient from "./apiClient";

export const uploadProductImage = async (fileUri: string, fileName: string, mimeType: string = 'image/jpeg') => {
  const formData = new FormData();

  formData.append('file', {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await apiClient.post("/Products/upload-image", formData);

  return response.data;
};

export interface StockAdjustmentPayload {
  OfflineReferenceId: string;
  ProductId: number;
  Delta: number;
  Reason?: string;
  UserId?: number;
  CreatedAt?: string;
}

export const syncStockAdjustment = async (data: StockAdjustmentPayload) => {
  const response = await apiClient.post("/Inventories/adjust", data);
  return response.data;
};
