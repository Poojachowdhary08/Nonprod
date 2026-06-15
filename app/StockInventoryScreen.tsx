import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// StockInventoryScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "../utils/auth";

type AnyRow = Record<string, any>;

type Props = {
  embedded?: boolean;
  limit?: number;
};

const BASE_URL = `${APP_API_BASE_URL}`;
const API_ALL_INVENTORY = `${BASE_URL}/all-inventory`;

const DEFAULT_LIMIT = 50;

const norm = (v: any) =>
  String(v ?? "")
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const safeNum = (v: any, fallback: number | null = null) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return n;
};

const toDisplayTitle = (value: any) =>
  String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Best-effort date formatter (if backend gives ISO)
const fmtDate = (v: any) => {
  try {
    if (!v) return "";
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
};

const pick = (row: AnyRow, keys: string[]) => {
  for (const k of keys) {
    const val = row?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
  }
  return undefined;
};

const StockInventoryScreen: React.FC<Props> = ({ embedded = false, limit = DEFAULT_LIMIT }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const buildUrl = useCallback(
    (offset: number) => `${API_ALL_INVENTORY}?limit=${limit}&offset=${offset}`,
    [limit]
  );

  const extractList = (json: any): AnyRow[] => {
    if (Array.isArray(json?.inventory)) return json.inventory;
    if (Array.isArray(json?.items)) return json.items;
    if (Array.isArray(json?.data)) return json.data;
    if (Array.isArray(json)) return json;
    return [];
  };

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (fetchingRef.current) return;
      if (!reset && !hasMoreRef.current) return;

      fetchingRef.current = true;

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const nextOffset = reset ? 0 : offsetRef.current;

      try {
        if (reset) setLoading(true);
        else setPaging(true);

        const url = buildUrl(nextOffset);
        const res = await authenticatedFetch(url, { signal: ctrl.signal });
        const json = await res.json();
        if (ctrl.signal.aborted) return;

        const list = extractList(json);

        setRows((prev) => (reset ? list : [...prev, ...list]));

        offsetRef.current = nextOffset + list.length;
        hasMoreRef.current = list.length >= limit;
      } catch (e: any) {
        if (e?.name !== "AbortError") console.log("all-inventory fetch error:", e);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setPaging(false);
      }
    },
    [buildUrl, limit]
  );

  // Initial load
  useEffect(() => {
    fetchPage(true);
    return () => abortRef.current?.abort();
  }, [fetchPage]);

  // Debounce search
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(query), 350);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  // Local filtering only (no extra API spam)
  const filteredRows = useMemo(() => {
    const q = norm(debouncedQuery);
    if (!q) return rows;

    return rows.filter((r) => {
      const name = pick(r, ["item_name", "name", "material_name", "master_item_name", "inventory_item_name"]) ?? "";
      const category = pick(r, ["category", "item_category", "category_name", "type", "item_type"]) ?? "";
      const brand = pick(r, ["brand", "brand_name", "make", "manufacturer"]) ?? "";
      const uom = pick(r, ["uom", "unit", "uom_code"]) ?? "";
      const location = pick(r, ["location", "store", "store_name", "warehouse", "warehouse_name"]) ?? "";
      const sku = pick(r, ["sku", "item_code", "code", "item_id"]) ?? "";

      const hay = norm([name, category, brand, uom, location, sku].join(" "));
      return hay.includes(q);
    });
  }, [rows, debouncedQuery]);

  // Quick stats chips from current filtered set
  const stats = useMemo(() => {
    const total = filteredRows.length;
    let low = 0;
    let zero = 0;

    for (const r of filteredRows) {
      const qty =
        safeNum(
          pick(r, ["available_qty", "available_quantity", "qty", "quantity", "stock", "available_stock"]),
          null
        ) ?? null;

      if (qty === 0) zero += 1;
      // "Low" heuristic: <= 5, because backend doesn't give threshold.
      if (qty !== null && qty > 0 && qty <= 5) low += 1;
    }

    return { total, low, zero };
  }, [filteredRows]);

  const renderCard = useCallback(({ item }: { item: AnyRow }) => {
    const name =
      pick(item, ["item_name", "name", "material_name", "master_item_name", "inventory_item_name"]) ?? "—";

    const category =
      pick(item, ["category", "item_category", "category_name", "type", "item_type"]) ?? "";

    const brand = pick(item, ["brand", "brand_name", "make", "manufacturer"]) ?? "";
    const uom = pick(item, ["uom", "unit", "uom_code"]) ?? "";

    const qtyRaw = pick(item, [
      "available_qty",
      "available_quantity",
      "qty",
      "quantity",
      "stock",
      "available_stock",
    ]);

    const qty = safeNum(qtyRaw, null);
    const location =
      pick(item, ["location", "store", "store_name", "warehouse", "warehouse_name"]) ?? "";

    const formatPrettyDate = (value: any) => {
      if (!value) return "";

      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return "";

      const day = date.getDate();
      const month = date.toLocaleString("en-GB", { month: "short" });
      const year = date.getFullYear();

      const getOrdinal = (n: number) => {
        if (n > 3 && n < 21) return "th";
        switch (n % 10) {
          case 1:
            return "st";
          case 2:
            return "nd";
          case 3:
            return "rd";
          default:
            return "th";
        }
      };

      return `${day}${getOrdinal(day)} ${month} ${year}`;
    };

    const updatedRaw = pick(item, ["updated_date"]) ?? pick(item, ["updated_date_ist"]);
    const updatedAt = formatPrettyDate(updatedRaw);
    // Status chip based on qty
    const status =
      qty === null ? "UNKNOWN" : qty === 0 ? "OUT OF STOCK" : qty <= 5 ? "LOW" : "AVAILABLE";

    const chipStyle =
      status === "OUT OF STOCK"
        ? styles.chipRed
        : status === "LOW"
        ? styles.chipAmber
        : status === "AVAILABLE"
        ? styles.chipGreen
        : styles.chipGrey;

    const chipIcon =
      status === "OUT OF STOCK"
        ? "error-outline"
        : status === "LOW"
        ? "warning-amber"
        : status === "AVAILABLE"
        ? "check-circle-outline"
        : "help-outline";

    return (
      <View style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <TText style={styles.cardTitle} numberOfLines={1}>
              {toDisplayTitle(name) || "—"}
            </TText>

            <View style={styles.metaRow}>
              {category ? (
                <View style={styles.metaPill}>
                  <MaterialIcons name="category" size={14} color={C.mutedText} />
                  <TText style={styles.metaText} numberOfLines={1}>
                    {String(category)}
                  </TText>
                </View>
              ) : null}

              {brand ? (
                <View style={styles.metaPill}>
                  <MaterialIcons name="factory" size={14} color={C.mutedText} />
                  <TText style={styles.metaText} numberOfLines={1}>
                    {String(brand)}
                  </TText>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.statusChip, chipStyle]}>
            <MaterialIcons name={chipIcon as any} size={14} color={C.text} />
            <TText style={styles.statusChipText}>{status}</TText>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBottomRow}>
          <View style={styles.kv}>
            <TText style={styles.k}>Available</TText>
            <TText style={styles.v}>
              {qty === null ? "—" : String(qty)} {uom ? String(uom) : ""}
            </TText>
          </View>

          <View style={styles.kv}>
            <TText style={styles.k}>Location</TText>
            <TText style={styles.v} numberOfLines={1}>
              {location ? toDisplayTitle(location) : "—"}
            </TText>
          </View>

          <View style={styles.kvRight}>
            <TText style={styles.k}>Updated</TText>
            <TText style={styles.v} numberOfLines={1}>
              {updatedAt || "—"}
            </TText>
          </View>
        </View>
      </View>
    );
  }, [C.mutedText, C.text, styles]);

  const header = useMemo(() => {
    return (
      <View style={styles.headerWrap}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <TText style={styles.headerTitle}>Stock Inventory</TText>
          </View>
        </View>

        <View style={styles.searchRow}>
          <MaterialIcons name="search" size={18} color={C.mutedText} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search item / category / brand / location…"
            placeholderTextColor={C.subtleText}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query?.length ? (
            <TouchableOpacity onPress={() => setQuery("")} style={styles.clearBtn} activeOpacity={0.8}>
              <MaterialIcons name="close" size={18} color={C.text} />
            </TouchableOpacity>
          ) : null}
        </View>

      </View>
    );
  }, [C.mutedText, C.subtleText, C.text, fetchPage, query, styles]);

  return (
    <View style={{ flex: 1 }} testID="stock-inventory-screen-root">
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.primary} />
          <TText style={styles.loadingText}>Loading inventory…</TText>
        </View>
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item, idx) => String(item?.id ?? item?.item_id ?? item?.inventory_id ?? item?.sku ?? idx)}
          contentContainerStyle={{ padding: 12, paddingBottom: 18 }}
          ListHeaderComponent={header}
          onEndReachedThreshold={0.25}
          onEndReached={() => fetchPage(false)}
          renderItem={renderCard}
          ListEmptyComponent={
            <TText style={styles.emptyText}>
              No inventory found
            </TText>
          }
          ListFooterComponent={
            paging ? <ActivityIndicator style={{ padding: 16 }} color={C.primary} /> : null
          }
        />
      )}
    </View>
  );
};

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  headerWrap: {
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  headerTitle: { fontSize: 13, fontWeight: "700", color: C.text },

  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.border,
  },
  refreshText: { fontSize: 11, fontWeight: "700", color: C.primary },

  searchRow: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 11,
    fontWeight: "700",
    color: C.text,
    paddingVertical: 0,
  },
  clearBtn: {
    height: 30,
    width: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
  },

  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    flexWrap: "wrap",
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  statChipText: { fontSize: 11, fontWeight: "700", color: C.text },

  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "android" ? 0.08 : 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    borderColor: C.border,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardTitle: { fontSize: 11, fontWeight: "700", color: C.text },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: "100%",
  },
  metaText: { fontSize: 11, fontWeight: "600", color: C.mutedText },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 10, fontWeight: "700", color: C.text },

  chipGreen: { backgroundColor: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.35)" },
  chipAmber: { backgroundColor: "rgba(245,158,11,0.14)", borderColor: "rgba(245,158,11,0.35)" },
  chipRed: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.35)" },
  chipGrey: { backgroundColor: "rgba(107,114,128,0.12)", borderColor: "rgba(107,114,128,0.25)" },

  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  kv: { flex: 1 },
  kvRight: { flex: 1.2 },

  k: { fontSize: 10, fontWeight: "900", color: C.mutedText },
  v: { fontSize: 12, fontWeight: "900", color: C.text, marginTop: 4 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: C.mutedText, fontWeight: "900" },

  emptyText: { textAlign: "center", marginTop: 40, color: C.mutedText, fontWeight: "900" },
});

export default StockInventoryScreen;
