import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
export const downloadAndSaveImageAsync = async (
  imageUrl: string,
  productId: string,
): Promise<string | null> => {
  try {
    if (!imageUrl) return null;

    if (Platform.OS === "web") {
      console.log(
        `[Web Mode] Bỏ qua tải ảnh offline cho &{productId}, dùng trực tiếp URL online`,
      );
      return null;
    }

    const fileName = `${productId}.jpg`;

    const directoryUri = `${FileSystem.documentDirectory}products/`;
    const localFileUri = `${directoryUri}${fileName}`;

    const dirInfo = await FileSystem.getInfoAsync(directoryUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(directoryUri, {
        intermediates: true,
      });
    }

    const fileInfo = await FileSystem.getInfoAsync(localFileUri);
    if (fileInfo.exists) {
      console.log(`[Cache] Ảnh ${productId} đã có sẵn ở Local`);
      return localFileUri;
    }

    console.log(`[Download] Đang tải ảnh cho ${productId}...`);
    const downloadResult = await FileSystem.downloadAsync(
      imageUrl,
      localFileUri,
    );

    return downloadResult.uri;
  } catch (error) {
    console.error(`Lỗi tải ảnh cho sản phẩm ${productId}:`, error);
    return null;
  }
};
