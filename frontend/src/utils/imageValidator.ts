import { Platform, Image as RNImage } from 'react-native';
import { logger } from './logger';

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Validates picked image before any state change, upload, or opening cropper.
 * Checks MIME type, extension, size, magic bytes (content signature), and decode capability.
 */
export async function validatePickedImage(
  uri: string,
  metadata?: {
    mimeType?: string | null;
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    fileName?: string | null;
  }
): Promise<ImageValidationResult> {
  if (!uri || typeof uri !== 'string') {
    return {
      isValid: false,
      error: 'Không tìm thấy file ảnh được chọn.',
    };
  }

  // 1. Validate File Name & Extension if available
  const fileName = metadata?.fileName || uri.split('?')[0].split('/').pop() || '';
  if (fileName && fileName.includes('.')) {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    const disallowedExtensions = ['.pdf', '.zip', '.rar', '.7z', '.exe', '.bat', '.cmd', '.sh', '.svg', '.gif', '.heic', '.heif', '.bmp', '.tiff'];
    if (disallowedExtensions.includes(ext) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        isValid: false,
        error: 'Định dạng ảnh chưa được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.',
      };
    }
  }

  // 2. Validate MIME Type if provided by picker
  if (metadata?.mimeType) {
    const mime = metadata.mimeType.toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      return {
        isValid: false,
        error: 'Định dạng ảnh chưa được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.',
      };
    }
  }

  // 3. Validate File Size if provided
  if (metadata?.fileSize !== undefined && metadata?.fileSize !== null) {
    if (metadata.fileSize <= 0) {
      return {
        isValid: false,
        error: 'File ảnh rỗng. Vui lòng chọn file khác.',
      };
    }
    if (metadata.fileSize > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `Ảnh vượt quá dung lượng cho phép (tối đa ${MAX_FILE_SIZE / (1024 * 1024)}MB).`,
      };
    }
  }

  // 4. Magic Bytes Inspection & Real Size Check
  try {
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();

      if (blob.size === 0) {
        return {
          isValid: false,
          error: 'File ảnh rỗng. Vui lòng chọn file khác.',
        };
      }

      if (blob.size > MAX_FILE_SIZE) {
        return {
          isValid: false,
          error: 'Ảnh vượt quá dung lượng cho phép (tối đa 5MB).',
        };
      }

      // Check header bytes (first 16 bytes)
      const buffer = await blob.slice(0, 16).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (bytes.length < 4) {
        return {
          isValid: false,
          error: 'Không thể đọc file ảnh. File bị hỏng hoặc rỗng.',
        };
      }

      const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                     bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

      if (!isJpeg && !isPng && !isWebp) {
        return {
          isValid: false,
          error: 'Định dạng ảnh chưa được hỗ trợ. Vui lòng chọn ảnh JPG, PNG hoặc WEBP.',
        };
      }
    }
  } catch (err: any) {
    logger.warn('ImageValidator', 'Lỗi khi đọc header file ảnh:', err?.message);
    // Proceed to decode check if fetch fails (e.g. some native blob schemes)
  }

  // 5. Image Decode & Dimension Capability Check
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      if (Platform.OS === 'web') {
        const img = new (window as any).Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        };
        img.onerror = () => {
          reject(new Error('Không thể giải mã file ảnh'));
        };
        img.src = uri;
      } else {
        RNImage.getSize(
          uri,
          (w, h) => resolve({ width: w, height: h }),
          (err) => reject(err)
        );
      }
    });

    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      return {
        isValid: false,
        error: 'Kích thước ảnh không hợp lệ.',
      };
    }

    if (dimensions.width > 10000 || dimensions.height > 10000) {
      return {
        isValid: false,
        error: 'Kích thước ảnh quá lớn (tối đa 10.000 pixel mỗi chiều).',
      };
    }

    return {
      isValid: true,
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (decodeErr) {
    return {
      isValid: false,
      error: 'Không thể đọc file ảnh. File có thể bị hỏng hoặc không đúng định dạng ảnh.',
    };
  }
}
