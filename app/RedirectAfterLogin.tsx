import React from "react";
import { View, ActivityIndicator, StyleSheet, Image } from "react-native";
import { useSessionRedirect } from "@/hooks/useSessionRedirect";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

export default function RedirectAfterLogin() {
  useSessionRedirect();

  return (
    <View style={styles.container} testID="redirect-after-login-root">
      <View style={styles.logoContainer}>
        <Image
          source={require("../assets/images/cropped-Avenue-reality-logo.webp")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <ActivityIndicator size="large" color="#007AFF" />
      <TText style={styles.text}>....</TText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  logoContainer: {
    marginBottom: 30,
    alignItems: "center",
  },
  logo: {
    width: 200,
    height: 60,
  },
  text: {
    marginTop: 20,
    fontSize: 16,
    color: "#555",
    fontWeight: "500",
  },
});
