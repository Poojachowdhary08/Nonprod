import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// app/PropertiesListScreen.tsx

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  UIManager,
  LayoutAnimation,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import NetInfo from "@react-native-community/netinfo";

import ViewSchedulesForm from "./ViewSchedulesForm";
import TaskSchedule from "./TaskSchedule";
import PropertyInventory from "./PropertyInventory";
import PropertyReviewEngineer from "./PropertyReviewEngineer";
import PropertyHistory from "./PropertyHistory";
import PropertyWorkers from "./PropertyWorkers";
import PropertyDetailsScreen from "./PropertyDetailsScreen";

import AppFooterNav, { FooterNavItem } from "./AppFooterNav";

import {
  trackScreen,
  trackUI,
  updateDynamicContext,
  clearDynamicContext,
  startScreenTimer,
} from "../utils/telemetry";
import {
  buildPropertyRouteContext,
  saveLastPropertyRouteContext,
  toPropertyRouteParams,
} from "../utils/propertyRouteContext";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type GridItem = {
  id: number;
  title: string;
  subtitle: string;
  iconName?: string;
  details: JSX.Element | null;
  actionIcons?: JSX.Element;
  onPress?: () => void;
};

type RawPropertyDetails = Record<string, any>;

type NormalizedPropertyDetails = {
  propertyId: string;
  propertyName: string;
  location: string;
  type: string;
  subtype: string;
  phases: string;
  dimensions: string;
  owner: string;
  ownerType: string;
  remarks: string;
  projectId: string;
};

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bg: "#F5F7FB",
  card: "#FFFFFF",
  border: "#E6EAF2",
  text: "#1B2B41",
  muted: "#6B7A90",
  accent: "#2C7BE5",
  accentSoft: "#E8F1FF",
  shadow: "#0F172A",
  disabledText: "#9AA0A6",
  chatGreen: "#22C55E",
  badgeRed: "#EF4444",
  danger: "#DC2626",
};

const FOOTER_BASE_HEIGHT = 64;
const MAP_SECTION_ID = 999;
const PROPERTY_DETAILS_SECTION_ID = 1000;

const safeString = (value: any) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const firstNonEmpty = (...values: any[]) => {
  for (const value of values) {
    const s = safeString(value);
    if (s) return s;
  }
  return "";
};

const normalizePropertyDetails = (
  raw: RawPropertyDetails | null | undefined,
  fallbacks: {
    propertyId?: string;
    propertyName?: string;
    projectId?: string;
    location?: string;
  }
): NormalizedPropertyDetails => {
  const data = raw || {};

  return {
    propertyId: firstNonEmpty(
      data.propertyid,
      data.propertyId,
      data.property_id,
      data.id,
      fallbacks.propertyId
    ),
    propertyName: firstNonEmpty(
      data.property_name,
      data.propertyName,
      data.name,
      data.title,
      fallbacks.propertyName
    ),
    location: firstNonEmpty(
      data.location,
      data.address,
      data.project_location,
      data.projectLocation,
      fallbacks.location
    ),
    type: firstNonEmpty(
      data.type,
      data.property_type,
      data.propertyType
    ),
    subtype: firstNonEmpty(
      data.subtype,
      data.sub_type,
      data.property_subtype,
      data.propertySubtype
    ),
    phases: firstNonEmpty(
      data.constructionphases,
      data.construction_phases,
      data.phases,
      data.phase
    ),
    dimensions: firstNonEmpty(
      data.dimensions,
      data.dimension,
      data.size,
      data.area
    ),
    owner: firstNonEmpty(
      data.owner,
      data.owner_name,
      data.ownerName,
      data.client_name,
      data.clientName
    ),
    ownerType: firstNonEmpty(
      data.ownerType,
      data.owner_type,
      data.ownership_type,
      data.ownershipType
    ),
    remarks: firstNonEmpty(
      data.remarks,
      data.remark,
      data.notes,
      data.description
    ),
    projectId: firstNonEmpty(
      data.projectId,
      data.project_id,
      fallbacks.projectId
    ),
  };
};

const InlineRow = ({
  icon,
  label,
  value,
  testID,
  showEmpty = false,
}: {
  icon: any;
  label: string;
  value: string;
  testID: string;
  showEmpty?: boolean;
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  if (!showEmpty && !safeString(value)) return null;
  const displayValue = safeString(value) || "-";

  return (
    <View style={styles.inlineRow} testID={testID}>
      <View style={styles.inlineLeft}>
        <Ionicons name={icon} size={16} color={C.mutedText} style={{ marginRight: 8 }} />
        <TText style={[styles.inlineLabel, { color: C.text }]}>{label}</TText>
      </View>
      <TText style={[styles.inlineValue, { color: C.text }]}>{displayValue}</TText>
    </View>
  );
};

const PropertiesListScreen: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const AVENUE_LOGO_URL =
    "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

  const routeContext = useMemo(() => buildPropertyRouteContext(params), [params]);
  const selectedSectionParam = safeString(
    (Array.isArray(params.selectedSection) ? params.selectedSection[0] : params.selectedSection) ??
      (Array.isArray(params.selected_section) ? params.selected_section[0] : params.selected_section) ??
      ""
  );

  const cleanPropertyId = safeString(routeContext.propertyId);
  const cleanProjectId = safeString(routeContext.projectId);
  const routePropertyName = safeString(routeContext.propertyName);
  const routeProjectName = safeString((routeContext as any).projectName);
  const routeProjectLocation = safeString(routeContext.projectLocation);

  const initialSectionNum = useMemo(() => {
    const n = Number(selectedSectionParam);
    if (Number.isFinite(n) && n !== 0) return n;
    return 2;
  }, [selectedSectionParam]);

  const userDetails = useMemo(() => routeContext.userDetails || {}, [routeContext.userDetails]);

  const [online, setOnline] = useState<boolean>(true);
  const lastNetRef = useRef<{ online?: boolean }>({ online: undefined });

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const nextOnline = !!(state.isConnected && state.isInternetReachable !== false);
      setOnline(nextOnline);

      if (lastNetRef.current.online !== nextOnline) {
        lastNetRef.current.online = nextOnline;
        trackUI({
          screen: "PropertiesListScreen",
          element: "netinfo",
          action: "change",
          extra: {
            online: nextOnline,
            isConnected: state.isConnected,
            isInternetReachable: state.isInternetReachable,
            type: (state as any)?.type || null,
          },
        });
      }
    });

    (async () => {
      const s = await NetInfo.fetch();
      const nextOnline = !!(s.isConnected && s.isInternetReachable !== false);
      setOnline(nextOnline);
      lastNetRef.current.online = nextOnline;
    })();

    return () => sub && sub();
  }, []);

  const [propertyDetailsRaw, setPropertyDetailsRaw] = useState<RawPropertyDetails | null>(null);
  const [propertyLoading, setPropertyLoading] = useState<boolean>(false);
  const [propertyError, setPropertyError] = useState<string>("");

  const fetchPropertyDetails = useCallback(async () => {
    if (!cleanPropertyId) {
      setPropertyDetailsRaw(null);
      setPropertyError("Property ID is missing.");
      return;
    }

    if (!online) return;

    try {
      setPropertyLoading(true);
      setPropertyError("");

      const response = await authenticatedFetch(`/properties/${cleanPropertyId}`);
      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }

      const data = await response.json();
      const found = data?.property ?? data?.data ?? data ?? null;
      if (!found) throw new Error("Failed to load property details.");

      setPropertyDetailsRaw(found);
    } catch (err: any) {
      console.log("fetchPropertyDetails error:", err);
      setPropertyDetailsRaw(null);
      setPropertyError(err?.message || "Failed to load property details.");
    } finally {
      setPropertyLoading(false);
    }
  }, [cleanPropertyId, online]);

  useEffect(() => {
    if (!cleanPropertyId || !online) return;
    fetchPropertyDetails();
  }, [cleanPropertyId, online, fetchPropertyDetails]);

  const normalizedProperty = useMemo(() => {
    return normalizePropertyDetails(propertyDetailsRaw, {
      propertyId: cleanPropertyId,
      propertyName: routePropertyName,
      projectId: cleanProjectId,
      location: routeProjectLocation,
    });
  }, [
    propertyDetailsRaw,
    cleanPropertyId,
    routePropertyName,
    cleanProjectId,
    routeProjectLocation,
  ]);

  const resolvedPropertyName = normalizedProperty.propertyName || cleanPropertyId || "Property";
  const resolvedProjectLocation = normalizedProperty.location || "Location not available";

  useEffect(() => {
    saveLastPropertyRouteContext({
      propertyId: cleanPropertyId,
      projectId: cleanProjectId,
      propertyName: resolvedPropertyName,
      projectName: routeProjectName,
      projectLocation: normalizedProperty.location,
      userDetails,
    });
  }, [
    cleanPropertyId,
    cleanProjectId,
    resolvedPropertyName,
    routeProjectName,
    normalizedProperty.location,
    userDetails,
  ]);

  useEffect(() => {
    updateDynamicContext({
      screen: "PropertiesListScreen",
      propertyId: cleanPropertyId || null,
      projectId: cleanProjectId || null,
      projectLocation: normalizedProperty.location || null,
      propertyName: resolvedPropertyName || null,
      online,
    });

    trackScreen("PropertiesListScreen", {
      propertyId: cleanPropertyId || null,
      projectId: cleanProjectId || null,
      propertyName: resolvedPropertyName || null,
      online,
    });

    const stop = startScreenTimer("PropertiesListScreen", {
      propertyId: cleanPropertyId || null,
      projectId: cleanProjectId || null,
      online,
    });

    return () => {
      stop?.();
      clearDynamicContext();
    };
  }, [
    cleanPropertyId,
    cleanProjectId,
    normalizedProperty.location,
    resolvedPropertyName,
    online,
  ]);

  const [selectedSection, setSelectedSection] = useState<number>(initialSectionNum);
  const [calendarMode, setCalendarMode] = useState<boolean>(false);

  const toggleDetails = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCalendarMode(false);
    setSelectedSection((current) =>
      current === PROPERTY_DETAILS_SECTION_ID ? 2 : PROPERTY_DETAILS_SECTION_ID
    );
  }, []);

  useEffect(() => {
    setSelectedSection(initialSectionNum);
    setCalendarMode(false);
  }, [initialSectionNum]);

  const getDetailsBySection = useCallback(
    (id: number): JSX.Element | null => {
      try {
        if (!cleanPropertyId && id !== 0) {
          return (
            <View style={styles.emptyStateBox} testID="property-missing-id-state">
              <Ionicons name="warning-outline" size={28} color={C.danger} />
              <TText style={styles.emptyStateTitle}>Property ID missing</TText>
              <TText style={styles.emptyStateText}>
                This screen did not receive a valid property ID.
              </TText>
            </View>
          );
        }

        if (id === MAP_SECTION_ID) {
          return (
            <PropertyDetailsScreen
              propertyId={cleanPropertyId}
              propertyLocation={normalizedProperty.location}
              online={online}
            />
          );
        }

        if (id === PROPERTY_DETAILS_SECTION_ID) {
          return (
            <View style={styles.propertyDetailsPanel} testID="property-details-panel">
              {!online && (
                <TText style={[styles.offlineNote, { color: C.danger }]} testID="property-inline-offline-note">
                  Offline: showing only basic info. Details need internet.
                </TText>
              )}

              {online && propertyLoading && (
                <View style={styles.inlineLoader} testID="property-inline-loader">
                  <ActivityIndicator size="small" color={C.primary} />
                  <TText style={[styles.inlineLoaderText, { color: C.mutedText }]}>
                    Loading property details...
                  </TText>
                </View>
              )}

              {online && !propertyLoading && !!propertyError && (
                <View style={styles.errorBox} testID="property-inline-error">
                  <Ionicons name="alert-circle-outline" size={18} color={C.danger} />
                  <TText style={[styles.errorText, { color: C.danger }]}>{propertyError}</TText>
                </View>
              )}

              {online && !propertyLoading && (
                <View style={styles.detailsBody}>
                  <View style={styles.detailsSummaryGrid}>
                    <View style={styles.detailsSummaryCard}>
                      <TText style={styles.detailsSummaryLabel}>Property</TText>
                      <TText style={styles.detailsSummaryValue} numberOfLines={2}>{resolvedPropertyName}</TText>
                    </View>
                    <View style={styles.detailsSummaryCard}>
                      <TText style={styles.detailsSummaryLabel}>Project</TText>
                      <TText style={styles.detailsSummaryValue} numberOfLines={2}>{normalizedProperty.projectId || cleanProjectId || "-"}</TText>
                    </View>
                    <View style={styles.detailsSummaryCard}>
                      <TText style={styles.detailsSummaryLabel}>Location</TText>
                      <TText style={styles.detailsSummaryValue} numberOfLines={2}>{resolvedProjectLocation}</TText>
                    </View>
                    <View style={styles.detailsSummaryCard}>
                      <TText style={styles.detailsSummaryLabel}>Property ID</TText>
                      <TText style={styles.detailsSummaryValue} numberOfLines={2}>{normalizedProperty.propertyId || "-"}</TText>
                    </View>
                  </View>

                  <View style={styles.detailsRowsCard}>
                    <InlineRow icon="pricetag-outline" label="Type" value={normalizedProperty.type} testID="property-inline-row-type" showEmpty />
                    <InlineRow icon="layers-outline" label="Sub Type" value={normalizedProperty.subtype} testID="property-inline-row-subtype" showEmpty />
                    <InlineRow icon="construct-outline" label="Phases" value={normalizedProperty.phases} testID="property-inline-row-phases" showEmpty />
                    <InlineRow icon="resize-outline" label="Dimensions" value={normalizedProperty.dimensions} testID="property-inline-row-dimensions" showEmpty />
                    <InlineRow icon="person-outline" label="Owner" value={normalizedProperty.owner} testID="property-inline-row-owner" showEmpty />
                    <InlineRow icon="briefcase-outline" label="Owner Type" value={normalizedProperty.ownerType} testID="property-inline-row-owner-type" showEmpty />
                    <InlineRow icon="chatbox-ellipses-outline" label="Remarks" value={normalizedProperty.remarks} testID="property-inline-row-remarks" showEmpty />
                  </View>
                </View>
              )}

              {online &&
                !propertyLoading &&
                !propertyError &&
                !normalizedProperty.type &&
                !normalizedProperty.subtype &&
                !normalizedProperty.phases &&
                !normalizedProperty.dimensions &&
                !normalizedProperty.owner &&
                !normalizedProperty.ownerType &&
                !normalizedProperty.remarks && (
                  <View style={styles.errorBox} testID="property-inline-empty">
                    <Ionicons name="information-circle-outline" size={18} color={C.mutedText} />
                    <TText style={[styles.errorText, { color: C.mutedText }]}>
                      Details API returned no visible fields for this property.
                    </TText>
                  </View>
                )}
            </View>
          );
        }

        if (id === 2) {
          if (calendarMode) {
            return (
              <TaskSchedule
                propertyId={cleanPropertyId}
                projectId={cleanProjectId}
                userDetails={userDetails}
              />
            );
          }

          return (
            <ViewSchedulesForm
              propertyId={cleanPropertyId}
              userDetails={userDetails}
              projectId={cleanProjectId}
            />
          );
        }

        if (id === 3) {
          return (
            <PropertyInventory
              propertyId={cleanPropertyId}
              userDetails={userDetails}
              projectId={cleanProjectId}
            />
          );
        }

        if (id === 4) {
          return (
            <PropertyWorkers
              propertyId={cleanPropertyId}
              projectId={cleanProjectId}
            />
          );
        }

        if (id === 5) {
          return (
            <PropertyHistory
              propertyId={cleanPropertyId}
              projectId={cleanProjectId}
              userDetails={userDetails}
            />
          );
        }

        if (id === 7) {
          return (
            <PropertyReviewEngineer
              propertyId={cleanPropertyId}
              projectId={cleanProjectId}
              userDetails={userDetails}
            />
          );
        }

        return (
          <ViewSchedulesForm
            propertyId={cleanPropertyId}
            userDetails={userDetails}
            projectId={cleanProjectId}
          />
        );
      } catch (err) {
        console.log("getDetailsBySection render error:", err);
        return (
          <View style={styles.emptyStateBox} testID="property-section-render-error">
            <Ionicons name="alert-circle-outline" size={28} color={C.danger} />
            <TText style={styles.emptyStateTitle}>Unable to load section</TText>
            <TText style={styles.emptyStateText}>
              Something failed while rendering this section.
            </TText>
          </View>
        );
      }
    },
    [cleanPropertyId, cleanProjectId, normalizedProperty, online, userDetails, calendarMode, propertyLoading, propertyError]
  );

  const openMapInline = useCallback(() => {
    if (!online) {
      Alert.alert("Offline", "Map is unavailable offline.");
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCalendarMode(false);
    setSelectedSection(MAP_SECTION_ID);
  }, [online]);

  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);

  const SchedulesToolbar = useMemo(() => {
    const listActive = !calendarMode;
    const calendarActive = calendarMode;
    return (
      <View style={styles.toolbar} testID="schedule-toolbar">
        <TouchableOpacity
          testID="schedule-toolbar-list-btn"
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setCalendarMode(false);
            setSelectedSection(2);
          }}
          style={[
            styles.toolbarBtn,
            {
              backgroundColor: listActive ? C.primarySoft : C.surfaceAlt,
              borderColor: listActive ? C.primaryStrong : C.border,
            },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons name="list" size={20} color={listActive ? C.primaryStrong : C.mutedText} />
        </TouchableOpacity>

        {online && (
          <TouchableOpacity
            testID="schedule-toolbar-workflow-btn"
            onPress={() => {
              router.push({
                pathname: "/TaskWorkflowWrapper",
                params: toPropertyRouteParams({
                  propertyId: cleanPropertyId,
                  projectId: cleanProjectId,
                  propertyName: resolvedPropertyName,
                  projectName: routeProjectName,
                  projectLocation: normalizedProperty.location,
                  userDetails,
                }),
              } as any);
            }}
            style={[
              styles.toolbarBtn,
              {
                backgroundColor: C.surfaceAlt,
                borderColor: C.border,
              },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons name="git-network-outline" size={20} color={C.mutedText} />
          </TouchableOpacity>
        )}

        {online && (
          <TouchableOpacity
            testID="schedule-toolbar-calendar-btn"
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setCalendarMode(true);
              setSelectedSection(2);
            }}
            style={[
              styles.toolbarBtn,
              {
                backgroundColor: calendarActive ? C.primarySoft : C.surfaceAlt,
                borderColor: calendarActive ? C.primaryStrong : C.border,
              },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color={calendarActive ? C.primaryStrong : C.mutedText} />
          </TouchableOpacity>
        )}
      </View>
    );
  }, [online, cleanPropertyId, cleanProjectId, userDetails, router, calendarMode, C]);

  const items: GridItem[] = [
    {
      id: 0,
      title: "Back",
      subtitle: "",
      iconName: "arrow-back-outline",
      details: null,
      onPress: () => router.back(),
    },
    {
      id: 2,
      title: "Schedules",
      subtitle: "View schedules",
      iconName: "calendar-outline",
      details: (
        <ViewSchedulesForm
          propertyId={cleanPropertyId}
          projectId={cleanProjectId}
          userDetails={userDetails}
        />
      ),
      actionIcons: SchedulesToolbar,
    },
    {
      id: 3,
      title: "Inventory",
      subtitle: "Requested Inventory",
      iconName: "list-outline",
      details: (
        <PropertyInventory
          propertyId={cleanPropertyId}
          projectId={cleanProjectId}
          userDetails={userDetails}
        />
      ),
    },
    {
      id: 4,
      title: "Labour",
      subtitle: "Labour & Contractor",
      iconName: "people-outline",
      details: (
        <PropertyWorkers
          propertyId={cleanPropertyId}
          projectId={cleanProjectId}
        />
      ),
    },
    {
      id: 5,
      title: "Documents",
      subtitle: "View documents",
      iconName: "document-text-outline",
      details: (
        <PropertyHistory
          propertyId={cleanPropertyId}
          projectId={cleanProjectId}
          userDetails={userDetails}
        />
      ),
    },
    {
      id: 7,
      title: "Review",
      subtitle: "Engineer review",
      iconName: "construct-outline",
      details: (
        <PropertyReviewEngineer
          propertyId={cleanPropertyId}
          projectId={cleanProjectId}
          userDetails={userDetails}
        />
      ),
    },
  ];

  const openChats = useCallback(() => {
    if (!online) {
      Alert.alert("Offline", "Chats are unavailable offline.");
      return;
    }

    router.push({
      pathname: "/PropertyChatsWrapper",
      params: toPropertyRouteParams({
        propertyId: cleanPropertyId,
        projectId: cleanProjectId,
        propertyName: resolvedPropertyName,
        projectName: routeProjectName,
        projectLocation: normalizedProperty.location,
        userDetails,
      }),
    } as any);
  }, [
    online,
    cleanPropertyId,
    cleanProjectId,
    resolvedPropertyName,
    normalizedProperty.location,
    userDetails,
    router,
  ]);

  const handleSelect = useCallback(
    (item: GridItem) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      if (item.id === 0) {
        item.onPress?.();
        return;
      }

      const disabled = isDisabledOffline(item.id);
      if (disabled) {
        Alert.alert("Offline", "This section is unavailable offline.");
        return;
      }

      setCalendarMode(false);
      setSelectedSection(item.id);
    },
    [online]
  );

  const currentDetails = useMemo(() => {
    return getDetailsBySection(selectedSection);
  }, [getDetailsBySection, selectedSection]);
  const footerOffset = FOOTER_BASE_HEIGHT + Math.max(insets.bottom, 0);

  const selectedTitle =
    selectedSection === MAP_SECTION_ID
      ? "Map"
      : selectedSection === PROPERTY_DETAILS_SECTION_ID
        ? "Details"
      : items.find((it) => it.id === selectedSection)?.title || "Schedules";

  const selectedSubtitle =
    selectedSection === MAP_SECTION_ID
      ? "Property location"
      : selectedSection === PROPERTY_DETAILS_SECTION_ID
        ? "Property details"
      : items.find((it) => it.id === selectedSection)?.subtitle || "";

  const footerItems: FooterNavItem[] = useMemo(
    () => [
      { id: 0, title: "Back", iconName: "arrow-back-outline" },
      { id: 2, title: "Schedules", iconName: "calendar-outline" },
      { id: 3, title: "Inventory", iconName: "list-outline" },
      { id: 4, title: "Labour", iconName: "people-outline" },
      { id: 5, title: "Documents", iconName: "document-text-outline" },
      { id: 7, title: "Review", iconName: "construct-outline" },
    ],
    []
  );

  const onFooterSelect = useCallback(
    (it: FooterNavItem) => {
      const grid = items.find((x) => x.id === it.id);
      if (grid) handleSelect(grid);
    },
    [items, handleSelect]
  );

  return (
    <View style={[styles.rootContainer, { backgroundColor: C.bg }]} testID="properties-list-screen-root">
      <SafeAreaView style={[styles.safeTop, { backgroundColor: C.headerBg }]} />

      <View style={[styles.mainContent, { paddingBottom: footerOffset }]}>
        <View
          style={[styles.headerContainer, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}
          testID="properties-list-header"
        >
          <Image
            source={{ uri: AVENUE_LOGO_URL }}
            style={styles.logo}
            resizeMode="contain"
            testID="properties-list-logo"
          />

          <TText
            style={[styles.headerTitle, { color: C.text }]}
            numberOfLines={1}
            testID="properties-list-title"
          >
            {selectedTitle}
          </TText>

          <TouchableOpacity
            testID="properties-list-home-btn"
            onPress={() => router.push("/HomeScreen")}
            style={styles.headerIconBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="home" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <View
          testID="properties-list-scroll"
          style={styles.scrollArea}
        >
          <View
            style={[styles.propertyCard, { backgroundColor: C.surface, borderColor: C.border }]}
            testID="property-summary-card"
          >
            <View style={{ flex: 1 }}>
              <View style={styles.propertyTopRow}>
                <TText
                  style={[styles.propertyCardTitle, { color: C.text }]}
                  numberOfLines={1}
                  testID="property-summary-title"
                >
                  {resolvedPropertyName}
                </TText>

                <View style={styles.topActions}>
                  <TouchableOpacity
                    testID="property-summary-map-btn"
                    onPress={openMapInline}
                    activeOpacity={0.85}
                    style={[styles.mapPillBtn, { borderColor: C.border, backgroundColor: C.primarySoft }]}
                  >
                    <Ionicons name="map-outline" size={16} color={C.primary} />
                    <TText style={[styles.mapPillText, { color: C.primary }]}>Map</TText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    testID="property-summary-toggle-details-btn"
                    onPress={toggleDetails}
                    activeOpacity={0.85}
                    style={[styles.collapseBtn, { borderColor: C.border, backgroundColor: C.surfaceAlt }]}
                  >
                    <Ionicons
                      name={selectedSection === PROPERTY_DETAILS_SECTION_ID ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={C.mutedText}
                    />
                    <TText style={[styles.collapseBtnText, { color: C.mutedText }]}>
                      {selectedSection === PROPERTY_DETAILS_SECTION_ID ? "Hide" : "Show"}
                    </TText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.propertyCardRow}>
                <Ionicons name="location-outline" size={16} color={C.mutedText} />
                <TText
                  style={[styles.propertyCardSub, { color: C.mutedText }]}
                  testID="property-summary-location"
                >
                  {resolvedProjectLocation}
                </TText>
              </View>

              <View style={styles.propertyCardRow}>
                <Ionicons name="key-outline" size={16} color={C.mutedText} />
                <TText
                  style={[styles.propertyCardSub, { color: C.mutedText }]}
                  testID="property-summary-id"
                >
                  {normalizedProperty.propertyId || "-"}
                </TText>
              </View>

            </View>
          </View>

          <View
            style={[styles.sectionWrapper, { backgroundColor: C.surface, borderColor: C.border }]}
            testID="property-section-wrapper"
          >
            <View style={styles.sectionHeader}>
              <TText
                style={[styles.sectionTitle, { color: C.text }]}
                testID="property-section-title"
              >
                {selectedSubtitle}
              </TText>
              {items.find((it) => it.id === selectedSection)?.actionIcons}
            </View>

            <View style={styles.sectionContent} testID="property-section-content">
              {currentDetails}
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity
        testID="property-chats-fab"
        onPress={openChats}
        activeOpacity={0.9}
        style={[styles.fab, { bottom: footerOffset + 14, backgroundColor: C.primaryStrong }]}
      >
        <Ionicons name="chatbubble-ellipses" size={20} color={C.white} />
      </TouchableOpacity>

      <View
        style={[styles.footerWrapper, { backgroundColor: C.surface, borderTopColor: C.border }]}
        testID="properties-list-footer-wrapper"
      >
        <AppFooterNav
          items={footerItems}
          selectedSection={selectedSection}
          online={online}
          isDisabledOffline={isDisabledOffline}
          onSelect={onFooterSelect}
          colors={{
            border: C.border,
            accent: C.primary,
            accentSoft: C.primarySoft,
            muted: C.mutedText,
            disabledText: C.navIconInactive,
          }}
          useBottomInset={true}
        />
      </View>
    </View>
  );
};

export default PropertiesListScreen;

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  safeTop: {
    backgroundColor: "#FFFFFF",
  },

  mainContent: {
    flex: 1,
    minHeight: 0,
    paddingBottom: FOOTER_BASE_HEIGHT,
  },

  scrollArea: {
    flex: 1,
    minHeight: 0,
  },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },

  logo: {
    width: 68,
    height: 40,
  },

  headerIconBtn: {
    padding: 6,
    borderRadius: 999,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginHorizontal: 8,
  },

  propertyCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 12,
    marginTop: 12,
    minHeight: 102,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  propertyTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },

  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  mapPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.accentSoft,
  },

  mapPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.accent,
  },

  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
  },

  collapseBtnText: {
    marginLeft: 6,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.muted,
  },

  propertyCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
  },

  propertyCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 6,
  },

  propertyCardSub: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    flex: 1,
  },

  inlineDetailsWrap: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },

  propertyDetailsPanel: {
    flex: 1,
    minHeight: 0,
  },

  detailsBody: {
    gap: 10,
  },

  detailsSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  detailsSummaryCard: {
    width: "48%",
    minHeight: 68,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EAF2",
    backgroundColor: "#F8FAFF",
    padding: 10,
    justifyContent: "center",
  },

  detailsSummaryLabel: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: "800",
    marginBottom: 5,
  },

  detailsSummaryValue: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "900",
    lineHeight: 15,
  },

  detailsRowsCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E6EAF2",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
  },

  offlineNote: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.danger,
    marginBottom: 8,
  },

  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },

  inlineLoaderText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
  },

  inlineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  inlineLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },

  inlineLabel: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "600",
  },

  inlineValue: {
    flex: 1,
    fontSize: 11,
    color: "#0F172A",
    textAlign: "right",
    fontWeight: "600",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },

  errorText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: "700",
    flex: 1,
  },

  emptyStateBox: {
    marginTop: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyStateTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },

  emptyStateText: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: "center",
  },

  sectionWrapper: {
    flex: 1,
    minHeight: 0,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: "hidden",
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text,
  },

  sectionContent: {
    flex: 1,
    minHeight: 0,
    paddingTop: 6,
  },

  toolbar: {
    flexDirection: "row",
    backgroundColor: "#F3F6FB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  toolbarBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },

  fab: {
    position: "absolute",
    right: 18,
    width: 50,
    height: 50,
    borderRadius: 31,
    backgroundColor: "#3e79f7",
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    zIndex: 100,
  },

  footerWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    zIndex: 50,
  },
});
