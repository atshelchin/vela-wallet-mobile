import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, Share, AppState, Platform, Image } from 'react-native';
import { useSafeRouter } from '@/hooks/use-safe-router';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { fadeIn, fadeInDown } from '@/constants/entering';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaCard } from '@/components/ui/VelaCard';
import { ChainLogo } from '@/components/ChainLogo';
import { color, text, inter, space, radius, font, shadow, motion, createStyles } from '@/constants/theme';
import { useWallet } from '@/models/wallet-state';
import { getAllNetworksSync } from '@/models/network';
import { QRCode } from '@/components/QRCode';
import { fetchTokens } from '@/services/wallet-api';
import { tokenUsdValue } from '@/models/types';
import * as Haptics from 'expo-haptics';
import { Copy, Check, ArrowLeft, Share2 } from 'lucide-react-native';
import type { Network } from '@/models/network';
import QRCodeLib from 'qrcode';

// ── Web Canvas share-card renderer ──
const LOGO_ASSET = require('@/../assets/images/icon.png');

function resolveAssetUri(asset: any): string {
  if (typeof asset === 'string') return asset;
  if (typeof asset === 'number') {
    // Metro bundled numeric ID — use resolveAssetSource
    const resolved = Image.resolveAssetSource(asset);
    return resolved?.uri ?? '';
  }
  return asset?.uri ?? asset?.default ?? '';
}

async function renderShareCardToCanvas(
  address: string,
  walletName: string,
  networks: Network[],
): Promise<Blob> {
  const W = 750; // 2x for retina
  const PAD = 64;
  const contentW = W - PAD * 2;

  const logoSize = 80;
  const qrSize = 360;
  const chipH = 48;
  const chipGap = 16;
  const chipsPerRow = 2;
  const networkRows = Math.ceil(networks.length / chipsPerRow);
  const networksH = networkRows * chipH + (networkRows - 1) * chipGap;
  // Logo + title + wallet name + QR + address + divider + networks + footer
  const H = PAD + logoSize + 24 + 48 + 20 + 40 + 16 + qrSize + 40 + 64 + 48 + 2 + 40 + 36 + 20 + networksH + 60 + 30 + 24 + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  let y = PAD;

  // App logo
  const lx = (W - logoSize) / 2;
  let logoDrawn = false;
  const logoSources = [
    resolveAssetUri(LOGO_ASSET),
    '/assets/assets/images/icon.png',
    '/assets/images/icon.png',
    '/icon.png',
    '/favicon.png',
  ].filter(s => s && s !== '[object Object]');

  for (const src of logoSources) {
    try {
      const logoImg = await loadImageRobust(src);
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, lx, y, logoSize, logoSize);
      ctx.restore();
      logoDrawn = true;
      break;
    } catch {}
  }
  if (!logoDrawn) {
    // Fallback: draw app icon background with sailboat silhouette
    ctx.fillStyle = '#0A1929';
    ctx.beginPath();
    ctx.arc(lx + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  y += logoSize + 24;

  // Title: "Scan to Send Me Crypto"
  ctx.fillStyle = '#1A1A18';
  ctx.font = 'bold 40px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Scan to Send Me Crypto', W / 2, y + 36);
  y += 48 + 20;

  // Wallet name
  ctx.fillStyle = '#7A776E';
  ctx.font = '500 30px Inter, system-ui, sans-serif';
  ctx.fillText(walletName, W / 2, y + 28);
  y += 40 + 16;

  // QR code
  const qrModules = QRCodeLib.create(address, { errorCorrectionLevel: 'M' }).modules;
  const moduleCount = qrModules.size;
  const moduleSize = qrSize / moduleCount;
  const qrX = (W - qrSize) / 2;
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qrModules.data[row * moduleCount + col] === 1) {
        ctx.fillRect(qrX + col * moduleSize, y + row * moduleSize, moduleSize + 0.5, moduleSize + 0.5);
      }
    }
  }
  y += qrSize + 40;

  // Address box
  const addrBoxH = 64;
  ctx.fillStyle = '#F5F3EF';
  roundRect(ctx, PAD, y, contentW, addrBoxH, 16);
  ctx.fill();
  ctx.fillStyle = '#1A1A18';
  ctx.font = '500 22px "SF Mono", "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(address, W / 2, y + addrBoxH / 2 + 8);
  y += addrBoxH + 48;

  // Divider
  ctx.fillStyle = '#ECEBE4';
  ctx.fillRect(PAD, y, contentW, 2);
  y += 2 + 40;

  // Supported Networks title
  ctx.fillStyle = '#1A1A18';
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Supported Networks', PAD, y + 24);
  y += 36;

  ctx.fillStyle = '#7A776E';
  ctx.font = '400 22px Inter, system-ui, sans-serif';
  ctx.fillText('Same address across all EVM networks', PAD, y + 18);
  y += 20 + 24;

  // Network chips (2-column grid)
  const chipW = (contentW - chipGap) / 2;
  const logoImages = await Promise.all(
    networks.map(n => loadImage(n.logoURL).catch(() => null)),
  );

  for (let i = 0; i < networks.length; i++) {
    const col = i % chipsPerRow;
    const row = Math.floor(i / chipsPerRow);
    const cx = PAD + col * (chipW + chipGap);
    const cy = y + row * (chipH + chipGap);
    const n = networks[i];

    ctx.fillStyle = '#F5F3EF';
    roundRect(ctx, cx, cy, chipW, chipH, 24);
    ctx.fill();

    const cLogoSize = 28;
    const cLogoX = cx + 16;
    const cLogoY = cy + (chipH - cLogoSize) / 2;
    const img = logoImages[i];
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cLogoX + cLogoSize / 2, cLogoY + cLogoSize / 2, cLogoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cLogoX, cLogoY, cLogoSize, cLogoSize);
      ctx.restore();
    } else {
      ctx.fillStyle = n.iconBg;
      ctx.beginPath();
      ctx.arc(cLogoX + cLogoSize / 2, cLogoY + cLogoSize / 2, cLogoSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = n.iconColor;
      ctx.font = `bold ${cLogoSize * 0.35}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(n.iconLabel, cLogoX + cLogoSize / 2, cLogoY + cLogoSize / 2 + 4);
    }

    ctx.fillStyle = '#1A1A18';
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(n.displayName, cLogoX + cLogoSize + 10, cy + chipH / 2 + 7);

    if (n.isL2) {
      const badgeText = 'L2';
      ctx.font = '600 16px Inter, sans-serif';
      const badgeW = ctx.measureText(badgeText).width + 12;
      const badgeX = cx + chipW - badgeW - 14;
      const badgeY = cy + (chipH - 22) / 2;
      ctx.fillStyle = '#E8F0FE';
      roundRect(ctx, badgeX, badgeY, badgeW, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#4267F4';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 16);
    }
  }
  y += networksH + 60;

  // Footer: Vela Wallet + website
  ctx.fillStyle = '#1A1A18';
  ctx.font = '600 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Vela Wallet', W / 2, y);
  y += 30;
  ctx.fillStyle = '#B0ADA5';
  ctx.font = '400 22px Inter, system-ui, sans-serif';
  ctx.fillText('getvela.app', W / 2, y);

  return new Promise((resolve) => canvas.toBlob(resolve as BlobCallback, 'image/png', 1));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Load image with fetch+blob fallback to avoid CORS/taint issues on web */
async function loadImageRobust(src: string): Promise<HTMLImageElement> {
  // Try direct first
  try { return await loadImage(src); } catch {}
  // Fetch as blob — works for same-origin assets that fail CORS canvas tainting
  const resp = await fetch(src);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  return loadImage(blobUrl);
}

// Aggressive polling: 3s for first 1 min, then 60s for next 4 min, then stop
const FAST_INTERVAL_MS = 3_000;
const SLOW_INTERVAL_MS = 60_000;
const FAST_PHASE_MS = 1 * 60_000;
const TOTAL_LISTEN_MS = 5 * 60_000;

function PulsingDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800 }),
        withTiming(1, { duration: 800 }),
      ),
      -1,
      false,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.listeningDot, animatedStyle]} />
  );
}

export default function ReceiveScreen() {
  const router = useSafeRouter();
  const { activeAccount, state } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';
  const networks = getAllNetworksSync();

  const [isListening, setIsListening] = useState(false);
  const [depositDetected, setDepositDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const previousBalance = useRef<number | null>(null);
  const shareCardRef = useRef<View>(null);

  // Deposit detection polling — 3s fast, then 60s slow
  useEffect(() => {
    if (!address) return;
    setIsListening(true);
    previousBalance.current = null;
    const startTime = Date.now();
    let timerId: ReturnType<typeof setTimeout>;

    const checkDeposit = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const tokens = await fetchTokens(address, { forceRefresh: true });
        const total = tokens.reduce((sum, t) => sum + tokenUsdValue(t), 0);

        if (previousBalance.current !== null && total > previousBalance.current) {
          setDepositDetected(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setTimeout(() => setDepositDetected(false), 5000);
          setIsListening(false);
          return;
        }
        previousBalance.current = total;
      } catch {}

      const elapsed = Date.now() - startTime;
      if (elapsed >= TOTAL_LISTEN_MS) {
        setIsListening(false);
        return;
      }
      const interval = elapsed < FAST_PHASE_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
      timerId = setTimeout(checkDeposit, interval);
    };

    checkDeposit();
    return () => { clearTimeout(timerId); setIsListening(false); };
  }, [address]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const shareAsImage = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        const blob = await renderShareCardToCanvas(address!, accountName, networks);
        const file = new File([blob], `${accountName}-address.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `${accountName} Wallet Address` });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${accountName}-address.png`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        if (!shareCardRef.current) return;
        const { captureRef } = await import('react-native-view-shot');
        const Sharing = await import('expo-sharing');
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${accountName} Wallet Address` });
      }
    } catch (e) {
      console.warn('Share failed:', e);
    }
    setSharing(false);
  }, [address, accountName, sharing, networks]);

  const truncatedAddress = address
    ? `${address.slice(0, 8)}...${address.slice(-6)}`
    : '';

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.navBtn}>
            <ArrowLeft size={22} color={color.fg.base} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Receive</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* QR Card */}
        <Animated.View entering={fadeInDown(100, 400)}>
          <VelaCard elevated style={styles.qrCard}>
            {/* Wallet name */}
            <Text style={styles.walletName}>{accountName}</Text>

            <View style={styles.qrContainer}>
              {address ? (
                <QRCode value={address} size={180} />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Text style={styles.qrPlaceholderText}>No address</Text>
                </View>
              )}
            </View>

            {/* Address row with inline copy */}
            <Pressable onPress={copyAddress} style={styles.addressRow}>
              <Text style={styles.addressText} numberOfLines={1}>{truncatedAddress}</Text>
              {copied ? (
                <Check size={16} color={color.success.base} strokeWidth={2.5} />
              ) : (
                <Copy size={16} color={color.fg.muted} strokeWidth={2} />
              )}
            </Pressable>

            {/* Status indicator */}
            {isListening && !depositDetected && (
              <Animated.View style={styles.listeningRow} entering={fadeIn(0, 300)}>
                <PulsingDot />
                <Text style={styles.listeningText}>Listening for deposits</Text>
              </Animated.View>
            )}

            {depositDetected && (
              <Animated.View style={styles.depositAlert} entering={fadeIn(0, 300)}>
                <Check size={16} color={color.success.base} strokeWidth={3} />
                <Text style={styles.depositText}>Deposit received!</Text>
              </Animated.View>
            )}
          </VelaCard>
        </Animated.View>

        {/* Share button */}
        <Animated.View entering={fadeInDown(200, 400)}>
          <Pressable
            onPress={shareAsImage}
            style={styles.shareBtn}
            disabled={sharing}
          >
            <Share2 size={18} color={color.fg.base} strokeWidth={2} />
            <Text style={styles.shareBtnText}>
              {sharing ? 'Generating...' : 'Share as Image'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Supported networks */}
        <Animated.View entering={fadeInDown(300, 400)}>
          <Text style={styles.sectionTitle}>Supported Networks</Text>
          <Text style={styles.sectionSubtitle}>
            Same address across all EVM networks
          </Text>

          <VelaCard style={styles.networksCard}>
            {networks.map((network, index) => (
              <View key={network.id}>
                {index > 0 && <View style={styles.separator} />}
                <View style={styles.networkRow}>
                  <ChainLogo
                    label={network.iconLabel}
                    color={network.iconColor}
                    bgColor={network.iconBg}
                    logoURL={network.logoURL}
                    size={32}
                  />
                  <Text style={styles.networkName}>{network.displayName}</Text>
                  {network.isL2 && (
                    <View style={styles.networkBadge}>
                      <Text style={styles.networkBadgeText}>L2</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
          </VelaCard>
        </Animated.View>
      </ScrollView>

      {/* Hidden share card for native image capture (web uses Canvas) */}
      {Platform.OS !== 'web' && (
        <View style={styles.shareCardWrapper} pointerEvents="none">
          <View ref={shareCardRef} style={styles.shareCard} collapsable={false}>
            {/* Logo */}
            <Image source={require('@/../assets/images/icon.png')} style={styles.shareCardLogo} />

            {/* Title */}
            <Text style={styles.shareCardHeadline}>Scan to Send Me Crypto</Text>

            {/* Wallet name */}
            <Text style={styles.shareCardTitle}>{accountName}</Text>

            <View style={styles.shareCardQR}>
              {address && <QRCode value={address} size={200} />}
            </View>

            <View style={styles.shareCardAddressBox}>
              <Text style={styles.shareCardAddress}>{address}</Text>
            </View>

            <View style={styles.shareCardDivider} />

            <Text style={styles.shareCardNetworksTitle}>Supported Networks</Text>
            <Text style={styles.shareCardNetworksSub}>
              Same address across all EVM networks
            </Text>

            <View style={styles.shareCardNetworkGrid}>
              {networks.map((network) => (
                <View key={network.id} style={styles.shareCardNetworkChip}>
                  <ChainLogo
                    label={network.iconLabel}
                    color={network.iconColor}
                    bgColor={network.iconBg}
                    logoURL={network.logoURL}
                    size={24}
                  />
                  <Text style={styles.shareCardNetworkName}>{network.displayName}</Text>
                  {network.isL2 && (
                    <View style={styles.shareCardL2}>
                      <Text style={styles.shareCardL2Text}>L2</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.shareCardFooter}>
              <Text style={styles.shareCardBrand}>Vela Wallet</Text>
              <Text style={styles.shareCardUrl}>getvela.app</Text>
            </View>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

const SHARE_CARD_W = 375;

const styles = createStyles(() => ({
  content: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    marginBottom: space.md,
  },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.fg.base,
  },
  headerSpacer: { minWidth: 50 },

  // QR Card
  qrCard: {
    padding: space['2xl'],
    alignItems: 'center',
    marginBottom: space.xl,
  },
  walletName: {
    fontSize: text.lg,
    ...inter.semibold,
    color: color.fg.base,
    marginBottom: space.xl,
  },
  qrContainer: {
    marginBottom: space.xl,
  },
  qrPlaceholder: {
    width: 180,
    height: 180,
    borderRadius: radius.xl,
    backgroundColor: color.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    fontSize: text.base,
    color: color.fg.subtle,
  },

  // Address row
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    alignSelf: 'center',
  },
  addressText: {
    fontSize: text.sm,
    ...inter.medium,
    fontFamily: font.mono,
    color: color.fg.base,
  },

  // Listening
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.lg,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.success.base,
  },
  listeningText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.success.base,
  },

  // Deposit
  depositAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.success.soft,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    marginTop: space.lg,
    width: '100%',
  },
  depositText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.success.base,
  },

  // Share button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space['2xl'],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.strong,
    alignSelf: 'center',
    marginBottom: space['4xl'],
  },
  shareBtnText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.base,
  },

  // Networks
  sectionTitle: {
    fontSize: text.lg,
    ...inter.bold,
    color: color.fg.base,
    marginBottom: space.sm,
  },
  sectionSubtitle: {
    fontSize: text.base,
    ...inter.regular,
    color: color.fg.muted,
    marginBottom: space.xl,
  },
  networksCard: {
    paddingVertical: space.md,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space['2xl'],
  },
  networkName: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.base,
    flex: 1,
  },
  networkBadge: {
    backgroundColor: color.info.soft,
    paddingHorizontal: space.md,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  networkBadgeText: {
    fontSize: text.xs,
    ...inter.semibold,
    color: color.info.base,
  },
  separator: {
    height: 1,
    backgroundColor: color.border.base,
    marginHorizontal: space['2xl'],
  },

  // ── Hidden share card (rendered off-screen for capture) ──
  shareCardWrapper: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  shareCard: {
    width: SHARE_CARD_W,
    backgroundColor: '#FFFFFF',
    padding: 32,
    paddingBottom: 40,
    alignItems: 'center',
  },
  shareCardLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 16,
  },
  shareCardHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A18',
    marginBottom: 8,
  },
  shareCardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#7A776E',
    marginBottom: 20,
  },
  shareCardQR: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 20,
  },
  shareCardAddressBox: {
    backgroundColor: '#F5F3EF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: '100%',
    marginBottom: 24,
  },
  shareCardAddress: {
    fontSize: 12,
    fontFamily: font.mono,
    fontWeight: '500',
    color: '#1A1A18',
    textAlign: 'center',
    lineHeight: 18,
  },
  shareCardDivider: {
    height: 1,
    backgroundColor: '#ECEBE4',
    width: '100%',
    marginBottom: 20,
  },
  shareCardNetworksTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A18',
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  shareCardNetworksSub: {
    fontSize: 12,
    fontWeight: '400',
    color: '#7A776E',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  shareCardNetworkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    marginBottom: 24,
  },
  shareCardNetworkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3EF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareCardNetworkName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A18',
  },
  shareCardL2: {
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  shareCardL2Text: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4267F4',
  },
  shareCardFooter: {
    paddingTop: 24,
  },
  shareCardBrand: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A18',
    marginBottom: 4,
  },
  shareCardUrl: {
    fontSize: 12,
    fontWeight: '400',
    color: '#B0ADA5',
  },
}));
