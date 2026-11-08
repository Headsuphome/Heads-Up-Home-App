import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, space, type } from './theme';
import { Button, Chip } from './components';
import {
  ALLERGENS, MAX_OTHER_ALLERGENS, allergenLabel, hasAllAllergens, isOtherAllergen, otherAllergenKey, toggleAllAllergens,
} from './logic';
import { toggle } from './storage';

// The allergen choices, shared by onboarding and My alerts: an "all 14" shortcut, the 14 UK
// allergens with plain-English examples, and a box for anything else someone needs to avoid.

export default function AllergenPicker({ allergens, update }) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState(null);
  const chosen = allergens || [];
  const others = chosen.filter(isOtherAllergen);
  const all = hasAllAllergens(chosen);

  const addOther = () => {
    const key = otherAllergenKey(typed);
    if (!key) { setNote('Type a food or ingredient, like kiwi or coconut.'); return; }
    if (others.includes(key)) { setTyped(''); setNote(null); return; }
    if (others.length >= MAX_OTHER_ALLERGENS) { setNote(`You can add up to ${MAX_OTHER_ALLERGENS}. Remove one to add another.`); return; }
    update((p) => ({ allergens: [...p.allergens, key] }));
    setTyped('');
    setNote(null);
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.wrap}>
        <Chip
          label="All 14 allergens"
          icon="checkmark-done-outline"
          selected={all}
          accessibilityLabel={all ? 'All 14 allergens chosen. Tap to clear them.' : 'Choose all 14 allergens'}
          onPress={() => update((p) => ({ allergens: toggleAllAllergens(p.allergens) }))}
        />
        {ALLERGENS.map((a) => (
          <Chip key={a.key} label={a.label} selected={chosen.includes(a.key)} onPress={() => update((p) => ({ allergens: toggle(p.allergens, a.key) }))} />
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={styles.otherTitle}>Something else?</Text>
        <Text style={[type.small, { lineHeight: 19 }]}>
          Add any other food or ingredient your household avoids, like kiwi or coconut. We'll look for it in food recalls.
        </Text>
        {others.length ? (
          <View style={styles.wrap}>
            {others.map((key) => (
              <Chip
                key={key}
                label={`${allergenLabel(key)}  ✕`}
                selected
                accessibilityLabel={`Remove ${allergenLabel(key)}`}
                onPress={() => update((p) => ({ allergens: p.allergens.filter((a) => a !== key) }))}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.addRow}>
          <TextInput
            value={typed}
            onChangeText={(t) => { setTyped(t); if (note) setNote(null); }}
            placeholder="e.g. kiwi"
            placeholderTextColor="#6B7280"
            style={styles.input}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={addOther}
            accessibilityLabel="Another allergen"
          />
          <Button label="Add" kind="secondary" icon="add" onPress={addOther} style={styles.addButton} />
        </View>
        {note ? <Text style={[type.small, { color: colors.accent }]}>{note}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  otherTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  addButton: { minWidth: 96 },
});
