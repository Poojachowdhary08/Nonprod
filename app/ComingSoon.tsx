import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";

const ComingSoon = () => {
  const router = useRouter(); // ✅ Use Expo Router

  return (
    <View style={styles.container} testID="coming-soon-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Coming Soon</TText>
        </View>
        <TouchableOpacity onPress={() => router.push('/HomeScreen')}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <TText style={styles.title}>Coming Soon</TText>
        <TText style={styles.subtitle}>We're working hard to bring something amazing!</TText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
    justifyContent: "space-between",
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
    marginLeft: 10,
  },
  content: {
    marginTop: 50,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "black",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "black",
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 10,
  },
});

export default ComingSoon;
