import React, { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorFor, colors, radius, space, type } from '../theme';
import { Button, CategoryIcon, Chip, SectionLabel } from '../components';
import { ALLERGENS, CATEGORIES } from '../logic';
import { toggle } from '../storage';
import { PRICES, TRIAL_DAYS, startTrial } from '../plans';
import { PRIVACY_URL } from '../config';

const PROMISES = [
  { icon: 'albums-outline', category: 'electrical', text: 'Every UK recall in one place: food, products, medicines and pets' },
  { icon: 'notifications-outline', category: 'food-drink', text: 'Alerts for the things you own and the allergens you avoid' },
  { icon: 'lock-closed-outline', category: 'medicines', text: 'No sign-up form. Your choices stay private.' },
];

function Dots({ step }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of 4`}>
      {[0, 1, 2, 3].map((i) => <View key={i} style={[styles.dot, i === step && styles.dotOn]} />)}
    </View>
  );
}

export default function OnboardingScreen({ prefs, update, onEnableAlerts, onFinish }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, note }

  const turnOn = async () => {
    setBusy(true);
    const r = await onEnableAlerts();
    setResult(r);
    setBusy(false);
  };

  if (step === 0) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Dots step={0} />
        <View style={styles.heroArt} accessibilityElementsHidden importantForAccessibility="no">
          {['food-drink', 'baby-children', 'medicines', 'electrical', 'toys'].map((k, i) => (
            <View key={k} style={[styles.bubble, { backgroundColor: colorFor(k).bg, transform: [{ translateY: i % 2 ? 10 : -6 }] }]}>
              <Ionicons name={CATEGORIES.find((c) => c.key === k).icon} size={26} color={colorFor(k).fg} />
            </View>
          ))}
        </View>
        <Text style={styles.title}>Know when something in your home is recalled</Text>
        <View style={styles.factBox}>
          <Text style={styles.factFigure}>10–20%</Text>
          <Text style={[type.body, { flex: 1, lineHeight: 21 }]}>Typically only 10–20% of recalled products are returned or fixed, and many people never hear about the recall. Heads Up Home makes sure you do.</Text>
        </View>
        <View style={{ gap: space.md }}>
          {PROMISES.map((p) => (
            <View key={p.text} style={styles.promise}>
              <CategoryIcon category={p.category} icon={p.icon} size={40} />
              <Text style={[type.body, { flex: 1 }]}>{p.text}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        <Button label="Get started" onPress={() => setStep(1)} />
        <Text style={[type.small, { textAlign: 'center', lineHeight: 19 }]}>
          Heads Up Home is an independent app, not a government service.{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>Privacy policy</Text>
        </Text>
      </ScrollView>
    );
  }

  if (step === 1) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Dots step={1} />
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>What should we watch for you?</Text>
          <Text style={type.small}>Pick as many as you like. You can change these any time in My alerts.</Text>
        </View>
        <View>
          <SectionLabel>Categories</SectionLabel>
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
          <Text style={[type.small, { lineHeight: 19, marginTop: space.md }]}>
            Allergies count as health information. We only use your choices to find recalls for you, and you can change or clear them at any time.
          </Text>
        </View>
        <Button label="Next" onPress={() => setStep(2)} />
      </ScrollView>
    );
  }

  if (step === 3) {
    const tryIt = () => {
      const changes = startTrial(prefs);
      if (changes) update(changes);
      onFinish();
    };
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <Dots step={3} />
        <View style={[styles.bell, { backgroundColor: '#FFEDD5' }]}>
          <Ionicons name="sparkles" size={42} color={colors.accent} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={styles.title}>Try Premium free for {TRIAL_DAYS} days</Text>
          <Text style={type.body}>An unlimited cupboard for everything in your home, with receipt scanning and family sharing on the way.</Text>
          <Text style={type.small}>No payment details needed. After the trial you keep everything in Free, or carry on with Premium from {PRICES.premiumMonthly} a month.</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 10 }}>
          <Button label="Start my free trial" icon="sparkles-outline" onPress={tryIt} />
          <Button label="Maybe later" kind="secondary" onPress={onFinish} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Dots step={2} />
      <View style={styles.bell}>
        <Ionicons name="notifications" size={44} color={colors.accent} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={styles.title}>Turn on recall alerts</Text>
        <Text style={type.body}>
          We'll let you know when something you own, or something you've asked us to watch, is recalled. Allergy and cupboard alerts always come straight away.
        </Text>
        <Text style={type.small}>
          This sets up a private account for you automatically, with no email or password. Your choices and cupboard are copied to it, so we can check new recalls for you while the app is closed.
        </Text>
      </View>

      {result ? (
        <View style={[styles.result, { backgroundColor: result.ok ? colors.okSoft : colors.accentSoft }]}>
          <Ionicons name={result.ok ? 'checkmark-circle' : 'information-circle'} size={22} color={result.ok ? colors.ok : colors.accent} />
          <Text style={[type.body, { flex: 1, color: result.ok ? colors.okInk : colors.accentInk }]}>
            {result.note || 'Alerts are on. You\'re all set.'}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      {!result ? (
        <View style={{ gap: 10 }}>
          <Button label="Turn on alerts" icon="notifications-outline" onPress={turnOn} />
          <Button label="Not now" kind="secondary" onPress={() => setStep(3)} />
        </View>
      ) : (
        <Button label="Next" onPress={() => setStep(3)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: space.xl, paddingTop: space.lg, gap: space.xl },
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { width: 24, backgroundColor: colors.accent },
  heroArt: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: space.lg },
  bubble: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bell: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: space.lg },
  result: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md },
  link: { color: colors.accent, fontWeight: '600', textDecorationLine: 'underline' },
  factBox: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: 14 },
  factFigure: { fontSize: 22, fontWeight: '800', color: colors.accent, letterSpacing: -0.5 },
});
