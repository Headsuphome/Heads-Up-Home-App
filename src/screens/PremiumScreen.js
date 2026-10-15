import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';
import { Button } from '../components';
import { PLANS, PRICES, TRIAL_DAYS, currentPlan, planLabel, startTrial, trialDaysLeft } from '../plans';

const ACCENT = { free: '#475569', premium: '#C2410C', trade: '#0369A1' };

function PlanCard({ plan, current, children }) {
  return (
    <View style={[styles.plan, current && { borderColor: ACCENT[plan.key], borderWidth: 2 }]}>
      <View style={styles.planTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.planName, { color: ACCENT[plan.key] }]}>{plan.name}</Text>
          <Text style={type.small}>{plan.tagline}</Text>
        </View>
        {current ? (
          <View style={[styles.currentTag, { backgroundColor: ACCENT[plan.key] }]}>
            <Text style={styles.currentText}>Your plan</Text>
          </View>
        ) : null}
      </View>
      <View>
        <Text style={styles.price}>{plan.price}</Text>
        {plan.priceNote ? <Text style={type.small}>{plan.priceNote}</Text> : null}
      </View>
      <View style={{ gap: 8 }}>
        {plan.features.map((f) => (
          <View key={f.text} style={styles.feature}>
            <Ionicons name={f.ready ? 'checkmark-circle' : 'time-outline'} size={18} color={f.ready ? colors.ok : colors.muted} />
            <Text style={[type.body, { flex: 1, color: f.ready ? colors.ink : colors.muted }]}>
              {f.text}{f.ready ? '' : ' (coming soon)'}
            </Text>
          </View>
        ))}
      </View>
      {children}
    </View>
  );
}

export default function PremiumScreen({ prefs, update, onClose, reason }) {
  const [message, setMessage] = useState(null);
  const plan = currentPlan(prefs);
  const days = trialDaysLeft(prefs);

  const trial = () => {
    const changes = startTrial(prefs);
    if (!changes) return;
    update(changes);
    setMessage(`Premium is on for ${TRIAL_DAYS} days. Enjoy the unlimited cupboard.`);
  };

  const notYet = () => setMessage('Payments open when Heads Up Home launches in the app stores. Until then, everything is free to try.');

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.roundButton}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.planNow}>{planLabel(prefs)}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 6 }}>
          <Text style={type.title}>Choose your plan</Text>
          <Text style={type.small}>Recall alerts that keep you safe are always free. Premium and Trade add convenience for busy homes and businesses.</Text>
        </View>

        {reason ? (
          <View style={styles.reason}>
            <Ionicons name="information-circle" size={20} color={colors.accentInk} />
            <Text style={[type.body, { flex: 1, color: colors.accentInk }]}>{reason}</Text>
          </View>
        ) : null}

        {message ? (
          <View style={styles.message}>
            <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
            <Text style={[type.body, { flex: 1, color: colors.okInk }]}>{message}</Text>
          </View>
        ) : null}

        <PlanCard plan={PLANS[1]} current={plan === 'premium'}>
          {plan === 'free' && !prefs.trialUsed ? (
            <Button label={`Try Premium free for ${TRIAL_DAYS} days`} icon="sparkles-outline" onPress={trial} />
          ) : plan === 'premium' && days > 0 ? (
            <Button label={`Keep Premium after your trial (${PRICES.premiumYearly} a year)`} kind="secondary" onPress={notYet} />
          ) : plan !== 'premium' ? (
            <Button label={`Get Premium (${PRICES.premiumMonthly} a month)`} onPress={notYet} />
          ) : null}
        </PlanCard>

        <PlanCard plan={PLANS[2]} current={plan === 'trade'}>
          <Button label="I'm interested in Trade" kind="secondary" onPress={() => setMessage('Thanks! Trade is in development. Email support@headsuphome.co.uk and we\'ll let you know first.')} />
        </PlanCard>

        <PlanCard plan={PLANS[0]} current={plan === 'free'} />

        <Text style={[type.small, { lineHeight: 19 }]}>
          Subscriptions will be through the App Store or Google Play, and you can cancel any time in your phone's settings. The free trial doesn't need any payment details.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  planNow: { fontSize: 13, fontWeight: '600', color: colors.muted },
  content: { paddingHorizontal: space.xl, paddingBottom: 40, gap: space.lg },
  plan: { backgroundColor: colors.surface, borderRadius: radius.lg + 2, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.md },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  planName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  currentTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  currentText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  price: { fontSize: 20, fontWeight: '700', color: colors.ink },
  feature: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  reason: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  message: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.okSoft },
});
