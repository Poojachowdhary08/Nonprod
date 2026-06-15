import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  Alert,
  Platform,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Pressable,
  BackHandler,
  Animated,
} from "react-native";
import { Linking } from "react-native";
import { WebView } from "react-native-webview";
import DateTimePicker from "@react-native-community/datetimepicker";
import Slider from "@react-native-community/slider";
import Icon from "react-native-vector-icons/FontAwesome";
import { StackNavigationProp } from "@react-navigation/stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import TText from "@/components/TText";
import PullToRefreshScrollView from "@/components/PullToRefreshScrollView";
import { useFontScale } from "@/context/FontScaleContext";
import { useTheme } from "@/src/theme/ThemeProvider";
import {
  authenticatedFetch,
  clearStoredAuth,
  logoutCurrentSession,
  restoreAuthenticatedUser,
} from "../utils/auth";

const { width } = Dimensions.get("window");
type HomeScreenNavigationProp = StackNavigationProp<any, "Home">;

interface HomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

type ClientProperty = {
  property_id: string;
  property_name: string;
  project_name?: string;
  project_id?: string;
  project_location_city?: string;
  project_location?: string;
  [key: string]: any;
};

const videoId = "6ASPpxcjQBA";
const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

const slides = [
  {
    id: "1",
    url: "https://assets.architecturaldigest.in/photos/60082067345ead69c9c1abe2/16:9/w_2560%2Cc_limit/Vila-Tugendhat-by-Mies-van-der-Rohe-Photo-by-David-Zidlicky-1366x768.jpg",
    text: "9 Acres of abundant living space designed for comfort, calm, and long-term family life.",
  },
  {
    id: "2",
    url: "https://thumbs.dreamstime.com/b/new-modern-block-flats-green-area-residential-apartment-flat-buildings-exterior-luxury-house-complex-part-city-real-350335244.jpg",
    text: "125 thoughtfully planned homes with a community-first layout and generous open areas.",
  },
  {
    id: "3",
    url: "https://toplinerealty.in/wp-content/uploads/2025/04/240sq-west-03.webp",
    text: "A premium clubhouse with daily convenience, wellness, and shared community amenities.",
  },
  {
    id: "4",
    url: "https://futurestiles.com/wp-content/uploads/2024/08/20-Trending-Normal-House-Front-Elevation-Designs-in-2024.jpg",
    text: "Flexible plot and villa options to match both family needs and lifestyle goals.",
  },
];

function safeText(value: unknown, fallback = "—") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatTimeLabel(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function minutesToDate(totalMinutes: number) {
  const date = new Date();
  date.setHours(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60, 0, 0);
  return date;
}

function dateToMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function TextSizeSlider({
  value,
  onChange,
  minimumValue = 0.85,
  maximumValue = 1.4,
  step = 0.05,
  tickCount = 7,
}: {
  value: number;
  onChange: (v: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  tickCount?: number;
}) {
  const { theme } = useTheme();
  const C = theme.colors;
  const ticks = useMemo(() => new Array(tickCount).fill(0).map((_, i) => i), [tickCount]);

  return (
    <View style={styles.textSizeRow}>
      <TText style={[styles.textSizeA, { color: C.mutedText }]}>A</TText>

      <View style={styles.sliderShell}>
        <View style={[styles.sliderLine, { backgroundColor: C.sliderLine }]} />
        <View style={styles.tickRow} pointerEvents="none">
          {ticks.map((i) => (
            <View key={i} style={[styles.tick, { backgroundColor: C.tick }]} />
          ))}
        </View>

        <Slider
          style={styles.nativeSlider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          step={step}
          value={value}
          onValueChange={onChange}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor={C.primary}
        />
      </View>

      <TText style={[styles.textSizeABig, { color: C.text }]}>A</TText>
    </View>
  );
}

function FooterBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const color = active ? theme.colors.navIconActive : theme.colors.navIconInactive;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.footerBtn}>
      <Icon name={icon} size={20} color={color} />
      <TText style={[styles.footerLabel, { color }]}>{label}</TText>
    </TouchableOpacity>
  );
}

const CustomerHomeScreen: React.FC<HomeScreenProps> = () => {
  const { theme, pref, setPref, schedule, setSchedule } = useTheme();
  const { fontScale, setFontScale } = useFontScale();
  const C = theme.colors;
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [clientData, setClientData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loginType, setLoginType] = useState<string | null>(null);
  const [clientProperties, setClientProperties] = useState<ClientProperty[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"home" | "properties">("home");
  const [profileVisible, setProfileVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<"dark" | "light" | null>(null);

  const textSlideAnim = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => true;
      BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress);
    }, [])
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("__EXPO_ROUTER_key")) {
        url.searchParams.delete("__EXPO_ROUTER_key");
        window.history.replaceState({}, document.title, url.pathname);
      }
    }
  }, []);

  useEffect(() => {
    const fetchLoginType = async () => {
      const type = await AsyncStorage.getItem("login_type");
      setLoginType(type);
    };
    fetchLoginType();
  }, []);

  const handleHomePress = useCallback(async () => {
    try {
      const savedLoginType = await AsyncStorage.getItem("login_type");
      if (savedLoginType === "email") return;

      const refreshToken = await AsyncStorage.getItem("refresh_token");

      if (!refreshToken) {
        router.replace("/LoginPage");
        return;
      }

      await restoreAuthenticatedUser();

      return;
    } catch {
      await clearStoredAuth();
      router.replace("/LoginPage");
    }
  }, [router]);

  useEffect(() => {
    handleHomePress();
  }, [handleHomePress]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % slides.length;
        scrollViewRef.current?.scrollTo({ x: nextIndex * width, animated: true });

        Animated.timing(textSlideAnim, {
          toValue: -width,
          duration: 450,
          useNativeDriver: true,
        }).start(() => {
          textSlideAnim.setValue(width);
          Animated.timing(textSlideAnim, {
            toValue: 0,
            duration: 450,
            useNativeDriver: true,
          }).start();
        });

        return nextIndex;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [textSlideAnim]);

  const fetchClientData = useCallback(
    async (showError = true) => {
      try {
        if (!loginType) return;

        setLoading(true);
        const phoneNumber = await AsyncStorage.getItem("phone_number");
        if (!phoneNumber) {
          setLoading(false);
          return;
        }

        const clientRes = await authenticatedFetch(`/clients-phone/${phoneNumber}`);
        if (!clientRes.ok) throw new Error("Failed to fetch client");
        const nextClientData = await clientRes.json();
        setClientData(nextClientData);

        const propertyRes = await authenticatedFetch(
          `/clients/${nextClientData.client_id}/properties`
        );
        if (!propertyRes.ok) throw new Error("Failed to fetch properties");
        const propsData = await propertyRes.json();
        setClientProperties(Array.isArray(propsData) ? propsData : []);
      } catch (error) {
        console.error("[ERROR] Could not fetch client or property data:", error);
        if (showError) {
          Alert.alert("Error", "Unable to load customer dashboard.");
        }
      } finally {
        setLoading(false);
      }
    },
    [loginType]
  );

  useEffect(() => {
    void fetchClientData();
  }, [fetchClientData]);

  const handlePullToRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetchClientData(false);
    } finally {
      setRefreshing(false);
    }
  }, [fetchClientData, refreshing]);

  const openProperty = useCallback(
    (property: ClientProperty) => {
      router.push({
        pathname: "/CustomerPropertiesListScreen",
        params: {
          propertyId: property.property_id,
          projectId: property.project_id,
          propertyName: property.property_name,
          projectLocation: property.project_location_city || property.project_location,
          userDetails: JSON.stringify(clientData),
        },
      });
    },
    [clientData, router]
  );

  const confirmLogout = useCallback(async () => {
    try {
      setLogoutConfirmVisible(false);

      const savedLoginType = await AsyncStorage.getItem("login_type");
      if (savedLoginType === "email") {
        await clearStoredAuth();
        router.replace("/LoginPage");
        return;
      }

      await logoutCurrentSession();
      router.replace("/LoginPage");
    } catch (error) {
      console.error("[ERROR] Logout failed:", error);
      Alert.alert("Error", "Logout request failed.");
    }
  }, [router]);

  const propertyCount = clientProperties.length;
  const customerName = safeText(clientData?.name, "Customer");
  const customerEmail = safeText(clientData?.email);
  const customerPhone = safeText(clientData?.phone);
  const customerId = safeText(clientData?.client_id);
  const bottomInset = Math.max(insets.bottom, 8);
  const footerHeight = 60 + bottomInset;

  const summaryLabel = useMemo(() => {
    if (!propertyCount) return "No properties assigned yet";
    if (propertyCount === 1) return "1 property assigned";
    return `${propertyCount} properties assigned`;
  }, [propertyCount]);

  const activeThemeLabel = useMemo(() => {
    if (pref === "custom") {
      return `Custom: dark ${formatTimeLabel(schedule.darkStartMinutes)} to ${formatTimeLabel(
        schedule.lightStartMinutes
      )}`;
    }
    if (pref === "system") return `Using ${theme.mode}`;
    return `${pref} mode`;
  }, [pref, schedule.darkStartMinutes, schedule.lightStartMinutes, theme.mode]);

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]}>
      <View style={[styles.header, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
        <Image
          source={require("../assets/images/cropped-Avenue-reality-logo.webp")}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <TText style={[styles.headerTitle, { color: C.text }]}>Customer Dashboard</TText>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={[styles.loadingWrap, { backgroundColor: C.bg }]}>
          <ActivityIndicator size="large" color={C.primaryStrong} />
          <TText style={[styles.loadingText, { color: C.mutedText }]}>Loading customer dashboard…</TText>
        </View>
      ) : (
        <PullToRefreshScrollView
          style={[styles.scroll, { backgroundColor: C.bg }]}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: footerHeight + 18 }]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handlePullToRefresh}
          pullLabel="Pull to refresh"
          releaseLabel="Release to refresh"
        >


          {activeTab === "home" ? (
            <>
              <View style={styles.slideshowContainer}>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={false}
                >
                  {slides.map((item) => (
                    <View key={item.id} style={styles.slideItem}>
                      <Image source={{ uri: item.url }} style={styles.slideshowImage} />
                    </View>
                  ))}
                </ScrollView>
              </View>

              <TText style={[styles.projectTitle, { color: C.text }]}>Serene Grande</TText>
              <TText style={[styles.projectSubtitle, { color: C.mutedText }]}>
                3BHK and 4BHK Villas • Modern, Elegant, Connected
              </TText>

              <Animated.View
                style={[
                  styles.textContainer,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    transform: [{ translateX: textSlideAnim }],
                  },
                ]}
              >
                <TText style={[styles.slideText, { color: C.text }]}>{slides[currentIndex].text}</TText>
              </Animated.View>

              {Platform.OS !== "web" ? (
                <View style={[styles.videoWrap, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <WebView source={{ uri: youtubeUrl.replace("watch?v=", "embed/") }} javaScriptEnabled allowsFullscreenVideo />
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => Linking.openURL(youtubeUrl)}
                  style={[styles.videoThumbCard, { backgroundColor: C.surface, borderColor: C.border }]}
                >
                  <Image source={{ uri: thumbnailUrl }} style={styles.videoThumb} resizeMode="cover" />
                  <TText style={[styles.videoLinkText, { color: C.primaryStrong }]}>Watch video on YouTube</TText>
                </TouchableOpacity>
              )}
            </>
          ) : null}

          {activeTab === "properties" ? (
            <>
              <View
                style={[
                  styles.propertiesHeroCard,
                  {
                    backgroundColor: C.surface,
                    borderColor: C.border,
                    shadowColor: C.text,
                  },
                ]}
              >
                <View style={styles.propertiesHeroTop}>
                  <View style={styles.propertiesHeroTextWrap}>
                    <TText style={[styles.propertiesHeroEyebrow, { color: C.primaryStrong }]}>Properties</TText>
                    <TText style={[styles.propertiesHeroTitle, { color: C.text }]}>Registered Properties</TText>
                    <TText style={[styles.propertiesHeroSubTitle, { color: C.mutedText }]}>
                      {summaryLabel}
                    </TText>
                  </View>
                  <View style={[styles.propertiesHeroCountCard, { backgroundColor: C.primarySoft }]}>
                    <TText style={[styles.propertiesHeroCount, { color: C.primaryStrong }]}>{propertyCount}</TText>
                    <TText style={[styles.propertiesHeroCountLabel, { color: C.primaryStrong }]}>Total</TText>
                  </View>
                </View>

              </View>

              <View style={styles.propertyListHeader}>
                <View>
                  <TText style={[styles.propertyListTitle, { color: C.text }]}>Property List</TText>
                  <TText style={[styles.propertyListSubTitle, { color: C.mutedText }]}>
                    Assigned units available for this customer account
                  </TText>
                </View>
              </View>

              {propertyCount ? (
                clientProperties.map((property, index) => (
                  <TouchableOpacity
                    key={`${property.property_id}-${index}`}
                    activeOpacity={0.88}
                    onPress={() => openProperty(property)}
                    style={[styles.propertyCard, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <View style={styles.propertyCardTop}>
                      <View style={[styles.propertyIconWrap, { backgroundColor: C.primarySoft }]}>
                        <Icon name="home" size={18} color={C.primaryStrong} />
                      </View>
                      <View style={styles.propertyTextWrap}>
                        <TText style={[styles.propertyName, { color: C.text }]}>
                          {safeText(property.property_name, "Unnamed Property")}
                        </TText>
                        <TText style={[styles.propertyProject, { color: C.mutedText }]}>
                          {safeText(property.project_name, "Project")}
                        </TText>
                      </View>
                      <View style={[styles.propertyArrowWrap, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                        <Icon name="chevron-right" size={12} color={C.mutedText} />
                      </View>
                    </View>

                    <View style={styles.propertyMetaRow}>
                      <View style={[styles.metaChip, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                        <Icon name="map-marker" size={13} color={C.mutedText} />
                        <TText style={[styles.metaChipText, { color: C.mutedText }]}>
                          {safeText(property.project_location_city || property.project_location)}
                        </TText>
                      </View>
                      <View style={[styles.metaChip, { backgroundColor: C.primarySoft, borderColor: C.border }]}>
                        <Icon name="building" size={12} color={C.primaryStrong} />
                        <TText style={[styles.metaChipText, { color: C.primaryStrong }]}>
                          {safeText(property.project_id, "Assigned")}
                        </TText>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                  <Icon name="folder-open" size={20} color={C.mutedText} />
                  <TText style={[styles.emptyTitle, { color: C.text }]}>No properties yet</TText>
                  <TText style={[styles.emptySubTitle, { color: C.mutedText }]}>
                    Properties assigned to this account will appear here as cards.
                  </TText>
                </View>
              )}
            </>
          ) : null}

        </PullToRefreshScrollView>
      )}

      <View
        style={[
          styles.footer,
          {
            backgroundColor: C.navBg,
            borderTopColor: C.border,
            minHeight: footerHeight,
            paddingBottom: bottomInset,
          },
        ]}
      >
        <FooterBtn icon="home" label="Home" active={activeTab === "home"} onPress={() => setActiveTab("home")} />
        <FooterBtn
          icon="building"
          label="Properties"
          active={activeTab === "properties"}
          onPress={() => setActiveTab("properties")}
        />
        <FooterBtn icon="user" label="Account" active={profileVisible} onPress={() => setProfileVisible(true)} />
      </View>

      <Modal transparent visible={profileVisible} animationType="slide" onRequestClose={() => setProfileVisible(false)}>
        <Pressable style={[styles.profileOverlay, { backgroundColor: C.overlay }]} onPress={() => setProfileVisible(false)}>
          <Pressable
            style={[styles.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={(e: any) => e?.stopPropagation?.()}
          >
            <View style={styles.profileHandle} />

            <View style={[styles.profileHeader, { backgroundColor: C.primarySoft }]}>
              <View style={[styles.avatar, { backgroundColor: C.primaryStrong }]}>
                <TText style={[styles.avatarText, { color: C.white }]}>{customerName.slice(0, 1).toUpperCase()}</TText>
              </View>
              <View style={styles.profileHeaderText}>
                <TText style={[styles.profileName, { color: C.text }]}>{customerName}</TText>
                <TText style={[styles.profileSub, { color: C.mutedText }]}>{customerEmail}</TText>
              </View>
            </View>

            <View style={[styles.infoCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.infoRow}>
                <Icon name="phone" size={16} color={C.primaryStrong} />
                <TText style={[styles.infoText, { color: C.text }]}>{customerPhone}</TText>
              </View>
              <View style={styles.infoRow}>
                <Icon name="id-badge" size={16} color={C.primaryStrong} />
                <TText style={[styles.infoText, { color: C.text }]}>{customerId}</TText>
              </View>
            </View>

            <View style={[styles.appearanceCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.appearanceHeader}>
                <TText style={[styles.appearanceTitle, { color: C.text }]}>Text Size</TText>
                <TText
                  style={[
                    styles.textSizeValueChip,
                    { color: C.primaryStrong, backgroundColor: C.primarySoft },
                  ]}
                >
                  {Math.round(fontScale * 100)}%
                </TText>
              </View>
              <TextSizeSlider value={fontScale} onChange={setFontScale} />
              <TText style={[styles.textSizeHint, { color: C.mutedText }]}>
                Adjust the app text to what feels most comfortable.
              </TText>
            </View>

            <View style={[styles.appearanceCard, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
              <View style={styles.appearanceHeader}>
                <TText style={[styles.appearanceTitle, { color: C.text }]}>Appearance</TText>
                <TText style={[styles.appearanceHint, { color: C.mutedText }]}>{activeThemeLabel}</TText>
              </View>

              <View style={styles.themeModeRow}>
                {(["light", "dark", "custom"] as const).map((option) => {
                  const active = pref === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      activeOpacity={0.85}
                      onPress={() => void setPref(option)}
                      style={[
                        styles.themeModeBtn,
                        {
                          backgroundColor: active ? C.primarySoft : C.surface,
                          borderColor: active ? C.primaryStrong : C.border,
                        },
                      ]}
                    >
                      <TText style={{ color: active ? C.primaryStrong : C.text, fontWeight: "800", fontSize: 12 }}>
                        {option[0].toUpperCase() + option.slice(1)}
                      </TText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {pref === "custom" ? (
                <View style={styles.themeScheduleWrap}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("dark")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Dark Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>
                      {formatTimeLabel(schedule.darkStartMinutes)}
                    </TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setTimePickerTarget("light")}
                    style={[styles.themeScheduleBtn, { backgroundColor: C.surface, borderColor: C.border }]}
                  >
                    <TText style={[styles.themeScheduleLabel, { color: C.mutedText }]}>Light Starts</TText>
                    <TText style={[styles.themeScheduleValue, { color: C.text }]}>
                      {formatTimeLabel(schedule.lightStartMinutes)}
                    </TText>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              onPress={() => setLogoutConfirmVisible(true)}
              style={[styles.logoutButton, { backgroundColor: C.primaryStrong }]}
            >
              <Icon name="sign-out" size={16} color={C.white} />
              <TText style={[styles.logoutText, { color: C.white }]}>Logout</TText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {timePickerTarget &&
        (Platform.OS === "web" ? (
          <Modal transparent visible animationType="fade" onRequestClose={() => setTimePickerTarget(null)}>
            <Pressable style={[styles.confirmOverlay, { backgroundColor: C.overlay }]} onPress={() => setTimePickerTarget(null)}>
              <Pressable
                style={[styles.confirmCard, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={(e: any) => e?.stopPropagation?.()}
              >
                <TText style={[styles.confirmTitle, { color: C.text }]}>
                  {timePickerTarget === "dark" ? "Set dark start time" : "Set light start time"}
                </TText>
                <View style={[styles.timeInputShell, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <input
                    type="time"
                    value={`${String(
                      Math.floor((timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes) / 60)
                    ).padStart(2, "0")}:${String(
                      (timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes) % 60
                    ).padStart(2, "0")}`}
                    onChange={(e: any) => {
                      const value = String((e.target as HTMLInputElement).value || "");
                      const [hours, minutes] = value.split(":").map((part) => Number(part));
                      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
                      const nextMinutes = hours * 60 + minutes;
                      void setSchedule({
                        darkStartMinutes: timePickerTarget === "dark" ? nextMinutes : schedule.darkStartMinutes,
                        lightStartMinutes: timePickerTarget === "light" ? nextMinutes : schedule.lightStartMinutes,
                      });
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      fontSize: 16,
                      fontWeight: 700,
                      color: C.text,
                    }}
                  />
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.confirmBtn,
                    { backgroundColor: C.surfaceAlt, borderColor: C.borderStrong, alignSelf: "flex-end", marginTop: 12 },
                  ]}
                  onPress={() => setTimePickerTarget(null)}
                >
                  <TText style={[styles.confirmBtnText, { color: C.text }]}>Done</TText>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={minutesToDate(timePickerTarget === "dark" ? schedule.darkStartMinutes : schedule.lightStartMinutes)}
            mode="time"
            display="default"
            onChange={(_event, selectedDate) => {
              if (Platform.OS !== "ios") setTimePickerTarget(null);
              if (!selectedDate) return;
              const nextMinutes = dateToMinutes(selectedDate);
              void setSchedule({
                darkStartMinutes: timePickerTarget === "dark" ? nextMinutes : schedule.darkStartMinutes,
                lightStartMinutes: timePickerTarget === "light" ? nextMinutes : schedule.lightStartMinutes,
              });
            }}
          />
        ))}

      <Modal transparent visible={logoutConfirmVisible} animationType="fade" onRequestClose={() => setLogoutConfirmVisible(false)}>
        <Pressable
          style={[styles.confirmOverlay, { backgroundColor: C.overlay }]}
          onPress={() => setLogoutConfirmVisible(false)}
        >
          <Pressable
            style={[styles.confirmCard, { backgroundColor: C.surface, borderColor: C.border }]}
            onPress={(e: any) => e?.stopPropagation?.()}
          >
            <TText style={[styles.confirmTitle, { color: C.text }]}>Logout</TText>
            <TText style={[styles.confirmText, { color: C.mutedText }]}>Are you sure you want to logout?</TText>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setLogoutConfirmVisible(false)}
                style={[styles.confirmBtn, { backgroundColor: C.surfaceAlt, borderColor: C.borderStrong }]}
              >
                <TText style={[styles.confirmBtnText, { color: C.text }]}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={confirmLogout} style={[styles.confirmBtn, styles.confirmBtnDanger]}>
                <TText style={[styles.confirmBtnText, { color: C.white }]}>Logout</TText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  headerLogo: { width: 70, height: 36 },
  headerTitle: { fontSize: 16, fontWeight: "900" },
  headerSpacer: { width: 34, height: 34 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 14 },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center" },
  heroTextWrap: { flex: 1 },
  heroEyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  heroTitle: { fontSize: 20, fontWeight: "900", marginTop: 6 },
  heroSubTitle: { fontSize: 13, fontWeight: "600", marginTop: 4, lineHeight: 20 },
  heroCountChip: {
    minWidth: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  heroCountText: { fontSize: 24, fontWeight: "900" },
  slideshowContainer: { height: 240, width: "100%", marginBottom: 14 },
  slideItem: { width: width - 28, alignItems: "center", justifyContent: "center" },
  slideshowImage: { width: width - 28, height: 240, resizeMode: "cover", borderRadius: 18 },
  projectTitle: {
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 2,
  },
  projectSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
  },
  textContainer: {
    width: "100%",
    alignSelf: "center",
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  slideText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 22,
    textAlign: "center",
  },
  videoWrap: {
    height: 210,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 14,
    borderWidth: 1,
  },
  videoThumbCard: {
    marginTop: 14,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
  },
  videoThumb: { height: 200, width: "100%", borderRadius: 12 },
  videoLinkText: { textAlign: "center", marginTop: 8, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 10,
    gap: 12,
  },
  sectionHeaderTextWrap: { flex: 1, paddingRight: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  sectionSubTitle: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  sectionCountPill: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  sectionCountText: { fontSize: 15, fontWeight: "900" },
  propertiesHeroCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginTop: 4,
    marginBottom: 18,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  propertiesHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  propertiesHeroTextWrap: { flex: 1 },
  propertiesHeroEyebrow: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  propertiesHeroTitle: { fontSize: 20, fontWeight: "900", marginTop: 6 },
  propertiesHeroSubTitle: { fontSize: 13, fontWeight: "600", marginTop: 6, lineHeight: 20 },
  propertiesHeroCountCard: {
    minWidth: 84,
    minHeight: 84,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  propertiesHeroCount: { fontSize: 28, fontWeight: "900" },
  propertiesHeroCountLabel: { fontSize: 11, fontWeight: "800", marginTop: 4, textTransform: "uppercase" },
  propertiesHeroMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  propertiesHeroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  propertiesHeroBadgeText: { fontSize: 12, fontWeight: "700" },
  propertyListHeader: {
    marginBottom: 10,
  },
  propertyListTitle: { fontSize: 17, fontWeight: "900" },
  propertyListSubTitle: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  propertyCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  propertyCardTop: { flexDirection: "row", alignItems: "center" },
  propertyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  propertyTextWrap: { flex: 1 },
  propertyName: { fontSize: 15, fontWeight: "900" },
  propertyProject: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  propertyArrowWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyMetaRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  metaChipText: { fontSize: 12, fontWeight: "700" },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 15, fontWeight: "900", marginTop: 10 },
  emptySubTitle: { fontSize: 12, fontWeight: "600", textAlign: "center", marginTop: 6, lineHeight: 19 },
  profileOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  profileCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderWidth: 1,
  },
  profileHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.40)",
    marginBottom: 14,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 20, fontWeight: "900" },
  profileHeaderText: { flex: 1 },
  profileName: { fontSize: 16, fontWeight: "900" },
  profileSub: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  infoCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
  appearanceCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginTop: 12,
  },
  appearanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 10,
  },
  appearanceTitle: { fontSize: 12, fontWeight: "900" },
  appearanceHint: { fontSize: 11, fontWeight: "600", flex: 1, textAlign: "right" },
  textSizeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  textSizeA: { fontSize: 12, fontWeight: "900" },
  textSizeABig: { fontSize: 16, fontWeight: "900" },
  sliderShell: { flex: 1, height: 30, justifyContent: "center" },
  sliderLine: {
    position: "absolute",
    left: 2,
    right: 2,
    height: 4,
    borderRadius: 999,
  },
  tickRow: {
    position: "absolute",
    left: 2,
    right: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tick: { width: 2, height: 10, borderRadius: 2 },
  nativeSlider: { width: "100%", height: 30 },
  textSizeValueChip: {
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  textSizeHint: { marginTop: 8, fontSize: 11, fontWeight: "600" },
  themeModeRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  themeModeBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  themeScheduleWrap: { flexDirection: "row", gap: 10, marginTop: 10 },
  themeScheduleBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  themeScheduleLabel: { fontSize: 11, fontWeight: "700" },
  themeScheduleValue: { fontSize: 14, fontWeight: "900", marginTop: 4 },
  footer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
  },
  footerBtn: { alignItems: "center", justifyContent: "center", width: 76 },
  footerLabel: { fontSize: 11, fontWeight: "800", marginTop: 4 },
  logoutButton: {
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  logoutText: { fontSize: 13, fontWeight: "800" },
  confirmOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  confirmCard: {
    width: 330,
    maxWidth: "92%",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  confirmTitle: { fontSize: 15, fontWeight: "900" },
  confirmText: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  confirmBtn: {
    minWidth: 92,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  confirmBtnDanger: {
    backgroundColor: "#ef4444",
    borderWidth: 0,
  },
  confirmBtnText: { fontSize: 12, fontWeight: "800" },
  timeInputShell: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
});

export default CustomerHomeScreen;
