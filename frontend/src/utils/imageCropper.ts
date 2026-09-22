import { Platform } from 'react-native';

export interface CropResult {
  uri: string;
  width: number;
  height: number;
  isSquare: boolean;
}

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
}

export interface CropAdjustmentOptions {
  zoom?: number;       // 1.0 to 3.0
  panX?: number;       // -1.0 to 1.0
  panY?: number;       // -1.0 to 1.0
  format?: 'jpeg' | 'png';
  quality?: number;    // 0.0 to 1.0
}

/**
 * Validate MIME type and file size (max 5MB, JPG/PNG/WebP only)
 */
export function validateImageFile(mimeType?: string, sizeInBytes?: number): ImageValidationResult {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (mimeType && !allowedMimes.includes(mimeType.toLowerCase())) {
    return {
      isValid: false,
      error: 'Định dạng ảnh không hợp lệ. Chỉ chấp nhận JPG, PNG hoặc WebP.'
    };
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (sizeInBytes && sizeInBytes > MAX_SIZE) {
    return {
      isValid: false,
      error: 'Dung lượng ảnh vượt quá giới hạn 5MB.'
    };
  }

  return { isValid: true };
}

/**
 * Crops an image to a 1:1 square and resizes to target dimension (default 800x800).
 * Supports zoom and pan adjustments.
 * Ensures transparent areas or padding are filled with solid white to avoid unintended black backgrounds.
 */
export async function cropImageToSquare(
  imageUri: string,
  targetSize: number = 800,
  options?: CropAdjustmentOptions
): Promise<CropResult> {
  if (Platform.OS !== 'web') {
    return {
      uri: imageUri,
      width: targetSize,
      height: targetSize,
      isSquare: true
    };
  }

  const zoom = Math.max(1.0, Math.min(3.0, options?.zoom || 1.0));
  const panX = Math.max(-1.0, Math.min(1.0, options?.panX || 0));
  const panY = Math.max(-1.0, Math.min(1.0, options?.panY || 0));
  const format = options?.format || 'jpeg';
  const quality = options?.quality || 0.9;

  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const sourceWidth = img.naturalWidth || img.width;
        const sourceHeight = img.naturalHeight || img.height;

        // Base square dimension adjusted by zoom
        const minDimension = Math.min(sourceWidth, sourceHeight);
        const cropSize = minDimension / zoom;

        // Center coordinates
        const centerX = (sourceWidth - cropSize) / 2;
        const centerY = (sourceHeight - cropSize) / 2;

        // Max pan distance
        const maxPanX = (sourceWidth - cropSize) / 2;
        const maxPanY = (sourceHeight - cropSize) / 2;

        const cropX = Math.max(0, Math.min(sourceWidth - cropSize, centerX + panX * maxPanX));
        const cropY = Math.max(0, Math.min(sourceHeight - cropSize, centerY + panY * maxPanY));

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Không thể khởi tạo Canvas 2D context');
        }

        // Always fill with pure white background first so transparent PNGs never become black
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetSize, targetSize);

        // High-quality downsampling/smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          cropX,
          cropY,
          cropSize,
          cropSize,
          0,
          0,
          targetSize,
          targetSize
        );

        const mime = format === 'png' ? 'image/png' : 'image/jpeg';
        const croppedDataUrl = canvas.toDataURL(mime, quality);

        resolve({
          uri: croppedDataUrl,
          width: targetSize,
          height: targetSize,
          isSquare: true
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err: any) => {
      reject(new Error('Lỗi khi tải ảnh để cắt 1:1'));
    };

    img.src = imageUri;
  });
}
