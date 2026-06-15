import React, { useMemo } from "react";
import { Text, StyleSheet, TextProps, TextStyle } from "react-native";
import { useFontScale } from "@/context/FontScaleContext";
import { useTheme } from "@/src/theme/ThemeProvider";

function isNum(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export default function TText({ style, ...rest }: TextProps) {
  const { fontScale } = useFontScale();
  const { theme } = useTheme();
  const C = theme.colors;

  const flat = useMemo(
    () => (StyleSheet.flatten(style) as TextStyle | undefined) || undefined,
    [style]
  );

  const scaled = useMemo(() => {
    if (!flat) return null;

    const out: TextStyle = {};

    if (isNum(flat.fontSize))
      out.fontSize = Math.round(flat.fontSize * fontScale * 10) / 10;

    if (isNum(flat.lineHeight))
      out.lineHeight = Math.round(flat.lineHeight * fontScale * 10) / 10;

    const ls = (flat as any).letterSpacing;
    if (isNum(ls))
      (out as any).letterSpacing = Math.round(ls * fontScale * 10) / 10;

    return Object.keys(out).length ? out : null;
  }, [flat, fontScale]);

  // ✅ Theme color:
  // - If caller already set a color in style, we DO NOT override it.
  // - If no color given, we use theme text color.
  const themedColor = useMemo<TextStyle>(() => {
    const hasExplicitColor = !!flat?.color;
    return hasExplicitColor ? {} : { color: C.text };
  }, [flat?.color, C.text]);

  return <Text {...rest} style={[themedColor, style, scaled]} />;
}
