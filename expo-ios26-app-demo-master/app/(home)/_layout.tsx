import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerTransparent: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: "首页" }} />
      <Stack.Screen name="page2" options={{ title: "页面2" }} />
    </Stack>
  );
}
