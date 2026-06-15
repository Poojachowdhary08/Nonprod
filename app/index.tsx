import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Dimensions,
  Alert,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as Notifications from 'expo-notifications';
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { logoutCurrentSession } from "../utils/auth";

declare global {
  var __pushHandlerSet: boolean | undefined;
}


if (!globalThis.__pushHandlerSet) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  globalThis.__pushHandlerSet = true; // ✅ Set the flag
}


const { width } = Dimensions.get("window");


    const slides = [
        {
            id: '1',
            url: 'https://assets.architecturaldigest.in/photos/60082067345ead69c9c1abe2/16:9/w_2560%2Cc_limit/Vila-Tugendhat-by-Mies-van-der-Rohe-Photo-by-David-Zidlicky-1366x768.jpg',
            text: '9 Acres of Abundant Living Space – Discover a stunning community that offers you all the space you need to grow, thrive, and create lasting memories.',
        }
    ];

const LandingPage = () => {
  const router = useRouter(); // ✅ Use router for navigation

  // Animation refs
  const logoAnim = useRef(new Animated.Value(1)).current;
  const textSlideAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
    const [showLogoutButton, setShowLogoutButton] = useState(false);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [showDialog, setShowDialog] = useState(false); // ✅ State for showing the dialog




  useEffect(() => {
    const animateLogo = setInterval(() => {
      Animated.sequence([
        Animated.timing(logoAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(logoAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]).start();
    }, 3000);
  
    return () => clearInterval(animateLogo); // ✅ Proper cleanup
  }, []);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % slides.length;
        scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  
        Animated.timing(textSlideAnim, { toValue: -width, duration: 800, useNativeDriver: true }).start(() => {
          textSlideAnim.setValue(width);
          Animated.timing(textSlideAnim, { toValue: 0, duration: 800, useNativeDriver: true }).start();
        });
  
        return nextIndex;
      });
    }, 5000);
  
    return () => clearInterval(interval); // ✅ Cleanup interval on unmount
  }, []);
  




    // ✅ Function to open logout modal
    const handleLogout = () => {
      setLogoutModalVisible(true);
    };
  
    // ✅ Function to confirm logout and send request
  
    const confirmLogout = async () => {
      try {
        // ✅ Close the modal first
        setLogoutModalVisible(false);
  
        const refreshToken = await AsyncStorage.getItem("refresh_token");

        if (!refreshToken) {
          Alert.alert("Error", "Missing authentication data.");
          return;
        }

        await logoutCurrentSession();
          // ✅ Ensure modal is closed again (in case the first call didn't work)
          setLogoutModalVisible(false);
  
          // ✅ Redirect to HomeScreen with a delay to ensure modal closes
          setTimeout(() => {
            router.replace("/LoginPage");
          }, 300);
      } catch (error) {
        Alert.alert("Error", "Logout request failed.");
      }
    };



  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }} testID="index-root">
      {/* Header */}
      <View style={styles.header}>
        <Animated.Image
          source={require("../assets/images/cropped-Avenue-reality-logo.webp")}
          style={[styles.logo, { transform: [{ scale: logoAnim }] }]}
          resizeMode="contain"
        />
        <TouchableOpacity style={styles.button} onPress={handleLogout}>
          <TText style={styles.buttonText}>LOGOUT</TText>
        </TouchableOpacity>
      </View>

      {/* Slideshow */}
      <View style={styles.slideshowContainer}>
        <ScrollView ref={scrollViewRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={false}>
          {slides.map((item, index) => (
            <View key={index} style={styles.slideItem}>
              <Image source={{ uri: item.url }} style={styles.slideshowImage} />
            </View>
          ))}
        </ScrollView>
      </View>
      <TText style={styles.title}>Avenue Realty</TText>
      <TText style={styles.subtitle}>Connecting Reality Dots</TText>

      {/* Slide Text */}
      <Animated.View style={[styles.textContainer, { transform: [{ translateX: textSlideAnim }] }]}>
        <TText style={styles.slideText}>{slides[currentIndex].text}</TText>
      </Animated.View>

            {/* ✅ Logout Confirmation Modal */}
            <Modal transparent visible={logoutModalVisible} animationType="fade">
              <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                  <TText style={styles.modalText}>
                    Are you sure you want to logout?
                  </TText>
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={confirmLogout}
                    >
                      <TText style={{ color: "red" }}>Yes</TText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalButton}
                      onPress={() => setLogoutModalVisible(false)}
                    >
                      <TText>No</TText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
            
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: { width: 180, height: 100, resizeMode: "contain", marginLeft: 10 },
  button: {
    backgroundColor: "#4A90E2",
    width: 70,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    height: 35,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "400" },
  slideshowContainer: { marginTop: 20, height: 250, width: "100%" },
  slideItem: { width, alignItems: "center", justifyContent: "center" },
  slideshowImage: { width: width - 40, height: 250, resizeMode: "cover", borderRadius: 10 },
  textContainer: {
    width: "90%",
    alignSelf: "center",
    marginTop: 20,
    padding: 15,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#7d7b7a",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    marginTop: 15,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500",
    color: "#4A90E2",
    textAlign: "center",
    marginTop: 5,
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 1,
  },
  slideText: { fontSize: 16, fontWeight: "300", color: "#424140", textAlign: "center" },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: { backgroundColor: "white", padding: 20, borderRadius: 10 },
  modalText: { fontSize: 16, fontWeight: "bold", marginBottom: 10 },
  modalButtons: { flexDirection: "row", justifyContent: "space-around" },
  modalButton: { padding: 10 },
});

export default LandingPage;
