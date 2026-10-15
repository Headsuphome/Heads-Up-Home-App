import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, tones, type } from './theme';
import { badgeFor, friendlyDate, sourceShort } from './logic';

export function Badge({ text, tone = 'neutral' }) {
  const t = tones[tone] || tones.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [styles.chip, selected ? styles.chipOn : styles.chipOff, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, selected ? { color: '#FFFFFF', fontWeight: '600' } : null]}>{label}</Text>
    </Pressable>
  );
}

export function RecallCard({ recall, onPress, note }) {
  const badge = badgeFor(recall);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${recall.title}. ${badge.text}.`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.cardTop}>
        <Badge text={badge.text} tone={badge.tone} />
        <Text style={styles.meta}>{friendlyDate(recall.publishedAt)} · {sourceShort(recall.source)}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={3}>{recall.title}</Text>
      {recall.summary ? <Text style={styles.cardBody} numberOfLines={2}>{recall.summary}</Text> : null}
      {note ? (
        <View style={styles.note}>
          <Ionicons name="alert-circle" size={16} color={colors.accent} />
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SectionLabel({ children }) {
  return <Text style={[type.label, { marginBottom: space.sm }]}>{children}</Text>;
}

export function Button({ label, onPress, kind = 'primary', icon, style }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary, pressed && { opacity: 0.85 }, style]}
    >
      {icon ? <Ionicons name={icon} size={20} color={primary ? '#FFFFFF' : colors.ink} /> : null}
      <Text style={[styles.buttonText, { color: primary ? '#FFFFFF' : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ icon = 'checkmark-circle-outline', title, body }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Text style={[type.heading, { fontSize: 17, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.small, { textAlign: 'center', lineHeight: 19 }]}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, maxWidth: 220 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.lineStrong },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '500' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  meta: { fontSize: 12, color: colors.muted, flexShrink: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600', lineHeight: 21, color: colors.ink },
  cardBody: { fontSize: 14, lineHeight: 20, color: colors.muted },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  noteText: { fontSize: 13, fontWeight: '600', color: colors.accentInk, flexShrink: 1 },
  button: { minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  buttonText: { fontSize: 16, fontWeight: '600' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: 40, paddingHorizontal: space.xl },
});
