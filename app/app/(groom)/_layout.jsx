// Groom section layout — a headerless native stack on the dark background.
import { Stack } from "expo-router";
import { C } from "../../src/ui/theme.js";

export default function GroomLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: C.bg },
      }}
    />
  );
}
