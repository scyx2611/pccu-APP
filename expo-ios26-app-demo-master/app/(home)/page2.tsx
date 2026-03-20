import { Link } from "expo-router";
import { Button, ScrollView, Text } from "react-native";

export default function Page2() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <Text>Page 2</Text>
      <Link href="/" asChild>
        <Button title="Go to Home" />
      </Link>
    </ScrollView>
  );
}
