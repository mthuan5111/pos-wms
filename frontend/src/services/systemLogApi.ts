import apiClient from "./apiClient";

export const getAuditLogs = async (page: number = 1, pageSize: number = 50, action?: string, signal?: AbortSignal) => {
  let url = `/AuditLogs?page=${page}&pageSize=${pageSize}`;
  if (action) {
      url += `&action=${encodeURIComponent(action)}`;
  }
  const response = await apiClient.get(url, { signal });
  return response.data;
};
