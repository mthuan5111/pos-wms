import apiClient from "./apiClient";

export interface SupplierPayload {
  name: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
}

export interface SupplierResponse {
  id?: number;
  Id?: number;
  name?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
}

export { parseEntityId } from "../utils/errorParser";

export const getSuppliers = async () => {
  const response = await apiClient.get("/Suppliers");
  return response.data;
};

export const createSupplier = async (data: SupplierPayload) => {
  const response = await apiClient.post("/Suppliers", data);
  return response.data;
};

export const updateSupplier = async (id: number, data: SupplierPayload) => {
  const response = await apiClient.put(`/Suppliers/${id}`, data);
  return response.data;
};

export const deleteSupplier = async (id: number) => {
  const response = await apiClient.delete(`/Suppliers/${id}`);
  return response.data;
};
