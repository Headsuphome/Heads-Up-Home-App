import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorFor, colors, radius, space, type } from '../theme';
import { Button, Chip, EmptyState, RecallCard } from '../components';
import { filterRecalls, recentCount } from '../logic';

const FILTERS = [
  { key: 'for-you', label: 'For you', icon: 'star' },
  { key: 'all', label: 'All' },
  { key: 'food-drink', label: 'Food', category: 'food-drink', icon: 'restaurant-outline' },
  { key: 'baby-children', label: 'Baby', category: 'baby-children', icon: 'happy-outline' },
  { key: 'medicines', label: 'Medicines', category: 'medicines', icon: 'medkit-outline' },
  { key: 'electrical', label: 'Electrical', category: 'electrical', icon: 'flash-outline' },
  { key: 'toys', label: 'Toys', category: 'toys', icon: 'cube-outline' },
  { key: 'trades-tools', label: 'Tools', category: 'trades-tools', icon: 'construct-outline' },
];

// The three coloured counts on the summary card.
const STATS = [
  { label: 'Food', match: (r) => r.categories.includes('food-drink'), category: 'food-drink' },
  { label: 'Products', match: (r) => !r.categories.includes('food-drink') && !r.categories.includes('medicines'), category: 'electrical' },
  { label: 'Medicines', match: (r) => r.categories.includes('medicines'), category: 'medicines' },
];

export default function HomeScreen({ recalls, loading, error, onRefresh, prefs, matches, openRecall, goTo }) {
  const [filter, setFilter] = useState('for-you');
  const matchedIds = useMemo(() => new Set(matches.map((m) => m.recall.id)), [matches]);
  const shown = useMemo(() => filterRecalls(recalls, filter, prefs, matchedIds), [recalls, filter, prefs, matchedIds]);
  const top = matches[0];
  const noPrefs = !prefs.categories.length && !prefs.allergens.length && !prefs.cupboard.length;
  const weekCount = useMemo(() => recentCount(recalls, 7), [recalls]);
  const monthRecalls = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    return recalls.filter((r) => new Date(r.publishedAt).getTime() >= since);
  }, [recalls]);

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <View style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Ionicons name="shield-checkmark" size={20} color={colors.ink} />
            </View>
            <Text style={styles.brandText}>Heads Up Home</Text>
          </View>
          <Pressable onPress={() => goTo('alerts')} accessibilityRole="button" accessibilityLabel="Alert settings" style={styles.heroButton}>
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={styles.heroNumber}>{weekCount}</Text>
          <Text style={styles.heroLabel}>{weekCount === 1 ? 'new UK recall in the last 7 days' : 'new UK recalls in the last 7 days'}</Text>
        </View>
        <Text style={styles.statCaption}>Last 30 days</Text>
        <View style={[styles.statRow, { marginTop: -8 }]}>
          {STATS.map((st) => {
            const c = colorFor(st.category);
            const n = monthRecalls.filter(st.match).length;
            return (
              <View key={st.label} style={[styles.stat, { backgroundColor: c.bg }]}>
                <Text style={[styles.statNumber, { color: c.fg }]}>{n}</Text>
                <Text style={[styles.statLabel, { color: c.fg }]}>{st.label}</Text>
              </View>
            );
          })}
        </View>
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
          <Chip key={f.key} label={f.label} icon={f.icon} category={f.category} selected={filter === f.key} onPress={() => setFilter(f.key)} />
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
  hero: { backgroundColor: colors.ink, borderRadius: 22, padding: space.xl, gap: space.lg },
  logo: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FDBA74', alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.4 },
  heroButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroNumber: { fontSize: 44, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroLabel: { fontSize: 15, color: '#CBD5E1' },
  statRow: { flexDirection: 'row', gap: space.sm },
  statCaption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: '#94A3B8' },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  statNumber: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600' },
  banner: { flexDirection: 'row', gap: 14, backgroundColor: colors.accentSoft, borderRadius: radius.lg + 2, padding: space.lg },
  bannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: colors.accentInk },
  bannerBody: { fontSize: 14, lineHeight: 20, color: colors.accentInk },
  setup: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
});
