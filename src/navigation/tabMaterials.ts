export const TAB_MATERIAL_COLORS = {
  selected: '#000000',
  idle: '#8E8E93',
} as const;

export const TOP_TAB_MATERIAL = {
  background: 'rgba(242,242,247,0.92)',
  activeBackground: 'rgba(0,0,0,0.045)',
  border: 'rgba(60,60,67,0.12)',
} as const;

export const TAB_LABEL_STYLE = {
  default: { color: TAB_MATERIAL_COLORS.idle, fontSize: 11, fontWeight: '600' },
  selected: { color: TAB_MATERIAL_COLORS.selected, fontSize: 11, fontWeight: '700' },
} as const;
