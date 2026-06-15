import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  SafeAreaView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@/src/theme/ThemeProvider";
import { getDecimalInputProps } from "../utils/keyboardProps";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
const BASE_URL = `${APP_API_BASE_URL}`;

// expo-router params can be string | string[]
const asStr = (v: any) => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));
const now = () => new Date().toISOString();

const log = (...args: any[]) => console.log(`[ISR] ${now()}`, ...args);
const warn = (...args: any[]) => console.warn(`[ISR] ${now()}`, ...args);
const err = (...args: any[]) => console.error(`[ISR] ${now()}`, ...args);

const safeNum = (v: any, fallback = 0) => {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const InventoryScanResult = () => {
  const router = useRouter();
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const params = useLocalSearchParams();

  // -------------------------
  // Read all params safely
  // -------------------------
  const parsed_item_name = asStr(params.parsed_item_name);
  const parsed_location = asStr(params.parsed_location);
  const parsed_warehouse = asStr(params.parsed_warehouse);

  const item_name = asStr(params.item_name); // from StockRequestDetails -> activeLineItem.item_name
  const requested_quantity = asStr(params.requested_quantity);

  const project_name = asStr(params.project_name);
  const property_name = asStr(params.property_name);
  const engineer_id = asStr(params.engineer_id);
  const request_id = asStr(params.request_id);
  const deli_date = asStr(params.deli_date);
  const item_type = asStr(params.item_type);

  const warehouse = asStr(params.warehouse);
  const location = asStr(params.location);

  const project_id = asStr(params.project_id);
  const property_id = asStr(params.property_id);
  const invoice_id = asStr(params.invoice_id);
  const employee_code = asStr(params.employee_code);
  const status = asStr(params.status);

  const issued_request_id = asStr(params.issued_request_id);
  const child_request_id = asStr(params.child_request_id);

  const stockManagerCode = String(employee_code || "NA");
  const effectiveEngineerId = String(engineer_id || stockManagerCode);
  const parentReqId = String(request_id || "");
  const issuedReqId = String(issued_request_id || child_request_id || "").trim();

  // what we send to backend
  const originalItemName = String(item_name || "").trim();

  // -------------------------
  // State
  // -------------------------
  const initialReqQty = safeNum(requested_quantity, 0);
  const [requestedQty, setRequestedQty] = useState<number>(initialReqQty);
  const [availableQty, setAvailableQty] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Modals
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueQtyInput, setIssueQtyInput] = useState("");
  const [raiseModalVisible, setRaiseModalVisible] = useState(false);
  const [raiseQtyInput, setRaiseQtyInput] = useState("");

  // guards
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setBusySafe = (v: boolean) => {
    busyRef.current = v;
    if (mountedRef.current) setBusy(v);
  };

  // Reset busy when screen is focused (prevents "busy stuck" after back navigation)
  useFocusEffect(
    useCallback(() => {
      log("FOCUS -> reset busy=false, close modals");
      setBusySafe(false);
      setIssueModalVisible(false);
      setRaiseModalVisible(false);
      return () => { };
    }, [])
  );

  // Log params once
  useEffect(() => {
    log("MOUNT params snapshot:", {
      parentReqId,
      originalItemName,
      requested_quantity,
      parsed_item_name,
      parsed_location,
      parsed_warehouse,
      project_name,
      property_name,
      warehouse,
      location,
      employee_code,
      engineer_id,
      effectiveEngineerId,
      status,
      issuedReqId,
      invoice_id,
      project_id,
      property_id,
      item_type,
      deli_date,
      platform: Platform.OS,
    });
  }, []);

  // -------------------------
  // Small helper: fetch wrapper with logging
  // -------------------------
  const http = async (url: string, init?: RequestInit) => {
    const method = init?.method || "GET";
    const started = Date.now();
    log("HTTP ->", method, url);

    try {
      const res = await authenticatedFetch(url, init);
      const elapsed = Date.now() - started;

      // read body safely
      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      log("HTTP <-", method, url, {
        ok: res.ok,
        status: res.status,
        elapsed_ms: elapsed,
        body_preview: typeof json === "object" ? json : text?.slice?.(0, 500),
      });

      return { res, json, text };
    } catch (e: any) {
      const elapsed = Date.now() - started;
      err("HTTP ERR <-", method, url, { elapsed_ms: elapsed, message: e?.message, e });
      throw e;
    }
  };

  // -------------------------
  // Fetch Inventory Data
  // -------------------------
  const fetchInventoryData = useCallback(async () => {
    setLoading(true);

    const queryParams = new URLSearchParams({
      parsed_item_name: String(parsed_item_name || ""),
      parsed_location: String(parsed_location || ""),
      parsed_warehouse: String(parsed_warehouse || ""),
    }).toString();

    const url = `${BASE_URL}/lookup/inventory?${queryParams}`;

    log("LOOKUP start", { url });

    try {
      const { res, json } = await http(url);

      if (res.ok && json?.inventory_details) {
        const qty = safeNum(json.inventory_details.calculated_available_quantity, 0);
        log("LOOKUP ok -> availableQty =", qty, "inventory_details=", json.inventory_details);
        setAvailableQty(qty);
      } else {
        warn("LOOKUP response missing inventory_details", { ok: res.ok, json });
        setAvailableQty(0);
      }
    } catch (e: any) {
      err("LOOKUP failed", e);
      Alert.alert("Error", "Failed to fetch current stock levels.");
      setAvailableQty(0);
    } finally {
      setLoading(false);
    }
  }, [parsed_item_name, parsed_location, parsed_warehouse]);

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  // -------------------------
  // API Action Calls (Issue / Raise / Reject)
  // -------------------------

  const ensureBasics = () => {
    // item_name is guaranteed from StockRequestDetails now, but still log if it’s empty.
    if (!parentReqId) warn("parentReqId is EMPTY - check navigation params");
    if (!originalItemName) warn("originalItemName is EMPTY - check StockRequestDetails router.push params");
  };

  const postIssueStockUp = async (issuedQty: number) => {
    ensureBasics();

    const payload = {
      request_id: parentReqId,
      engineer_id: effectiveEngineerId,
      performed_by: stockManagerCode,
      item_name: originalItemName,

      requested_quantity: Number(requestedQty),
      issued_quantity: Number(issuedQty),

      location: String(location || parsed_location || ""),
      warehouse: String(warehouse || parsed_warehouse || "1"),

      project_name: project_name || null,
      property_name: property_name || null,
      project_id: project_id ? String(project_id) : null,
      property_id: property_id ? String(property_id) : null,

      invoice_id: safeNum(invoice_id, 0),
      p_req_id: parentReqId,
      deli_date: String(deli_date || ""),
      item_type: item_type || "general",
    };

    log("ISSUE payload ->", payload);

    const { res, json } = await http(`${BASE_URL}/issue-stock-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = json?.detail || json?.message || "Issue failed";
      throw new Error(msg);
    }
    return json;
  };

  const postRaiseStock = async (raiseQty: number) => {
    ensureBasics();

    const payload = {
      request_id: parentReqId,
      engineer_id: effectiveEngineerId,
      invoice_id: safeNum(invoice_id, 0) || null,
      item_name: originalItemName,

      requested_quantity: Number(raiseQty),
      warehouse: String(warehouse || parsed_warehouse || "1"),
      project_name: String(project_name || ""),
      property_name: String(property_name || ""),
      deli_date: String(deli_date || ""),
      performed_by: stockManagerCode,
    };

    log("RAISE payload ->", payload);

    const { res, json } = await http(`${BASE_URL}/raise-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = json?.detail || json?.message || "Raise failed";
      throw new Error(msg);
    }
    return json;
  };

  const postRejectStock = async (rejectQty: number, reason: string) => {
    ensureBasics();

    const payload = {
      request_id: parentReqId,
      item_name: originalItemName,
      warehouse: String(warehouse || parsed_warehouse || "1"),
      rejected_quantity: Number(rejectQty),
      performed_by: stockManagerCode,
      rejection_reason: reason,
    };

    log("REJECT payload ->", payload);

    const { res, json } = await http(`${BASE_URL}/reject-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const msg = json?.detail || json?.message || "Reject failed";
      throw new Error(msg);
    }
    return json;
  };

  // -------------------------
  // Handlers
  // -------------------------
  const doIssue = async (qty: number) => {
    log("doIssue pressed", { qty, busy: busyRef.current, requestedQty, availableQty });

    if (busyRef.current) {
      warn("doIssue blocked because busy=true");
      return;
    }

    setBusySafe(true);
    try {
      const remainder = Math.max(requestedQty - qty, 0);
      log("doIssue computed remainder", { remainder });

      const issueRes = await postIssueStockUp(qty);
      log("ISSUE success", issueRes);

      if (remainder > 0) {
        const raiseRes = await postRaiseStock(remainder);
        log("RAISE (remainder) success", raiseRes);
      }

      setRequestedQty(0);

      Alert.alert(
        "Success",
        `Issued ${qty}${remainder > 0 ? ` and raised ${remainder}` : ""}.`
      );

      // NOTE: if you want to stay and refresh available qty after issue:
      // await fetchInventoryData();

      router.back();
    } catch (e: any) {
      err("doIssue error", e);
      Alert.alert("Error", e?.message || "Issue failed");
    } finally {
      setBusySafe(false);
      log("doIssue finally -> busy=false");
    }
  };

  const doRaiseOnly = async (qty: number) => {
    log("doRaiseOnly pressed", { qty, busy: busyRef.current });

    if (busyRef.current) {
      warn("doRaiseOnly blocked because busy=true");
      return;
    }

    setBusySafe(true);
    try {
      const raiseRes = await postRaiseStock(qty);
      log("RAISE only success", raiseRes);

      Alert.alert("Success", `Raised ${qty} successfully.`);
      router.back();
    } catch (e: any) {
      err("doRaiseOnly error", e);
      Alert.alert("Error", e?.message || "Raise failed");
    } finally {
      setBusySafe(false);
      log("doRaiseOnly finally -> busy=false");
    }
  };

  const doReject = async () => {
    log("doReject pressed", { busy: busyRef.current, requestedQty, parentReqId, originalItemName });

    if (busyRef.current) {
      warn("doReject blocked because busy=true");
      return;
    }

    setBusySafe(true);
    try {
      const rejectRes = await postRejectStock(requestedQty, "Insufficient stock");
      log("REJECT success", rejectRes);

      setRequestedQty(0);
      Alert.alert("Success", "Request rejected successfully.");
      router.back();
    } catch (e: any) {
      err("doReject error", e);
      Alert.alert("Error", e?.message || "Reject failed");
    } finally {
      setBusySafe(false);
      log("doReject finally -> busy=false");
    }
  };

  const isFulfilled = requestedQty <= 0;

  // -------------------------
  // UI
  // -------------------------
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={C.text} />
        <Text style={{ textAlign: "center", marginTop: 10, color: C.text }}>
          Fetching current stock...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} testID="inventory-scan-result-root">
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            log("Header back pressed");
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Inventory Action</Text>

        <TouchableOpacity
          onPress={() => {
            log("Header home pressed");
            router.push("/HomeScreen");
          }}
        >
          <Ionicons name="home" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.itemTitle}>{originalItemName || parsed_item_name || "—"}</Text>
          <View style={styles.separator} />

          <InfoRow label="Request ID" value={parentReqId} />
          <InfoRow label="Project" value={project_name} />
          <InfoRow label="Property" value={property_name} />
          <InfoRow label="Warehouse" value={warehouse || parsed_warehouse} />
          <InfoRow label="Location" value={location || parsed_location} />

          {/* Debug panel on screen (so you don’t depend only on console) */}
          {/* <View style={styles.debugBox}>
            <Text style={styles.debugText}>busy: {String(busy)}</Text>
            <Text style={styles.debugText}>requestedQty: {requestedQty}</Text>
            <Text style={styles.debugText}>availableQty: {availableQty}</Text>
            <Text style={styles.debugText}>parentReqId: {parentReqId || "EMPTY"}</Text>
            <Text style={styles.debugText}>item_name: {originalItemName || "EMPTY"}</Text>
            <Text style={styles.debugText}>parsed: {parsed_item_name}/{parsed_location}/{parsed_warehouse}</Text>
          </View> */}
        </View>

        <View style={styles.qtyContainer}>
          <View style={styles.qtyBox}>
            <Text style={styles.qtyLabel}>Requested</Text>
            <Text style={[styles.qtyValue, { color: C.danger }]}>{requestedQty}</Text>
          </View>
          <View style={styles.qtyBox}>
            <Text style={styles.qtyLabel}>Available</Text>
            <Text style={[styles.qtyValue, { color: C.success }]}>{availableQty}</Text>
          </View>
        </View>

        {!isFulfilled ? (
          <View style={styles.actionsRow}>
            <ActionButton
              label="Issue"
              color="#77b354"
              busy={busy}
              onPress={() => {
                log("Issue button pressed");
                const maxIssue = Math.min(requestedQty, availableQty);
                setIssueQtyInput(String(maxIssue));
                setIssueModalVisible(true);
              }}
            />

            {requestedQty > availableQty && (
              <ActionButton
                label="Raise"
                color="#2589f5"
                busy={busy}
                onPress={() => {
                  log("Raise button pressed");
                  const diff = requestedQty - availableQty;
                  setRaiseQtyInput(String(diff));
                  setRaiseModalVisible(true);
                }}
              />
            )}

            <ActionButton
              label="Reject"
              color="#bd3935"
              busy={busy}
              onPress={() => {
                log("Reject button pressed");

                // ✅ Web fix: use confirm() so callback actually runs
                if (Platform.OS === "web") {
                  const ok = window.confirm("Are you sure you want to reject this request?");
                  log("Web confirm result:", ok);
                  if (ok) {
                    log("Web confirm OK -> calling doReject()");
                    doReject();
                  } else {
                    log("Web confirm CANCEL");
                  }
                  return;
                }

                // ✅ Mobile: Alert.alert works fine
                Alert.alert("Confirm Reject", "Are you sure you want to reject this request?", [
                  {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => log("Reject confirm CANCEL"),
                  },
                  {
                    text: "Reject",
                    style: "destructive",
                    onPress: () => {
                      log("Reject confirm OK -> calling doReject()");
                      doReject();
                    },
                  },
                ]);
              }}
            />


          </View>
        ) : (
          <View style={styles.fulfilledBox}>
            <Text style={styles.fulfilledText}>Transaction Completed</Text>
          </View>
        )}
      </ScrollView>

      {/* MODALS */}
      <QuantityModal
        visible={issueModalVisible}
        value={issueQtyInput}
        onChange={setIssueQtyInput}
        onCancel={() => {
          log("Issue modal cancel");
          setIssueModalVisible(false);
        }}
        onConfirm={() => {
          log("Issue modal confirm", { issueQtyInput });
          setIssueModalVisible(false);
          doIssue(safeNum(issueQtyInput, 0));
        }}
        title="Issue Quantity"
      />

      <QuantityModal
        visible={raiseModalVisible}
        value={raiseQtyInput}
        onChange={setRaiseQtyInput}
        onCancel={() => {
          log("Raise modal cancel");
          setRaiseModalVisible(false);
        }}
        onConfirm={() => {
          log("Raise modal confirm", { raiseQtyInput });
          setRaiseModalVisible(false);
          doRaiseOnly(safeNum(raiseQtyInput, 0));
        }}
        title="Raise Quantity"
      />
    </SafeAreaView>
  );
};

// Helper Components
const InfoRow = ({ label, value }: { label: string; value: any }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Text style={styles.value}>{String(value || "—")}</Text>
    </View>
  );
};

const ActionButton = ({ label, color, onPress, busy }: any) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <TouchableOpacity
      disabled={busy}
      style={[styles.actionBtn, { backgroundColor: busy ? C.subtleText : color }]}
      onPress={onPress}
    >
      <Text style={styles.actionBtnText}>{busy ? "Please wait…" : label}</Text>
    </TouchableOpacity>
  );
};

const QuantityModal = ({ visible, value, onChange, onCancel, onConfirm, title }: any) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            {...getDecimalInputProps()}
            value={value}
            onChangeText={onChange}
            style={styles.input}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 15 }}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.subtleText }]} onPress={onCancel}>
              <Text style={styles.actionBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.primaryStrong }]} onPress={onConfirm}>
              <Text style={styles.actionBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (C: any) => StyleSheet.create({
  container: { padding: 20, backgroundColor: C.bg },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    borderBottomWidth: 1,
    borderColor: C.border,
    backgroundColor: C.headerBg,
  },
  headerTitle: { fontSize: 15, fontWeight: "bold", color: C.text },
  card: {
    backgroundColor: C.surface,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  itemTitle: { fontSize: 13, fontWeight: "bold", color: C.text },
  separator: { height: 1, backgroundColor: C.border, marginVertical: 15 },
  row: { flexDirection: "row", marginBottom: 8 },
  label: { flex: 1, color: C.mutedText, fontSize: 11 },
  value: { flex: 2, color: C.text, fontWeight: "500", fontSize: 11 },

  debugBox: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  debugText: { fontSize: 11, color: C.mutedText, fontWeight: "700", marginTop: 2 },

  qtyContainer: { marginTop: 20, flexDirection: "row", gap: 10 },
  qtyBox: { flex: 1, alignItems: "center", padding: 15, backgroundColor: C.surfaceAlt, borderRadius: 8 },
  qtyLabel: { fontSize: 11, color: C.subtleText, marginBottom: 5 },
  qtyValue: { fontSize: 12, fontWeight: "bold" },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 25 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  actionBtnText: { color: C.white, fontWeight: "bold" },

  modalBackdrop: { flex: 1, backgroundColor: C.overlayStrong || C.overlay, justifyContent: "center", padding: 30 },
  modalCard: { backgroundColor: C.surface, padding: 20, borderRadius: 12 },
  modalTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 15, color: C.text },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, fontSize: 18, textAlign: "center", color: C.text, backgroundColor: C.surface },

  fulfilledBox: { padding: 20, backgroundColor: C.successSoft, borderRadius: 8, alignItems: "center" },
  fulfilledText: { color: C.success, fontWeight: "bold" },
});

export default InventoryScanResult;
