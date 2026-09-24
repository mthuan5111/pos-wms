import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cropImage } from '../utils/imageCropper';

export interface ImageCropperModalProps {
  visible: boolean;
  imageUri: string;
  onConfirm: (croppedUri: string) => void;
  onCancel: () => void;
  onReplace?: () => void;
}

type AspectRatioOption = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
type DragHandle =
  | 'inside'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'edge-top'
  | 'edge-bottom'
  | 'edge-left'
  | 'edge-right'
  | null;

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FittedImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CONTAINER_SIZE = Math.min(360, Math.floor(Dimensions.get('window').width - 48));
const MIN_CROP_SIZE = 36;

export default function ImageCropperModal({
  visible,
  imageUri,
  onConfirm,
  onCancel,
  onReplace,
}: ImageCropperModalProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('free');
  const [origDimensions, setOrigDimensions] = useState<{ width: number; height: number } | null>(null);
  const [fittedRect, setFittedRect] = useState<FittedImageRect>({ x: 0, y: 0, width: CONTAINER_SIZE, height: CONTAINER_SIZE });
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: CONTAINER_SIZE, height: CONTAINER_SIZE });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);

  // Drag interaction refs
  const dragHandleRef = useRef<DragHandle>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; box: CropBox }>({
    startX: 0,
    startY: 0,
    box: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Calculate fitted image rect when image dimensions change
  const computeFitting = useCallback((origW: number, origH: number) => {
    const containerW = CONTAINER_SIZE;
    const containerH = CONTAINER_SIZE;
    const imgAspect = origW / origH;
    const containerAspect = containerW / containerH;

    let fitW: number;
    let fitH: number;
    let fitX: number;
    let fitY: number;

    if (imgAspect > containerAspect) {
      fitW = containerW;
      fitH = containerW / imgAspect;
      fitX = 0;
      fitY = (containerH - fitH) / 2;
    } else {
      fitH = containerH;
      fitW = containerH * imgAspect;
      fitX = (containerW - fitW) / 2;
      fitY = 0;
    }

    const fitRect: FittedImageRect = { x: fitX, y: fitY, width: fitW, height: fitH };
    setFittedRect(fitRect);

    // Initial crop box: 90% of fitted image, centered
    const initialW = fitW * 0.9;
    const initialH = fitH * 0.9;
    const initialX = fitX + (fitW - initialW) / 2;
    const initialY = fitY + (fitH - initialH) / 2;

    setCropBox({
      x: Math.round(initialX),
      y: Math.round(initialY),
      width: Math.round(initialW),
      height: Math.round(initialH),
    });
  }, []);

  // Load natural dimensions of the image on open
  useEffect(() => {
    if (!visible || !imageUri) {
      setOrigDimensions(null);
      setIsLoadingDimensions(true);
      return;
    }

    setIsLoadingDimensions(true);
    setAspectRatio('free');

    if (Platform.OS === 'web') {
      const img = new (window as any).Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        setOrigDimensions({ width: w, height: h });
        computeFitting(w, h);
        setIsLoadingDimensions(false);
      };
      img.onerror = () => {
        setIsLoadingDimensions(false);
      };
      img.src = imageUri;
    } else {
      Image.getSize(
        imageUri,
        (w, h) => {
          setOrigDimensions({ width: w, height: h });
          computeFitting(w, h);
          setIsLoadingDimensions(false);
        },
        () => {
          setIsLoadingDimensions(false);
        }
      );
    }
  }, [visible, imageUri, computeFitting]);

  // Adjust crop box when aspect ratio changes
  const handleSelectAspect = (ratio: AspectRatioOption) => {
    setAspectRatio(ratio);
    if (!origDimensions) return;

    const fit = fittedRect;
    if (ratio === 'free') {
      return; // Keep current box
    }

    let targetRatio = 1.0;
    if (ratio === '1:1') targetRatio = 1.0;
    else if (ratio === '4:3') targetRatio = 4 / 3;
    else if (ratio === '3:4') targetRatio = 3 / 4;
    else if (ratio === '16:9') targetRatio = 16 / 9;
    else if (ratio === '9:16') targetRatio = 9 / 16;

    let newW = fit.width * 0.9;
    let newH = newW / targetRatio;

    if (newH > fit.height * 0.9) {
      newH = fit.height * 0.9;
      newW = newH * targetRatio;
    }

    const newX = fit.x + (fit.width - newW) / 2;
    const newY = fit.y + (fit.height - newH) / 2;

    setCropBox({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH),
    });
  };

  const handleReset = () => {
    if (!origDimensions) return;
    setAspectRatio('free');
    computeFitting(origDimensions.width, origDimensions.height);
  };

  // Drag interaction logic
  const handleStartDrag = (handle: DragHandle, clientX: number, clientY: number) => {
    dragHandleRef.current = handle;
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      box: { ...cropBox },
    };
  };

  const handleMoveDrag = (clientX: number, clientY: number) => {
    const handle = dragHandleRef.current;
    if (!handle) return;

    const dx = clientX - dragStartRef.current.startX;
    const dy = clientY - dragStartRef.current.startY;
    const initBox = dragStartRef.current.box;
    const fit = fittedRect;

    let newX = initBox.x;
    let newY = initBox.y;
    let newW = initBox.width;
    let newH = initBox.height;

    if (handle === 'inside') {
      newX = Math.max(fit.x, Math.min(fit.x + fit.width - newW, initBox.x + dx));
      newY = Math.max(fit.y, Math.min(fit.y + fit.height - newH, initBox.y + dy));
    } else {
      if (handle.includes('left')) {
        const potentialW = initBox.width - dx;
        if (potentialW >= MIN_CROP_SIZE) {
          const maxLeft = initBox.x + initBox.width - MIN_CROP_SIZE;
          newX = Math.max(fit.x, Math.min(maxLeft, initBox.x + dx));
          newW = initBox.width - (newX - initBox.x);
        }
      }
      if (handle.includes('right')) {
        const maxRight = fit.x + fit.width;
        newW = Math.max(MIN_CROP_SIZE, Math.min(maxRight - initBox.x, initBox.width + dx));
      }
      if (handle.includes('top')) {
        const potentialH = initBox.height - dy;
        if (potentialH >= MIN_CROP_SIZE) {
          const maxTop = initBox.y + initBox.height - MIN_CROP_SIZE;
          newY = Math.max(fit.y, Math.min(maxTop, initBox.y + dy));
          newH = initBox.height - (newY - initBox.y);
        }
      }
      if (handle.includes('bottom')) {
        const maxBottom = fit.y + fit.height;
        newH = Math.max(MIN_CROP_SIZE, Math.min(maxBottom - initBox.y, initBox.height + dy));
      }

      // Enforce aspect ratio if not 'free'
      if (aspectRatio !== 'free') {
        let r = 1.0;
        if (aspectRatio === '1:1') r = 1.0;
        else if (aspectRatio === '4:3') r = 4 / 3;
        else if (aspectRatio === '3:4') r = 3 / 4;
        else if (aspectRatio === '16:9') r = 16 / 9;
        else if (aspectRatio === '9:16') r = 9 / 16;

        if (handle.includes('left') || handle.includes('right')) {
          newH = Math.max(MIN_CROP_SIZE, newW / r);
          if (newY + newH > fit.y + fit.height) {
            newH = fit.y + fit.height - newY;
            newW = newH * r;
          }
        } else {
          newW = Math.max(MIN_CROP_SIZE, newH * r);
          if (newX + newW > fit.x + fit.width) {
            newW = fit.x + fit.width - newX;
            newH = newW / r;
          }
        }
      }
    }

    setCropBox({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH),
    });
  };

  const handleEndDrag = () => {
    dragHandleRef.current = null;
  };

  // Perform final crop on original image pixels
  const handleApplyCrop = async () => {
    if (!imageUri || !origDimensions) return;
    setIsProcessing(true);

    try {
      const fit = fittedRect;
      const scaleX = origDimensions.width / fit.width;
      const scaleY = origDimensions.height / fit.height;

      const originX = Math.max(0, (cropBox.x - fit.x) * scaleX);
      const originY = Math.max(0, (cropBox.y - fit.y) * scaleY);
      const width = Math.min(origDimensions.width - originX, cropBox.width * scaleX);
      const height = Math.min(origDimensions.height - originY, cropBox.height * scaleY);

      const cropped = await cropImage(
        imageUri,
        {
          originX: Math.round(originX),
          originY: Math.round(originY),
          width: Math.round(width),
          height: Math.round(height),
        },
        {
          format: 'jpeg',
          quality: 0.92,
          fillWhiteBackground: true,
        }
      );

      onConfirm(cropped.uri);
    } catch (err: any) {
      console.warn('[ImageCropper] Error applying crop:', err);
      // Fallback to original image if crop engine fails
      onConfirm(imageUri);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        testID="image-cropper-backdrop"
        className="flex-1 bg-black/85 justify-center items-center p-3"
        style={Platform.OS === 'web' ? ({ zIndex: 2147483640, position: 'fixed', inset: 0 } as any) : {}}
      >
        <View className="bg-white w-full max-w-md p-5 border-4 border-black">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-3 pb-2 border-b-2 border-black">
            <View>
              <Text className="text-base font-black uppercase text-black tracking-wider">
                Chỉnh sửa vùng ảnh
              </Text>
              <Text className="text-[11px] text-gray-600">
                Kéo 4 cạnh, 4 góc hoặc di chuyển khung để chọn vùng sản phẩm
              </Text>
            </View>
            <TouchableOpacity testID="crop-modal-close" onPress={onCancel} className="p-1">
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Aspect Ratio Presets Bar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-3 pb-1">
            {(['free', '1:1', '4:3', '3:4', '16:9', '9:16'] as AspectRatioOption[]).map((opt) => {
              const labels: Record<AspectRatioOption, string> = {
                free: 'Tùy chỉnh',
                '1:1': '1:1',
                '4:3': '4:3',
                '3:4': '3:4',
                '16:9': '16:9',
                '9:16': '9:16',
              };
              const isSelected = aspectRatio === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  onPress={() => handleSelectAspect(opt)}
                  className={`px-3 py-1.5 mr-2 border-2 border-black ${isSelected ? 'bg-black' : 'bg-white'}`}
                >
                  <Text className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-black'}`}>
                    {labels[opt]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Interactive Crop Viewport */}
          <View
            className="items-center justify-center bg-gray-100 border-2 border-black overflow-hidden relative"
            style={{
              width: CONTAINER_SIZE,
              height: CONTAINER_SIZE,
              alignSelf: 'center',
              userSelect: 'none',
            } as any}
            {...(Platform.OS === 'web'
              ? {
                  onMouseMove: (e: any) => handleMoveDrag(e.clientX, e.clientY),
                  onMouseUp: handleEndDrag,
                  onMouseLeave: handleEndDrag,
                }
              : {
                  onTouchMove: (e: any) => {
                    const touch = e.nativeEvent.touches[0];
                    if (touch) handleMoveDrag(touch.pageX, touch.pageY);
                  },
                  onTouchEnd: handleEndDrag,
                  onTouchCancel: handleEndDrag,
                })}
          >
            {isLoadingDimensions ? (
              <ActivityIndicator size="large" color="#000" />
            ) : (
              <>
                {/* 1. Underlying Entire Original Image (Contain Mode, centered, never distorted) */}
                <Image
                  source={{ uri: imageUri }}
                  style={{
                    position: 'absolute',
                    left: fittedRect.x,
                    top: fittedRect.y,
                    width: fittedRect.width,
                    height: fittedRect.height,
                  }}
                  resizeMode="contain"
                />

                {/* 2. Dimmed Outside Masks */}
                {/* Top mask */}
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: cropBox.y,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                  }}
                  pointerEvents="none"
                />
                {/* Bottom mask */}
                <View
                  style={{
                    position: 'absolute',
                    top: cropBox.y + cropBox.height,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                  }}
                  pointerEvents="none"
                />
                {/* Left mask */}
                <View
                  style={{
                    position: 'absolute',
                    top: cropBox.y,
                    left: 0,
                    width: cropBox.x,
                    height: cropBox.height,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                  }}
                  pointerEvents="none"
                />
                {/* Right mask */}
                <View
                  style={{
                    position: 'absolute',
                    top: cropBox.y,
                    left: cropBox.x + cropBox.width,
                    right: 0,
                    height: cropBox.height,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                  }}
                  pointerEvents="none"
                />

                {/* 3. Interactive Crop Box with border & grid */}
                <View
                  style={{
                    position: 'absolute',
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.width,
                    height: cropBox.height,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    borderStyle: 'solid',
                    cursor: 'move',
                  } as any}
                  {...(Platform.OS === 'web'
                    ? {
                        onMouseDown: (e: any) => {
                          e.stopPropagation();
                          handleStartDrag('inside', e.clientX, e.clientY);
                        },
                      }
                    : {
                        onTouchStart: (e: any) => {
                          const touch = e.nativeEvent.touches[0];
                          if (touch) handleStartDrag('inside', touch.pageX, touch.pageY);
                        },
                      })}
                >
                  {/* Grid Lines (Rule of thirds) */}
                  <View style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} pointerEvents="none" />
                  <View style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} pointerEvents="none" />
                  <View style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} pointerEvents="none" />
                  <View style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.4)' }} pointerEvents="none" />

                  {/* 4 Corner Drag Handles */}
                  {/* Top-Left */}
                  <View
                    style={{ position: 'absolute', top: -8, left: -8, width: 22, height: 22, backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', cursor: 'nwse-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('top-left', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { e.stopPropagation?.(); const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('top-left', t.pageX, t.pageY); } })}
                  />
                  {/* Top-Right */}
                  <View
                    style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', cursor: 'nesw-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('top-right', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { e.stopPropagation?.(); const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('top-right', t.pageX, t.pageY); } })}
                  />
                  {/* Bottom-Left */}
                  <View
                    style={{ position: 'absolute', bottom: -8, left: -8, width: 22, height: 22, backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', cursor: 'nesw-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('bottom-left', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { e.stopPropagation?.(); const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('bottom-left', t.pageX, t.pageY); } })}
                  />
                  {/* Bottom-Right */}
                  <View
                    style={{ position: 'absolute', bottom: -8, right: -8, width: 22, height: 22, backgroundColor: '#000', borderWidth: 2, borderColor: '#fff', cursor: 'nwse-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('bottom-right', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { e.stopPropagation?.(); const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('bottom-right', t.pageX, t.pageY); } })}
                  />

                  {/* 4 Edge Drag Bars */}
                  {/* Top Edge */}
                  <View
                    style={{ position: 'absolute', top: -6, left: 24, right: 24, height: 12, cursor: 'ns-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('edge-top', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('edge-top', t.pageX, t.pageY); } })}
                  />
                  {/* Bottom Edge */}
                  <View
                    style={{ position: 'absolute', bottom: -6, left: 24, right: 24, height: 12, cursor: 'ns-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('edge-bottom', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('edge-bottom', t.pageX, t.pageY); } })}
                  />
                  {/* Left Edge */}
                  <View
                    style={{ position: 'absolute', left: -6, top: 24, bottom: 24, width: 12, cursor: 'ew-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('edge-left', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('edge-left', t.pageX, t.pageY); } })}
                  />
                  {/* Right Edge */}
                  <View
                    style={{ position: 'absolute', right: -6, top: 24, bottom: 24, width: 12, cursor: 'ew-resize' } as any}
                    {...(Platform.OS === 'web'
                      ? { onMouseDown: (e: any) => { e.stopPropagation(); handleStartDrag('edge-right', e.clientX, e.clientY); } }
                      : { onTouchStart: (e: any) => { const t = e.nativeEvent.touches[0]; if (t) handleStartDrag('edge-right', t.pageX, t.pageY); } })}
                  />
                </View>
              </>
            )}
          </View>

          {/* Footer Controls */}
          <View className="flex-row justify-between items-center mt-4 pt-3 border-t-2 border-black">
            <TouchableOpacity
              onPress={handleReset}
              className="px-3 py-2 border-2 border-black bg-white flex-row items-center"
            >
              <Ionicons name="refresh-outline" size={16} color="#000" style={{ marginRight: 4 }} />
              <Text className="text-black font-bold text-xs uppercase">Đặt lại</Text>
            </TouchableOpacity>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={onCancel}
                disabled={isProcessing}
                className="px-4 py-2 border-2 border-gray-400 bg-white"
              >
                <Text className="text-gray-700 font-bold text-xs uppercase">Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="apply-crop-button"
                onPress={handleApplyCrop}
                disabled={isProcessing || isLoadingDimensions}
                className="px-5 py-2 bg-black flex-row items-center"
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
                ) : (
                  <Ionicons name="checkmark-outline" size={16} color="#fff" style={{ marginRight: 4 }} />
                )}
                <Text className="text-white font-bold text-xs uppercase">Áp dụng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
