import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colorFor, colors, radius, space, type } from '../theme';
import { Button } from '../components';
import { impactStats, recentCount } from '../logic';
import { WEBSITE_URL } from '../config';

// Research on why recalls so often fail to reach people. Each figure links to its source,
// so anyone can check it. Keep these in step with the website (scripts/build-website.py).
export const FACTS = [
  {
    figure: '10–20%',
    text: 'Typically only 10–20% of recalled products are returned or fixed. The rest stay in people\'s homes.',
    source: 'UK Government research (BEIS), 2020',
    url: 'https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/923601/recall-effectiveness-report.pdf',
  },
  {
    figure: '54%',
    text: 'Only about half of UK adults had seen any product recall or safety warning in the past two years.',
    source: 'Office for Product Safety and Standards survey, 2022',
    url: 'https://assets.publishing.service.gov.uk/media/657852770467eb001355f5d0/opss-product-safety-and-consumers-wave-5-main-report.pdf',
  },
  {
    figure: '23%',
    text: 'Only 23% of adults always register new electrical appliances, which is how manufacturers find you when one is recalled.',
    source: 'Electrical Safety First and Ipsos MORI, 2017',
    url: 'https://www.electricalsafetyfirst.org.uk/press-and-media/nearly-three-quarters-of-consumers-risk-missing-dangerous-product-recalls/',
  },
];

const HELPS = [
  { icon: 'time-outline', text: 'Checks every official UK recall source every hour, so you don\'t have to' },
  { icon: 'notifications-outline', text: 'Alerts you straight away about your allergies and the things in your cupboard' },
  { icon: 'barcode-outline', text: 'Scan a barcode in the shop and know in seconds if it\'s been recalled' },
  { icon: 'checkmark-done-outline', text: 'Tells you exactly what to do, like how to get your money back' },
  { icon: 'heart-outline', text: 'Safety alerts are free, with no sign-up form and no adverts' },
];

const SHARE_MESSAGE = `I use Heads Up Home to get alerts when food, products, medicines or pet items are recalled in the UK, including for allergies. Most recalled products never get returned because people don't hear about them. Have a look: ${WEBSITE_URL}`;

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => { const d = new Date(iso); return `${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`; };

function Stat({ value, label, category }) {
  const c = colorFor(category);
  return (
    <View style={[styles.stat, { backgroundColor: c.bg }]}>
      <Text style={[styles.statNumber, { color: c.fg }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export default function WhyScreen({ recalls, prefs, matches, onClose }) {
  const matchedIds = useMemo(() => new Set(matches.map((m) => m.recall.id)), [matches]);
  const mine = useMemo(() => impactStats(recalls, prefs, matchedIds), [recalls, prefs, matchedIds]);
  const month = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    const list = recalls.filter((r) => new Date(r.publishedAt).getTime() >= since);
    return {
      all: list.length,
      food: list.filter((r) => r.categories.includes('food-drink')).length,
      medicines: list.filter((r) => r.categories.includes('medicines')).length,
      allergy: list.filter((r) => r.alertType === 'allergy' || r.allergens.length).length,
    };
  }, [recalls]);
  const week = useMemo(() => recentCount(recalls, 7), [recalls]);

  const share = () => Share.share({ message: SHARE_MESSAGE }).catch(() => {});

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.roundButton}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 6 }}>
          <Text style={type.title}>Why it matters</Text>
          <Text style={[type.body, { lineHeight: 22 }]}>A recall only keeps you safe if you hear about it. Most of the time, people don't.</Text>
        </View>

        {FACTS.map((f) => (
          <View key={f.figure} style={styles.fact}>
            <Text style={styles.figure}>{f.figure}</Text>
            <Text style={styles.factText}>{f.text}</Text>
            <Pressable onPress={() => Linking.openURL(f.url).catch(() => {})} accessibilityRole="link" hitSlop={8} style={styles.sourceRow}>
              <Text style={styles.source}>Source: {f.source}</Text>
              <Ionicons name="open-outline" size={13} color={colors.muted} />
            </Pressable>
          </View>
        ))}

        <View style={styles.live}>
          <Text style={styles.liveTitle}>Right now</Text>
          <Text style={styles.liveBody}>
            {month.all} UK recalls in the last 30 days, {week} of them in the last week. Recalls happen all the time, for things in ordinary homes.
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat value={month.food} label="Food" category="food-drink" />
            <Stat value={month.allergy} label="Allergy" category="baby-children" />
            <Stat value={month.medicines} label="Medicines" category="medicines" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How Heads Up Home helps</Text>
          {HELPS.map((h) => (
            <View key={h.text} style={styles.help}>
              <Ionicons name={h.icon} size={20} color={colors.accent} />
              <Text style={[type.body, { flex: 1, lineHeight: 21 }]}>{h.text}</Text>
            </View>
          ))}
        </View>

        {mine.since ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Heads Up Home</Text>
            <Text style={[type.body, { lineHeight: 22 }]}>
              Since {shortDate(mine.since)} we've checked {mine.checked} new {mine.checked === 1 ? 'recall' : 'recalls'} for you, and {mine.relevant} matched what you asked us to watch.
            </Text>
            <Text style={[type.small, { lineHeight: 19 }]}>
              You're watching {mine.cupboard} cupboard {mine.cupboard === 1 ? 'item' : 'items'}, {mine.allergens} {mine.allergens === 1 ? 'allergen' : 'allergens'} and {mine.categories} {mine.categories === 1 ? 'category' : 'categories'}.
            </Text>
          </View>
        ) : null}

        <View style={styles.shareCard}>
          <Ionicons name="people" size={28} color="#FDBA74" />
          <Text style={styles.shareTitle}>Know someone who should have this?</Text>
          <Text style={styles.shareBody}>Parents, grandparents, anyone with allergies in the family, or a friend who's always buying gadgets. Sharing it could stop a recalled product hurting someone.</Text>
          <Button label="Tell a friend" icon="share-social-outline" onPress={share} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: 40, gap: space.lg },
  fact: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, borderTopWidth: 4, borderTopColor: '#FB923C', padding: space.lg, gap: 6 },
  figure: { fontSize: 40, fontWeight: '800', color: colors.accent, letterSpacing: -1 },
  factText: { fontSize: 16, lineHeight: 23, color: colors.ink, fontWeight: '500' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  source: { fontSize: 12, color: colors.muted },
  live: { backgroundColor: colors.ink, borderRadius: 22, padding: space.xl, gap: space.md },
  liveTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  liveBody: { fontSize: 15, lineHeight: 21, color: '#CBD5E1' },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  statNumber: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.md },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  help: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  shareCard: { backgroundColor: colors.ink, borderRadius: 22, padding: space.xl, gap: space.md, alignItems: 'flex-start' },
  shareTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  shareBody: { fontSize: 15, lineHeight: 21, color: '#CBD5E1' },
});
