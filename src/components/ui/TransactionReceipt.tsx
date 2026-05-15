/**
 * Transaction receipt — bank-receipt style full-screen view.
 * Web: Canvas-rendered share image (high quality, like ReceiveScreen).
 * Native: react-native-view-shot screenshot.
 */

import React, { useRef } from 'react';
import { Image, Platform, View, Text, Pressable, ScrollView } from 'react-native';
import { color, text, inter, space, radius, font, createStyles } from '@/constants/theme';
import { TokenLogo } from '@/components/TokenLogo';
import { ChainLogo } from '@/components/ChainLogo';
import { QRCode } from '@/components/QRCode';
import QRCodeLib from 'qrcode';
import { formatBalance, shortAddr } from '@/models/types';
import { chainName, getAllNetworksSync } from '@/models/network';
import { copyToClipboard, hapticSuccess, showAlert, openBrowser } from '@/services/platform';
import { Share2, ExternalLink } from 'lucide-react-native';
import type { RecipientIdentity } from '@/services/recipient-identity';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  from: string;
  fromName?: string;
  to: string;
  toName?: string | null;
  amount: string;
  symbol: string;
  chainId: number;
  txHash: string;
  logoUrls: string[];
  usdValue?: number;
  timestamp: Date;
  recipientIdentity?: RecipientIdentity | null;
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(d: Date): string {
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Canvas share image (web) — pixel-perfect, no html2canvas
// ---------------------------------------------------------------------------

const LOGO_ASSET = require('@/../assets/images/icon.png');

function resolveAssetUri(asset: any): string {
  if (typeof asset === 'string') return asset;
  if (typeof asset === 'number') {
    const resolved = Image.resolveAssetSource(asset);
    return resolved?.uri ?? '';
  }
  return asset?.uri ?? asset?.default ?? '';
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

async function loadImageRobust(src: string): Promise<HTMLImageElement> {
  try { return await loadImage(src); } catch {}
  const resp = await fetch(src);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  try { return await loadImage(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
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

async function renderReceiptToCanvas(props: Props): Promise<Blob> {
  const { from, fromName, to, amount, symbol, chainId, txHash, usdValue, timestamp, recipientIdentity } = props;
  const chain = chainName(chainId);
  const net = getAllNetworksSync().find(n => n.chainId === chainId);
  const explorerUrl = `${net?.explorerURL ?? 'https://etherscan.io'}/tx/${txHash}`;
  const displayToName = recipientIdentity?.name ?? props.toName;

  const W = 750;
  const PAD = 60;
  const contentW = W - PAD * 2;
  const qrSize = 200;
  const logoSize = 40;

  const H = PAD + 40 + 20 + 30 + 10  // header
    + 60 + 10 + 40 + 20               // amount
    + 1 + 30                           // divider
    + 5 * 50                           // 5 detail rows
    + 30 + qrSize + 10 + 20 + 40      // QR section
    + logoSize + 20 + 24 + PAD;       // footer

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

  let y = PAD;

  // Header: TRANSACTION RECEIPT + chain name
  ctx.fillStyle = '#1A1A18';
  ctx.font = 'bold 24px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TRANSACTION RECEIPT', PAD, y + 20);
  ctx.fillStyle = '#7A776E';
  ctx.font = '500 20px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(chain, W - PAD, y + 20);
  y += 40 + 20;

  // Divider
  ctx.fillStyle = '#ECEBE4';
  ctx.fillRect(PAD, y, contentW, 1);
  y += 1 + 30;

  // Amount
  ctx.fillStyle = '#1A1A18';
  ctx.font = `bold 48px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`${formatBalance(parseFloat(amount))} ${symbol}`, W / 2, y + 40);
  y += 60;
  if (usdValue && usdValue > 0) {
    ctx.fillStyle = '#7A776E';
    ctx.font = '500 24px Inter, system-ui, sans-serif';
    ctx.fillText(formatUsd(usdValue), W / 2, y + 18);
    y += 30;
  }
  y += 20;

  // Divider
  ctx.fillStyle = '#ECEBE4';
  ctx.fillRect(PAD, y, contentW, 1);
  y += 1 + 20;

  // Detail rows
  const details: [string, string, string?][] = [
    ['From', shortAddr(from), fromName],
    ['To', shortAddr(to), displayToName ?? undefined],
    ['Network', chain],
    ['Time', formatTime(timestamp)],
    ['Tx Hash', shortAddr(txHash)],
  ];

  for (const [label, value, name] of details) {
    ctx.fillStyle = '#7A776E';
    ctx.font = '400 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, PAD, y + 22);

    ctx.textAlign = 'right';
    if (name) {
      ctx.fillStyle = '#1A1A18';
      ctx.font = '600 22px Inter, system-ui, sans-serif';
      ctx.fillText(name, W - PAD, y + 14);
      ctx.fillStyle = '#7A776E';
      ctx.font = '400 20px "SF Mono", monospace';
      ctx.fillText(value, W - PAD, y + 38);
      y += 50;
    } else {
      ctx.fillStyle = '#1A1A18';
      ctx.font = '600 22px Inter, system-ui, sans-serif';
      ctx.fillText(value, W - PAD, y + 22);
      y += 44;
    }
  }

  // QR section
  y += 20;
  ctx.fillStyle = '#ECEBE4';
  ctx.fillRect(PAD, y, contentW, 1);
  y += 1 + 30;

  // QR code
  const qrModules = QRCodeLib.create(explorerUrl, { errorCorrectionLevel: 'M' }).modules;
  const moduleCount = qrModules.size;
  const moduleSize = qrSize / moduleCount;
  const qrX = (W - qrSize) / 2;
  ctx.fillStyle = '#1A1A18';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qrModules.data[row * moduleCount + col] === 1) {
        ctx.fillRect(qrX + col * moduleSize, y + row * moduleSize, moduleSize + 0.5, moduleSize + 0.5);
      }
    }
  }
  y += qrSize + 10;
  ctx.fillStyle = '#B0ADA5';
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Scan to view on explorer', W / 2, y + 14);
  y += 40;

  // Footer: logo + Vela Wallet + getvela.app
  let logoImg: HTMLImageElement | null = null;
  const logoSources = [resolveAssetUri(LOGO_ASSET), '/assets/assets/images/icon.png', '/assets/images/icon.png'].filter(Boolean);
  for (const src of logoSources) {
    try { logoImg = await loadImageRobust(src); break; } catch {}
  }
  if (logoImg) {
    const lx = (W - logoSize) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(lx + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, lx, y, logoSize, logoSize);
    ctx.restore();
  }
  y += logoSize + 12;
  ctx.fillStyle = '#1A1A18';
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText('Vela Wallet', W / 2, y + 14);
  y += 24;
  ctx.fillStyle = '#B0ADA5';
  ctx.font = '400 18px Inter, system-ui, sans-serif';
  ctx.fillText('getvela.app', W / 2, y + 12);

  return new Promise((resolve) => canvas.toBlob(resolve as BlobCallback, 'image/png', 1));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransactionReceipt({
  from, fromName, to, toName, amount, symbol, chainId,
  txHash, logoUrls, usdValue, timestamp, recipientIdentity, onDone,
}: Props) {
  const receiptRef = useRef<View>(null);
  const chain = chainName(chainId);
  const net = getAllNetworksSync().find(n => n.chainId === chainId);
  const explorerBase = net?.explorerURL ?? 'https://etherscan.io';
  const explorerUrl = `${explorerBase}/tx/${txHash}`;
  const displayToName = recipientIdentity?.name ?? toName;

  const handleViewExplorer = () => openBrowser(explorerUrl);

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      try {
        const blob = await renderReceiptToCanvas({
          from, fromName, to, toName, amount, symbol, chainId,
          txHash, logoUrls, usdValue, timestamp, recipientIdentity, onDone,
        });
        const file = new File([blob], `vela-receipt-${txHash.slice(0, 10)}.png`, { type: 'image/png' });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Sent ${amount} ${symbol}` });
          return;
        }

        // Fallback: copy image to clipboard
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          hapticSuccess();
          showAlert('Copied', 'Receipt image copied to clipboard.');
          return;
        } catch {}

        // Fallback: download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = file.name;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        hapticSuccess();
      } catch {
        await copyToClipboard(explorerUrl);
        showAlert('Copied', 'Explorer link copied.');
      }
    } else {
      try {
        const ViewShot = require('react-native-view-shot');
        const { Share } = require('react-native');
        if (receiptRef.current) {
          const uri = await ViewShot.captureRef(receiptRef, { format: 'png', quality: 1, result: 'tmpfile' });
          await Share.share({ url: uri, message: `Sent ${amount} ${symbol} on ${chain}\n${explorerUrl}` });
        }
      } catch {
        const { Share } = require('react-native');
        await Share.share({ message: `Sent ${amount} ${symbol} on ${chain}\n${explorerUrl}` });
      }
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      {/* Capturable receipt card */}
      <View ref={receiptRef} testID="receipt-card" collapsable={false} style={styles.receipt}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Transaction Receipt</Text>
          <View style={styles.headerNetwork}>
            {net && <ChainLogo label={net.iconLabel} color={net.iconColor} bgColor={net.iconBg} logoURL={net.logoURL} size={16} />}
            <Text style={styles.headerChain}>{chain}</Text>
          </View>
        </View>
        <View style={styles.separator} />
        <View style={styles.amountSection}>
          <TokenLogo symbol={symbol} logoUrls={logoUrls} size={44} />
          <Text style={styles.amountText}>{formatBalance(parseFloat(amount))} {symbol}</Text>
          {usdValue != null && usdValue > 0 && <Text style={styles.amountUsd}>{formatUsd(usdValue)}</Text>}
        </View>
        <View style={styles.separator} />

        <View style={styles.detailRow}><Text style={styles.detailLabel}>From</Text><View style={styles.detailValueCol}>{fromName && <Text style={styles.detailName}>{fromName}</Text>}<Text style={styles.detailAddr}>{shortAddr(from)}</Text></View></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>To</Text><View style={styles.detailValueCol}>{displayToName && <Text style={styles.detailName}>{displayToName}</Text>}<Text style={styles.detailAddr}>{shortAddr(to)}</Text></View></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Network</Text><Text style={styles.detailValue}>{chain}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Time</Text><Text style={styles.detailValue}>{formatTime(timestamp)}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Tx Hash</Text><Text style={styles.detailAddr}>{shortAddr(txHash)}</Text></View>

        <View style={styles.qrSection}>
          <QRCode value={explorerUrl} size={80} />
          <Text style={styles.qrHint}>Scan to view on explorer</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>VELA WALLET</Text>
          <Text style={styles.footerUrl}>getvela.app</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={handleViewExplorer}>
          <ExternalLink size={18} color={color.fg.muted} strokeWidth={2} />
          <Text style={styles.actionText}>Explorer</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={handleShare}>
          <Share2 size={18} color={color.fg.muted} strokeWidth={2} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>

      <Pressable style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = createStyles(() => ({
  screen: { flex: 1, backgroundColor: color.bg.base },
  screenContent: { padding: space.xl, paddingBottom: 100 },
  receipt: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: space['2xl'],
    borderWidth: 1,
    borderColor: color.border.base,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  headerTitle: { fontSize: text.sm, ...inter.bold, color: color.fg.base, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  headerNetwork: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  headerChain: { fontSize: text.xs, ...inter.medium, color: color.fg.muted },
  separator: { height: 1, backgroundColor: color.border.base, marginVertical: space.lg },
  amountSection: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  amountText: { fontSize: text['3xl'], ...inter.bold, fontFamily: font.display, color: color.fg.base, marginTop: space.sm },
  amountUsd: { fontSize: text.base, ...inter.medium, color: color.fg.muted },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: space.md },
  detailLabel: { fontSize: text.sm, ...inter.regular, color: color.fg.muted, minWidth: 70 },
  detailValueCol: { alignItems: 'flex-end' as const, flex: 1 },
  detailName: { fontSize: text.sm, ...inter.semibold, color: color.fg.base, textAlign: 'right' as const },
  detailAddr: { fontSize: text.sm, ...inter.medium, fontFamily: font.mono, color: color.fg.muted, textAlign: 'right' as const },
  detailValue: { fontSize: text.sm, ...inter.semibold, color: color.fg.base, textAlign: 'right' as const, flex: 1 },
  qrSection: { alignItems: 'center', marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: color.border.base, gap: space.sm },
  qrHint: { fontSize: text.xs, ...inter.regular, color: color.fg.subtle },
  footer: { alignItems: 'center', marginTop: space.xl, gap: 2 },
  footerLogo: { fontSize: text.sm, ...inter.bold, color: color.fg.muted, letterSpacing: 2 },
  footerUrl: { fontSize: text.xs, ...inter.regular, color: color.fg.subtle },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: space['5xl'], marginTop: space['2xl'] },
  actionBtn: { alignItems: 'center', gap: space.sm },
  actionText: { fontSize: text.sm, ...inter.medium, color: color.fg.muted },
  doneBtn: { backgroundColor: color.fg.base, borderRadius: radius.xl, paddingVertical: space.xl, alignItems: 'center', marginTop: space['2xl'] },
  doneBtnText: { fontSize: text.lg, ...inter.semibold, color: color.fg.inverse },
}));
