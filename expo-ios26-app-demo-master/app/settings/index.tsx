import { Link } from "expo-router";
import { Button, ScrollView, Text } from "react-native";

export default function Settings() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <Text>Settings</Text>
      <Link href="/settings/profile" asChild>
        <Button title="Profile" />
      </Link>
    </ScrollView>
  );
}
