import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Dimensions, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";

import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";
import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";

type ScheduleItem = {
  scheduleid: number;
  phasename: string;
  status: string;
  startdate?: string;
  enddate?: string;
  x?: number;
  y?: number;
  exp_startdate?: string;
  exp_enddate?: string;
  depends_on_scheduleid?: number[] | null;
  completion_percentage?: number;
};

type Props = {
  propertyId: string;
  userDetails: any;
};

const CustomerTaskWorkflow = ({ propertyId }: Props) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const { width: winW, height: winH } = Dimensions.get("window");
  const isMobile = winW < 768;

  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 160;
  const xSpacing = 340;
  const ySpacing = 240;

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [edges, setEdges] = useState<{ from: number; to: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: winW * 3, height: winH * 3 });

  const zoomableRef = useRef<any>(null);
  const [zoom] = useState(isMobile ? 0.6 : 0.8);

  const STATUS_THEMES: Record<string, any> = {
    completed: { bg: C.successSoft, border: "rgba(34,197,94,0.35)", accent: C.success },
    "in progress": { bg: C.primarySoft, border: "rgba(59,130,246,0.35)", accent: C.primaryStrong },
    inprogress: { bg: C.primarySoft, border: "rgba(59,130,246,0.35)", accent: C.primaryStrong },
    pending: { bg: C.pill, border: C.border, accent: C.primaryStrong },
    hold: { bg: C.dangerSoft, border: "rgba(239,68,68,0.22)", accent: C.danger },
    "on hold": { bg: C.dangerSoft, border: "rgba(239,68,68,0.22)", accent: C.danger },
    unknown: { bg: C.surfaceAlt, border: C.border, accent: C.navIconInactive },
  };

  const projectSummary = useMemo(() => {
    if (!schedule.length) return { progress: 0, plannedStart: "—", actualEnd: "—" };

    let totalCompletion = 0;
    let minPlannedStart: Date | null = null;
    let maxActualEnd: Date | null = null;

    schedule.forEach((task) => {
      const status = task.status?.toLowerCase() || "";
      totalCompletion += status.includes("complete") ? 100 : task.completion_percentage || 0;

      if (task.exp_startdate) {
        const d = new Date(task.exp_startdate);
        if (!isNaN(d.getTime()) && (!minPlannedStart || d < minPlannedStart)) minPlannedStart = d;
      }

      if (task.enddate) {
        const d = new Date(task.enddate);
        if (!isNaN(d.getTime()) && (!maxActualEnd || d > maxActualEnd)) maxActualEnd = d;
      }
    });

    return {
      progress: schedule.length ? Math.round(totalCompletion / schedule.length) : 0,
      plannedStart: minPlannedStart ? format(minPlannedStart, "MMM d, yyyy") : "—",
      actualEnd: maxActualEnd ? format(maxActualEnd, "MMM d, yyyy") : "—",
    };
  }, [schedule]);

  const formatDate = (d?: string) => {
    if (!d) return "—";
    const date = new Date(d);
    return isNaN(date.getTime()) ? "—" : format(date, "MMM d, yyyy");
  };

  useEffect(() => {
    const fetchSchedule = async () => {
      setIsLoading(true);
      try {
        const res = await authenticatedFetch(`${APP_API_BASE_URL}/properties/${propertyId}/schedule`);
        const data = await res.json();

        if (!data.schedule || !Array.isArray(data.schedule) || data.schedule.length === 0) {
          setSchedule([]);
          setEdges([]);
          return;
        }

        const nodeMap = new Map<number, ScheduleItem>();
        const childrenMap = new Map<number, number[]>();

        data.schedule.forEach((item: ScheduleItem) => {
          nodeMap.set(item.scheduleid, item);
          (item.depends_on_scheduleid || []).forEach((dep) => {
            if (!childrenMap.has(dep)) childrenMap.set(dep, []);
            childrenMap.get(dep)!.push(item.scheduleid);
          });
        });

        const positioned: ScheduleItem[] = [];
        const visited = new Set<number>();

        const layout = (id: number, x: number, y: number) => {
          if (visited.has(id)) return;
          visited.add(id);

          const node = nodeMap.get(id);
          if (!node) return;

          positioned.push({ ...node, x, y });

          const children = childrenMap.get(id) || [];
          children.forEach((cid, idx) => {
            layout(cid, x + idx * xSpacing - ((children.length - 1) * xSpacing) / 2, y + ySpacing);
          });
        };

        const roots = data.schedule.filter((n: any) => !n.depends_on_scheduleid?.length);
        roots.forEach((r: any, i: number) => layout(r.scheduleid, 1000 + i * xSpacing, 100));

        setSchedule(positioned);

        const edgeList: { from: number; to: number }[] = [];
        data.schedule.forEach((item: any) => {
          (item.depends_on_scheduleid || []).forEach((dep: any) => edgeList.push({ from: dep, to: item.scheduleid }));
        });
        setEdges(edgeList);

        if (positioned.length > 0) {
          const maxX = Math.max(...positioned.map((n) => (n.x || 0) + NODE_WIDTH + 1000));
          const maxY = Math.max(...positioned.map((n) => (n.y || 0) + NODE_HEIGHT + 1000));
          setCanvasSize({ width: maxX, height: maxY });
        } else {
          setCanvasSize({ width: winW * 3, height: winH * 3 });
        }
      } catch (e) {
        console.error("customer workflow fetch error:", e);
        Alert.alert("Error", "Could not fetch workflow data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
  }, [propertyId, winH, winW]);

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]} testID="customer-task-workflow-root">
      <View style={[styles.header, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flex: 1 }}>
          <TText style={[styles.headerLabel, { color: C.mutedText }]}>Workflow Progress</TText>
          <View style={{ flexDirection: "row", marginTop: 4, gap: 12 }}>
            <View>
              <TText style={[styles.headerSubLabel, { color: C.subtleText }]}>PLANNED START</TText>
              <TText style={[styles.headerDateText, { color: C.text }]}>{projectSummary.plannedStart}</TText>
            </View>
            <View>
              <TText style={[styles.headerSubLabel, { color: C.subtleText }]}>ACTUAL END</TText>
              <TText style={[styles.headerDateText, { color: C.text }]}>{projectSummary.actualEnd}</TText>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <View style={[styles.progressPill, { backgroundColor: C.primarySoft }]}>
            <TText style={[styles.progressText, { color: C.primaryStrong }]}>{projectSummary.progress}%</TText>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.primaryStrong} />
        </View>
      ) : (
        <View style={styles.canvasWrapper}>
          <ReactNativeZoomableView
            ref={zoomableRef}
            initialZoom={zoom}
            minZoom={0.2}
            maxZoom={2.5}
            contentWidth={canvasSize.width}
            contentHeight={canvasSize.height}
            bindToBorders={false}
            panToMove
            pinchToZoom
            doubleTapZoomToCenter
            style={{ backgroundColor: C.bg }}
          >
            <View style={{ width: canvasSize.width, height: canvasSize.height }}>
              {edges.map((edge, i) => {
                const from = schedule.find((n) => n.scheduleid === edge.from);
                const to = schedule.find((n) => n.scheduleid === edge.to);
                if (!from || !to) return null;

                const x1 = (from.x || 0) + NODE_WIDTH / 2;
                const y1 = (from.y || 0) + NODE_HEIGHT;
                const x2 = (to.x || 0) + NODE_WIDTH / 2;
                const y2 = to.y || 0;

                return (
                  <React.Fragment key={i}>
                    <View
                      style={[
                        styles.edgeLine,
                        { left: x1, top: y1, width: 2, height: (y2 - y1) / 2, backgroundColor: C.borderStrong },
                      ]}
                    />
                    <View
                      style={[
                        styles.edgeLine,
                        {
                          left: Math.min(x1, x2),
                          top: y1 + (y2 - y1) / 2,
                          width: Math.abs(x2 - x1) + 2,
                          height: 2,
                          backgroundColor: C.borderStrong,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.edgeLine,
                        {
                          left: x2,
                          top: y1 + (y2 - y1) / 2,
                          width: 2,
                          height: (y2 - y1) / 2,
                          backgroundColor: C.borderStrong,
                        },
                      ]}
                    />
                    <View style={[styles.arrowHead, { left: x2 - 4, top: y2 - 6, backgroundColor: C.borderStrong }]} />
                  </React.Fragment>
                );
              })}

              {schedule.map((item) => {
                const theme = STATUS_THEMES[item.status?.toLowerCase()] || STATUS_THEMES.unknown;
                return (
                  <View key={item.scheduleid} style={[styles.nodeContainer, { left: item.x, top: item.y }]}>
                    <Animated.View
                      entering={FadeInDown}
                      style={[styles.nodeCard, { backgroundColor: theme.bg, borderColor: theme.border }]}
                    >
                      <View style={[styles.statusAccent, { backgroundColor: theme.accent }]} />
                      <View style={styles.nodeHeader}>
                        <TText style={[styles.nodeTitle, { color: C.text }]}>{item.phasename}</TText>
                      </View>

                      <View style={styles.dateGrid}>
                        <View style={styles.dateItem}>
                          <TText style={[styles.dateLabel, { color: C.text }]}>PLANNED START</TText>
                          <TText style={[styles.dateValue, { color: C.text }]}>{formatDate(item.exp_startdate)}</TText>
                        </View>
                        <View style={styles.dateItem}>
                          <TText style={[styles.dateLabel, { color: C.text }]}>PLANNED END</TText>
                          <TText style={[styles.dateValue, { color: C.text }]}>{formatDate(item.exp_enddate)}</TText>
                        </View>
                        <View style={styles.dateItem}>
                          <TText style={[styles.dateLabel, { color: C.text }]}>ACTUAL START</TText>
                          <TText style={[styles.dateValue, { color: C.text }]}>{formatDate(item.startdate)}</TText>
                        </View>
                        <View style={styles.dateItem}>
                          <TText style={[styles.dateLabel, { color: C.text }]}>ACTUAL END</TText>
                          <TText style={[styles.dateValue, { color: C.text }]}>{formatDate(item.enddate)}</TText>
                        </View>
                      </View>
                    </Animated.View>
                  </View>
                );
              })}
            </View>
          </ReactNativeZoomableView>
        </View>
      )}

      <View style={styles.zoomControls}>
        <Pressable style={[styles.zoomBtn, { backgroundColor: C.surface }]} onPress={() => zoomableRef.current?.zoomBy(0.2)}>
          <Ionicons name="add" size={24} color={C.text} />
        </Pressable>
        <Pressable style={[styles.zoomBtn, { backgroundColor: C.surface }]} onPress={() => zoomableRef.current?.zoomBy(-0.2)}>
          <Ionicons name="remove" size={24} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    alignItems: "center",
    zIndex: 100,
  },
  headerLabel: { fontSize: 13, fontWeight: "500" },
  headerSubLabel: { fontSize: 9, fontWeight: "700" },
  headerDateText: { fontSize: 11, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 12, alignItems: "center" },
  progressPill: {
    minWidth: 60,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  progressText: { fontSize: 14, fontWeight: "900" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  canvasWrapper: { flex: 1, overflow: "hidden" },
  nodeContainer: { position: "absolute" },
  nodeCard: {
    width: 280,
    height: 160,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    elevation: 3,
    shadowOpacity: 0.1,
  },
  statusAccent: {
    position: "absolute",
    left: 0,
    top: 15,
    bottom: 15,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  nodeHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  nodeTitle: { fontSize: 16, fontWeight: "600", flex: 1 },
  dateGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  dateItem: { width: "50%" },
  dateLabel: { fontSize: 10, fontWeight: "500" },
  dateValue: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  edgeLine: { position: "absolute", backgroundColor: "#CBD5E1" },
  arrowHead: {
    position: "absolute",
    width: 8,
    height: 8,
    backgroundColor: "#CBD5E1",
    borderRadius: 4,
  },
  zoomControls: {
    position: "absolute",
    bottom: 30,
    right: 20,
    gap: 10,
    zIndex: 100,
  },
  zoomBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowOpacity: 0.2,
  },
});

export default CustomerTaskWorkflow;
