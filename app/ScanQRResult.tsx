import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// If you prefer expo-clipboard, swap the import:
// import * as Clipboard from "expo-clipboard";
import { Clipboard } from "react-native";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";
import { authenticatedFetch } from "../utils/auth";

type Batch = {
  batch_id: string | number;
  available_quantity: number;
  issued_quantity: number;
  updated_date_ist: string;
};

type InventoryDetails = {
  item_name: string;
  inventory_id: string | number;
  location: string;
  warehouse: string | number;
  calculated_available_quantity: number;
  parsed_item_name?: string;
};

type InventoryResult = {
  inventory_details?: InventoryDetails | null;
  batches?: Batch[] | null;
};

const safe = (v: any) => (v === undefined || v === null ? "" : String(v));

const buildLookupUrl = (name: string, location: string, warehouse: string) =>
  `${APP_API_BASE_URL}/lookup/inventory?parsed_item_name=${encodeURIComponent(
    name
  )}&parsed_location=${encodeURIComponent(location)}&parsed_warehouse=${encodeURIComponent(
    warehouse
  )}`;

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.row}>
    <TText style={styles.label}>{label}</TText>
    <TText style={styles.value}>{value || "—"}</TText>
  </View>
);

const ScanQRResult: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  const parsed_item_name = safe(params.parsed_item_name);
  const parsed_location = safe(params.parsed_location);
  const parsed_warehouse = safe(params.parsed_warehouse);

  const url = useMemo(
    () => buildLookupUrl(parsed_item_name, parsed_location, parsed_warehouse),
    [parsed_item_name, parsed_location, parsed_warehouse]
  );

  const [data, setData] = useState<InventoryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithTimeout = async (u: string, ms = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const res = await authenticatedFetch(u, { method: "GET", signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await fetchWithTimeout(url, 20000);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} ${text ? `- ${text}` : ""}`.trim());
      }
      const json = (await res.json()) as InventoryResult;

      // Normalize optional fields
      setData({
        inventory_details: json?.inventory_details ?? null,
        batches: Array.isArray(json?.batches) ? json?.batches : [],
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch inventory details.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [url]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    // Auto-fetch on mount and when params/url changes
    load();
  }, [load]);

  const copyToClipboard = async () => {
    try {
      if (Platform.OS === "web") {
        await (navigator as any).clipboard.writeText(url);
      } else {
        Clipboard.setString(url);
      }
      Alert.alert("Copied", "Lookup URL copied to clipboard.");
    } catch {
      Alert.alert("Copy Failed", "Could not copy the URL.");
    }
  };

  const openInBrowser = async () => {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else Alert.alert("Error", "Cannot open URL on this device.");
    } catch {
      Alert.alert("Error", "Failed to open the URL.");
    }
  };

  const inv = data?.inventory_details ?? null;
  const batches = data?.batches ?? [];

  return (
    <View style={styles.root} testID="scan-qrresult-root">
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
        </TouchableOpacity>
        <TText style={styles.headerTitle}>QR Result</TText>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>


      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >


        {/* Results */}
        <View style={styles.card}>
          <TText style={styles.cardTitle}>Inventory Lookup</TText>

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator size="large" />
              <TText style={{ marginTop: 8, color: "#6B7280" }}>Fetching inventory…</TText>
            </View>
          ) : error ? (
            <View style={styles.centerBlock}>
              <Ionicons name="warning" size={18} color="#EF4444" />
              <TText style={{ marginTop: 8, color: "#EF4444" }}>{error}</TText>
              <TouchableOpacity style={[styles.actionBtn, { marginTop: 10 }]} onPress={load}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <TText style={styles.actionText}>Retry</TText>
              </TouchableOpacity>
            </View>
          ) : !inv ? (
            <View style={styles.centerBlock}>
              <Ionicons name="file-tray" size={20} color="#6B7280" />
              <TText style={{ marginTop: 6, color: "#6B7280" }}>No matching inventory.</TText>
            </View>
          ) : (
            <>
              <InfoRow label="Item Name" value={safe(inv.item_name)} />
              <InfoRow label="Inventory ID" value={safe(inv.inventory_id)} />
              <InfoRow label="Location" value={safe(inv.location)} />
              <InfoRow label="Warehouse" value={safe(inv.warehouse)} />
              <InfoRow
                label="Available Qty"
                value={safe(inv.calculated_available_quantity)}
              />
            </>
          )}
        </View>

        {/* Batches */}
        <View style={styles.card}>
          <TText style={styles.cardTitle}>Batches</TText>

          {loading ? (
            <View style={styles.centerBlock}>
              <ActivityIndicator />
              <TText style={{ marginTop: 8, color: "#6B7280" }}>Loading batches…</TText>
            </View>
          ) : batches.length === 0 ? (
            <TText style={{ color: "#6B7280" }}>No batches found.</TText>
          ) : (
            <View style={{ gap: 10 }}>
              {batches.map((b, idx) => (
                <View key={`${b.batch_id}-${idx}`} style={styles.batchRow}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <TText style={styles.batchLabel}>Batch</TText>
                    <TText style={styles.batchValue}>{safe(b.batch_id)}</TText>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <TText style={styles.batchLabel}>Available</TText>
                    <TText style={styles.batchValue}>{safe(b.available_quantity)}</TText>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <TText style={styles.batchLabel}>Issued</TText>
                    <TText style={styles.batchValue}>{safe(b.issued_quantity)}</TText>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                    <TText style={styles.batchLabel}>Updated (IST)</TText>
                    <TText style={styles.batchValue}>{safe(b.updated_date_ist)}</TText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F7F8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#F7F7F8",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEFF2",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#0A0A0A",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#0A0A0A",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E6E9",
  },
  label: { color: "#6B7280", fontSize: 14, width: "45%" },
  value: { color: "#111827", fontSize: 14, fontWeight: "600", width: "55%", textAlign: "right" },

  urlText: {
    fontSize: 13,
    color: "#1F2937",
    backgroundColor: "#F2F4F7",
    padding: 10,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0A84FF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  secondary: { backgroundColor: "#111827" },
  ghost: { backgroundColor: "#E6F0FF" },
  ghostText: { color: "#0A84FF" },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  centerBlock: { alignItems: "center", justifyContent: "center", paddingVertical: 10 },

  batchRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FAFAFB",
  },
  batchLabel: { color: "#6B7280", fontSize: 13 },
  batchValue: { color: "#111827", fontSize: 13, fontWeight: "600" },
  container: { flex: 1, backgroundColor: "#F9F9F9" },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
    justifyContent: "space-between",
  },
});

export default ScanQRResult;
