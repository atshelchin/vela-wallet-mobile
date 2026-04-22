import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { VelaColor, VelaFont, VelaRadius, VelaSpacing } from '@/constants/theme';
import { useWallet } from '@/models/wallet-state';
import { fetchNFTs } from '@/services/wallet-api';
import { type APINFT, nftId, nftDisplayName, nftImageURL } from '@/models/types';

type ViewMode = 'collections' | 'all';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = 12;
const GRID_PADDING = VelaSpacing.screenH;
const NUM_COLUMNS = 2;
const ITEM_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

interface NFTCollection {
  name: string;
  image: string | null;
  nfts: APINFT[];
}

function groupByCollection(nfts: APINFT[]): NFTCollection[] {
  const map = new Map<string, NFTCollection>();
  for (const nft of nfts) {
    const key = nft.collectionName ?? 'Unknown Collection';
    if (!map.has(key)) {
      map.set(key, { name: key, image: nft.collectionImage ?? nftImageURL(nft), nfts: [] });
    }
    map.get(key)!.nfts.push(nft);
  }
  // Sort by collection size descending
  return Array.from(map.values()).sort((a, b) => b.nfts.length - a.nfts.length);
}

function NFTThumbnail({ nft, onPress }: { nft: APINFT; onPress: () => void }) {
  const imageUrl = nftImageURL(nft);
  const displayName = nftDisplayName(nft);

  return (
    <TouchableOpacity style={styles.gridItem} onPress={onPress} activeOpacity={0.8}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.gridImage} resizeMode="cover" />
      ) : (
        <View style={styles.gridPlaceholder}>
          <Text style={styles.gridPlaceholderText}>NFT</Text>
        </View>
      )}
      <Text style={styles.gridName} numberOfLines={1}>{displayName}</Text>
    </TouchableOpacity>
  );
}

function CollectionCard({
  collection,
  onPress,
}: {
  collection: NFTCollection;
  onPress: () => void;
}) {
  const previewUrl = collection.image;
  return (
    <TouchableOpacity style={styles.collectionCard} onPress={onPress} activeOpacity={0.8}>
      {previewUrl ? (
        <Image source={{ uri: previewUrl }} style={styles.collectionImage} resizeMode="cover" />
      ) : (
        <View style={[styles.collectionImage, styles.collectionPlaceholder]}>
          <Text style={styles.collectionPlaceholderText}>
            {collection.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.collectionInfo}>
        <Text style={styles.collectionName} numberOfLines={1}>{collection.name}</Text>
        <Text style={styles.collectionCount}>{collection.nfts.length} item{collection.nfts.length !== 1 ? 's' : ''}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function NFTGalleryScreen() {
  const router = useRouter();
  const { activeAccount, state } = useWallet();
  const address = activeAccount?.address ?? state.address;

  const [nfts, setNfts] = useState<APINFT[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('collections');
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);

  const loadNFTs = useCallback(async () => {
    if (!address) return;
    try {
      const result = await fetchNFTs(address);
      setNfts(result);
    } catch {
      Alert.alert('Error', 'Failed to load NFTs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    loadNFTs();
  }, [loadNFTs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNFTs();
  }, [loadNFTs]);

  const collections = groupByCollection(nfts);

  const navigateToDetail = (nft: APINFT) => {
    router.push({
      pathname: '/nft-detail',
      params: {
        network: nft.network,
        chainName: nft.chainName,
        contractAddress: nft.contractAddress,
        tokenId: nft.tokenId,
        name: nft.name ?? '',
        description: nft.description ?? '',
        image: nft.image ?? '',
        tokenType: nft.tokenType,
        collectionName: nft.collectionName ?? '',
        collectionImage: nft.collectionImage ?? '',
      },
    });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.title}>NFTs</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'collections' && styles.toggleBtnActive]}
          onPress={() => {
            setViewMode('collections');
            setExpandedCollection(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleText, viewMode === 'collections' && styles.toggleTextActive]}>
            Collections
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'all' && styles.toggleBtnActive]}
          onPress={() => setViewMode('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleText, viewMode === 'all' && styles.toggleTextActive]}>
            All
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) return <Text style={styles.loadingText}>Loading NFTs...</Text>;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No NFTs found</Text>
        <Text style={styles.emptySubtext}>NFTs you own will appear here</Text>
      </View>
    );
  };

  // Collections view
  if (viewMode === 'collections' && !expandedCollection) {
    return (
      <ScreenContainer>
        <FlatList
          data={collections}
          keyExtractor={(item) => item.name}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => (
            <CollectionCard
              collection={item}
              onPress={() => {
                if (item.nfts.length === 1) {
                  navigateToDetail(item.nfts[0]);
                } else {
                  setExpandedCollection(item.name);
                }
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={VelaColor.accent} />
          }
          showsVerticalScrollIndicator={false}
        />
      </ScreenContainer>
    );
  }

  // Expanded collection or "All" view
  const displayNfts =
    expandedCollection
      ? collections.find((c) => c.name === expandedCollection)?.nfts ?? []
      : nfts;

  return (
    <ScreenContainer>
      <FlatList
        data={displayNfts}
        keyExtractor={(item) => nftId(item)}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.gridRow}
        ListHeaderComponent={() => (
          <View>
            {renderHeader()}
            {expandedCollection && (
              <TouchableOpacity
                style={styles.backRow}
                onPress={() => setExpandedCollection(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.backLink}>← All Collections</Text>
                <Text style={styles.expandedTitle}>{expandedCollection}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={renderEmpty}
        renderItem={({ item }) => (
          <NFTThumbnail nft={item} onPress={() => navigateToDetail(item)} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={VelaColor.accent} />
        }
        showsVerticalScrollIndicator={false}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 4,
  },
  title: {
    ...VelaFont.heading(28),
    color: VelaColor.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: VelaColor.bgWarm,
    borderRadius: VelaRadius.full,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: VelaRadius.full,
  },
  toggleBtnActive: {
    backgroundColor: VelaColor.bgCard,
  },
  toggleText: {
    ...VelaFont.label(13),
    color: VelaColor.textSecondary,
  },
  toggleTextActive: {
    color: VelaColor.textPrimary,
  },
  loadingText: {
    ...VelaFont.body(15),
    color: VelaColor.textSecondary,
    textAlign: 'center',
    marginTop: 60,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyText: {
    ...VelaFont.title(17),
    color: VelaColor.textSecondary,
  },
  emptySubtext: {
    ...VelaFont.body(14),
    color: VelaColor.textTertiary,
  },
  // Collection cards
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VelaColor.bgCard,
    borderRadius: VelaRadius.card,
    borderWidth: 1,
    borderColor: VelaColor.border,
    padding: 12,
    marginBottom: 12,
    gap: 14,
  },
  collectionImage: {
    width: 60,
    height: 60,
    borderRadius: VelaRadius.cardSmall,
    backgroundColor: VelaColor.bgWarm,
  },
  collectionPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionPlaceholderText: {
    ...VelaFont.heading(18),
    color: VelaColor.textTertiary,
  },
  collectionInfo: {
    flex: 1,
    gap: 4,
  },
  collectionName: {
    ...VelaFont.title(16),
    color: VelaColor.textPrimary,
  },
  collectionCount: {
    ...VelaFont.body(13),
    color: VelaColor.textSecondary,
  },
  // Grid
  gridRow: {
    gap: GRID_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    marginBottom: GRID_GAP,
  },
  gridImage: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    borderRadius: VelaRadius.cardSmall,
    backgroundColor: VelaColor.bgWarm,
  },
  gridPlaceholder: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    borderRadius: VelaRadius.cardSmall,
    backgroundColor: VelaColor.bgWarm,
    borderWidth: 1,
    borderColor: VelaColor.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridPlaceholderText: {
    ...VelaFont.heading(20),
    color: VelaColor.textTertiary,
  },
  gridName: {
    ...VelaFont.title(13),
    color: VelaColor.textPrimary,
    marginTop: 6,
  },
  // Back link in expanded collection
  backRow: {
    marginBottom: 16,
    gap: 4,
  },
  backLink: {
    ...VelaFont.title(14),
    color: VelaColor.accent,
  },
  expandedTitle: {
    ...VelaFont.heading(20),
    color: VelaColor.textPrimary,
  },
});
