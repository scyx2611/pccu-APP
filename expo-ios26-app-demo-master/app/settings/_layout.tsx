import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerTransparent: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: "设置" }} />
      <Stack.Screen name="profile" options={{ title: "个人资料" }} />
    </Stack>
  );
}
