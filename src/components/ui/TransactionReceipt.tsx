/**
 * Transaction receipt — bank-receipt style full-screen view.
 * Supports screenshot (react-native-view-shot / html2canvas) and share.
 */

import React, { useRef } from 'react';
import { Platform, View, Text, Pressable, ScrollView } from 'react-native';
import { color, text, inter, space, radius, font, createStyles } from '@/constants/theme';
import { TokenLogo } from '@/components/TokenLogo';
import { ChainLogo } from '@/components/ChainLogo';
import { QRCode } from '@/components/QRCode';
import { formatBalance, shortAddr } from '@/models/types';
import { chainName, getAllNetworksSync } from '@/models/network';
import { copyToClipboard, hapticSuccess, showAlert } from '@/services/platform';
import { Check, Link, Share2, ArrowLeft } from 'lucide-react-native';
import type { RecipientIdentity } from '@/services/recipient-identity';

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

function formatTime(d: Date): string {
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

  const [copiedLink, setCopiedLink] = React.useState(false);

  const handleCopyLink = async () => {
    await copyToClipboard(explorerUrl);
    hapticSuccess();
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (Platform.OS === 'web') {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const el = document.querySelector(`[data-testid="receipt-card"]`);
        if (!el) throw new Error('not found');

        const canvas = await html2canvas(el as HTMLElement, {
          backgroundColor: '#FFFFFF',
          scale: 2,
          useCORS: true,
        });

        try {
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(), 'image/png'),
          );
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          hapticSuccess();
          showAlert('Copied', 'Receipt image copied to clipboard.');
          return;
        } catch { /* fallback to download */ }

        const link = document.createElement('a');
        link.download = `vela-receipt-${txHash.slice(0, 10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        hapticSuccess();
      } catch {
        await copyToClipboard(explorerUrl);
        hapticSuccess();
        showAlert('Copied', 'Explorer link copied to clipboard.');
      }
    } else {
      try {
        const ViewShot = require('react-native-view-shot');
        const { Share } = require('react-native');
        if (receiptRef.current) {
          const uri = await ViewShot.captureRef(receiptRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          });
          await Share.share({
            url: uri,
            message: `Sent ${amount} ${symbol} on ${chain}\n${explorerUrl}`,
          });
        }
      } catch {
        const { Share } = require('react-native');
        await Share.share({
          message: `Sent ${amount} ${symbol} to ${toName ?? shortAddr(to)} on ${chain}\n${explorerUrl}`,
        });
      }
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent} showsVerticalScrollIndicator={false}>
      {/* Capturable receipt card */}
      <View ref={receiptRef} testID="receipt-card" collapsable={false} style={styles.receipt}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Transaction Receipt</Text>
          <View style={styles.headerNetwork}>
            {net && <ChainLogo label={net.iconLabel} color={net.iconColor} bgColor={net.iconBg} logoURL={net.logoURL} size={16} />}
            <Text style={styles.headerChain}>{chain}</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* Amount hero */}
        <View style={styles.amountSection}>
          <TokenLogo symbol={symbol} logoUrls={logoUrls} size={44} />
          <Text style={styles.amountText}>{formatBalance(parseFloat(amount))} {symbol}</Text>
          {usdValue != null && usdValue > 0 && (
            <Text style={styles.amountUsd}>{formatUsd(usdValue)}</Text>
          )}
        </View>

        <View style={styles.separator} />

        {/* Details */}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>From</Text>
          <View style={styles.detailValueCol}>
            {fromName && <Text style={styles.detailName}>{fromName}</Text>}
            <Text style={styles.detailAddr}>{shortAddr(from)}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To</Text>
          <View style={styles.detailValueCol}>
            {displayToName && <Text style={styles.detailName}>{displayToName}</Text>}
            <Text style={styles.detailAddr}>{shortAddr(to)}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network</Text>
          <Text style={styles.detailValue}>{chain}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Time</Text>
          <Text style={styles.detailValue}>{formatTime(timestamp)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Tx Hash</Text>
          <Text style={styles.detailAddr}>{shortAddr(txHash)}</Text>
        </View>

        {/* QR code */}
        <View style={styles.qrSection}>
          <QRCode value={explorerUrl} size={80} />
          <Text style={styles.qrHint}>Scan to view on explorer</Text>
        </View>

        {/* Branding footer — logo + website */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>VELA WALLET</Text>
          <Text style={styles.footerUrl}>getvela.app</Text>
        </View>
      </View>

      {/* Action buttons — outside the screenshot area */}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={handleCopyLink}>
          {copiedLink ? (
            <Check size={18} color={color.success.base} strokeWidth={2.5} />
          ) : (
            <Link size={18} color={color.fg.muted} strokeWidth={2} />
          )}
          <Text style={styles.actionText}>{copiedLink ? 'Copied' : 'Copy Link'}</Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={handleShare}>
          <Share2 size={18} color={color.fg.muted} strokeWidth={2} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>

      {/* Done button */}
      <Pressable style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = createStyles(() => ({
  screen: {
    flex: 1,
    backgroundColor: color.bg.base,
  },
  screenContent: {
    padding: space.xl,
    paddingBottom: 100,
  },
  receipt: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: space['2xl'],
    borderWidth: 1,
    borderColor: color.border.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.md,
  },
  headerTitle: {
    fontSize: text.sm,
    ...inter.bold,
    color: color.fg.base,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  headerNetwork: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  headerChain: {
    fontSize: text.xs,
    ...inter.medium,
    color: color.fg.muted,
  },
  separator: {
    height: 1,
    backgroundColor: color.border.base,
    marginVertical: space.lg,
  },
  amountSection: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
  },
  amountText: {
    fontSize: text['3xl'],
    ...inter.bold,
    fontFamily: font.display,
    color: color.fg.base,
    marginTop: space.sm,
  },
  amountUsd: {
    fontSize: text.base,
    ...inter.medium,
    color: color.fg.muted,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: space.md,
  },
  detailLabel: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.muted,
    minWidth: 70,
  },
  detailValueCol: {
    alignItems: 'flex-end' as const,
    flex: 1,
  },
  detailName: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.base,
    textAlign: 'right' as const,
  },
  detailAddr: {
    fontSize: text.sm,
    ...inter.medium,
    fontFamily: font.mono,
    color: color.fg.muted,
    textAlign: 'right' as const,
  },
  detailValue: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.base,
    textAlign: 'right' as const,
    flex: 1,
  },
  qrSection: {
    alignItems: 'center',
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: color.border.base,
    gap: space.sm,
  },
  qrHint: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
  footer: {
    alignItems: 'center',
    marginTop: space.xl,
    gap: 2,
  },
  footerLogo: {
    fontSize: text.sm,
    ...inter.bold,
    color: color.fg.muted,
    letterSpacing: 2,
  },
  footerUrl: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space['5xl'],
    marginTop: space['2xl'],
  },
  actionBtn: {
    alignItems: 'center',
    gap: space.sm,
  },
  actionText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.fg.muted,
  },
  doneBtn: {
    backgroundColor: color.fg.base,
    borderRadius: radius.xl,
    paddingVertical: space.xl,
    alignItems: 'center',
    marginTop: space['2xl'],
  },
  doneBtnText: {
    fontSize: text.lg,
    ...inter.semibold,
    color: color.fg.inverse,
  },
}));
