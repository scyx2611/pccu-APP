import { MAIN_TAB_APPEARANCE, MAIN_TABS } from '../mainTabs';

describe('MAIN_TABS', () => {
  it('keeps the bottom navigation in the requested order with user-facing labels', () => {
    expect(MAIN_TABS.map((tab) => ({ name: tab.name, label: tab.label }))).toEqual([
      { name: 'home', label: '首頁' },
      { name: 'schedule', label: '行程' },
      { name: 'tutoring', label: '課輔' },
      { name: 'settings', label: '我的' },
    ]);
  });

  it('uses outline icons by default and filled icons when selected', () => {
    expect(MAIN_TABS.map((tab) => ({ name: tab.name, sfSymbol: tab.sfSymbol }))).toEqual([
      { name: 'home', sfSymbol: { default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' } },
      { name: 'schedule', sfSymbol: { default: 'clock', selected: 'clock.fill' } },
      { name: 'tutoring', sfSymbol: { default: 'book', selected: 'book.fill' } },
      { name: 'settings', sfSymbol: { default: 'person', selected: 'person.fill' } },
    ]);
  });

  it('uses compact grayscale tab labels instead of the default blue selection tint', () => {
    expect(MAIN_TAB_APPEARANCE).toEqual({
      iconColor: { default: '#8E8E93', selected: '#000000' },
      labelStyle: {
        default: { color: '#8E8E93', fontSize: 11, fontWeight: '600' },
        selected: { color: '#000000', fontSize: 11, fontWeight: '700' },
      },
    });
  });
});
