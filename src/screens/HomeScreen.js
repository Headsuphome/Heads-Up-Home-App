import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { Button, Chip, EmptyState, RecallCard } from '../components';
import { filterRecalls } from '../logic';

const FILTERS = [
  { key: 'for-you', label: 'For you' },
  { key: 'all', label: 'All' },
  { key: 'food-drink', label: 'Food' },
  { key: 'baby-children', label: 'Baby' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'toys', label: 'Toys' },
  { key: 'trades-tools', label: 'Tools' },
];

export default function HomeScreen({ recalls, loading, error, onRefresh, prefs, matches, openRecall, goTo }) {
  const [filter, setFilter] = useState('for-you');
  const matchedIds = useMemo(() => new Set(matches.map((m) => m.recall.id)), [matches]);
  const shown = useMemo(() => filterRecalls(recalls, filter, prefs, matchedIds), [recalls, filter, prefs, matchedIds]);
  const top = matches[0];
  const noPrefs = !prefs.categories.length && !prefs.allergens.length && !prefs.cupboard.length;

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View style={styles.brandRow}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.brandText}>Heads Up Home</Text>
        </View>
        <Pressable onPress={() => goTo('alerts')} accessibilityRole="button" accessibilityLabel="Alert settings" style={styles.roundButton}>
          <Ionicons name="notifications-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {top ? (
        <Pressable onPress={() => openRecall(top.recall)} accessibilityRole="button" style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="warning" size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.bannerTitle}>
              {top.confidence === 'barcode' ? 'Recall: an item in your cupboard' : 'Possible match in your cupboard'}
            </Text>
            <Text style={styles.bannerBody}>
              {top.item.name} may be affected. Tap to check your pack.
              {matches.length > 1 ? ` (${matches.length - 1} more)` : ''}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {noPrefs ? (
        <View style={styles.setup}>
          <Text style={[type.body, { fontWeight: '600' }]}>Make this feed yours</Text>
          <Text style={type.small}>Pick the categories and allergens that matter to your home, and we'll put those recalls first.</Text>
          <Button label="Choose what to watch" kind="secondary" icon="options-outline" onPress={() => goTo('alerts')} />
        </View>
      ) : null}

      <Text style={type.heading}>Latest UK recalls</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>
    </View>
  );

  let empty = null;
  if (loading && !recalls.length) {
    empty = <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;
  } else if (error && !recalls.length) {
    empty = <EmptyState icon="cloud-offline-outline" title="Couldn't load recalls" body={`${error}\nPull down to try again.`} />;
  } else {
    empty = <EmptyState title="Nothing here right now" body="No recalls match this filter yet. We check for new ones every hour." />;
  }

  return (
    <FlatList
      data={shown}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <RecallCard recall={item} onPress={() => openRecall(item)} note={matchedIds.has(item.id) ? 'May match something in your cupboard' : null} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading && recalls.length > 0} onRefresh={onRefresh} tintColor={colors.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: space.xl, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: 14, backgroundColor: colors.accentSoft, borderRadius: radius.lg + 2, padding: space.lg },
  bannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: colors.accentInk },
  bannerBody: { fontSize: 14, lineHeight: 20, color: colors.accentInk },
  setup: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
});
