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
