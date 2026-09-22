import apiClient from "./apiClient";

export interface OrderSyncRequestDto {
  UserId: number;
  CustomerId: number;
  TotalAmount: number;
  PaymentMethod?: string;
  OrderDate: string;
  Status: number;
  OfflineReferenceId: string;
  ShiftId?: number | null;
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

export const getServerOrders = async () => {
  const response = await apiClient.get("/Orders");
  return response.data;
};
