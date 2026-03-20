import { Link } from "expo-router";
import { Button, ScrollView, Text } from "react-native";

export default function Index() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic">
      <Text>Hello World!</Text>
      <Link href="/page2" asChild>
        <Button title="Go to Page 2" />
      </Link>
    </ScrollView>
  );
}
