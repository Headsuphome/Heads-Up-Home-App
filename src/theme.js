// Colours and spacing, taken from the approved screen designs.

export const colors = {
  bg: '#F3F5F7',
  surface: '#FFFFFF',
  ink: '#0E1A2B',
  muted: '#4B5563',
  line: '#E2E6EB',
  lineStrong: '#D5DAE0',
  accent: '#C2410C',
  accentSoft: '#FFEDD5',
  accentInk: '#7C2D12',
  ok: '#15803D',
  okSoft: '#DCFCE7',
  okInk: '#166534',
};

export const tones = {
  danger: { bg: '#FEE2E2', fg: '#991B1B' },
  warning: { bg: '#FFEDD5', fg: '#9A3412' },
  info: { bg: '#E0E7FF', fg: '#1E3A8A' },
  neutral: { bg: '#E5E7EB', fg: '#374151' },
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const type = {
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 21, color: colors.ink },
  small: { fontSize: 13, color: colors.muted },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted },
};
