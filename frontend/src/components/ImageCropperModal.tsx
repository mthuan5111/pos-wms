import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cropImageToSquare } from '../utils/imageCropper';

interface ImageCropperModalProps {
  visible: boolean;
  imageUri: string;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
  onReplace: () => void;
}

export default function ImageCropperModal({
  visible,
  imageUri,
  onConfirm,
  onCancel,
  onReplace,
}: ImageCropperModalProps) {
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0); // Normalized -1.0 to 1.0
  const [panY, setPanY] = useState(0); // Normalized -1.0 to 1.0
  const [isProcessing, setIsProcessing] = useState(false);

  // Dragging state for Web/Touch
  const isDraggingRef = useRef(false);
  const startCoordRef = useRef({ x: 0, y: 0 });
  const startPanRef = useRef({ panX: 0, panY: 0 });

  useEffect(() => {
    if (visible) {
      setZoom(1.0);
      setPanX(0);
      setPanY(0);
    }
  }, [visible, imageUri]);

  const handleReset = () => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  };

  const handleZoomChange = (delta: number) => {
    setZoom((prev) => Math.max(1.0, Math.min(3.0, Number((prev + delta).toFixed(2)))));
  };

  const handleCrop = async () => {
    if (!imageUri) return;
    setIsProcessing(true);
    try {
      const cropped = await cropImageToSquare(imageUri, 800, {
        zoom,
        panX,
        panY,
        format: 'jpeg',
        quality: 0.9
      });
      onConfirm(cropped.uri);
    } catch (err: any) {
      console.warn('Lỗi cắt ảnh:', err);
      onConfirm(imageUri);
    } finally {
      setIsProcessing(false);
    }
  };

  // Mouse / pointer pan handlers for Web
  const onMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startCoordRef.current = { x: e.clientX, y: e.clientY };
    startPanRef.current = { panX, panY };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - startCoordRef.current.x;
    const dy = e.clientY - startCoordRef.current.y;

    // Viewport is 260px wide, drag sensitivity normalized
    const deltaPanX = dx / 130;
    const deltaPanY = dy / 130;

    setPanX(Math.max(-1.0, Math.min(1.0, startPanRef.current.panX - deltaPanX)));
    setPanY(Math.max(-1.0, Math.min(1.0, startPanRef.current.panY - deltaPanY)));
  };

  const onMouseUp = () => {
    isDraggingRef.current = false;
  };

  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        testID="image-cropper-backdrop"
        className="flex-1 bg-black/80 justify-center items-center p-4"
        style={Platform.OS === 'web' ? ({ zIndex: 999999, position: 'fixed', inset: 0 } as any) : {}}
      >
        <View className="bg-white w-full max-w-md p-6 border-4 border-black">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-3 pb-2 border-b-2 border-black">
            <View>
              <Text className="text-lg font-black uppercase text-black tracking-wider">
                Cắt ảnh vuông 1:1
              </Text>
              <Text className="text-xs text-gray-600">Kéo và phóng to để chọn vùng ảnh sản phẩm</Text>
            </View>
            <TouchableOpacity testID="crop-modal-close" onPress={onCancel} className="p-1">
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* 1:1 Interactive Viewport */}
          <View className="w-full items-center my-3">
            <div
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{
                width: 260,
                height: 260,
                border: '4px solid #000',
                backgroundColor: '#FFFFFF',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                userSelect: 'none'
              }}
            >
              <img
                src={imageUri}
                alt="Crop preview"
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${zoom}) translate(${-panX * 25}%, ${-panY * 25}%)`,
                  transition: isDraggingRef.current ? 'none' : 'transform 0.08s ease-out',
                  pointerEvents: 'none'
                }}
              />
              {/* 1:1 Grid Guidelines */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: '1px solid rgba(255,255,255,0.6)',
                  pointerEvents: 'none',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gridTemplateRows: '1fr 1fr 1fr'
                }}
              >
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
              </div>
              <View className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5">
                <Text className="text-[10px] text-white font-bold tracking-widest">
                  1:1 • 800x800
                </Text>
              </View>
            </div>
          </View>

          {/* Zoom and Reset Controls */}
          <View className="border-2 border-black p-3 mb-4 bg-gray-50 flex-col gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-bold uppercase text-black">Thu phóng ({zoom.toFixed(1)}x)</Text>
              <TouchableOpacity
                testID="btn-reset-crop"
                onPress={handleReset}
                className="px-2 py-1 bg-white border border-black flex-row items-center"
              >
                <Ionicons name="refresh-outline" size={14} color="#000" style={{ marginRight: 4 }} />
                <Text className="text-[11px] font-bold text-black uppercase">Đặt lại</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center justify-between gap-3">
              <TouchableOpacity
                testID="btn-zoom-out"
                onPress={() => handleZoomChange(-0.2)}
                disabled={zoom <= 1.0}
                className={`w-9 h-9 border-2 border-black items-center justify-center ${zoom <= 1.0 ? 'bg-gray-200' : 'bg-white'}`}
              >
                <Ionicons name="remove" size={20} color="#000" />
              </TouchableOpacity>

              {/* Slider for Web */}
              {Platform.OS === 'web' ? (
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: '#000000', cursor: 'pointer' }}
                />
              ) : (
                <View className="flex-1 items-center">
                  <Text className="text-xs font-bold">{zoom.toFixed(1)}x</Text>
                </View>
              )}

              <TouchableOpacity
                testID="btn-zoom-in"
                onPress={() => handleZoomChange(0.2)}
                disabled={zoom >= 3.0}
                className={`w-9 h-9 border-2 border-black items-center justify-center ${zoom >= 3.0 ? 'bg-gray-200' : 'bg-white'}`}
              >
                <Ionicons name="add" size={20} color="#000" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-col gap-2">
            <TouchableOpacity
              testID="btn-confirm-crop"
              disabled={isProcessing}
              onPress={handleCrop}
              className="bg-black py-3 px-4 border-2 border-black items-center justify-center flex-row"
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text className="text-white font-black uppercase tracking-wider text-sm">
                    Xác nhận cắt ảnh 1:1
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View className="flex-row gap-2">
              <TouchableOpacity
                testID="btn-replace-image"
                disabled={isProcessing}
                onPress={onReplace}
                className="flex-1 bg-white py-2.5 px-3 border-2 border-black items-center justify-center flex-row"
              >
                <Ionicons name="image-outline" size={16} color="#000" style={{ marginRight: 6 }} />
                <Text className="text-black font-bold uppercase tracking-wider text-xs">
                  Thay ảnh
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="btn-cancel-crop"
                disabled={isProcessing}
                onPress={onCancel}
                className="flex-1 bg-gray-100 py-2.5 px-3 border-2 border-gray-400 items-center justify-center"
              >
                <Text className="text-gray-700 font-bold uppercase tracking-wider text-xs">
                  Hủy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
