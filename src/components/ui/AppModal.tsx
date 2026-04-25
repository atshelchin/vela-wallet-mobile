/**
 * Cross-platform modal that stays inside #root on web.
 *
 * - iOS/Android: uses native <Modal> (unchanged)
 * - Web: absolute overlay with slide-up + fade animation
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, StyleSheet, Platform, Pressable } from 'react-native';

interface Props {
  visible: boolean;
  children: React.ReactNode;
  animationType?: 'none' | 'slide' | 'fade';
  presentationStyle?: 'fullScreen' | 'pageSheet';
  onRequestClose?: () => void;
}

export function AppModal({ visible, children, animationType = 'slide', onRequestClose }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <Modal visible={visible} animationType={animationType} presentationStyle="pageSheet" onRequestClose={onRequestClose}>
        {children}
      </Modal>
    );
  }

  // Web: animated overlay
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      // Trigger animation on next frame
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
    } else {
      setAnimating(false);
      // Unmount after transition
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={styles.wrapper}>
      {/* Backdrop */}
      <Pressable
        style={[styles.backdrop, animating && styles.backdropVisible]}
        onPress={onRequestClose}
      />
      {/* Content */}
      <View style={[styles.content, animating && styles.contentVisible]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // 'fixed' normally targets viewport, but #root has transform:translateZ(0)
    // which makes fixed position relative to #root instead. This ensures
    // the modal covers everything including the tab bar.
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0)',
    // @ts-ignore web-only
    transition: 'background-color 0.3s ease',
  },
  backdropVisible: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  content: {
    backgroundColor: '#FAFAF8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '92%',
    paddingBottom: 80, // space for tab bar underneath
    // @ts-ignore web-only
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: [{ translateY: 900 }],
  },
  contentVisible: {
    transform: [{ translateY: 0 }],
  },
});
