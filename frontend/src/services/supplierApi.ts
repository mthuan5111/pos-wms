import apiClient from "./apiClient";

export const getSuppliers = async () => {
  const response = await apiClient.get("/Suppliers");
  return response.data;
};

export const createSupplier = async (data: any) => {
  const response = await apiClient.post("/Suppliers", data);
  return response.data;
};

export const updateSupplier = async (id: number, data: any) => {
  const response = await apiClient.put(`/Suppliers/${id}`, data);
  return response.data;
};

export const deleteSupplier = async (id: number) => {
  const response = await apiClient.delete(`/Suppliers/${id}`);
  return response.data;
};
