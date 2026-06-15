import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import ModalSelector from "@/components/AppModalSelect";
import { useSmartSearch } from "@/hooks/useSmartSearch";
import axios from "axios";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo, { NetInfoSubscription, NetInfoState } from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AppFooterNav, { FooterNavItem } from "./AppFooterNav";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "@/utils/auth";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { getDecimalInputProps } from "../utils/keyboardProps";
import { resolveEmployeeIdentity } from "../utils/employeeIdentity";

type RequestType = "general" | "avenue_add_on" | "customer_add_on";
type Option = { key: string; label: string };

interface Item {
  item_id?: string;
  item_name: string;
  item_type: string;
  id: number;
  minimum_quantity: number;
  quantity: number;
}

interface ProjectOption {
  key: string;
  label: string;
}

interface SelectedItem {
  item_name: string;
  invoice_id?: string;
  warehouse?: string;
}

type OutboxRequest = {
  id: string;
  when: string;
  payload: any;
};

const KS = {
  items: "cache:masteritems:v1",
  itemTypes: "cache:itemtypes:v1",
  projects: "cache:projects:v1",
  propertiesPrefix: "cache:properties:project:",
  outbox: "outbox:inventoryRequests:v1",
  lastSync: "meta:lastSync:masteritems:v1",
};

const API = {
  items: `${APP_API_BASE_URL}/get-all-masteritems-new-non-paginated`,
  itemTypes: `${APP_API_BASE_URL}/get-all-item-types`,
  projects: `${APP_API_BASE_URL}/projects_m`,
  properties: (pid: string) => `${APP_API_BASE_URL}/projects_m/${pid}/properties`,
  requestInventory: `${APP_API_BASE_URL}/request-inventory`,
};

const INVENTORY_REQUEST_SOURCE = "PropertiesMasterItems";

const footerItems: FooterNavItem[] = [
  { id: 0, title: "Back", iconName: "arrow-back-outline" },
  { id: 2, title: "Schedules", iconName: "calendar-outline" },
  { id: 3, title: "Inventory", iconName: "list-outline" },
  { id: 4, title: "Labour", iconName: "people-outline" },
  { id: 5, title: "Documents", iconName: "document-text-outline" },
  { id: 7, title: "Review", iconName: "construct-outline" },
];

const COLORS = {
  bg: "#F5F7FB",
  card: "#FFFFFF",
  text: "#222",
  subText: "#5A5F6A",
  primary: "#2563EB",
  primaryAlt: "#1D4ED8",
  border: "#E5E7EB",
  muted: "#9CA3AF",
  success: "#16A34A",
  danger: "#EF4444",
  warning: "#F59E0B",
  chip: "#EEF2FF",
  accent: "#2C7BE5",
  accentSoft: "#E8F1FF",
  disabledText: "#9AA0A6",
};

const makeItemKey = (it: Partial<Item>) => {
  if (it.item_id) return `item:${String(it.item_id)}`;
  if (it.id != null) return `item:${String(it.id)}`;
  const name = (it.item_name || "").trim().toLowerCase();
  const type = (it.item_type || "").trim().toLowerCase();
  return `item:${name}|${type}`;
};

const PropertiesMasterItems: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const propertyId = useMemo(() => (params.propertyId ? String(params.propertyId) : ""), [params.propertyId]);
  const projectIdParam = useMemo(() => (params.projectId ? String(params.projectId) : ""), [params.projectId]);
  const propertyName = useMemo(
    () => (params.propertyName ? String(params.propertyName) : String(params.property_name || "")),
    [params.propertyName, params.property_name]
  );
  const projectLocation = useMemo(
    () => (params.projectLocation ? String(params.projectLocation) : String(params.project_location || "")),
    [params.projectLocation, params.project_location]
  );
  const projectName = useMemo(
    () => (params.projectName ? String(params.projectName) : String(params.project_name || "")),
    [params.projectName, params.project_name]
  );
  const userDetails = useMemo(() => {
    const raw = params.userDetails ?? params.user_details;
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return raw;
    }
  }, [params.userDetails, params.user_details]);
  const identityParams = useMemo(
    () => ({
      employee_code: params.employee_code,
      employee_details: params.employee_details,
      userDetails: params.userDetails,
      user_details: params.user_details,
      phone_number: params.phone_number,
    }),
    [
      params.employee_code,
      params.employee_details,
      params.userDetails,
      params.user_details,
      params.phone_number,
    ]
  );

  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const modalSelectorRef = useRef<any>(null);
  const [filterOptions, setFilterOptions] = useState<Option[]>([{ key: "All", label: "All" }]);
  const [selectedItemType, setSelectedItemType] = useState<string>("All");

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"request" | "block">("request");
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [type, setType] = useState<RequestType>("general");
  const [startDate, setStartDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [project, setProject] = useState("");
  const [property, setProperty] = useState("");
  const [remark, setRemark] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const isOnlineRef = useRef<boolean>(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const didInitialOnlineLoadRef = useRef(false);
  const itemsFetchInFlightRef = useRef(false);
  const itemTypesFetchInFlightRef = useRef(false);
  const projectsFetchInFlightRef = useRef(false);
  const lastItemsFetchAtRef = useRef(0);
  const lastItemTypesFetchAtRef = useRef(0);
  const lastProjectsFetchAtRef = useRef(0);

  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, boolean>>({});

  const { width } = useWindowDimensions();
  const numColumns = useMemo(() => {
    return width < 620 ? 1 : width < 980 ? 2 : 3;
  }, [width]);

  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [selectedSection, setSelectedSection] = useState<number>(2);

  const online = isConnected !== false;
  const isDisabledOffline = (id: number) => !online && (id === 5 || id === 7);

  const onFooterSelect = (item: FooterNavItem) => {
    if (item.id === 0) {
      router.back();
      return;
    }

    if (isDisabledOffline(item.id)) {
      Alert.alert("Offline", "This section is unavailable offline.");
      return;
    }

    setSelectedSection(item.id);

    router.push({
      pathname: "/PropertiesListScreen",
      params: {
        propertyId: propertyId || String(params.propertyId || ""),
        selectedSection: String(item.id),
        projectId: projectIdParam || String(params.projectId || ""),
        propertyName: propertyName || "",
        projectLocation: projectLocation || "",
        userDetails: userDetails ? JSON.stringify(userDetails) : "",
      },
    } as any);
  };

  const setJSON = async (k: string, v: any) => {
    try {
      await AsyncStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  const getJSON = async <T,>(k: string, fallback: T): Promise<T> => {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  const enqueueOutbox = async (payload: any) => {
    const box = await getJSON<OutboxRequest[]>(KS.outbox, []);
    const entry: OutboxRequest = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      when: new Date().toISOString(),
      payload,
    };
    const next = [entry, ...box].slice(0, 200);
    await setJSON(KS.outbox, next);
    return entry.id;
  };

  const ensureInventoryRequestIdentity = useCallback(
    async (payload: Record<string, any>) => {
      const employeeCode = String(payload.employee_code || "").trim();
      if (employeeCode) return payload;

      const identity = await resolveEmployeeIdentity(identityParams as Record<string, unknown>);
      const effectiveEmployeeCode = identity.employee_code || "";
      if (!effectiveEmployeeCode) return payload;

      return {
        ...payload,
        employee_code: effectiveEmployeeCode,
      };
    },
    [identityParams]
  );

  const flushOutbox = useCallback(async () => {
    if (!isOnlineRef.current) return;

    const box = await getJSON<OutboxRequest[]>(KS.outbox, []);
    if (!box.length) return;

    const stillPending: OutboxRequest[] = [];
    for (const req of box) {
      try {
        const payload = await ensureInventoryRequestIdentity(req.payload || {});
        if (!String(payload.employee_code || "").trim()) throw new Error("missing employee_code");
        const res = await axios.post(API.requestInventory, payload, {
          headers: {
            "Content-Type": "application/json",
            "x-client-sync-mode": "offline_replay",
            "x-client-request-source": INVENTORY_REQUEST_SOURCE,
          },
          timeout: 15000,
        });
        if (!(res?.data?.success)) throw new Error("backend reported failure");
      } catch {
        stillPending.push(req);
      }
    }
    await setJSON(KS.outbox, stillPending);
    if (box.length !== stillPending.length) {
      setDialogMessage(`📤 Synced ${box.length - stillPending.length} pending request(s).`);
      setIsDialogVisible(true);
    }
  }, [ensureInventoryRequestIdentity]);

  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filteredItems = useSmartSearch<Item>({
    data: items,
    query: debouncedQuery,
    keys: ["item_name", "item_type"],
  });

  const finalFilteredItems = useMemo(() => {
    return selectedItemType === "All"
      ? filteredItems
      : filteredItems.filter((item) => item.item_type === selectedItemType);
  }, [filteredItems, selectedItemType]);

  const selectedCount = useMemo(
    () => Object.values(selectedItemsMap).filter(Boolean).length,
    [selectedItemsMap]
  );
  const anySelected = selectedCount > 0;

  const hydrateFromCache = useCallback(async () => {
    const [cachedItems, cachedTypes, cachedProjects, metaLast] = await Promise.all([
      getJSON<Item[]>(KS.items, []),
      getJSON<Option[]>(KS.itemTypes, [{ key: "All", label: "All" }]),
      getJSON<ProjectOption[]>(KS.projects, []),
      AsyncStorage.getItem(KS.lastSync),
    ]);

    if (cachedItems.length) {
      const normalized = cachedItems.map((it, idx) => ({
        ...it,
        item_id: it.item_id ? String(it.item_id) : it.id != null ? String(it.id) : `fallback_${idx}`,
      }));
      setItems(normalized);
      await setJSON(KS.items, normalized);
    }
    if (cachedTypes.length) setFilterOptions(cachedTypes);
    if (cachedProjects.length) setProjectOptions(cachedProjects);
    if (metaLast) setLastSync(metaLast);
  }, []);

  const fetchItems = useCallback(async (force = false) => {
    if (!isOnlineRef.current) {
      setIsLoading(false);
      return;
    }
    const now = Date.now();
    if (itemsFetchInFlightRef.current) return;
    if (!force && lastItemsFetchAtRef.current && now - lastItemsFetchAtRef.current < 5 * 60 * 1000) return;

    try {
      itemsFetchInFlightRef.current = true;
      lastItemsFetchAtRef.current = now;
      setIsLoading(true);
      const response = await authenticatedFetch(API.items);
      const jsonData = await response.json();
      let validItems: Item[] = [];
      if (Array.isArray(jsonData.items)) {
        validItems = jsonData.items.map((item: any, index: number) => ({
          ...item,
          item_id: item.item_id ? String(item.item_id) : `fallback_${index}`,
        }));
        setItems(validItems);
        await setJSON(KS.items, validItems);
        const now = new Date().toISOString();
        await AsyncStorage.setItem(KS.lastSync, now);
        setLastSync(now);
      } else {
        setItems([]);
      }
    } catch {
    } finally {
      itemsFetchInFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const fetchItemTypes = useCallback(async (force = false) => {
    if (!isOnlineRef.current) return;
    const now = Date.now();
    if (itemTypesFetchInFlightRef.current) return;
    if (!force && lastItemTypesFetchAtRef.current && now - lastItemTypesFetchAtRef.current < 5 * 60 * 1000) return;

    try {
      itemTypesFetchInFlightRef.current = true;
      lastItemTypesFetchAtRef.current = now;
      const res = await authenticatedFetch(API.itemTypes);
      const json = await res.json();

      const raw: unknown = json?.item_types;
      const arr: unknown[] = Array.isArray(raw) ? raw : [];

      const normalized: string[] = arr
        .map((x) => String(x))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const uniqueTypes: string[] = Array.from(new Set(normalized)).sort((a, b) => a.localeCompare(b));

      const options: Option[] = [{ key: "All", label: "All" }, ...uniqueTypes.map((t) => ({ key: t, label: t }))];

      setFilterOptions(options);
      await setJSON(KS.itemTypes, options);
    } catch {
    } finally {
      itemTypesFetchInFlightRef.current = false;
    }
  }, []);

  const fetchProjects = useCallback(async (force = false) => {
    if (!isOnlineRef.current) {
      const cache = await getJSON<ProjectOption[]>(KS.projects, []);
      setProjectOptions(cache);
      return;
    }
    const now = Date.now();
    if (projectsFetchInFlightRef.current) return;
    if (!force && lastProjectsFetchAtRef.current && now - lastProjectsFetchAtRef.current < 5 * 60 * 1000) return;

    try {
      projectsFetchInFlightRef.current = true;
      lastProjectsFetchAtRef.current = now;
      const response = await axios.get(API.projects);
      if (Array.isArray(response.data.projects)) {
        const options = response.data.projects.map((proj: { project_id: number; project_name: string }) => ({
          key: String(proj.project_id),
          label: proj.project_name,
        }));
        setProjectOptions(options);
        await setJSON(KS.projects, options);
      } else {
        setProjectOptions([]);
      }
    } catch {
      const cache = await getJSON<ProjectOption[]>(KS.projects, []);
      setProjectOptions(cache);
    } finally {
      projectsFetchInFlightRef.current = false;
    }
  }, []);

  const fetchProperties = useCallback(async (selectedProjectId: string) => {
    const cacheKey = `${KS.propertiesPrefix}${selectedProjectId}`;
    if (!isOnlineRef.current) {
      const cache = await getJSON<ProjectOption[]>(cacheKey, []);
      setPropertyOptions(cache);
      return;
    }
    try {
      const response = await axios.get(API.properties(selectedProjectId));
      if (Array.isArray(response.data.properties)) {
        const options = response.data.properties.map((prop: any, index: number) => ({
          key: `${index + 1}`,
          label: prop.name,
        }));
        setPropertyOptions(options);
        await setJSON(cacheKey, options);
      } else {
        setPropertyOptions([]);
      }
    } catch {
      const cache = await getJSON<ProjectOption[]>(cacheKey, []);
      setPropertyOptions(cache);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchItems(true), fetchItemTypes(true), fetchProjects(true), flushOutbox()]);
    setIsRefreshing(false);
  }, [fetchItems, fetchItemTypes, fetchProjects, flushOutbox]);

  const handleFilterSelect = (itemType: string) => setSelectedItemType(itemType);
  const handleSearch = (query: string) => setSearchQuery(query);

  const handleProjectSelect = (option: { key: string; label: string }) => {
    setProject(option.label);
    setProjectId(option.key);
    fetchProperties(option.key);
  };

  const closeDialog = () => setIsDialogVisible(false);
  const openFilterModal = () => modalSelectorRef.current?.open();

  useFocusEffect(
    useCallback(() => {
      let unsub: NetInfoSubscription | undefined;

      (async () => {
        await hydrateFromCache();

        const state = await NetInfo.fetch();
        const onlineNow = Boolean(state.isConnected && state.isInternetReachable !== false);
        setIsOnline(onlineNow);
        isOnlineRef.current = onlineNow;
        setIsConnected(onlineNow);

        unsub = NetInfo.addEventListener((s: NetInfoState) => {
          const now = Boolean(s.isConnected && s.isInternetReachable !== false);
          const wasOnline = isOnlineRef.current;
          setIsOnline(now);
          setIsConnected(now);
          isOnlineRef.current = now;

          if (now && !wasOnline) {
            flushOutbox();
            fetchItems();
            fetchItemTypes();
          }
        });

        if (onlineNow && !didInitialOnlineLoadRef.current) {
          didInitialOnlineLoadRef.current = true;
          fetchItems();
          fetchItemTypes();
          fetchProjects();
        }
      })();

      setSelectedItemsMap({});
      return () => {
        unsub?.();
      };
    }, [hydrateFromCache, fetchItems, fetchItemTypes, flushOutbox])
  );

  const handleRequestInventory = async () => {
    const quantityNumber = Number(quantity);
    if (!quantity || isNaN(quantityNumber) || quantityNumber <= 0) {
      setDialogMessage("Invalid Quantity. Please enter a valid number.");
      setIsDialogVisible(true);
      return;
    }
    if (!projectId || property === "Select Property" || !property) {
      setDialogMessage("Missing Fields. Please select a project and property.");
      setIsDialogVisible(true);
      return;
    }
    if (!selectedItem) {
      setDialogMessage("No item selected.");
      setIsDialogVisible(true);
      return;
    }
    if (!startDate) {
      setDialogMessage("Missing Date. Please select a start date.");
      setIsDialogVisible(true);
      return;
    }

    const identity = await resolveEmployeeIdentity(params as Record<string, unknown>);
    const effectiveEmployeeCode = identity.employee_code || String(params.employee_code?.toString?.() || "").trim();
    if (!effectiveEmployeeCode) {
      setDialogMessage("Unable to identify employee code for this request. Please log in again and retry.");
      setIsDialogVisible(true);
      return;
    }

    const requestData = {
      item_name: selectedItem.item_name,
      requested_quantity: parseInt(quantity, 10),
      invoice_id: selectedItem.invoice_id || null,
      warehouse: selectedItem.warehouse || "1",
      project_id: projectId || projectIdParam || null,
      project_name: project || null,
      property_id: propertyId || null,
      property_name: property || null,
      employee_code: effectiveEmployeeCode,
      deli_date: startDate.toISOString().split("T")[0],
      initial_remark: remark || "",
      item_type: type,
    };

    if (!isOnlineRef.current) {
      await enqueueOutbox(requestData);
      setModalVisible(false);
      setDialogMessage("📦 Saved offline. I will auto-send this when you’re back online.");
      setIsDialogVisible(true);
      return;
    }

    try {
      const response = await axios.post(API.requestInventory, requestData, {
        headers: {
          "Content-Type": "application/json",
          "x-client-sync-mode": "online_live",
          "x-client-request-source": INVENTORY_REQUEST_SOURCE,
        },
        timeout: 15000,
      });

      if (response.data.success) {
        let baseMessage = `✅ Requested ${quantity} units of "${selectedItem.item_name}" for ${project} • ${property} on ${startDate
          .toISOString()
          .split("T")[0]}.`;
        if (response.data.note) baseMessage += `\n\n⚠️ ${response.data.note}`;
        setDialogMessage(baseMessage);
      } else {
        setDialogMessage("❌ Failed to request inventory. Please try again.");
      }
    } catch {
      await enqueueOutbox(requestData);
      setDialogMessage("📦 Network issue. Saved offline and will sync later.");
    }
    setModalVisible(false);
    setIsDialogVisible(true);
  };

  const toggleItemSelection = (key: string) => {
    setSelectedItemsMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const renderItem = ({ item }: { item: Item }) => {
    const key = makeItemKey(item);
    const checked = !!selectedItemsMap[key];

    return (
      <TouchableOpacity
        testID={`properties-master-items-card-${key}`}
        onPress={() => toggleItemSelection(key)}
        activeOpacity={0.8}
      >
        <View style={[styles.card, checked && styles.cardSelected]}>
          <View style={styles.cardHeader}>
            <View style={styles.checkboxRow}>
              <Ionicons
                name={checked ? "checkbox" : "square-outline"}
                size={22}
                color={checked ? C.primaryStrong : C.subtleText}
              />
              <Ionicons name="cube-outline" size={16} color={C.mutedText} style={styles.nameIcon} />
              <View style={{ flex: 1 }}>
                <TText
                  testID={`properties-master-items-card-title-${key}`}
                  style={styles.itemTitle}
                  numberOfLines={2}
                >
                  {item.item_name}
                </TText>
                <TText
                  testID={`properties-master-items-card-meta-${key}`}
                  style={styles.itemTypeText}
                  numberOfLines={1}
                >
                  {item.item_type}
                  <TText style={styles.metaLabel}>  Qty - </TText>
                  <TText style={styles.metaValue}>{item.quantity ?? 0}</TText>
                  <TText style={styles.metaLabel}>  Min - </TText>
                  <TText style={styles.metaValue}>{item.minimum_quantity ?? 0}</TText>
                </TText>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading && !items.length) {
    return (
      <View style={styles.centered} testID="properties-master-items-loading-state">
        <ActivityIndicator size="large" color={C.primaryStrong} />
        <TText style={styles.loadingText}>Loading items…</TText>
      </View>
    );
  }

  const offlineBadge = !isOnline ? (
    <View style={styles.offlineWrap} testID="properties-master-items-offline-badge">
      <Ionicons name="cloud-offline-outline" size={14} />
      <TText style={styles.offlineText}>Offline </TText>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]} testID="properties-master-items-root">
      {/* Sticky Top Bar */}
      <View
        style={[styles.topBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}
        testID="properties-master-items-topbar"
      >
        <View style={styles.topLeft}>
          <TouchableOpacity
            testID="properties-master-items-back-btn"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.push("/HomeScreen");
            }}
            style={styles.navBtn}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <TText style={styles.screenTitle} testID="properties-master-items-title">
            Property Master Items
          </TText>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {offlineBadge}
          <TouchableOpacity
            testID="properties-master-items-home-btn"
            onPress={() => router.push("/HomeScreen")}
            style={styles.navBtn}
          >
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search + Filter + Add */}
      <View style={styles.searchRow} testID="properties-master-items-search-row">
        <View style={[styles.searchBox, styles.flex80]} testID="properties-master-items-search-box">
          <Ionicons name="search" size={18} color={C.mutedText} />
          <TextInput
            testID="properties-master-items-search-input"
            style={[styles.searchInput, { color: C.text }]}
            placeholder="Search items by name or type"
            placeholderTextColor={C.subtleText}
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery ? (
            <TouchableOpacity
              testID="properties-master-items-search-clear-btn"
              onPress={() => setSearchQuery("")}
            >
              <Ionicons name="close-circle" size={18} color={C.subtleText} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          testID="properties-master-items-filter-btn"
          style={[styles.iconBtn, styles.flex10]}
          onPress={openFilterModal}
        >
          <Ionicons name="options" size={22} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="properties-master-items-add-btn"
          style={[styles.iconBtn, styles.flex10, !anySelected && styles.iconBtnDisabled]}
          disabled={!anySelected}
          onPress={() => {
            const selected = items.filter((i) => selectedItemsMap[makeItemKey(i)]);
            if (!selected.length) return;
            router.push({
              pathname: "/PropertiesMultiRequestMasterItem",
              params: {
                items: encodeURIComponent(JSON.stringify(selected)),
                employee_details: encodeURIComponent(JSON.stringify(params)),
                projectId: params.projectId,
                projectName: projectName || "",
                projectLocation: projectLocation || "",
                propertyId: params.propertyId,
                propertyName: propertyName || "",
              },
            });
          }}
        >
          <Ionicons name="add-outline" size={22} color={anySelected ? C.text : C.subtleText} />
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        testID="properties-master-items-list"
        key={`cols-${numColumns}`}
        data={finalFilteredItems}
        renderItem={renderItem}
        keyExtractor={(item: any) => makeItemKey(item)}
        numColumns={numColumns}
        contentContainerStyle={styles.listPad}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrap : undefined}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState} testID="properties-master-items-empty-state">
            <Ionicons name="file-tray-outline" size={28} color={C.subtleText} />
            <TText style={styles.emptyText}>No items found</TText>
          </View>
        }
      />

      {/* Request Modal */}
      <Modal transparent animationType="slide" visible={modalVisible}>
        <View
          style={[styles.modalBackdrop, { backgroundColor: C.overlayStrong }]}
          testID="properties-master-items-request-modal"
        >
          <View style={[styles.modalCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={styles.modalHeader}>
              <TText style={styles.modalTitle} testID="properties-master-items-request-modal-title">
                {modalType === "request" ? "Request Inventory" : "Block Inventory"}
              </TText>
              <TouchableOpacity
                testID="properties-master-items-request-modal-close-btn"
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Item Name</TText>
              <View style={styles.inputShell}>
                <TText testID="properties-master-items-request-item-name" style={styles.input}>
                  {selectedItem?.item_name ?? ""}
                </TText>
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Quantity</TText>
              <View style={styles.inputShell}>
                <TextInput
                  testID="properties-master-items-request-quantity-input"
                  style={styles.input}
                  {...getDecimalInputProps()}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="Enter quantity"
                  placeholderTextColor={C.subtleText}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Type</TText>
              <View style={styles.inputShell}>
                <ModalSelector
                  data={[
                    { key: "general", label: "GENERAL" },
                    { key: "add_on", label: "ADD ON" },
                  ]}
                  initValue={type.toUpperCase()}
                  onChange={(option: any) => setType(option.key as RequestType)}
                  style={styles.selectorWrap}
                  selectStyle={styles.selectorSelect}
                  initValueTextStyle={styles.selectorText}
                  optionTextStyle={styles.selectorText}
                  optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                  cancelStyle={{ backgroundColor: C.surface }}
                  cancelTextStyle={{ color: C.text }}
                  overlayStyle={{ backgroundColor: C.overlay }}
                  cancelText="Cancel"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Expected Delivery</TText>
              <View style={styles.inputShell}>
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    style={styles.webDate as any}
                    value={startDate.toISOString().split("T")[0]}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setStartDate(new Date((e.target as any).value))}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      testID="properties-master-items-request-date-btn"
                      onPress={() => setShowStartPicker(true)}
                      style={styles.dateBtn}
                    >
                      <Ionicons name="calendar" size={16} color={C.text} />
                      <TText style={styles.dateBtnText}>{startDate.toDateString()}</TText>
                    </TouchableOpacity>
                    {showStartPicker && (
                      <DateTimePicker
                        value={startDate}
                        mode="date"
                        display="default"
                        onChange={(_event: any, date: any) => {
                          setShowStartPicker(false);
                          if (date) setStartDate(date);
                        }}
                        minimumDate={new Date()}
                      />
                    )}
                  </>
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Project</TText>
              <View style={styles.inputShell}>
                <ModalSelector
                  data={projectOptions}
                  initValue={project || "Select project"}
                  onChange={handleProjectSelect}
                  style={styles.selectorWrap}
                  selectStyle={styles.selectorSelect}
                  initValueTextStyle={styles.selectorText}
                  optionTextStyle={styles.selectorText}
                  optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                  cancelStyle={{ backgroundColor: C.surface }}
                  cancelTextStyle={{ color: C.text }}
                  overlayStyle={{ backgroundColor: C.overlay }}
                  cancelText="Cancel"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Property</TText>
              <View style={styles.inputShell}>
                <ModalSelector
                  data={propertyOptions}
                  initValue={property || "Select property"}
                  onChange={(option: any) => setProperty(option.label)}
                  style={styles.selectorWrap}
                  selectStyle={styles.selectorSelect}
                  initValueTextStyle={styles.selectorText}
                  optionTextStyle={styles.selectorText}
                  optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
                  cancelStyle={{ backgroundColor: C.surface }}
                  cancelTextStyle={{ color: C.text }}
                  overlayStyle={{ backgroundColor: C.overlay }}
                  cancelText="Cancel"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <TText style={styles.label}>Initial Remark (optional)</TText>
              <View style={styles.inputShell}>
                <TextInput
                  testID="properties-master-items-request-remark-input"
                  style={styles.input}
                  value={remark}
                  onChangeText={setRemark}
                  placeholder="Add a note…"
                  placeholderTextColor={C.subtleText}
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                testID="properties-master-items-request-cancel-btn"
                style={styles.btnGhost}
                onPress={() => setModalVisible(false)}
              >
                <TText style={styles.btnGhostText}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity
                testID="properties-master-items-request-proceed-btn"
                style={styles.btnPrimary}
                onPress={handleRequestInventory}
              >
                <TText style={styles.btnPrimaryText}>
                  {modalType === "request" ? "Proceed" : "Block"}
                </TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Dialog */}
      <Modal visible={isDialogVisible} transparent animationType="fade">
        <View
          style={[styles.toastBackdrop, { backgroundColor: C.overlayStrong }]}
          testID="properties-master-items-dialog-modal"
        >
          <View style={[styles.toastCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <TText style={styles.toastTitle} testID="properties-master-items-dialog-title">
              Inventory Request
            </TText>
            <TText style={styles.toastMsg} testID="properties-master-items-dialog-message">
              {dialogMessage}
            </TText>
            <TouchableOpacity
              testID="properties-master-items-dialog-ok-btn"
              style={styles.toastBtn}
              onPress={closeDialog}
            >
              <TText style={styles.toastBtnText}>OK</TText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filter Modal */}
      <ModalSelector
        style={styles.selectorWrap}
        selectStyle={styles.selectorSelect}
        initValueTextStyle={styles.selectorText}
        optionTextStyle={styles.selectorText}
        optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
        cancelStyle={{ backgroundColor: C.surface }}
        cancelTextStyle={{ color: C.text }}
        overlayStyle={{ backgroundColor: C.overlay }}
        ref={modalSelectorRef}
        data={filterOptions}
        initValue={selectedItemType}
        onChange={(option: any) => handleFilterSelect(String(option.key))}
        cancelText="Cancel"
        visible={false}
        touchableActiveOpacity={0}
        childrenContainerStyle={{ display: "none" }}
      />

      <View style={styles.appFooterWrap} testID="properties-master-items-footer-wrap">
        <AppFooterNav
          items={footerItems}
          selectedSection={selectedSection}
          online={online}
          isDisabledOffline={isDisabledOffline}
          onSelect={onFooterSelect}
          colors={{
            border: C.border,
            accent: C.primaryStrong,
            accentSoft: C.primarySoft,
            muted: C.mutedText,
            disabledText: C.subtleText,
          }}
        />
      </View>
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    topBar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.surface,
      borderBottomColor: C.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    navBtn: {
      height: 36,
      width: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    screenTitle: { fontSize: 16, fontWeight: "800", color: C.text },

    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
    },
    flex80: { flex: 8, minWidth: 0 },
    flex10: { flex: 1 },

    searchBox: {
      height: 42,
      borderRadius: 12,
      backgroundColor: C.surfaceAlt,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 11, color: C.text, paddingVertical: 0 },

    iconBtn: {
      height: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtnDisabled: { opacity: 0.5 },

    listPad: { paddingHorizontal: 8, paddingBottom: 24 },
    columnWrap: { gap: 8 },
    itemTypeText: { fontSize: 11, color: C.mutedText, marginTop: 2, fontWeight: "600" },

    offlineWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.dangerSoft,
    },
    offlineText: { fontSize: 11, color: C.text, fontWeight: "700" },

    card: {
      flex: 1,
      margin: 8,
      backgroundColor: C.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      padding: 14,
      shadowColor: "#000",
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    cardSelected: { borderColor: C.primaryStrong, backgroundColor: C.primarySoft },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, flex: 1 },
    itemTitle: {
      fontWeight: "800",
      fontSize: 11,
      color: C.text,
      flex: 1,
      textTransform: "capitalize",
    },
    nameIcon: { marginTop: 3, marginLeft: 6, marginRight: 6 },
    metaLabel: { fontSize: 11, color: C.mutedText, marginLeft: 10 },
    metaValue: { fontSize: 11, color: C.text, fontWeight: "800" },

    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    loadingText: { marginTop: 10, fontSize: 15, color: C.mutedText },

    emptyState: { padding: 32, alignItems: "center" },
    emptyText: { color: C.mutedText, marginTop: 8, fontSize: 14 },

    modalBackdrop: { flex: 1, justifyContent: "center", backgroundColor: C.overlayStrong, padding: 16 },
    modalCard: {
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    modalHeader: {
      paddingHorizontal: 4,
      paddingVertical: 6,
      marginBottom: 6,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    modalTitle: { fontSize: 11, fontWeight: "800", color: C.text },

    formGroup: { marginTop: 10 },
    label: { fontSize: 11, color: C.mutedText, marginBottom: 6, fontWeight: "700" },
    inputShell: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      backgroundColor: C.surface,
      paddingHorizontal: 10,
      paddingVertical: Platform.OS === "web" ? 6 : 8,
    },
    input: { fontSize: 11, color: C.text, height: 36 },

    webDate: {
      width: "100%",
      height: 36,
      border: "none",
      outline: "none",
      backgroundColor: "transparent",
      fontSize: 13,
      color: C.text,
    } as any,
    dateBtn: { height: 36, flexDirection: "row", alignItems: "center", gap: 8 },
    dateBtnText: { fontSize: 11, color: C.text, fontWeight: "600" },

    selectorWrap: { borderRadius: 10 },
    selectorSelect: { borderWidth: 0 },
    selectorText: { fontSize: 13, color: C.text },

    modalFooter: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
    btnGhost: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.surface,
    },
    btnGhostText: { color: C.text, fontWeight: "800" },
    btnPrimary: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: C.primaryStrong,
    },
    btnPrimaryText: { color: "#fff", fontWeight: "800" },

    toastBackdrop: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: C.overlayStrong,
    },
    toastCard: {
      width: "86%",
      backgroundColor: C.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: C.border,
    },
    toastTitle: { fontSize: 11, fontWeight: "800", color: C.text, marginBottom: 8 },
    toastMsg: { fontSize: 11, color: C.mutedText, marginBottom: 12 },
    toastBtn: {
      alignSelf: "flex-end",
      backgroundColor: C.primaryStrong,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    toastBtnText: { color: "#fff", fontWeight: "800" },

    appFooterWrap: { borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  });

export default PropertiesMasterItems;
