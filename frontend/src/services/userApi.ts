import apiClient from "./apiClient";

export const getUsers = async () => {
  const response = await apiClient.get("/Users");
  return response.data;
};

export const getUserRoles = async () => {
  return ["Admin", "Manager", "Cashier", "WarehouseStaff"];
};

export const createUser = async (data: any) => {
  const response = await apiClient.post("/Users", data);
  return response.data;
};

export const updateUser = async (id: number, data: { name: string; role: string; phone?: string }) => {
  const response = await apiClient.put(`/Users/${id}`, data);
  return response.data;
};

export const resetUserPassword = async (id: number, newPassword: string) => {
  const response = await apiClient.put(`/Users/${id}/reset-password`, { newPassword });
  return response.data;
};

export const changeUserPassword = async (id: number, currentPassword: string, newPassword: string) => {
  const response = await apiClient.put(`/Users/${id}/change-password`, { currentPassword, newPassword });
  return response.data;
};

export const toggleUserStatus = async (id: number) => {
  const response = await apiClient.put(`/Users/${id}/toggle-status`);
  return response.data;
};

export const deleteUser = async (id: number) => {
  const response = await apiClient.delete(`/Users/${id}`);
  return response.data;
};
