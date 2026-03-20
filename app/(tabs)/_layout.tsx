import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../src/providers/theme/ThemeProvider';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="home">
        <Label>首頁</Label>
        <Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Label>設定</Label>
        <Icon sf="gear" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
