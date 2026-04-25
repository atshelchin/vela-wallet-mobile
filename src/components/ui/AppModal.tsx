/**
 * Cross-platform modal that stays inside #root on web.
 *
 * Features:
 * - iOS/Android: native <Modal> with drag-to-dismiss handle
 * - Web: animated overlay with slide-up, backdrop dismiss, drag-to-dismiss
 * - Pull-down gesture on the handle bar closes the modal on all platforms
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Platform,
  Pressable,
  PanResponder,
  Animated,
} from 'react-native';

interface Props {
  visible: boolean;
  children: React.ReactNode;
  onClose?: () => void;
  animationType?: 'none' | 'slide' | 'fade';
}

export function AppModal({ visible, children, onClose, animationType = 'slide' }: Props) {
  // --- Native (iOS / Android) ---
  if (Platform.OS !== 'web') {
    return (
      <Modal
        visible={visible}
        animationType={animationType}
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <View style={styles.nativeWrapper}>
          <DragHandle onClose={onClose} />
          {children}
        </View>
      </Modal>
    );
  }

  // --- Web ---
  return <WebModal visible={visible} onClose={onClose}>{children}</WebModal>;
}

// ---------------------------------------------------------------------------
// Drag handle (shared)
// ---------------------------------------------------------------------------

function DragHandle({ onClose }: { onClose?: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80) {
          onClose?.();
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
      },
    }),
  ).current;

  return (
    <Animated.View
      style={[styles.handleArea, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.handleBar} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Web modal with animation
// ---------------------------------------------------------------------------

function WebModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={[styles.backdrop, show && styles.backdropVisible]}
        onPress={onClose}
      />
      <View style={[styles.content, show && styles.contentVisible]}>
        <DragHandle onClose={onClose} />
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Native
  nativeWrapper: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },

  // Drag handle
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D1D1',
  },

  // Web
  wrapper: {
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
    // @ts-ignore web transition
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
    maxHeight: '90%',
    paddingBottom: 80,
    // @ts-ignore web transition
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    transform: [{ translateY: 900 }],
  },
  contentVisible: {
    transform: [{ translateY: 0 }],
  },
});
