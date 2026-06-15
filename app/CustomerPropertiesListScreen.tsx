import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PropertiesDetailsScreen from "./PropertyDetailsScreen";
import CustomerTaskWorkflow from "./CustomerTaskWorkflow";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type GridItem = {
    id: number;
    title: string;
    subtitle: string;
    icon: JSX.Element;
    details: JSX.Element | null;
    actionIcons?: JSX.Element;
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
        propertyId: firstNonEmpty(data.propertyid, data.propertyId, data.property_id, data.id, fallbacks.propertyId),
        propertyName: firstNonEmpty(data.property_name, data.propertyName, data.name, data.title, fallbacks.propertyName),
        location: firstNonEmpty(data.location, data.address, data.project_location, data.projectLocation, fallbacks.location),
        type: firstNonEmpty(data.type, data.property_type, data.propertyType),
        subtype: firstNonEmpty(data.subtype, data.sub_type, data.property_subtype, data.propertySubtype),
        phases: firstNonEmpty(data.constructionphases, data.construction_phases, data.phases, data.phase),
        dimensions: firstNonEmpty(data.dimensions, data.dimension, data.size, data.area),
        owner: firstNonEmpty(data.owner, data.owner_name, data.ownerName, data.client_name, data.clientName),
        ownerType: firstNonEmpty(data.ownerType, data.owner_type, data.ownership_type, data.ownershipType),
        remarks: firstNonEmpty(data.remarks, data.remark, data.notes, data.description),
        projectId: firstNonEmpty(data.projectId, data.project_id, fallbacks.projectId),
    };
};

const DetailRow = ({
    icon,
    label,
    value,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
}) => {
    const { theme } = useTheme();
    const C = theme.colors;
    if (!safeString(value)) return null;

    return (
        <View style={[detailStyles.inlineRow, { borderBottomColor: C.border }]}>
            <View style={detailStyles.inlineLeft}>
                <Ionicons name={icon} size={16} color={C.mutedText} style={{ marginRight: 8 }} />
                <TText style={[detailStyles.inlineLabel, { color: C.text }]}>{label}</TText>
            </View>
            <TText style={[detailStyles.inlineValue, { color: C.text }]}>{value}</TText>
        </View>
    );
};

const CustomerPropertyDetails = ({
    propertyId,
    propertyName,
    projectId,
    propertyLocation,
}: {
    propertyId: string;
    propertyName: string;
    projectId?: string;
    propertyLocation?: string;
}) => {
    const { theme } = useTheme();
    const C = theme.colors;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [propertyDetailsRaw, setPropertyDetailsRaw] = useState<RawPropertyDetails | null>(null);

    useEffect(() => {
        const fetchPropertyDetails = async () => {
            if (!propertyId) return;

            try {
                setLoading(true);
                setError("");

                const response = await authenticatedFetch(`/properties/${propertyId}`);
                if (!response.ok) {
                    throw new Error(`Failed: ${response.status}`);
                }

                const data = await response.json();
                const found = data?.property ?? data?.data ?? data ?? null;
                if (!found) throw new Error("Failed to load property details.");
                setPropertyDetailsRaw(found);
            } catch (err: any) {
                console.log("customer property details error:", err);
                setPropertyDetailsRaw(null);
                setError(err?.message || "Failed to load property details.");
            } finally {
                setLoading(false);
            }
        };

        fetchPropertyDetails();
    }, [propertyId]);

    const normalizedProperty = useMemo(
        () =>
            normalizePropertyDetails(propertyDetailsRaw, {
                propertyId,
                propertyName,
                projectId,
                location: propertyLocation,
            }),
        [propertyDetailsRaw, propertyId, propertyName, projectId, propertyLocation]
    );

    return (
        <View>
            <View style={[detailStyles.summaryCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                <View style={detailStyles.summaryTop}>
                    <View style={detailStyles.summaryTextWrap}>
                        <TText style={[detailStyles.summaryTitle, { color: C.text }]}>
                            {normalizedProperty.propertyName || propertyId || "Property"}
                        </TText>
                        <TText style={[detailStyles.summarySubtitle, { color: C.mutedText }]}>
                            {normalizedProperty.location || "Location not available"}
                        </TText>
                    </View>
                    <View style={[detailStyles.summaryPill, { backgroundColor: C.primarySoft }]}>
                        <Ionicons name="home-outline" size={16} color={C.primaryStrong} />
                    </View>
                </View>

                {loading ? (
                    <View style={detailStyles.loadingWrap}>
                        <ActivityIndicator size="small" color={C.primaryStrong} />
                        <TText style={[detailStyles.loadingText, { color: C.mutedText }]}>Loading property details…</TText>
                    </View>
                ) : error ? (
                    <TText style={[detailStyles.errorText, { color: C.danger }]}>{error}</TText>
                ) : (
                    <View style={detailStyles.rowsWrap}>
                        <DetailRow icon="pricetag-outline" label="Type" value={normalizedProperty.type} />
                        <DetailRow icon="layers-outline" label="Sub Type" value={normalizedProperty.subtype} />
                        <DetailRow icon="construct-outline" label="Phases" value={normalizedProperty.phases} />
                        <DetailRow icon="resize-outline" label="Dimensions" value={normalizedProperty.dimensions} />
                        <DetailRow icon="person-outline" label="Owner" value={normalizedProperty.owner} />
                        <DetailRow icon="briefcase-outline" label="Owner Type" value={normalizedProperty.ownerType} />
                        <DetailRow icon="chatbox-ellipses-outline" label="Remarks" value={normalizedProperty.remarks} />
                    </View>
                )}
            </View>

            <PropertiesDetailsScreen
                propertyId={propertyId}
                propertyLocation={normalizedProperty.location || propertyLocation || ""}
                online
            />
        </View>
    );
};

const CustomerPropertiesListScreen = () => {
    const { theme } = useTheme();
    const C = theme.colors;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { propertyId, projectId, propertyName, projectLocation, userDetails: userDetailsRaw } =
        useLocalSearchParams();
    console.log("project location in property lis screen", projectLocation)
    const cleanProjectLocation = Array.isArray(projectLocation)
        ? projectLocation[0]
        : projectLocation;

    const cleanPropertyId = Array.isArray(propertyId) ? propertyId[0] : propertyId;
    let userDetails: any = {};

    try {
      const raw = Array.isArray(userDetailsRaw) ? userDetailsRaw[0] : userDetailsRaw;
      userDetails = raw && raw !== "undefined" ? JSON.parse(decodeURIComponent(raw)) : {};
    } catch (err) {
      console.warn("❌ Failed to parse userDetailsRaw:", userDetailsRaw, err);
      userDetails = {};
    }
    
    const [selectedSection, setSelectedSection] = useState<number>(2);

    const gridItems: GridItem[] = [
        {
            id: 1,
            title: "Details",
            subtitle: "",
            icon: <Ionicons name="information-circle-outline" size={20} color={C.primaryStrong} />,
            details: (
                <CustomerPropertyDetails
                    propertyId={cleanPropertyId}
                    propertyName={Array.isArray(propertyName) ? propertyName[0] : String(propertyName || "")}
                    projectId={Array.isArray(projectId) ? projectId[0] : String(projectId || "")}
                    propertyLocation={cleanProjectLocation ? String(cleanProjectLocation) : ""}
                />
            ),
        },
        {
            id: 2,
            title: "Schedules",
            subtitle: "",
            icon: <Ionicons name="calendar-outline" size={20} color={C.primaryStrong} />,
            details: <CustomerTaskWorkflow propertyId={cleanPropertyId} userDetails={userDetails} />,
            // actionIcons: (
            //     <View style={styles.iconContainer}>
            //         <TouchableOpacity
            //             onPress={() =>
            //                 setCurrentDetails(
            //                     <CustomerTaskWorkflow propertyId={cleanPropertyId} userDetails={userDetails} />
            //                 )
            //             }
            //             style={styles.actionIcon}
            //         >
            //             <Ionicons name="git-network-outline" size={24} color="#1D3557" />
            //         </TouchableOpacity>
            //     </View>
            // ),
        },
        {
            id: 3,
            title: "Connect",
            subtitle: "",
            icon: (
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={C.primaryStrong} />
            ),
            details: null, // no inline details, open full screen on click

          }
        
    ];
    const handleGridItemPress = (item: GridItem) => {
        if (item.id === 3) {
          router.push({
            pathname: "/CustomerMessageWrapper",
            params: {
              propertyId: cleanPropertyId,
              projectId:projectId,
              userDetails: encodeURIComponent(JSON.stringify(userDetails)),
            },
          });
          
          
        } else {
          setSelectedSection(item.id);
        }
      };

    const currentDetails = useMemo(
        () => gridItems.find((item) => item.id === selectedSection)?.details ?? null,
        [gridItems, selectedSection]
    );

    const footerItems: FooterNavItem[] = useMemo(
        () => [
            { id: 0, title: "Back", iconName: "arrow-back-outline" },
            { id: 1, title: "Details", iconName: "information-circle-outline" },
            { id: 2, title: "Schedules", iconName: "calendar-outline" },
            { id: 3, title: "Connect", iconName: "chatbubble-ellipses-outline" },
        ],
        []
    );

    const footerOffset = 64 + Math.max(insets.bottom, 0);

    const selectedTitle = gridItems.find((item) => item.id === selectedSection)?.title || "Schedules";
    const selectedSubtitle = gridItems.find((item) => item.id === selectedSection)?.subtitle || "";

    const isWorkflowSection = selectedSection === 2;

    return (
        <View style={[styles.container, { backgroundColor: C.bg }]} testID="customer-properties-list-screen-root">
            <SafeAreaView style={[styles.safeTop, { backgroundColor: C.headerBg }]} />

            <View style={[styles.headerContainer, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
                <View style={styles.headerTitleContainer}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={C.text} />
                    </TouchableOpacity>
                    <TText style={[styles.headerTitle, { color: C.text }]} numberOfLines={1}>
                        {selectedTitle}
                    </TText>
                </View>
                <TouchableOpacity onPress={() => router.push("/CustomerHomeScreen")}>
                    <Ionicons name="home" size={24} color={C.text} />
                </TouchableOpacity>
            </View>

            <View style={[styles.mainContent, { paddingBottom: footerOffset }]}>
                <View style={styles.titleWrapper}>
                    <TText style={[styles.sectionTitle, { color: C.text }]}>
                        {selectedSubtitle}
                    </TText>
                </View>

                {isWorkflowSection ? (
                    <View style={[styles.sectionWrapper, styles.fixedSectionWrapper, { backgroundColor: C.surface, borderColor: C.border }]}>
                        <View style={styles.fixedSectionContent}>
                            {currentDetails}
                        </View>
                    </View>
                ) : (
                <ScrollView
                        contentContainerStyle={styles.scrollContainer}
                        showsVerticalScrollIndicator={false}
                        style={[styles.contentScroll, { backgroundColor: C.bg }]}
                    >
                        <View style={[styles.sectionWrapper, { backgroundColor: C.surface, borderColor: C.border }]}>
                            {currentDetails}
                        </View>
                    </ScrollView>
                )}
            </View>

            <View style={[styles.footerWrapper, { backgroundColor: C.surface, borderTopColor: C.border }]}>
                <AppFooterNav
                    items={footerItems}
                    selectedSection={selectedSection}
                    online
                    isDisabledOffline={() => false}
                    onSelect={(item) => {
                        const match = gridItems.find((gridItem) => gridItem.id === item.id);
                        if (match) handleGridItemPress(match);
                    }}
                    colors={{
                        border: C.border,
                        accent: C.primaryStrong,
                        accentSoft: C.primarySoft,
                        muted: C.mutedText,
                        disabledText: C.subtleText,
                    }}
                    useBottomInset
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeTop: {},
    headerContainer: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        justifyContent: "space-between",
    },
    headerTitleContainer: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
    headerTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginLeft: 10,
    },
    mainContent: { flex: 1 },
    contentScroll: { flex: 1 },
    sectionWrapper: {
        borderRadius: 12,
        marginHorizontal: 10,
        marginBottom: 16,
        padding: 16,
        borderWidth: 1,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    fixedSectionWrapper: {
        flex: 1,
        padding: 0,
        overflow: "hidden",
    },
    fixedSectionContent: {
        flex: 1,
        minHeight: 0,
    },
    scrollContainer: {
        flexGrow: 1,
        paddingBottom: 8,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "600",
        marginBottom: 2,
    },
    titleWrapper: {
        marginHorizontal: 12,
        marginBottom: 12,
    },
    footerWrapper: {
        borderTopWidth: 1,
    },
});

const detailStyles = StyleSheet.create({
    summaryCard: {
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
    },
    summaryTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        gap: 12,
    },
    summaryTextWrap: { flex: 1 },
    summaryTitle: { fontSize: 18, fontWeight: "900" },
    summarySubtitle: { fontSize: 13, fontWeight: "600", marginTop: 4 },
    summaryPill: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    loadingText: { fontSize: 12, fontWeight: "600" },
    errorText: { fontSize: 12, fontWeight: "600", marginTop: 4 },
    rowsWrap: { marginTop: 2 },
    inlineRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "rgba(148,163,184,0.35)",
    },
    inlineLeft: { flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 10 },
    inlineLabel: { fontSize: 13, fontWeight: "700" },
    inlineValue: { fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right", maxWidth: "50%" },
});

export default CustomerPropertiesListScreen;
