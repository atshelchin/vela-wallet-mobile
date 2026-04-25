/**
 * Cross-platform modal.
 *
 * - iOS/Android: native <Modal> with drag handle
 * - Web: portal to #root with slide-up animation, backdrop + drag dismiss
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Platform,
  Pressable,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';

interface Props {
  visible: boolean;
  children: React.ReactNode;
  onClose?: () => void;
}

export function AppModal({ visible, children, onClose }: Props) {
  if (Platform.OS !== 'web') {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.nativeRoot}>
          <DragHandle onClose={onClose} />
          <View style={styles.nativeContent}>{children}</View>
        </View>
      </Modal>
    );
  }

  return <WebModal visible={visible} onClose={onClose}>{children}</WebModal>;
}

// ---------------------------------------------------------------------------
// Drag handle
// ---------------------------------------------------------------------------

function DragHandle({ onClose }: { onClose?: () => void }) {
  const pan = useRef(new Animated.Value(0)).current;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => { if (g.dy > 0) pan.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.5) {
          onClose?.();
        }
        Animated.spring(pan, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      },
    }),
  ).current;

  return (
    <Animated.View style={[styles.handleArea, { transform: [{ translateY: pan }] }]} {...responder.panHandlers}>
      <View style={styles.handleBar} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Web modal (rendered via DOM portal into #root)
// ---------------------------------------------------------------------------

function WebModal({ visible, onClose, children }: { visible: boolean; onClose?: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Create a DOM container as direct child of #root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;z-index:99999;pointer-events:none;';
    const root = document.getElementById('root');
    if (root) {
      root.appendChild(el);
      setContainer(el);
    }
    return () => { el.remove(); };
  }, []);

  useEffect(() => {
    if (!container) return;
    if (visible) {
      container.style.pointerEvents = 'auto';
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      const t = setTimeout(() => {
        setMounted(false);
        if (container) container.style.pointerEvents = 'none';
      }, 300);
      return () => clearTimeout(t);
    }
  }, [visible, container]);

  if (!container || !mounted) return null;

  const { createPortal } = require('react-dom');

  return createPortal(
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: show ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)',
          transition: 'background-color 0.3s ease',
        }}
      />
      {/* Content sheet */}
      <div style={{
        position: 'relative',
        backgroundColor: '#FAFAF8',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '92%',
        overflow: 'auto',
        transform: show ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <DragHandle onClose={onClose} />
        <View style={styles.webContent}>{children}</View>
      </div>
    </div>,
    container,
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  nativeRoot: { flex: 1, backgroundColor: '#FAFAF8' },
  nativeContent: { flex: 1 },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handleBar: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#D1D1D1' },
  webContent: { flex: 1 },
});
