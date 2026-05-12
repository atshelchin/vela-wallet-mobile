import React, { useState } from 'react';
import { Platform, View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { AppModal } from '@/components/ui/AppModal';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import jsQR from 'jsqr';
import { color, text, inter, space, radius, createStyles } from '@/constants/theme';
import { X, SwitchCamera, Camera, ImagePlus } from 'lucide-react-native';

interface Props {
  visible: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
}

/** Parse ethereum: URI or raw address from scanned data. */
function parseAddress(data: string): string {
  let address = data.trim();
  if (address.startsWith('ethereum:')) {
    address = address.replace('ethereum:', '').split('?')[0].split('@')[0];
  }
  return address;
}

export function QRScanner({ visible, onScan, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    onScan(parseAddress(data));
    setTimeout(() => setScanned(false), 2000);
  }

  async function handlePickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;

      if (Platform.OS === 'web') {
        // Web: decode via canvas + jsQR
        const response = await fetch(uri);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        const code = jsQR(imageData.data as any, imageData.width, imageData.height);
        if (code?.data) {
          onScan(parseAddress(code.data));
        } else {
          Alert.alert('No QR Found', 'Could not find a QR code in the selected image.');
        }
      } else {
        // Native: use expo-camera's built-in image scanner
        const barcodes = await scanFromURLAsync(uri, ['qr']);
        if (barcodes.length > 0 && barcodes[0].data) {
          onScan(parseAddress(barcodes[0].data));
        } else {
          Alert.alert('No QR Found', 'Could not find a QR code in the selected image.');
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to scan the image.');
    }
  }

  if (!visible) return null;

  return (
    <AppModal visible={visible}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn}>
            <X size={22} color={color.accent.base} strokeWidth={2.5} />
          </Pressable>
          <Text style={styles.title}>Scan QR</Text>
          <Pressable
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
            hitSlop={8}
            style={styles.headerBtn}
          >
            <SwitchCamera size={22} color={color.accent.base} strokeWidth={2} />
          </Pressable>
        </View>

        {!permission?.granted ? (
          <View style={styles.permissionContainer}>
            <Camera size={40} color={color.fg.subtle} />
            <Text style={styles.permissionText}>
              Camera access is needed to scan QR codes.
            </Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing={facing}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarCodeScanned}
            />
            {/* Overlay with scanning frame */}
            <View style={styles.overlay}>
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanFrame}>
                  {/* Corner accents */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom} />
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable style={styles.galleryBtn} onPress={handlePickImage}>
            <ImagePlus size={18} color={color.accent.base} strokeWidth={2} />
            <Text style={styles.galleryText}>Pick from Photos</Text>
          </Pressable>
          <Text style={styles.hint}>
            Point camera at a QR code, or select an image
          </Text>
        </View>
      </View>
    </AppModal>
  );
}

const FRAME_SIZE = 250;
const CORNER_SIZE = 24;

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space['2xl'],
    paddingTop: 60,
    paddingBottom: space.xl,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.fg.inverse,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['5xl'],
    gap: space['2xl'],
  },
  permissionText: {
    fontSize: text.lg,
    ...inter.regular,
    color: color.fg.subtle,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: color.accent.base,
    paddingHorizontal: space['3xl'],
    paddingVertical: space.xl,
    borderRadius: radius.xl,
  },
  permissionButtonText: {
    fontSize: text.lg,
    ...inter.semibold,
    color: color.fg.inverse,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTop: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: FRAME_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanFrame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: color.accent.base,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: 3, borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: 3, borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: 3, borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: 3, borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  overlayBottom: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  footer: {
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space['2xl'],
    paddingBottom: space['5xl'],
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: space['2xl'],
    paddingVertical: space.lg,
    borderRadius: radius.full,
  },
  galleryText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.accent.base,
  },
  hint: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
    textAlign: 'center',
    paddingHorizontal: space['5xl'],
  },
}));
