// components/Card.tsx
import React from "react";
import { View, ViewProps } from "react-native";
import {useTheme } from "@/src/theme/ThemeProvider";

export default function Card({ style, ...rest }: ViewProps) {
  const { theme } = useTheme();
  const C = theme.colors;

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: C.card,
          borderColor: C.border,
          borderWidth: 1,
          borderRadius: 12,
        },
        style,
      ]}
    />
  );
}
