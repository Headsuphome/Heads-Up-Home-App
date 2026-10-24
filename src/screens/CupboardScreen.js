import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { Button, EmptyState, SectionLabel } from '../components';
import { newId } from '../storage';
import { FREE_CUPBOARD_LIMIT, canAddToCupboard, isPremium } from '../plans';

export default function CupboardScreen({ prefs, update, matches, recallsById, openRecall, openPremium, openScan }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

  const matchByItem = {};
  for (const m of matches) if (!matchByItem[m.item.id]) matchByItem[m.item.id] = m;
  const needs = prefs.cupboard.filter((i) => matchByItem[i.id]);
  const clear = prefs.cupboard.filter((i) => !matchByItem[i.id]);
  const flagged = (prefs.flagged || []).filter((f) => recallsById[f.recallId] || f.title);

  const premium = isPremium(prefs);
  const canAdd = canAddToCupboard(prefs);
  const fullMessage = `Your free cupboard holds ${FREE_CUPBOARD_LIMIT} items. Premium gives you an unlimited cupboard.`;

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (!canAddToCupboard(prefs)) { setAdding(false); openPremium(fullMessage); return; }
    update((p) => ({ cupboard: [{ id: newId(), name: n, brand: brand.trim() || null, barcode: null, dismissed: [], addedAt: new Date().toISOString() }, ...p.cupboard] }));
    setName('');
    setBrand('');
    setAdding(false);
  };

  const remove = (item) => {
    Alert.alert('Remove from cupboard?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => update((p) => ({ cupboard: p.cupboard.filter((i) => i.id !== item.id) })) },
    ]);
  };

  const doneWith = (recallId) => update((p) => ({ flagged: (p.flagged || []).filter((f) => f.recallId !== recallId) }));

  const soon = (what) => Alert.alert(`${what} is coming soon`, `It'll be part of Premium. For now, scan the barcode or type the product name and brand.`);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 4 }}>
        <Text style={type.title}>My cupboard</Text>
        <Text style={type.small}>Add what's in your home, and we'll check it against every new UK recall.</Text>
      </View>

      {adding ? (
        <View style={styles.form}>
          <Text style={styles.inputLabel}>Product</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Baby rice cereal 200g" placeholderTextColor="#6B7280" style={styles.input} autoFocus accessibilityLabel="Product name" />
          <Text style={styles.inputLabel}>Brand (helps us match accurately)</Text>
          <TextInput value={brand} onChangeText={setBrand} placeholder="e.g. Ella's Kitchen" placeholderTextColor="#6B7280" style={styles.input} accessibilityLabel="Brand" onSubmitEditing={save} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Add" icon="add" onPress={save} style={{ flex: 1 }} />
            <Button label="Cancel" kind="secondary" onPress={() => setAdding(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {canAdd ? (
            <Button label="Add an item" icon="add-circle-outline" onPress={() => setAdding(true)} />
          ) : (
            <Pressable onPress={() => openPremium(fullMessage)} accessibilityRole="button" style={styles.full}>
              <Ionicons name="sparkles" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '700', color: colors.accentInk }]}>Your cupboard is full</Text>
                <Text style={[type.small, { color: colors.accentInk }]}>Go Premium for an unlimited cupboard</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.accentInk} />
            </Pressable>
          )}
          {!premium ? (
            <Text style={[type.small, { textAlign: 'center' }]}>{prefs.cupboard.length} of {FREE_CUPBOARD_LIMIT} free items used</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => (canAdd ? openScan('add') : openPremium(fullMessage))} style={styles.scan} accessibilityRole="button">
              <Ionicons name="barcode-outline" size={24} color={colors.accent} />
              <Text style={styles.scanText}>Scan a barcode</Text>
              <Text style={styles.scanTag}>Adds it in seconds</Text>
            </Pressable>
            <Pressable onPress={() => soon('Receipt scanning')} style={styles.soon} accessibilityRole="button">
              <Ionicons name="receipt-outline" size={22} color={colors.muted} />
              <Text style={styles.soonText}>Snap a receipt</Text>
              <Text style={styles.soonTag}>Premium · coming soon</Text>
            </Pressable>
          </View>
        </View>
      )}

      {flagged.length ? (
        <View>
          <SectionLabel>To sort out</SectionLabel>
          <View style={styles.list}>
            {flagged.map((f, i) => {
              const recall = recallsById[f.recallId];
              return (
                <View key={f.recallId} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <Pressable style={{ flex: 1 }} onPress={() => recall && openRecall(recall)} accessibilityRole="button">
                    <Text style={styles.rowTitle} numberOfLines={2}>{recall ? recall.title : f.title}</Text>
                    <Text style={[styles.rowMeta, { color: colors.accentInk }]}>Follow the "What to do" advice</Text>
                  </Pressable>
                  <Pressable onPress={() => doneWith(f.recallId)} style={styles.doneButton} accessibilityRole="button" accessibilityLabel="Mark as sorted">
                    <Text style={styles.doneText}>Done</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {needs.length ? (
        <View>
          <SectionLabel>Needs checking</SectionLabel>
          <View style={{ gap: 8 }}>
            {needs.map((item) => {
              const m = matchByItem[item.id];
              return (
                <Pressable key={item.id} onPress={() => openRecall(m.recall)} style={styles.alertRow} accessibilityRole="button">
                  <View style={styles.alertIcon}>
                    <Ionicons name="warning-outline" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={[styles.rowMeta, { color: colors.accentInk, fontWeight: '600' }]}>
                      {m.confidence === 'barcode' ? 'Recalled · see what to do' : 'Possible recall · check batch code'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View>
        <SectionLabel>{needs.length ? 'All clear' : 'Your items'}</SectionLabel>
        {clear.length ? (
          <View style={styles.list}>
            {clear.map((item, i) => (
              <View key={item.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.dot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  {item.brand ? <Text style={styles.rowMeta}>{item.brand}</Text> : null}
                </View>
                <Text style={styles.okText}>No recalls</Text>
                <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityLabel={`Remove ${item.name}`} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : needs.length ? null : (
          <EmptyState icon="file-tray-outline" title="Your cupboard is empty" body="Add things you've bought, like baby food, chargers or toys. If any of them is recalled, it'll show up here and on your home screen." />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 40, gap: space.xl },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.bg, marginBottom: 6 },
  soon: { flex: 1, minHeight: 88, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 },
  soonText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  full: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.accentSoft },
  soonTag: { fontSize: 11, color: colors.muted },
  scan: { flex: 1, minHeight: 88, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 10 },
  scanText: { fontSize: 14, fontWeight: '700', color: colors.accentInk },
  scanTag: { fontSize: 11, color: colors.accentInk },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EEF1F4' },
  rowTitle: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  rowMeta: { fontSize: 13, color: colors.muted },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ok },
  okText: { fontSize: 12, fontWeight: '600', color: colors.okInk },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.accent, borderRadius: radius.lg, padding: 12 },
  alertIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  doneButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: 'center' },
  doneText: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
