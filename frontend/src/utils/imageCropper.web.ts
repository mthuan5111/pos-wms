export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface CropOptions {
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
  fillWhiteBackground?: boolean;
}

export interface CropResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Web Canvas 2D implementation of free-form and aspect-ratio image cropping.
 * Runs 100% in browser canvas without any native package dependency.
 */
export async function cropImage(
  imageUri: string,
  cropRect: CropRect,
  options?: CropOptions
): Promise<CropResult> {
  const format = options?.format || 'jpeg';
  const quality = options?.quality !== undefined ? options?.quality : 0.92;
  const fillWhite = options?.fillWhiteBackground !== undefined ? options?.fillWhiteBackground : (format === 'jpeg');

  const originX = Math.max(0, Math.round(cropRect.originX));
  const originY = Math.max(0, Math.round(cropRect.originY));
  const width = Math.max(1, Math.round(cropRect.width));
  const height = Math.max(1, Math.round(cropRect.height));

  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        // Clamp to actual image bounds
        const safeX = Math.min(originX, naturalWidth - 1);
        const safeY = Math.min(originY, naturalHeight - 1);
        const safeW = Math.min(width, naturalWidth - safeX);
        const safeH = Math.min(height, naturalHeight - safeY);

        const canvas = document.createElement('canvas');
        canvas.width = safeW;
        canvas.height = safeH;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Không thể khởi tạo Canvas 2D context');
        }

        if (fillWhite) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, safeW, safeH);
        } else {
          ctx.clearRect(0, 0, safeW, safeH);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(
          img,
          safeX,
          safeY,
          safeW,
          safeH,
          0,
          0,
          safeW,
          safeH
        );

        const mimeType = format === 'png' ? 'image/png' : (format === 'webp' ? 'image/webp' : 'image/jpeg');
        const croppedDataUrl = canvas.toDataURL(mimeType, quality);

        resolve({
          uri: croppedDataUrl,
          width: safeW,
          height: safeH,
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Lỗi khi tải ảnh để cắt'));
    };

    img.src = imageUri;
  });
}
