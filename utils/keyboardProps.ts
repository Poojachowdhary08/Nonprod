import { Platform, TextInputProps } from "react-native";

export function getDecimalInputProps(): Pick<
  TextInputProps,
  "keyboardType" | "inputMode"
> {
  if (Platform.OS === "web") {
    return {
      keyboardType: "decimal-pad",
      inputMode: "decimal",
    };
  }

  return {
    keyboardType: Platform.select({
      ios: "decimal-pad",
      android: "numeric",
      default: "decimal-pad",
    }),
  };
}
