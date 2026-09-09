import apiClient from "./apiClient";

export interface OrderSyncRequestDto {
  UserId: number;
  CustomerId: number;
  TotalAmount: number;
  OrderDate: string;
  Status: number;
  OfflineReferenceId: string;
  Details: Array<{
    ProductId: number;
    Quantity: number;
    UnitPrice: number;
  }>;
}

export const syncOfflineOrder = async (orderData: OrderSyncRequestDto) => {
  const response = await apiClient.post("/Orders/sync", orderData);
  return response.data;
};
