/**
 * Cross-platform modal that stays inside #root on web.
 *
 * React Native's <Modal> creates a portal to <body> on web,
 * escaping the phone-frame container. This component uses a
 * full-screen absolute overlay on web instead.
 */
import React from 'react';
import { Modal, View, StyleSheet, Platform } from 'react-native';

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

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 9999,
  },
  content: {
    flex: 1,
    backgroundColor: '#FAFAF8',
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
});
