import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Alert, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaCard } from '@/components/ui/VelaCard';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { shortAddr } from '@/models/types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IMAGE_SIZE = SCREEN_WIDTH - VelaSpacing.screenH * 2;

export default function NFTDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    network: string;
    chainName: string;
    contractAddress: string;
    tokenId: string;
    name: string;
    description: string;
    image: string;
    tokenType: string;
    collectionName: string;
    collectionImage: string;
  }>();

  const name = params.name || `#${params.tokenId}`;
  const description = params.description || '';
  const collectionName = params.collectionName || 'Unknown Collection';
  const tokenType = params.tokenType || 'ERC-721';
  const contractAddress = params.contractAddress ?? '';
  const tokenId = params.tokenId ?? '';
  const chainDisplayName = params.chainName ?? '';
  const network = params.network ?? '';

  // Resolve IPFS URLs
  let imageUrl = params.image || null;
  if (imageUrl && imageUrl.startsWith('ipfs://')) {
    imageUrl = `https://ipfs.io/ipfs/${imageUrl.slice(7)}`;
  }

  const copyContract = async () => {
    await Clipboard.setStringAsync(contractAddress);
    Alert.alert('Copied', 'Contract address copied to clipboard.');
  };

  const handleSendNFT = () => {
    Alert.alert('Coming Soon', 'NFT transfers are not yet available.');
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Nav bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={styles.backBtn}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{collectionName}</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* NFT Image */}
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.nftImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.nftImage, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}

        {/* Name and collection */}
        <Text style={styles.nftName}>{name}</Text>
        <Text style={styles.nftCollection}>{collectionName}</Text>

        {/* Description */}
        {description.length > 0 && (
          <VelaCard style={styles.descriptionCard}>
            <Text style={styles.descriptionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{description}</Text>
          </VelaCard>
        )}

        {/* Details */}
        <VelaCard style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Details</Text>

          <DetailRow label="Network" value={chainDisplayName} />
          <View style={styles.separator} />
          <DetailRow label="Token Type" value={tokenType} />
          <View style={styles.separator} />
          <DetailRow label="Token ID" value={tokenId.length > 12 ? `${tokenId.slice(0, 12)}...` : tokenId} />
          <View style={styles.separator} />
          <TouchableOpacity onPress={copyContract} activeOpacity={0.7}>
            <DetailRow label="Contract" value={shortAddr(contractAddress)} copyable />
          </TouchableOpacity>
        </VelaCard>

        {/* Send button */}
        <VelaButton
          title="Send NFT"
          onPress={handleSendNFT}
          variant="secondary"
          style={styles.sendBtn}
        />
      </ScrollView>
    </ScreenContainer>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueRow}>
        <Text style={styles.detailValue}>{value}</Text>
        {copyable && <Text style={styles.copyIcon}>⧉</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 100,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
  },
  backBtn: {
    ...VelaFont.title(16),
    color: VelaColor.accent,
    width: 50,
  },
  navTitle: {
    ...VelaFont.title(17),
    color: VelaColor.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  nftImage: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: VelaRadius.card,
    backgroundColor: VelaColor.bgWarm,
    marginBottom: 20,
    alignSelf: 'center',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: VelaColor.border,
  },
  placeholderText: {
    ...VelaFont.title(18),
    color: VelaColor.textTertiary,
  },
  nftName: {
    ...VelaFont.heading(24),
    color: VelaColor.textPrimary,
    marginBottom: 4,
  },
  nftCollection: {
    ...VelaFont.body(15),
    color: VelaColor.textSecondary,
    marginBottom: 20,
  },
  descriptionCard: {
    padding: VelaSpacing.cardPadding,
    marginBottom: 16,
  },
  descriptionLabel: {
    ...VelaFont.label(13),
    color: VelaColor.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descriptionText: {
    ...VelaFont.body(14),
    color: VelaColor.textPrimary,
    lineHeight: 22,
  },
  detailsCard: {
    padding: VelaSpacing.cardPadding,
    marginBottom: 24,
  },
  detailsTitle: {
    ...VelaFont.label(13),
    color: VelaColor.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: {
    ...VelaFont.body(14),
    color: VelaColor.textSecondary,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailValue: {
    ...VelaFont.title(14),
    color: VelaColor.textPrimary,
  },
  copyIcon: {
    fontSize: 14,
    color: VelaColor.accent,
  },
  separator: {
    height: 1,
    backgroundColor: VelaColor.border,
  },
  sendBtn: {
    marginTop: 4,
  },
});
