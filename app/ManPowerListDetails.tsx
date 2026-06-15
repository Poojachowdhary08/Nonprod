import { Animated } from "react-native";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {  View, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, TextInput, Modal, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSmartSearch } from "@/hooks/useSmartSearch";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
// ✅ Telemetry
import {
  trackScreen,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  startScreenTimer,
} from "../utils/telemetry";
import TText from "@/components/TText";

const ManPowerListDetails = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [workerData, setWorkerData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [openModalType, setOpenModalType] = useState<
    null | "attendance" | "half" | "full" | "total"
  >(null);
  const modalOpacity = useState(new Animated.Value(0))[0];

  // NEW: the selected work-log to show in a dialog
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // ✅ Track last filter state (nice analytics)
  const lastFilterRef = useRef<{
    start?: string | null;
    end?: string | null;
  }>({ start: null, end: null });

  // ✅ debounce search submit
  const searchDebounceRef = useRef<any>(null);

  const isValidDate = (date: any): date is Date =>
    date instanceof Date && !isNaN(date.getTime());

  const getFormattedDate = (date: Date | null) =>
    isValidDate(date) ? date.toISOString().split("T")[0] : "";

  // Convert backend date (YYYY-MM-DD) -> DD-MM-YYYY
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  // created_at is already like "19-06-2025 11:08AM"; just return as-is with fallback
  const formatCreatedAt = (val?: string) => val || "N/A";

  // Animate modal for the stats date-lists
  const animateModal = (visible: boolean) => {
    Animated.timing(modalOpacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (!visible) setOpenModalType(null);
    });
  };
  useEffect(() => {
    if (openModalType !== null) animateModal(true);
  }, [openModalType]);

  // Build date arrays for the stats dialog
  const getModalDates = () => {
    switch (openModalType) {
      case "total":
        return Object.keys(workerData?.daily_hours_summary || []);
      case "attendance":
        return Object.keys(workerData?.attendance_dates || []);
      case "full":
        return (
          workerData?.work_log_details
            ?.filter((log: any) => (log.day_type || "").toLowerCase() === "full")
            ?.map((log: any) => log.date) || []
        );
      case "half":
        return (
          workerData?.work_log_details
            ?.filter((log: any) => (log.day_type || "").toLowerCase() === "half")
            ?.map((log: any) => log.date) || []
        );
      default:
        return [];
    }
  };

  // ✅ Telemetry: screen context + view + timer
  useEffect(() => {
    updateDynamicContext({
      screen: "ManPowerListDetails",
      worker_id: params?.id ? String(params.id) : "",
      worker_type_param: params?.type ? String(params.type) : "",
    });

    trackScreen("ManPowerListDetails", {
      platform: Platform.OS,
      has_worker_id: !!params?.id,
      worker_id: params?.id ? String(params.id) : null,
      worker_type_param: params?.type ? String(params.type) : null,
    });

    return () => {
      clearDynamicContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stop = startScreenTimer("ManPowerListDetails", {
      worker_id: params?.id ? String(params.id) : null,
      worker_type_param: params?.type ? String(params.type) : null,
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch
  useEffect(() => {
    const fetchWorkerSummary = async () => {
      const workerId = params?.id ? String(params.id) : "";
      if (!workerId) return;

      const t0 = Date.now();
      trackUI({
        screen: "ManPowerListDetails",
        element: "fetch_worker_summary_start",
        action: "submit",
        extra: { worker_id: workerId },
      });

      try {
        const url = `${APP_API_BASE_URL}/worker/${encodeURIComponent(workerId)}/summary`;
        const res = await authenticatedFetch(url);
        const json = await res.json();

        trackNetwork({
          url: `/worker/${workerId}/summary`,
          method: "GET",
          status: res.status,
          ok: res.ok,
          durationMs: Date.now() - t0,
          extra: { worker_id: workerId },
        });

        setWorkerData(json);

        const logsCount = Array.isArray(json?.work_log_details)
          ? json.work_log_details.length
          : 0;

        trackUI({
          screen: "ManPowerListDetails",
          element: "fetch_worker_summary_success",
          action: "submit",
          extra: { worker_id: workerId, logs_count: logsCount },
        });
      } catch (err: any) {
        trackNetwork({
          url: `/worker/${workerId}/summary`,
          method: "GET",
          status: 0,
          ok: false,
          durationMs: Date.now() - t0,
          extra: { worker_id: workerId, error: String(err?.message || err) },
        });

        trackUI({
          screen: "ManPowerListDetails",
          element: "fetch_worker_summary_error",
          action: "submit",
          extra: { worker_id: workerId, message: String(err?.message || err) },
        });
      } finally {
        setLoading(false);
      }
    };

    if (params?.id) fetchWorkerSummary();
  }, [params?.id]);

  const getName = () =>
    workerData?.type === "contractor"
      ? workerData?.contractor_name || "N/A"
      : workerData?.labor_name || workerData?.labour_name || "N/A";

  const getTypeLabel = () =>
    workerData?.type === "contractor" ? "Contractor Summary" : "Labor Summary";

  const getPaymentStyle = (mode?: string) => {
    switch ((mode || "").toLowerCase()) {
      case "hourly":
        return styles.hourly;
      case "daily":
        return styles.daily;
      default:
        return styles.badge;
    }
  };

  const isFilterActive = !!(startDate || endDate);

  // FIX: avoid mutating startDate/endDate via setHours on the state object
  const dateFilteredLogs = useMemo(() => {
    const logs = workerData?.work_log_details || [];
    return logs.filter((log: any) => {
      const logDate = new Date(log.date);
      if (isNaN(logDate.getTime())) return true;

      let start: Date | null = null;
      let end: Date | null = null;
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      }
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }

      if (start && logDate < start) return false;
      if (end && logDate > end) return false;
      return true;
    });
  }, [workerData, startDate, endDate]);

  const filteredLogs = useSmartSearch({
    data: dateFilteredLogs,
    query: searchQuery,
    keys: [
      "property_name",
      "project_name",
      "remarks",
      "payment_mode",
      "day_type",
      "date",
    ],
  });

  const resetFilters = () => {
    trackUI({
      screen: "ManPowerListDetails",
      element: "filter_reset",
      action: "click",
      extra: {
        prev_start: startDate ? getFormattedDate(startDate) : null,
        prev_end: endDate ? getFormattedDate(endDate) : null,
      },
    });
    setStartDate(null);
    setEndDate(null);
  };

  // ✅ Telemetry: search typing + debounce submit
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(() => {
      const q = (searchQuery || "").trim();
      if (!q) return;

      trackUI({
        screen: "ManPowerListDetails",
        element: "search_input",
        action: "submit",
        extra: { query_len: q.length, has_filter: isFilterActive },
      });
    }, 650);

    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery, isFilterActive]);

  // ✅ Telemetry: filter applied (emit only when it actually changes)
  useEffect(() => {
    const curStart = startDate ? getFormattedDate(startDate) : null;
    const curEnd = endDate ? getFormattedDate(endDate) : null;

    const prev = lastFilterRef.current;
    const changed = prev.start !== curStart || prev.end !== curEnd;

    if (!changed) return;

    lastFilterRef.current = { start: curStart, end: curEnd };

    // don’t spam on initial mount before data loads
    if (!workerData) return;

    trackUI({
      screen: "ManPowerListDetails",
      element: "filter_changed",
      action: "submit",
      extra: {
        start: curStart,
        end: curEnd,
        logs_after_filter: dateFilteredLogs.length,
      },
    });
  }, [startDate, endDate, workerData, dateFilteredLogs.length]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4A90E2" />
        <TText style={styles.loadingText}>Loading worker details...</TText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID="man-power-list-details-root">
      {/* Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={() => {
            trackUI({
              screen: "ManPowerListDetails",
              element: "header_back",
              action: "click",
              extra: { worker_id: params?.id ? String(params.id) : null },
            });
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
        </TouchableOpacity>

        <TText style={styles.headerTitle}>Man Power Summary</TText>

        <TouchableOpacity
          onPress={() => {
            trackUI({
              screen: "ManPowerListDetails",
              element: "header_home",
              action: "click",
              extra: {},
            });
            router.push("/HomeScreen");
          }}
        >
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      <TText style={styles.sectionTitle}>{getTypeLabel()}</TText>

      {/* Summary Card */}
      <View style={styles.card}>
        <View className="detailRow" style={styles.detailRow}>
          <TText style={styles.label}>Name :</TText>
          <TText style={styles.value}>{getName()}</TText>
        </View>
        <View style={styles.detailRow}>
          <TText style={styles.label}>Type :</TText>
          <TText style={styles.value}>{workerData?.type || "N/A"}</TText>
        </View>
        <View style={styles.detailRow}>
          <TText style={styles.label}>Phone :</TText>
          <TText style={styles.value}>{workerData?.phone || "N/A"}</TText>
        </View>
        <View style={styles.detailRow}>
          <TText style={styles.label}>Payment Type :</TText>
          <TText style={styles.value}>{workerData?.payment_type || "N/A"}</TText>
        </View>
        <View style={styles.detailRow}>
          <TText style={styles.label}>Hours Worked :</TText>
          <TText style={styles.value}>{workerData?.total_hours_worked ?? "N/A"}</TText>
        </View>
        <View style={styles.detailRow}>
          <TText style={styles.label}>Sqft Done :</TText>
          <TText style={styles.value}>{workerData?.total_sqft_completed ?? "N/A"}</TText>
        </View>
        <View style={[styles.detailRow, { flexDirection: "column", alignItems: "flex-start" }]}>
          <TText style={styles.label}>Properties Worked :</TText>
          <TText style={styles.valueBlock}>
            {workerData?.properties_worked_on?.length
              ? workerData.properties_worked_on.join(",\n")
              : "N/A"}
          </TText>
        </View>
      </View>

      {/* Quick stats */}
      <View style={styles.statRow}>
        <TouchableOpacity
          style={styles.statBox}
          onPress={() => {
            trackUI({
              screen: "ManPowerListDetails",
              element: "stat_days_worked",
              action: "open",
              extra: { count: Object.keys(workerData?.daily_hours_summary || {}).length || 0 },
            });
            setOpenModalType("total");
          }}
        >
          <TText style={styles.statCount}>
            {Object.keys(workerData?.daily_hours_summary || {}).length || 0}
          </TText>
          <TText style={styles.statLabel}>Days Worked</TText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statBox}
          onPress={() => {
            trackUI({
              screen: "ManPowerListDetails",
              element: "stat_attendance",
              action: "open",
              extra: { count: Object.keys(workerData?.attendance_dates || {}).length || 0 },
            });
            setOpenModalType("attendance");
          }}
        >
          <TText style={styles.statCount}>
            {Object.keys(workerData?.attendance_dates || {}).length || 0}
          </TText>
          <TText style={styles.statLabel}>Attendance</TText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statBox}
          onPress={() => {
            const c =
              workerData?.work_log_details?.filter(
                (l: any) => (l.day_type || "").toLowerCase() === "full"
              ).length || 0;
            trackUI({
              screen: "ManPowerListDetails",
              element: "stat_full_days",
              action: "open",
              extra: { count: c },
            });
            setOpenModalType("full");
          }}
        >
          <TText style={styles.statCount}>
            {workerData?.work_log_details?.filter(
              (l: any) => (l.day_type || "").toLowerCase() === "full"
            ).length || 0}
          </TText>
          <TText style={styles.statLabel}>Full Days</TText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.statBox}
          onPress={() => {
            const c =
              workerData?.work_log_details?.filter(
                (l: any) => (l.day_type || "").toLowerCase() === "half"
              ).length || 0;
            trackUI({
              screen: "ManPowerListDetails",
              element: "stat_half_days",
              action: "open",
              extra: { count: c },
            });
            setOpenModalType("half");
          }}
        >
          <TText style={styles.statCount}>
            {workerData?.work_log_details?.filter(
              (l: any) => (l.day_type || "").toLowerCase() === "half"
            ).length || 0}
          </TText>
          <TText style={styles.statLabel}>Half Days</TText>
        </TouchableOpacity>
      </View>

      {/* Search + Filter */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, marginTop: 15 }}>
        <TextInput
          placeholder="Search property, remarks, work type or date"
          value={searchQuery}
          onChangeText={(t) => {
            setSearchQuery(t);
            trackUI({
              screen: "ManPowerListDetails",
              element: "search_input",
              action: "change",
              extra: { len: t.length },
            });
          }}
          style={[styles.searchInput, { flex: 1 }]}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              trackUI({
                screen: "ManPowerListDetails",
                element: "search_clear",
                action: "click",
                extra: {},
              });
              setSearchQuery("");
            }}
          >
            <Ionicons
              name="close-circle"
              size={22}
              color="#999"
              style={{ marginHorizontal: 6 }}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            if (isFilterActive) {
              resetFilters();
            } else {
              trackUI({
                screen: "ManPowerListDetails",
                element: "filter_open",
                action: "open",
                extra: {},
              });
              setShowFilterModal(true);
            }
          }}
        >
          <Ionicons
            name={isFilterActive ? "close-circle" : "filter"}
            size={24}
            color={isFilterActive ? "#E53935" : "#4A90E2"}
          />
        </TouchableOpacity>
      </View>

      {/* Date range modal */}
      <Modal visible={showFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <TText style={styles.sectionTitle}>Filter by Date</TText>
              <TouchableOpacity
                onPress={() => {
                  trackUI({
                    screen: "ManPowerListDetails",
                    element: "filter_close",
                    action: "close",
                    extra: {},
                  });
                  setShowFilterModal(false);
                }}
              >
                <Ionicons name="close-circle" size={24} color="#E53935" />
              </TouchableOpacity>
            </View>

            {Platform.OS === "web" ? (
              <>
                {/* @ts-ignore */}
                <input
                  type="date"
                  style={styles.dateInput}
                  value={getFormattedDate(startDate)}
                  onChange={(e) => {
                    const selected = new Date(e.target.value);
                    setStartDate(isValidDate(selected) ? selected : null);
                  }}
                />
                {/* @ts-ignore */}
                <input
                  type="date"
                  style={styles.dateInput}
                  value={getFormattedDate(endDate)}
                  onChange={(e) => {
                    const selected = new Date(e.target.value);
                    setEndDate(isValidDate(selected) ? selected : null);
                  }}
                />
              </>
            ) : (
              <>
                <TText style={{ marginBottom: 4 }}>Start Date</TText>
                <TouchableOpacity
                  onPress={() => {
                    trackUI({
                      screen: "ManPowerListDetails",
                      element: "filter_start_date_picker_open",
                      action: "open",
                      extra: {},
                    });
                    setShowStartPicker(true);
                  }}
                >
                  <TText style={styles.dateInput}>
                    {startDate?.toDateString() || "Select Start Date"}
                  </TText>
                </TouchableOpacity>

                {showStartPicker && (
                  <DateTimePicker
                    value={startDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowStartPicker(false);
                      if (selectedDate) {
                        setStartDate(selectedDate);
                        trackUI({
                          screen: "ManPowerListDetails",
                          element: "filter_start_date_selected",
                          action: "submit",
                          extra: { start: getFormattedDate(selectedDate) },
                        });
                      }
                    }}
                  />
                )}

                <TText style={{ marginTop: 10, marginBottom: 4 }}>End Date</TText>
                <TouchableOpacity
                  onPress={() => {
                    trackUI({
                      screen: "ManPowerListDetails",
                      element: "filter_end_date_picker_open",
                      action: "open",
                      extra: {},
                    });
                    setShowEndPicker(true);
                  }}
                >
                  <TText style={styles.dateInput}>
                    {endDate?.toDateString() || "Select End Date"}
                  </TText>
                </TouchableOpacity>

                {showEndPicker && (
                  <DateTimePicker
                    value={endDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowEndPicker(false);
                      if (selectedDate) {
                        setEndDate(selectedDate);
                        trackUI({
                          screen: "ManPowerListDetails",
                          element: "filter_end_date_selected",
                          action: "submit",
                          extra: { end: getFormattedDate(selectedDate) },
                        });
                      }
                    }}
                  />
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => {
                trackUI({
                  screen: "ManPowerListDetails",
                  element: "filter_apply",
                  action: "submit",
                  extra: {
                    start: startDate ? getFormattedDate(startDate) : null,
                    end: endDate ? getFormattedDate(endDate) : null,
                  },
                });
                setShowFilterModal(false);
              }}
            >
              <TText style={styles.applyBtnText}>Apply</TText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Work Logs - tap card to open dialog */}
      <TText style={[styles.sectionTitle, { marginBottom: 10 }]}>
        Work Logs ({filteredLogs.length})
      </TText>

      {filteredLogs.length > 0 ? (
        filteredLogs.map((log: any, index: number) => {
          const dayType = (log?.day_type || "").toLowerCase();
          return (
            <View key={index} style={styles.logCardContainer}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  trackUI({
                    screen: "ManPowerListDetails",
                    element: "work_log_open",
                    action: "open",
                    extra: {
                      date: log?.date || null,
                      payment_mode: log?.payment_mode || null,
                      day_type: log?.day_type || null,
                      project_id: log?.project_id || null,
                      property_id: log?.property_id || null,
                    },
                  });
                  setSelectedLog(log);
                }}
              >
                <View style={styles.card}>
                  <TText style={styles.logTitle}>
                    {formatDate(log?.date)} • {log?.project_name || "N/A"} •{" "}
                    {log?.property_name || "N/A"}
                  </TText>

                  <View style={styles.badgeRow}>
                    <TText style={[styles.badge, getPaymentStyle(log?.payment_mode)]}>
                      {(log?.payment_mode || "N/A").toUpperCase()}
                    </TText>
                    {(log?.payment_mode || "").toLowerCase() === "daily" && (
                      <TText
                        style={[
                          styles.badge,
                          dayType === "half" ? styles.halfDay : styles.fullDay,
                        ]}
                      >
                        {dayType === "half" ? "HALF DAY" : "FULL DAY"}
                      </TText>
                    )}
                  </View>

                  <TText
                    style={[
                      styles.logText,
                      (log?.payment_mode || "").toLowerCase() === "hourly" &&
                        styles.highlightHours,
                    ]}
                  >
                    Hours: {log?.hours_worked ?? "N/A"} | Sqft:{" "}
                    {log?.sqft_done ?? "N/A"}
                  </TText>

                  <TText style={styles.logText} numberOfLines={1} ellipsizeMode="tail">
                    Remarks: {log?.remarks || "N/A"}
                  </TText>
                </View>
              </TouchableOpacity>
            </View>
          );
        })
      ) : (
        <TText style={{ color: "#999", fontStyle: "italic", marginTop: 10 }}>
          No work logs found in selected range.
        </TText>
      )}

      {/* Stats dates dialog */}
      <Modal visible={!!openModalType} transparent animationType="none">
        <Animated.View style={[styles.modalOverlay, { opacity: modalOpacity }]}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <TText style={styles.sectionTitle}>{openModalType?.toUpperCase()} DATES</TText>
              <TouchableOpacity
                onPress={() => {
                  trackUI({
                    screen: "ManPowerListDetails",
                    element: "stat_modal_close",
                    action: "close",
                    extra: { type: openModalType },
                  });
                  animateModal(false);
                }}
              >
                <Ionicons name="close-circle" size={24} color="#E53935" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 200 }}>
              {getModalDates().map((date: string, idx: number) => (
                <TText key={idx} style={{ paddingVertical: 4, color: "#333" }}>
                  {formatDate(date)}
                </TText>
              ))}
              {getModalDates().length === 0 && (
                <TText style={{ fontStyle: "italic", color: "#aaa" }}>No dates found</TText>
              )}
            </ScrollView>
          </View>
        </Animated.View>
      </Modal>

      {/* Work-log detail dialog */}
      <Modal
        visible={!!selectedLog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          trackUI({
            screen: "ManPowerListDetails",
            element: "work_log_close",
            action: "close",
            extra: {},
          });
          setSelectedLog(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: "92%" }]}>
            <View style={styles.modalHeaderRow}>
              <TText style={styles.sectionTitle}>Work Log Details</TText>
              <TouchableOpacity
                onPress={() => {
                  trackUI({
                    screen: "ManPowerListDetails",
                    element: "work_log_close",
                    action: "close",
                    extra: {},
                  });
                  setSelectedLog(null);
                }}
              >
                <Ionicons name="close-circle" size={24} color="#E53935" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              <DetailRow label="Date" value={formatDate(selectedLog?.date)} />
              <DetailRow label="Created At" value={formatCreatedAt(selectedLog?.created_at)} />
              <DetailRow
                label="Engineer"
                value={`${selectedLog?.created_by_engineer_name || "N/A"} (${
                  selectedLog?.created_by_engineer_id || "N/A"
                })`}
              />
              <DetailRow
                label="Project"
                value={`${selectedLog?.project_name || "N/A"} [${
                  selectedLog?.project_id || "N/A"
                }]`}
              />
              <DetailRow
                label="Property"
                value={`${selectedLog?.property_name || "N/A"} [${
                  selectedLog?.property_id || "N/A"
                }]`}
              />
              <DetailRow label="Phase Name" value={`${selectedLog?.phase_name || "N/A"}`} />
              <DetailRow
                label="Payment Mode"
                value={selectedLog?.payment_mode || "N/A"}
                badgeStyle={getPaymentStyle(selectedLog?.payment_mode)}
              />
              {(selectedLog?.payment_mode || "").toLowerCase() === "daily" && (
                <DetailRow
                  label="Day Type"
                  value={(selectedLog?.day_type || "").toUpperCase() || "N/A"}
                />
              )}
              <DetailRow label="Hours Worked" value={String(selectedLog?.hours_worked ?? "N/A")} />
              <DetailRow label="Sqft Done" value={String(selectedLog?.sqft_done ?? "N/A")} />
              <DetailRow label="Remarks" value={selectedLog?.remarks || "N/A"} multiline />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// Small helper for labeled rows in the dialog
const DetailRow = ({
  label,
  value,
  badgeStyle,
  multiline,
}: {
  label: string;
  value: string;
  badgeStyle?: any;
  multiline?: boolean;
}) => (
  <View style={styles.detailRowDialog}>
    <TText style={styles.detailLabelDialog}>{label}</TText>
    {badgeStyle ? (
      <TText style={[styles.badge, badgeStyle]}>{value}</TText>
    ) : (
      <TText
        style={[styles.detailValueDialog, multiline && { textAlign: "left" }]}
        numberOfLines={multiline ? undefined : 2}
      >
        {value}
      </TText>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#F9F9F9" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#4A90E2" },

  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 5,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#2b2b2b",
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  label: { fontWeight: "600", color: "#444", fontSize: 14 },
  value: {
    fontSize: 14,
    color: "#555",
    textAlign: "right",
    maxWidth: "60%",
    textTransform: "capitalize",
  },
  valueBlock: { fontSize: 14, color: "#555", paddingTop: 6, lineHeight: 20 },

  logCardContainer: { marginBottom: 16 },
  logTitle: { fontWeight: "bold", fontSize: 14, color: "#333", marginBottom: 6 },
  logText: { fontSize: 13, color: "#555", marginBottom: 2, textTransform: "capitalize" },

  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    fontSize: 12,
    fontWeight: "bold",
    overflow: "hidden",
    color: "#333",
    backgroundColor: "#eee",
  },
  hourly: { backgroundColor: "#D6F5D6" },
  daily: { backgroundColor: "#FFE9CC" },
  fullDay: { backgroundColor: "#E0E7FF" },
  halfDay: { backgroundColor: "#F3D9FA" },
  highlightHours: { fontWeight: "bold", color: "#2E7D32" },

  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
  },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  dateInput: {
    borderColor: "#ccc",
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  applyBtn: {
    backgroundColor: "#4A90E2",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  applyBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  statRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 8,
  },
  statBox: {
    width: "23%",
    aspectRatio: 1,
    backgroundColor: "#F2F4F6",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statCount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
    textAlign: "center",
  },
  statLabel: { fontSize: 11, color: "#666", textAlign: "center" },

  detailRowDialog: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  detailLabelDialog: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
    minWidth: 110,
  },
  detailValueDialog: { fontSize: 13, color: "#333", flexShrink: 1, textAlign: "right" },
});

export default ManPowerListDetails;
