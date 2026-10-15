import React from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { Badge, Button } from '../components';
import { badgeFor, categoryLabel, friendlyDate, sourceName } from '../logic';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function DetailScreen({ recall, match, onBack, onHaveIt, onNotMine }) {
  const badge = badgeFor(recall);
  const products = recall.products.length ? recall.products : [{ name: recall.title, batchCodes: [] }];

  const share = () => {
    Share.share({ message: `${recall.title}\n\nCheck if you have this: ${recall.sourceUrl}` }).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.roundButton}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Share this recall" style={styles.roundButton}>
          <Ionicons name="share-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Badge text={badge.text} tone={badge.tone} />
          {recall.categories.slice(0, 2).map((c) => <Badge key={c} text={categoryLabel(c)} tone="info" />)}
        </View>
        <Text style={styles.title}>{recall.title}</Text>
        <Text style={type.small}>{friendlyDate(recall.publishedAt)} · {sourceName(recall.source)}</Text>

        {match ? (
          <View style={styles.matchNote}>
            <Ionicons name="alert-circle" size={20} color={colors.accent} />
            <Text style={styles.matchText}>
              This may match <Text style={{ fontWeight: '700' }}>{match.item.name}</Text> in your cupboard. Check the details below against your pack.
            </Text>
          </View>
        ) : null}

        {recall.summary ? (
          <Section title="What's wrong">
            <Text style={styles.body}>{recall.summary}</Text>
          </Section>
        ) : null}

        <Section title="Check your pack">
          {products.map((p, i) => (
            <View key={`${p.name}-${i}`} style={[styles.product, i > 0 && styles.productDivider]}>
              <Text style={[styles.body, { fontWeight: '600' }]}>{p.name}</Text>
              <View style={styles.facts}>
                <Fact label="Pack size" value={p.packSize} />
                <Fact label="Batch code" value={p.batchCodes && p.batchCodes.length ? p.batchCodes.join(', ') : null} />
                <Fact label="Best before" value={p.bestBefore} />
                <Fact label="Use by" value={p.useBy} />
                <Fact label="Barcode" value={p.barcode} />
              </View>
              {p.batchNotes ? <Text style={[type.small, { lineHeight: 19 }]}>{p.batchNotes}</Text> : null}
            </View>
          ))}
        </Section>

        {recall.advice ? (
          <Section title="What to do">
            <Text style={styles.body}>{recall.advice}</Text>
          </Section>
        ) : null}

        <Pressable onPress={() => Linking.openURL(recall.sourceUrl)} accessibilityRole="link" style={styles.sourceLink}>
          <Text style={styles.sourceText}>Read the official notice</Text>
          <Ionicons name="open-outline" size={16} color={colors.accent} />
        </Pressable>
        <Text style={[type.small, { lineHeight: 18 }]}>
          Source: {sourceName(recall.source)}. Contains public sector information licensed under the Open Government Licence v3.0. Heads Up Home is not a government service.
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Button label="I have this" icon="hand-left-outline" onPress={() => onHaveIt(recall)} style={{ flex: 1 }} />
        <Button label="Not mine" kind="secondary" onPress={() => onNotMine(recall)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: 24, gap: 14 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
  matchNote: { flexDirection: 'row', gap: 10, backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14 },
  matchText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.accentInk },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  body: { fontSize: 15, lineHeight: 21, color: '#374151' },
  product: { gap: space.sm },
  productDivider: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md, marginTop: space.xs },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  fact: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: '47%', flexGrow: 1 },
  factLabel: { fontSize: 12, color: colors.muted },
  factValue: { fontSize: 15, fontWeight: '600', color: colors.ink },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  sourceText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
