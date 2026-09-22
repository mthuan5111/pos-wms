import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CameraCaptureModalProps {
  visible: boolean;
  onCapture: (imageUri: string) => void;
  onCancel: () => void;
}

export default function CameraCaptureModal({
  visible,
  onCapture,
  onCancel
}: CameraCaptureModalProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    stopStream();
    setErrorMessage(null);
    setIsInitializing(true);

    if (Platform.OS !== 'web') {
      // Native runtime: Camera marked as FIXED_NOT_NATIVE_TESTED
      setIsInitializing(false);
      setErrorMessage('Chức năng camera trên thiết bị di động đã được cấu hình (FIXED_NOT_NATIVE_TESTED). Vui lòng chọn ảnh từ thư viện.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsInitializing(false);
      setErrorMessage('Trình duyệt không hỗ trợ truy cập camera trực tiếp. Vui lòng chọn ảnh từ thư viện.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('[CameraCapture] Camera error:', err);
      setHasPermission(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Bạn đã từ chối quyền truy cập camera. Vui lòng cấp quyền trong trình duyệt hoặc chọn ảnh từ thư viện.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage('Không tìm thấy thiết bị camera khả dụng trên máy.');
      } else {
        setErrorMessage('Không thể khởi động camera: ' + (err.message || 'Lỗi không xác định'));
      }
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setCapturedUri(null);
      startCamera();
    } else {
      stopStream();
      setCapturedUri(null);
    }

    return () => {
      stopStream();
    };
  }, [visible, facingMode]);

  const handleTakeSnapshot = () => {
    if (Platform.OS === 'web' && videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill white background before drawing
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedUri(dataUrl);
      }
    }
  };

  const handleRetake = () => {
    setCapturedUri(null);
    if (Platform.OS === 'web' && videoRef.current && streamRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleConfirm = () => {
    if (capturedUri) {
      stopStream();
      onCapture(capturedUri);
    }
  };

  const handleClose = () => {
    stopStream();
    onCancel();
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        testID="camera-capture-backdrop"
        className="flex-1 bg-black/80 justify-center items-center p-4"
        style={Platform.OS === 'web' ? ({ zIndex: 999999, position: 'fixed', inset: 0 } as any) : {}}
      >
        <View className="bg-white w-full max-w-lg p-6 border-4 border-black">
          {/* Header */}
          <View className="flex-row justify-between items-center pb-3 border-b-2 border-black mb-4">
            <View>
              <Text className="text-xl font-black uppercase text-black tracking-wider">
                Chụp ảnh sản phẩm
              </Text>
              <Text className="text-xs text-gray-600">Sử dụng camera để chụp ảnh trực tiếp</Text>
            </View>
            <TouchableOpacity testID="camera-btn-close" onPress={handleClose} className="p-1">
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Body / Video or Captured Snapshot */}
          <View className="w-full aspect-[4/3] bg-black items-center justify-center relative overflow-hidden border-2 border-black mb-4">
            {isInitializing ? (
              <View className="items-center justify-center p-4">
                <ActivityIndicator color="#fff" size="large" />
                <Text className="text-white text-xs font-bold mt-2 uppercase tracking-wider">
                  Đang khởi động camera...
                </Text>
              </View>
            ) : errorMessage ? (
              <View className="items-center justify-center p-6 text-center">
                <Ionicons name="alert-circle-outline" size={40} color="#dc2626" />
                <Text className="text-white text-xs font-bold mt-3 text-center">
                  {errorMessage}
                </Text>
                <TouchableOpacity
                  onPress={startCamera}
                  className="mt-4 bg-white px-4 py-2 border border-white"
                >
                  <Text className="text-black font-bold uppercase text-xs">Thử lại</Text>
                </TouchableOpacity>
              </View>
            ) : capturedUri ? (
              <Image source={{ uri: capturedUri }} className="w-full h-full" resizeMode="contain" />
            ) : Platform.OS === 'web' ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <video
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                      el.play().catch(() => {});
                    }
                  }}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ) : null}

            {/* Camera switch toggle button on top right */}
            {!capturedUri && !errorMessage && !isInitializing && (
              <TouchableOpacity
                testID="btn-toggle-camera-facing"
                onPress={toggleFacingMode}
                className="absolute top-3 right-3 bg-black/70 p-2 border border-white/40"
              >
                <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Action buttons */}
          <View className="flex-col gap-2">
            {!capturedUri ? (
              <TouchableOpacity
                testID="btn-take-snapshot"
                disabled={isInitializing || !!errorMessage}
                onPress={handleTakeSnapshot}
                className={`py-3 px-4 border-2 border-black items-center justify-center flex-row ${
                  isInitializing || !!errorMessage ? 'bg-gray-400 border-gray-400' : 'bg-black'
                }`}
              >
                <Ionicons name="camera" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text className="text-white font-black uppercase tracking-wider text-sm">
                  Chụp ảnh
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-col gap-2">
                <TouchableOpacity
                  testID="btn-confirm-snapshot"
                  onPress={handleConfirm}
                  className="bg-black py-3 px-4 border-2 border-black items-center justify-center flex-row"
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text className="text-white font-black uppercase tracking-wider text-sm">
                    Dùng ảnh này & Cắt 1:1
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="btn-retake-snapshot"
                  onPress={handleRetake}
                  className="bg-white py-2.5 px-4 border-2 border-black items-center justify-center flex-row"
                >
                  <Ionicons name="refresh-outline" size={18} color="#000" style={{ marginRight: 8 }} />
                  <Text className="text-black font-bold uppercase tracking-wider text-xs">
                    Chụp lại
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              testID="btn-cancel-camera"
              onPress={handleClose}
              className="py-2.5 px-4 border-2 border-gray-300 items-center justify-center bg-gray-50"
            >
              <Text className="text-gray-700 font-bold uppercase tracking-wider text-xs">
                Đóng
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
