import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, radius, space, type } from '../theme';
import { Button, Chip, SectionLabel } from '../components';
import { ALLERGENS, CATEGORIES } from '../logic';
import { toggle } from '../storage';
import { isPremium, planLabel } from '../plans';
import { DATA_SOURCES, PRIVACY_URL, SUPPORT_EMAIL, SUPPORT_URL } from '../config';

function LinkRow({ icon, label, onPress, divider, inApp }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={inApp ? 'button' : 'link'} style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={colors.ink} />
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name={inApp ? 'chevron-forward' : 'open-outline'} size={16} color={colors.muted} />
    </Pressable>
  );
}

const TIMINGS = [
  { key: 'instant', label: 'Instantly' },
  { key: 'daily', label: 'Daily summary' },
];

export default function AlertsScreen({ prefs, update, account = {}, onEnableAlerts, onTestAlert, onDeleteData, openPremium, openWhy }) {
  const alertsOn = account.status === 'ready' && account.permission !== false;
  const [deleting, setDeleting] = useState(false);
  const version = (Constants.expoConfig && Constants.expoConfig.version) || null;
  const open = (url) => Linking.openURL(url).catch(() => {});

  const confirmDelete = () => {
    Alert.alert(
      'Delete all your data?',
      'This removes your private account, your choices, your cupboard and your alert history from our server and from this phone. You\'ll stop getting alerts. It can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDeleteData();
            } catch (e) {
              setDeleting(false);
              Alert.alert('Couldn\'t delete your data', `Sorry, ${e.message}. Please check your connection and try again, or email ${SUPPORT_EMAIL} and we'll delete it for you.`);
            }
          },
        },
      ],
    );
  };

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

      <Pressable onPress={() => openPremium()} accessibilityRole="button" style={styles.planCard}>
        <Ionicons name="sparkles" size={22} color="#FDBA74" />
        <View style={{ flex: 1 }}>
          <Text style={styles.planTitle}>{planLabel(prefs)}</Text>
          <Text style={styles.planSub}>{isPremium(prefs) ? 'Unlimited cupboard and Premium features' : 'See what Premium and Trade add'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
      </Pressable>

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
        {account.userId ? (
          <Text selectable style={[type.small, { lineHeight: 19 }]}>Account number: {account.userId}</Text>
        ) : null}
        {account.preview && alertsOn && !account.note ? (
          <Text style={[type.small, { lineHeight: 19 }]}>This is a preview. Real alerts arrive in the installed app.</Text>
        ) : null}
        {!alertsOn ? <Button label="Turn on alerts" icon="notifications-outline" onPress={onEnableAlerts} /> : null}
        <Button label="Send me a test alert" kind="secondary" icon="paper-plane-outline" onPress={onTestAlert} />
        <Text style={[type.small, { lineHeight: 19 }]}>
          Adding your email, so you keep your cupboard on a new phone, is coming soon.
        </Text>
      </View>

      <View>
        <SectionLabel>About Heads Up Home</SectionLabel>
        <View style={styles.list}>
          <LinkRow icon="heart-outline" label="Why it matters, and tell a friend" onPress={openWhy} inApp />
          <LinkRow icon="help-circle-outline" label="Help and support" onPress={() => open(SUPPORT_URL)} divider />
          <LinkRow icon="lock-closed-outline" label="Privacy policy" onPress={() => open(PRIVACY_URL)} divider />
          <LinkRow icon="mail-outline" label={`Email ${SUPPORT_EMAIL}`} onPress={() => open(`mailto:${SUPPORT_EMAIL}`)} divider />
        </View>
        <Text style={[type.small, styles.about]}>
          Heads Up Home is an independent app. It isn't run by, or connected to, the government or any of the organisations below. We collect their public recall notices every hour and always link to the original, so you can check it for yourself.
        </Text>
        <View style={styles.sources}>
          {DATA_SOURCES.map((src) => (
            <Pressable key={src.name} onPress={() => open(src.url)} accessibilityRole="link" style={styles.sourceRow}>
              <Text style={styles.sourceText}>{src.name}</Text>
              <Ionicons name="open-outline" size={14} color={colors.accent} />
            </Pressable>
          ))}
        </View>
        <Text style={[type.small, styles.about]}>
          Contains public sector information licensed under the Open Government Licence v3.0.
        </Text>
      </View>

      <View style={styles.danger}>
        <Text style={[type.body, { fontWeight: '700' }]}>Delete my data</Text>
        <Text style={[type.small, { lineHeight: 19 }]}>
          Removes your account, choices, cupboard and alert history from our server and this phone.
        </Text>
        {deleting ? <ActivityIndicator color={colors.accent} /> : (
          <Button label="Delete my data" kind="secondary" icon="trash-outline" onPress={confirmDelete} />
        )}
      </View>

      {version ? <Text style={[type.small, { textAlign: 'center' }]}>Heads Up Home {version}</Text> : null}
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
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.ink },
  planTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  planSub: { fontSize: 13, color: '#CBD5E1' },
  account: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  accountIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EEF1F4' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.ink },
  about: { lineHeight: 19, marginTop: space.md },
  sources: { marginTop: space.sm, gap: 2 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  sourceText: { fontSize: 14, fontWeight: '600', color: colors.accent },
  danger: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});
