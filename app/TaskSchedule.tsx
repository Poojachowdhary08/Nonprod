import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Calendar, Mode } from "react-native-big-calendar";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { addDays, subDays, format } from "date-fns";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { parseISO } from "date-fns/parseISO";
import TText from "@/components/TText";
import ScheduleLockDialog from "@/components/ScheduleLockDialog";
import { buildScheduleLockState } from "@/utils/scheduleLocks";
import {
  buildPropertyRouteContext,
  toPropertyRouteParams,
} from "@/utils/propertyRouteContext";
import { useTheme } from "@/src/theme/ThemeProvider";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
type Schedule = {
  scheduleid: number;
  phasename: string;
  startdate: string;
  enddate: string;
  status: string;
  remarks: string;
  depends_on_scheduleid?: number[] | null;
};

// ✅ Define status-based colors
const getStatusColor = (status: string) => {
  switch (status.trim().toLowerCase()) {
    case "completed":
      return "#77f059"; // Green
    case "in progress":
      return "#f7e06a"; // Yellow
    case "pending":
      return "#fc6c56"; // Red
    default:
      return "#6493fa"; // Blue
  }
};
type Props = {
  propertyId: string;
  projectId?: string;
  userDetails: any;
};


const TaskSchedule = ({ propertyId, projectId, userDetails }: Props) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const { height } = Dimensions.get("window");
  const router = useRouter();
  const params = useLocalSearchParams();
  const routeContext = React.useMemo(
    () =>
      buildPropertyRouteContext(params, {
        propertyId,
        projectId,
        userDetails,
      }),
    [params, propertyId, projectId, userDetails]
  );
  const user = routeContext.userDetails || userDetails || null;

  const firstName = user?.first_name;
  const lastName = user?.last_name;
  const [viewMode, setViewMode] = useState<Mode>("week"); // ✅ Default to "week"
  const [startDate, setStartDate] = useState(new Date()); // ✅ Default to today
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lockedTask, setLockedTask] = useState<Schedule | null>(null);

  useEffect(() => {
    if (propertyId) {
      fetchSchedules();
    }
  }, [propertyId]);

  // ✅ Fetch schedules dynamically
  const fetchSchedules = async () => {
    try {
      const API_URL = `${APP_API_BASE_URL}/properties/${propertyId}/schedule`;
      const response = await authenticatedFetch(API_URL);
      const data = await response.json();
      if (Array.isArray(data.schedule)) {
        setSchedules(
          data.schedule.filter(
            (item: any) => item !== null && item !== undefined
          )
        );
      } else {
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(
    useCallback(() => {
      fetchSchedules();
    }, [])
  );
  const lockState = React.useMemo(() => buildScheduleLockState(schedules), [schedules]);

  const goToWorkflow = useCallback(() => {
    setLockedTask(null);
    router.push({
      pathname: "/TaskWorkflowWrapper",
      params: toPropertyRouteParams({
        propertyId: routeContext.propertyId || propertyId,
        projectId: routeContext.projectId || projectId,
        propertyName: routeContext.propertyName,
        projectLocation: routeContext.projectLocation,
        userDetails: user || {},
      }),
    });
  }, [propertyId, projectId, routeContext, router, user]);
  // ✅ Generate events correctly based on view mode
  const events = schedules.map((schedule) => {
    const start = parseISO(schedule.startdate);
    const end = parseISO(schedule.enddate);

    return {
      id: schedule.scheduleid,
      title: schedule.phasename,
      start: start,
      end: addDays(end, 1), // Ensure it covers the full day without duplicating
      color: getStatusColor(schedule.status),
      status: schedule.status,
      remarks: schedule.remarks,
    };
  });

  // ✅ Navigate days/weeks/months correctly
  const changeDate = (direction: "prev" | "next") => {
    let increment = viewMode === "month" ? 30 : viewMode === "week" ? 7 : 1;
    let newDate =
      direction === "next"
        ? addDays(startDate, increment)
        : subDays(startDate, increment);
    setStartDate(newDate);
  };

  return (
    <View style={styles.container} testID="task-schedule-root">
      {/* ✅ View Mode Switcher */}
      <View style={styles.viewSwitcher}>
        {[
          { mode: "day", icon: "calendar-today" },
          { mode: "week", icon: "calendar-week" },
          { mode: "month", icon: "calendar-month" },
        ].map(({ mode, icon }) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setViewMode(mode as Mode)}
            style={[
              styles.iconButton,
              viewMode === mode && styles.selectedIcon,
            ]}
          >
            <Icon name={icon} size={22} color={viewMode === mode ? C.white : C.text} />
            <TText style={[styles.iconText, viewMode === mode && styles.selectedText]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </TText>
          </TouchableOpacity>
        ))}
      </View>

      {/* ✅ Navigation */}
      <View style={styles.navContainer}>
        <TouchableOpacity onPress={() => changeDate("prev")} style={styles.navButton}>
          <Icon name="chevron-left" size={24} color={C.primaryStrong} />
        </TouchableOpacity>
        <TText style={styles.currentDate}>{format(startDate, "MMMM d, yyyy")}</TText>
        <TouchableOpacity onPress={() => changeDate("next")} style={styles.navButton}>
          <Icon name="chevron-right" size={24} color={C.primaryStrong} />
        </TouchableOpacity>
      </View>

      {/* ✅ Calendar */}
      <Calendar
        events={events}
        height={height * 0.75}
        mode={viewMode}
        date={startDate}
        eventCellStyle={(event) => ({
          backgroundColor: event.color, // ✅ Assign status color
          borderRadius: 5,
          padding: 4,
          opacity: lockState.lockedIds.has(Number(event.id)) ? 0.45 : 1,
        })}
        onPressEvent={(event) => {
          const selectedScheduleId = Number(event.id);
          const selectedSchedule = schedules.find((schedule) => schedule.scheduleid === selectedScheduleId);
          if (selectedSchedule && lockState.lockedIds.has(selectedSchedule.scheduleid)) {
            setLockedTask(selectedSchedule);
            return;
          }
          const formattedSchedule = {
            scheduleid: selectedScheduleId,
            phasename: event.title,
            startdate: format(new Date(event.start), "yyyy-MM-dd"),
            enddate: format(new Date(event.end), "yyyy-MM-dd"),
            status: event.status ?? "Pending",
            remarks: event.remarks ?? null,
          };
          router.push({
            pathname: "/TaskManagementForm",
            params: toPropertyRouteParams(
              {
                propertyId: routeContext.propertyId || propertyId,
                projectId: routeContext.projectId || projectId,
                propertyName: routeContext.propertyName,
                projectLocation: routeContext.projectLocation,
                userDetails: user || {},
              },
              {
                schedule: encodeURIComponent(JSON.stringify(formattedSchedule)),
                first_name: firstName,
                last_name: lastName,
                employee_code: user?.employee_code,
              }
            ),
          });
        }}
      />

      <ScheduleLockDialog
        visible={!!lockedTask}
        phaseName={lockedTask?.phasename}
        onClose={() => setLockedTask(null)}
        onGoToWorkflow={goToWorkflow}
      />
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, padding: 10 },
    viewSwitcher: { flexDirection: "row", justifyContent: "center", marginBottom: 10, gap: 10 },
    navContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10 },
    navButton: { padding: 10 },
    currentDate: { fontSize: 16, fontWeight: "bold", textAlign: "center", color: C.text },
    iconButton: { alignItems: "center", padding: 12, borderRadius: 8, backgroundColor: C.surfaceAlt },
    selectedIcon: { backgroundColor: C.primaryStrong },
    selectedText: { color: C.white },
    iconText: { fontSize: 14, fontWeight: "bold", color: C.text },
  });

export default TaskSchedule;
