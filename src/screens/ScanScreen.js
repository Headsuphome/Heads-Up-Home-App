import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, space, type } from '../theme';
import { Button, RecallCard } from '../components';
import { cleanBarcode, recallsWithBarcode } from '../logic';
import { productForBarcode, recallsForBarcode } from '../api';

// Scan a product's barcode to check it against every recall, and optionally add it to the cupboard.
// mode 'check' starts with the check; mode 'add' goes straight to the add form after the check.

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'];

function Camera({ onCode }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const done = useRef(false);

  const submitTyped = () => {
    const code = typed.replace(/\D/g, '');
    if (code.length >= 8) onCode(code);
  };

  if (typing || (permission && !permission.granted && !permission.canAskAgain)) {
    return (
      <View style={styles.typeBox}>
        {!typing ? (
          <>
            <Text style={type.body}>Camera access is turned off for Heads Up Home.</Text>
            <Button label="Open phone settings" kind="secondary" icon="settings-outline" onPress={() => Linking.openSettings().catch(() => {})} />
            <Text style={[type.small, { marginTop: space.sm }]}>Or type the numbers under the barcode:</Text>
          </>
        ) : (
          <Text style={type.body}>Type the numbers under the barcode:</Text>
        )}
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="e.g. 5000169123456"
          placeholderTextColor="#6B7280"
          keyboardType="number-pad"
          style={styles.input}
          autoFocus={typing}
          onSubmitEditing={submitTyped}
          accessibilityLabel="Barcode number"
        />
        <Button label="Check this barcode" icon="search" onPress={submitTyped} />
        {typing ? <Button label="Use the camera instead" kind="secondary" icon="camera-outline" onPress={() => setTyping(false)} /> : null}
      </View>
    );
  }

  if (!permission) return <ActivityIndicator style={{ marginTop: 60 }} color={colors.accent} />;

  if (!permission.granted) {
    return (
      <View style={styles.typeBox}>
        <View style={styles.cameraIcon}><Ionicons name="barcode-outline" size={40} color={colors.accent} /></View>
        <Text style={[type.heading, { textAlign: 'center' }]}>Scan with your camera</Text>
        <Text style={[type.small, { textAlign: 'center', lineHeight: 19 }]}>
          Heads Up Home uses the camera only to read barcodes. Nothing is recorded or saved.
        </Text>
        <Button label="Allow camera" icon="camera-outline" onPress={requestPermission} />
        <Button label="Type the barcode instead" kind="secondary" onPress={() => setTyping(true)} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.cameraBox}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={({ data }) => {
            if (done.current || cleanBarcode(data).length < 7) return;
            done.current = true;
            onCode(String(data));
          }}
        />
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Text style={[type.small, { textAlign: 'center' }]}>Point the camera at the barcode on the pack. Hold it steady.</Text>
      <Button label="Type the barcode instead" kind="secondary" icon="keypad-outline" onPress={() => setTyping(true)} />
    </View>
  );
}

export default function ScanScreen({ mode = 'check', recalls, canAdd, onAdd, onFull, openRecall, onClose }) {
  const [code, setCode] = useState(null);
  const [found, setFound] = useState(null); // { recalls, product } once looked up
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(mode === 'add');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    setFound(null);
    setFailed(false);
    const local = recallsWithBarcode(recalls, code);
    Promise.all([
      recallsForBarcode(code).catch(() => { if (live) setFailed(true); return []; }),
      productForBarcode(code),
    ]).then(([remote, product]) => {
      if (!live) return;
      const seen = new Set(local.map((r) => r.id));
      setFound({ recalls: [...local, ...remote.filter((r) => !seen.has(r.id))], product });
      if (product) {
        setName((n) => n || product.name);
        setBrand((b) => b || product.brand || '');
      }
    });
    return () => { live = false; };
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const again = () => {
    setCode(null);
    setFound(null);
    setAdded(false);
    setAdding(mode === 'add');
    setName('');
    setBrand('');
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (!canAdd) { onFull(); return; }
    onAdd({ name: n, brand: brand.trim() || null, barcode: code });
    setAdded(true);
    setAdding(false);
  };

  const title = mode === 'add' ? 'Scan into your cupboard' : 'Check a product';

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.roundButton}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>{title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!code ? (
          <Camera onCode={setCode} />
        ) : !found ? (
          <View style={{ alignItems: 'center', gap: space.md, marginTop: 40 }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={type.small}>Checking barcode {code} against every recall…</Text>
          </View>
        ) : (
          <>
            {found.recalls.length ? (
              <View style={styles.warn}>
                <Ionicons name="warning" size={24} color="#FFFFFF" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.warnTitle}>This barcode is in {found.recalls.length === 1 ? 'a recall' : `${found.recalls.length} recalls`}</Text>
                  <Text style={styles.warnBody}>Open the recall and check the batch code and dates on your pack.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.clear}>
                <Ionicons name="checkmark-circle" size={24} color={colors.ok} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.clearTitle}>{failed ? 'We couldn\'t check every recall just now' : 'No recalls found for this barcode'}</Text>
                  <Text style={styles.clearBody}>
                    {failed
                      ? 'Check your connection and scan again.'
                      : 'Some recall notices only list a product\'s name and batch codes, so it\'s also worth searching for it by name in Browse.'}
                  </Text>
                </View>
              </View>
            )}

            <Text style={type.small}>
              Barcode {code}{found.product ? ` · ${found.product.name}${found.product.brand ? `, ${found.product.brand}` : ''}` : ''}
            </Text>

            {found.recalls.map((r) => (
              <RecallCard key={r.id} recall={r} onPress={() => openRecall(r)} />
            ))}

            {added ? (
              <View style={styles.clear}>
                <Ionicons name="file-tray-stacked" size={22} color={colors.ok} />
                <Text style={[styles.clearTitle, { flex: 1 }]}>Added to your cupboard</Text>
              </View>
            ) : adding ? (
              <View style={styles.form}>
                <Text style={styles.inputLabel}>Product</Text>
                <TextInput value={name} onChangeText={setName} placeholder="e.g. Baby rice cereal 200g" placeholderTextColor="#6B7280" style={styles.input} accessibilityLabel="Product name" />
                <Text style={styles.inputLabel}>Brand (helps us match accurately)</Text>
                <TextInput value={brand} onChangeText={setBrand} placeholder="e.g. Ella's Kitchen" placeholderTextColor="#6B7280" style={styles.input} accessibilityLabel="Brand" onSubmitEditing={save} />
                {!found.product ? (
                  <Text style={[type.small, { lineHeight: 19 }]}>We couldn't find this product's name, so please type it. The barcode is saved with it.</Text>
                ) : null}
                <Button label="Add to my cupboard" icon="add" onPress={save} />
              </View>
            ) : (
              <Button label="Add to my cupboard" kind="secondary" icon="file-tray-stacked-outline" onPress={() => setAdding(true)} />
            )}

            <Button label="Scan another" kind={added || !adding ? 'primary' : 'secondary'} icon="barcode-outline" onPress={again} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingBottom: 40, gap: space.md },
  cameraBox: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000000' },
  frame: { position: 'absolute', left: '12%', right: '12%', top: '32%', bottom: '32%', borderWidth: 3, borderColor: '#FB923C', borderRadius: 14 },
  typeBox: { gap: space.md, paddingTop: space.lg },
  cameraIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: colors.surface },
  warn: { flexDirection: 'row', gap: 12, backgroundColor: colors.accent, borderRadius: radius.lg, padding: space.lg },
  warnTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  warnBody: { fontSize: 14, lineHeight: 20, color: '#FFEDD5' },
  clear: { flexDirection: 'row', gap: 12, backgroundColor: colors.okSoft, borderRadius: radius.lg, padding: space.lg, alignItems: 'center' },
  clearTitle: { fontSize: 16, fontWeight: '700', color: colors.okInk },
  clearBody: { fontSize: 14, lineHeight: 20, color: colors.okInk },
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  inputLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
});
