import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { Button, Chip, SectionLabel } from '../components';
import { ALLERGENS, CATEGORIES } from '../logic';
import { toggle } from '../storage';

const TIMINGS = [
  { key: 'instant', label: 'Instantly' },
  { key: 'daily', label: 'Daily summary' },
];

export default function AlertsScreen({ prefs, update, account = {}, onEnableAlerts, onTestAlert }) {
  const alertsOn = account.status === 'ready' && account.permission !== false;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ gap: 4 }}>
        <Text style={type.title}>My alerts</Text>
        <Text style={type.small}>Tell us what matters to you. Tap to switch each one on or off.</Text>
      </View>

      <View>
        <SectionLabel>Categories to watch</SectionLabel>
        <View style={styles.wrap}>
          {CATEGORIES.filter((c) => c.key !== 'other').map((c) => (
            <Chip key={c.key} label={c.label} category={c.key} icon={c.icon} selected={prefs.categories.includes(c.key)} onPress={() => update((p) => ({ categories: toggle(p.categories, c.key) }))} />
          ))}
        </View>
      </View>

      <View>
        <SectionLabel>Allergens in your household</SectionLabel>
        <View style={styles.wrap}>
          {ALLERGENS.map((a) => (
            <Chip key={a.key} label={a.label} selected={prefs.allergens.includes(a.key)} onPress={() => update((p) => ({ allergens: toggle(p.allergens, a.key) }))} />
          ))}
        </View>
      </View>

      <View>
        <SectionLabel>How should we tell you?</SectionLabel>
        <View style={styles.segment}>
          {TIMINGS.map((t) => {
            const on = prefs.timing === t.key;
            return (
              <Pressable key={t.key} onPress={() => update({ timing: t.key })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.segmentItem, on && styles.segmentOn]}>
                <Text style={[styles.segmentText, on && { color: colors.ink }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[type.small, { marginTop: space.sm, lineHeight: 19 }]}>
          Allergy and cupboard alerts are always sent straight away, because they're about safety.
        </Text>
      </View>

      <View style={styles.account}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.accountIcon, { backgroundColor: alertsOn ? colors.okSoft : colors.accentSoft }]}>
            <Ionicons name={alertsOn ? 'notifications' : 'notifications-off-outline'} size={22} color={alertsOn ? colors.ok : colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>{alertsOn ? 'Alerts are on' : 'Alerts are off'}</Text>
            <Text style={type.small}>{alertsOn ? 'Private account, no email needed' : 'Turn on to hear about recalls that matter to you'}</Text>
          </View>
        </View>
        {account.note ? <Text style={[type.small, { lineHeight: 19 }]}>{account.note}</Text> : null}
        {!alertsOn ? <Button label="Turn on alerts" icon="notifications-outline" onPress={onEnableAlerts} /> : null}
        <Button label="Send me a test alert" kind="secondary" icon="paper-plane-outline" onPress={onTestAlert} />
        <Text style={[type.small, { lineHeight: 19 }]}>
          Adding your email, so you keep your cupboard on a new phone, is coming soon.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, paddingBottom: 40, gap: space.xl },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: colors.line },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  account: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  accountIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
