import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorFor, colors, radius, space, type } from '../theme';
import { EmptyState, RecallCard, SectionLabel } from '../components';
import { CATEGORIES, categoryLabel, searchRecalls } from '../logic';
import { searchAllRecalls } from '../api';

export default function BrowseScreen({ recalls, openRecall, openScan }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(null);
  const [remote, setRemote] = useState([]);

  // Also search older recalls on the server once the person has typed a few letters.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setRemote([]); return undefined; }
    const timer = setTimeout(() => {
      searchAllRecalls(q).then(setRemote).catch(() => setRemote([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    let list = recalls;
    if (query.trim()) {
      const local = searchRecalls(recalls, query);
      const seen = new Set(local.map((r) => r.id));
      list = [...local, ...remote.filter((r) => !seen.has(r.id))];
    }
    if (category) list = list.filter((r) => r.categories.includes(category));
    return list;
  }, [recalls, query, remote, category]);

  const counts = useMemo(() => {
    const c = {};
    for (const r of recalls) for (const k of r.categories) c[k] = (c[k] || 0) + 1;
    return c;
  }, [recalls]);

  const showingResults = !!query.trim() || !!category;

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <Text style={type.title}>Browse recalls</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a product or brand"
          placeholderTextColor="#6B7280"
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search recalls"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={12}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : (
          <Pressable onPress={() => openScan('check')} accessibilityRole="button" accessibilityLabel="Scan a barcode to check a product" hitSlop={12} style={styles.scanButton}>
            <Ionicons name="barcode-outline" size={22} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {category ? (
        <Pressable onPress={() => setCategory(null)} style={styles.activeCategory} accessibilityRole="button">
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
          <Text style={[type.body, { fontWeight: '600' }]}>{categoryLabel(category)}</Text>
        </Pressable>
      ) : null}

      {!showingResults ? (
        <View>
          <SectionLabel>Categories</SectionLabel>
          <View style={styles.grid}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.key} onPress={() => setCategory(c.key)} accessibilityRole="button" style={({ pressed }) => [styles.tile, { backgroundColor: colorFor(c.key).bg, borderColor: colorFor(c.key).bg }, pressed && { opacity: 0.85 }]}>
                <View style={styles.tileIcon}>
                  <Ionicons name={c.icon} size={22} color={colorFor(c.key).fg} />
                </View>
                <View>
                  <Text style={[styles.tileLabel, { color: colorFor(c.key).fg }]}>{c.label}</Text>
                  <Text style={[type.small, { color: colorFor(c.key).fg }]}>{counts[c.key] || 0} recent</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={() => Linking.openURL('https://www.gov.uk/check-vehicle-recall')}
            accessibilityRole="link"
            style={({ pressed }) => [styles.vehicle, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="car-outline" size={26} color={colors.ink} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.tileLabel}>Cars, car seats and tyres</Text>
              <Text style={type.small}>Check on the government's official vehicle recall service</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <Text style={type.small}>{results.length} {results.length === 1 ? 'recall' : 'recalls'}</Text>
      )}
    </View>
  );

  return (
    <FlatList
      data={showingResults ? results : []}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <RecallCard recall={item} onPress={() => openRecall(item)} />}
      ListHeaderComponent={header}
      ListEmptyComponent={showingResults ? <EmptyState icon="search-outline" title="No recalls found" body="Try a different word, such as the brand or the type of product." /> : null}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      contentContainerStyle={{ padding: space.xl, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  scanButton: { paddingLeft: 6, paddingVertical: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, minHeight: 92, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, justifyContent: 'space-between', gap: space.sm },
  tileLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  activeCategory: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
