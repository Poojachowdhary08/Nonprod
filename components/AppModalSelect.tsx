import React, { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import ModalSelector from "react-native-modal-selector";
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from "react-native";

import { useTheme } from "@/src/theme/ThemeProvider";

type AppModalSelectProps = {
  onChange?: (option: any) => void;
  style?: StyleProp<ViewStyle>;
  selectStyle?: StyleProp<ViewStyle>;
  selectTextStyle?: StyleProp<TextStyle>;
  initValueTextStyle?: StyleProp<TextStyle>;
  optionTextStyle?: StyleProp<TextStyle>;
  cancelTextStyle?: StyleProp<TextStyle>;
  optionContainerStyle?: StyleProp<ViewStyle>;
  cancelContainerStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;
  [key: string]: any;
};

const BaseModalSelector: any = ModalSelector;

const AppModalSelect = React.forwardRef<any, AppModalSelectProps>(({
  style,
  selectStyle,
  selectTextStyle,
  initValueTextStyle,
  optionTextStyle,
  cancelTextStyle,
  optionContainerStyle,
  cancelContainerStyle,
  overlayStyle,
  ...rest
}, ref) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const hasCustomTrigger = Boolean(rest.customSelector || rest.children);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: "relative",
          width: "100%",
        },
        trigger: {
          width: "100%",
          minHeight: 35,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 12,
          paddingLeft: 12,
          paddingRight: 34,
          paddingVertical: 10,
          backgroundColor: C.card,
          justifyContent: "center",
        },
        triggerText: {
          fontSize: 11,
          color: C.text,
          fontWeight: "800",
        },
        menuText: {
          fontSize: 11,
          color: C.text,
        },
        overlay: {
          backgroundColor: C.overlayStrong,
        },
        menuBox: {
          backgroundColor: C.card,
          borderColor: C.border,
          borderWidth: 1,
          borderRadius: 12,
        },
        chevron: {
          position: "absolute",
          right: 12,
          top: 10,
          pointerEvents: "none",
        },
      }),
    [C.border, C.card, C.overlayStrong, C.text]
  );

  if (hasCustomTrigger) {
    return (
      <BaseModalSelector
        ref={ref}
        {...rest}
        style={style}
        selectStyle={selectStyle}
        selectTextStyle={selectTextStyle}
        initValueTextStyle={initValueTextStyle}
        optionTextStyle={StyleSheet.flatten([styles.menuText, optionTextStyle])}
        cancelTextStyle={StyleSheet.flatten([styles.menuText, cancelTextStyle])}
        optionContainerStyle={StyleSheet.flatten([styles.menuBox, optionContainerStyle])}
        cancelContainerStyle={StyleSheet.flatten([styles.menuBox, cancelContainerStyle])}
        overlayStyle={StyleSheet.flatten([styles.overlay, overlayStyle])}
      />
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <BaseModalSelector
        ref={ref}
        {...rest}
        style={undefined}
        selectStyle={StyleSheet.flatten([styles.trigger, selectStyle])}
        selectTextStyle={StyleSheet.flatten([styles.triggerText, selectTextStyle])}
        initValueTextStyle={StyleSheet.flatten([styles.triggerText, initValueTextStyle])}
        optionTextStyle={StyleSheet.flatten([styles.menuText, optionTextStyle])}
        cancelTextStyle={StyleSheet.flatten([styles.menuText, cancelTextStyle])}
        optionContainerStyle={StyleSheet.flatten([styles.menuBox, optionContainerStyle])}
        cancelContainerStyle={StyleSheet.flatten([styles.menuBox, cancelContainerStyle])}
        overlayStyle={StyleSheet.flatten([styles.overlay, overlayStyle])}
      />
      <Ionicons name="chevron-down" size={16} color={C.mutedText} style={styles.chevron} />
    </View>
  );
});

export default AppModalSelect;
