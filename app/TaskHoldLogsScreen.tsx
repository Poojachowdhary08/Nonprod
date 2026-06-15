import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { differenceInDays, format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "@/utils/auth";
import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";

type HoldTypeFilter = "All" | "Customer" | "Avenue";

type HoldLog = {
  hold_id?: string;
  scheduleid?: number;
  phasename?: string;
  hold_type?: string;
  hold_date?: string;
  resume_date?: string;
  hold_by_email?: string;
  hold_by_name?: string;
  resumed_by_email?: string;
  resumed_by_name?: string;
  hold_reason?: string;
  resume_reason?: string;
  hold_duration?: string | number | null;
};

const toSingle = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value || "";

const formatDate = (d?: string) => {
  if (!d) return "-";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "-" : format(date, "MMM d, yyyy");
};

const calculateDuration = (hold?: string, resume?: string) => {
  if (!hold || !resume) return "Same Day";
  const holdDate = new Date(hold);
  const resumeDate = new Date(resume);
  if (isNaN(holdDate.getTime()) || isNaN(resumeDate.getTime())) return "-";
  const days = differenceInDays(resumeDate, holdDate);
  return days === 0 ? "Same Day" : `${days} Day(s)`;
};

const displayActor = (log: HoldLog) =>
  log.hold_by_name ||
  log.resumed_by_name ||
  log.hold_by_email ||
  log.resumed_by_email ||
  "-";

const buildHoldLogRows = (logs: HoldLog[]) =>
  logs.map((log) => ({
    phase: log.phasename || "Unknown Phase",
    type: log.hold_type || "-",
    holdDate: formatDate(log.hold_date),
    resumeDate: formatDate(log.resume_date),
    duration: calculateDuration(log.hold_date, log.resume_date),
    actor: displayActor(log),
    reason: log.hold_reason || log.resume_reason || "-",
  }));

const escapeCsvValue = (value: string | number) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const buildHoldLogsCsv = (logs: HoldLog[]) => {
  const rows = buildHoldLogRows(logs);
  const header = ["#", "Phase", "Type", "Hold", "Resume", "Duration", "By", "Reason"];
  const body = rows.map((row, index) => [
    index + 1,
    row.phase,
    row.type,
    row.holdDate,
    row.resumeDate,
    row.duration,
    row.actor,
    row.reason,
  ]);

  return [header, ...body].map((line) => line.map(escapeCsvValue).join(",")).join("\n");
};

const downloadWebBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const TaskHoldLogsScreen: React.FC = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const propertyId = toSingle(params.propertyId as any);
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);

  const [logs, setLogs] = useState<HoldLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<HoldTypeFilter>("All");
  const [editMode, setEditMode] = useState(false);
  const [editingHoldId, setEditingHoldId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"Customer" | "Avenue">("Customer");
  const [savingHoldId, setSavingHoldId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchHoldLogs = useCallback(async () => {
    if (!propertyId) {
      setLogs([]);
      setLoading(false);
      return;
    }

    try {
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/holds/${propertyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
      const nextLogs = Array.isArray(data) ? data : Array.isArray(data?.holds) ? data.holds : [];
      setLogs(nextLogs);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not fetch hold logs");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchHoldLogs();
  }, [fetchHoldLogs]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchHoldLogs();
    } finally {
      setRefreshing(false);
    }
  };

  const toggleEditMode = () => {
    setEditMode((prev) => {
      const next = !prev;
      if (!next) {
        setEditingHoldId(null);
      }
      return next;
    });
  };

  const startEditing = (log: HoldLog) => {
    const holdId = String(log.hold_id || "");
    if (!holdId) {
      Alert.alert("Missing Hold ID", "This hold log cannot be edited because its identifier is missing.");
      return;
    }
    setEditingHoldId(holdId);
    setEditingType((log.hold_type || "Customer") === "Avenue" ? "Avenue" : "Customer");
  };

  const saveHoldType = async (log: HoldLog) => {
    const holdId = String(log.hold_id || "");
    if (!holdId) return;

    try {
      setSavingHoldId(holdId);
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/holds/${encodeURIComponent(holdId)}/type`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_type: editingType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);

      setLogs((prev) =>
        prev.map((item) =>
          String(item.hold_id || "") === holdId ? { ...item, ...(data?.hold || {}), hold_type: editingType } : item
        )
      );
      setEditingHoldId(null);
      Alert.alert("Saved", data?.message || "Hold type updated successfully.");
    } catch (e: any) {
      Alert.alert("Update Failed", e?.message || "Could not update the hold type.");
    } finally {
      setSavingHoldId(null);
    }
  };

  const counts = useMemo(
    () =>
      logs.reduce((acc: Record<string, number>, curr) => {
        const type = curr?.hold_type || "Other";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {}),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      const logType = String(log?.hold_type || "").toLowerCase();
      const matchesType = typeFilter === "All" || logType === typeFilter.toLowerCase();
      if (!matchesType) return false;
      if (!needle) return true;

      return [
        log.phasename,
        log.hold_type,
        log.hold_reason,
        log.resume_reason,
        log.hold_by_name,
        log.resumed_by_name,
        log.hold_by_email,
        log.resumed_by_email,
        log.hold_date,
        log.resume_date,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [logs, search, typeFilter]);

  const exportHoldLogsTable = async () => {
    if (!filteredLogs.length) {
      Alert.alert("Export unavailable", "There are no hold logs to export.");
      return;
    }

    if (isExporting) return;

    setIsExporting(true);
    try {
      const fileName = `hold-logs-${propertyId || "property"}-${Date.now()}.csv`;
      const csv = buildHoldLogsCsv(filteredLogs);

      if (Platform.OS === "web") {
        const csvBlob = new Blob([csv], {
          type: "text/csv;charset=utf-8",
        });
        downloadWebBlob(csvBlob, fileName);
        return;
      }

      const exportUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(exportUri, csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(exportUri, {
          mimeType: "text/csv",
          dialogTitle: "Download hold logs",
          UTI: "public.comma-separated-values-text",
        });
      } else {
        Alert.alert("File exported", exportUri);
      }
    } catch (e) {
      console.error("exportHoldLogsTable error:", e);
      Alert.alert("Export failed", "Could not export hold logs.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.container} testID="task-hold-logs-screen-root">
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <TText style={styles.headerTitle}>Hold Logs</TText>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")} style={styles.headerIconBtn}>
          <Ionicons name="home" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={C.primaryStrong} />
          <TText style={styles.emptyTitle}>Loading hold logs...</TText>
        </View>
      ) : (
        <ScrollView
          style={styles.page}
          contentContainerStyle={styles.pageContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryStrong} />
          }
          showsVerticalScrollIndicator={false}
        >
          {Object.keys(counts).length > 0 && (
            <View style={styles.summaryRow}>
              {Object.entries(counts).map(([type, count]) => (
                <View key={type} style={styles.summaryCard}>
                  <TText style={styles.summaryLabel}>{type}</TText>
                  <TText style={styles.summaryValue}>{count}</TText>
                </View>
              ))}
              <TouchableOpacity
                onPress={exportHoldLogsTable}
                style={[styles.summaryExportBtn, isExporting && styles.disabledBtn]}
                disabled={isExporting || loading}
                activeOpacity={0.9}
              >
                <Ionicons name="download-outline" size={22} color={C.white} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.searchRow}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={C.subtleText} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search hold logs"
                placeholderTextColor={C.subtleText}
                style={styles.searchInput}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={C.subtleText} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[styles.editToggleBtn, editMode && styles.editToggleBtnActive]}
              onPress={toggleEditMode}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={editMode ? "Turn off edit mode" : "Turn on edit mode"}
            >
              <Ionicons
                name={editMode ? "create" : "create-outline"}
                size={16}
                color={editMode ? C.white : C.primaryStrong}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.typeFilterRow}>
            {(["All", "Customer", "Avenue"] as const).map((type) => {
              const active = typeFilter === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeFilterBtn, active && styles.typeFilterBtnActive]}
                  onPress={() => setTypeFilter(type)}
                  activeOpacity={0.9}
                >
                  <TText style={[styles.typeFilterText, active && styles.typeFilterTextActive]}>{type}</TText>
                </TouchableOpacity>
              );
            })}
          </View>

          {filteredLogs.length === 0 ? (
            <View style={styles.emptyStateCompact}>
              <Ionicons name="document-text-outline" size={38} color={C.subtleText} />
              <TText style={styles.emptyTitle}>
                {logs.length === 0 ? "No hold logs found" : "No hold logs match your filters"}
              </TText>
              <TText style={styles.emptyText}>
                {logs.length === 0
                  ? "There are no hold or resume records available for this property yet."
                  : "Try changing the type option or clearing search."}
              </TText>
            </View>
          ) : (
            filteredLogs.map((log, index) => (
              <View key={`${log.hold_id ?? log.scheduleid ?? index}_${log.hold_date ?? index}`} style={styles.logCard}>
                <View style={styles.logCardHeader}>
                  <View style={styles.phaseIcon}>
                    <Ionicons name="pause-circle-outline" size={18} color={C.primaryStrong} />
                  </View>
                  <View style={styles.phaseTextWrap}>
                    <TText style={styles.logPhaseName} numberOfLines={2}>
                      {log.phasename || "Unknown Phase"}
                    </TText>
                    <TText style={styles.logSubText}>{formatDate(log.hold_date)}</TText>
                  </View>
                  {editingHoldId === String(log.hold_id || "") ? (
                    <View style={styles.inlineEditorWrap}>
                      <TouchableOpacity
                        style={[styles.inlineTypeBtn, editingType === "Customer" && styles.inlineTypeBtnActive]}
                        onPress={() => setEditingType("Customer")}
                      >
                        <TText style={[styles.inlineTypeBtnText, editingType === "Customer" && styles.inlineTypeBtnTextActive]}>
                          Customer
                        </TText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.inlineTypeBtn, editingType === "Avenue" && styles.inlineTypeBtnActive]}
                        onPress={() => setEditingType("Avenue")}
                      >
                        <TText style={[styles.inlineTypeBtnText, editingType === "Avenue" && styles.inlineTypeBtnTextActive]}>
                          Avenue
                        </TText>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.typePill}>
                      <TText style={styles.typePillText}>{log.hold_type || "-"}</TText>
                    </View>
                  )}
                </View>

                <TwoCol
                  left={<Detail label="Hold" value={formatDate(log.hold_date)} />}
                  right={<Detail label="Resume" value={formatDate(log.resume_date)} />}
                />
                <TwoCol
                  left={<Detail label="Duration" value={calculateDuration(log.hold_date, log.resume_date)} />}
                  right={<Detail label="By" value={displayActor(log)} />}
                />
                <Detail label="Reason" value={log.hold_reason || log.resume_reason || "-"} multiline />
                <View style={styles.editActionsRow}>
                  {editMode && editingHoldId === String(log.hold_id || "") ? (
                    <>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, styles.smallActionGhost]}
                        onPress={() => setEditingHoldId(null)}
                        disabled={savingHoldId === String(log.hold_id || "")}
                      >
                        <TText style={styles.smallActionGhostText}>Cancel</TText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallActionBtn, styles.smallActionPrimary]}
                        onPress={() => saveHoldType(log)}
                        disabled={savingHoldId === String(log.hold_id || "")}
                      >
                        <TText style={styles.smallActionPrimaryText}>
                          {savingHoldId === String(log.hold_id || "") ? "Saving..." : "Save Type"}
                        </TText>
                      </TouchableOpacity>
                    </>
                  ) : editMode ? (
                    <TouchableOpacity style={[styles.smallActionBtn, styles.smallActionGhost]} onPress={() => startEditing(log)}>
                      <TText style={styles.smallActionGhostText}>Edit Type</TText>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {editMode && editingHoldId !== String(log.hold_id || "") ? (
                  <View style={styles.editHintRow}>
                    <TText style={styles.editHintText}>Edit mode is on</TText>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const Detail: React.FC<{ label: string; value: string; multiline?: boolean }> = ({ label, value, multiline }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={[styles.detailWrap, multiline && styles.detailWrapFull]}>
      <TText style={styles.detailLabel}>{label}</TText>
      <TText style={[styles.detailValue, multiline && styles.detailValueMultiline]}>{value}</TText>
    </View>
  );
};

const TwoCol: React.FC<{ left: React.ReactNode; right: React.ReactNode }> = ({ left, right }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  return (
    <View style={styles.twoColRow}>
      <View style={styles.twoColItem}>{left}</View>
      <View style={styles.twoColGap} />
      <View style={styles.twoColItem}>{right}</View>
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerContainer: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 12,
      backgroundColor: C.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerIconBtn: { width: 48, alignItems: "center", justifyContent: "center", padding: 4 },
    headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "bold", color: C.text },
    disabledBtn: { opacity: 0.5 },
    page: { flex: 1 },
    pageContent: { padding: 14, paddingBottom: 28 },
    summaryRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    summaryCard: {
      flex: 1,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    summaryLabel: { fontSize: 11, color: C.mutedText, fontWeight: "700" },
    summaryValue: { marginTop: 2, fontSize: 16, color: C.text, fontWeight: "900" },
    summaryExportBtn: {
      width: 48,
      backgroundColor: C.primaryStrong,
      borderRadius: 12,
      paddingHorizontal: 0,
      paddingVertical: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    searchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    searchBar: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      backgroundColor: C.inputBg,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 12, fontWeight: "600", color: C.text, paddingVertical: 0 },
    editToggleBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.primaryStrong,
      backgroundColor: C.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    editToggleBtnActive: {
      backgroundColor: C.primaryStrong,
    },
    typeFilterRow: {
      flexDirection: "row",
      gap: 6,
      padding: 4,
      borderRadius: 12,
      backgroundColor: C.surfaceAlt,
      marginBottom: 12,
    },
    typeFilterBtn: {
      flex: 1,
      minHeight: 36,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    typeFilterBtnActive: { backgroundColor: C.primaryStrong },
    typeFilterText: { fontSize: 12, fontWeight: "800", color: C.mutedText },
    typeFilterTextActive: { color: C.white },
    logCard: {
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    logCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    phaseIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: C.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    phaseTextWrap: { flex: 1, minWidth: 0 },
    logPhaseName: { fontSize: 13, fontWeight: "900", color: C.text },
    logSubText: { marginTop: 2, fontSize: 11, fontWeight: "700", color: C.mutedText },
    typePill: {
      borderRadius: 999,
      backgroundColor: C.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    typePillText: { fontSize: 10, color: C.primaryStrong, fontWeight: "900" },
    inlineEditorWrap: { flexDirection: "row", gap: 6 },
    inlineTypeBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    inlineTypeBtnActive: {
      borderColor: C.primaryStrong,
      backgroundColor: C.primarySoft,
    },
    inlineTypeBtnText: { fontSize: 10, color: C.mutedText, fontWeight: "900" },
    inlineTypeBtnTextActive: { color: C.primaryStrong },
    twoColRow: { flexDirection: "row", alignItems: "flex-start" },
    twoColItem: { flex: 1, minWidth: 0 },
    twoColGap: { width: 10 },
    detailWrap: { marginTop: 8 },
    detailWrapFull: { width: "100%" },
    detailLabel: { fontSize: 10, fontWeight: "800", color: C.mutedText, marginBottom: 5 },
    detailValue: {
      minHeight: 35,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceAlt,
      color: C.text,
      fontSize: 11,
      fontWeight: "700",
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    detailValueMultiline: { lineHeight: 18 },
    editActionsRow: {
      marginTop: 12,
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
    },
    editHintRow: {
      marginTop: 8,
      alignItems: "flex-end",
    },
    editHintText: {
      fontSize: 10,
      fontWeight: "800",
      color: C.mutedText,
    },
    smallActionBtn: {
      minHeight: 34,
      borderRadius: 10,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    smallActionGhost: {
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surfaceAlt,
    },
    smallActionGhostText: { color: C.text, fontSize: 11, fontWeight: "800" },
    smallActionPrimary: {
      backgroundColor: C.primaryStrong,
    },
    smallActionPrimaryText: { color: C.white, fontSize: 11, fontWeight: "800" },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyStateCompact: {
      minHeight: 260,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    emptyTitle: { marginTop: 10, color: C.text, fontSize: 15, fontWeight: "900", textAlign: "center" },
    emptyText: { marginTop: 6, color: C.mutedText, fontSize: 12, fontWeight: "600", textAlign: "center" },
  });

export default TaskHoldLogsScreen;
