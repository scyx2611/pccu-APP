import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { MAIN_TAB_APPEARANCE, MAIN_TABS } from '../../src/navigation/mainTabs';

export default function TabLayout() {
  return (
    <NativeTabs {...MAIN_TAB_APPEARANCE}>
      {MAIN_TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <Label>{tab.label}</Label>
          <Icon sf={tab.sfSymbol} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
