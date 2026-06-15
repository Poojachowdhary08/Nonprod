// components/Screen.tsx
import React from "react";
import { View, ViewProps } from "react-native";
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

export default function Screen({ style, ...rest }: ViewProps) {
  const { theme } = useTheme();
  return <View {...rest} style={[{ flex: 1, backgroundColor: theme.colors.bg }, style]} />;
}
