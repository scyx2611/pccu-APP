import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";

export default function RootLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="(home)">
        <Label>首页</Label>
        <Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf="gear" />
        <Label>设置</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
