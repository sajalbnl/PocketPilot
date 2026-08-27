export const colors = {
  background: '#131313',
  backgroundDeep: '#0A0A0A',
  surface: '#171717',
  surfaceRaised: '#202020',
  surfaceSoft: '#262626',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  text: '#FAFAFA',
  textMuted: '#A1A1A1',
  textDim: '#737373',
  mint: '#16D9D5',
  mintSoft: '#7CE9E6',
  mintDark: 'rgba(35, 116, 125, 0.24)',
  brand: '#23747D',
  brandHover: '#2C8A94',
  amber: '#F4C95D',
  amberDark: 'rgba(234, 179, 8, 0.12)',
  red: '#FF6568',
  redDark: 'rgba(255, 101, 104, 0.11)',
  blue: '#96C8FF',
  blueDark: 'rgba(28, 114, 255, 0.12)',
  white: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.76)',
} as const;

export const radii = { small: 10, medium: 14, large: 18, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const typography = {
  display: { fontSize: 36, fontWeight: '700' as const, letterSpacing: -1.35, lineHeight: 40 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.55, lineHeight: 29 },
  section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 21 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.45, lineHeight: 15 },
  caption: { fontSize: 11, fontWeight: '500' as const, lineHeight: 16 },
} as const;

export const shadows = {
  raised: {
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
} as const;
