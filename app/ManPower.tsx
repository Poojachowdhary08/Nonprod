import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView, TextInput, Modal, Platform, KeyboardTypeOptions } from "react-native";
import ModalSelector from "@/components/AppModalSelect";

import { API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
// ✅ Telemetry (adjust path if needed)
import {
  trackScreen,
  startScreenTimer,
  trackUI,
  trackNetwork,
  updateDynamicContext,
  clearDynamicContext,
  flushTelemetry,
} from "../utils/telemetry";
import { getDecimalInputProps } from "../utils/keyboardProps";
import TText from "@/components/TText";

/* -------------------------------------------------------------------------- */
/*                                API BASE                                    */
/* -------------------------------------------------------------------------- */

const API_BASE = API_BASE_URL;
const DAILY_WORK_REQUEST_SOURCE = "ManPower";

/* -------------------------------------------------------------------------- */
/*                               ModalSelector TS fix                         */
/* -------------------------------------------------------------------------- */
const MS: any = ModalSelector;

/* -------------------------------------------------------------------------- */
/*                               Helpers                                      */
/* -------------------------------------------------------------------------- */

const toLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type Contractor = { contractor_id: string; contractor_name: string };
type Labour = { labor_id: string; labor_name: string };
type WorkType = { work_type_id: string; work_type_name: string };
type Phase = { phase_id: string; phase_name: string; status?: string };

type PersonType = "Contractor" | "Labour";
type ContractorType = "Contractor" | "NMR";
type WorkDuration = "hourly" | "daily";
type EntryType = "Regular" | "Avenue Add On" | "Customer Add On";
type DayType = "half" | "full" | "";

/** ✅ Updated Units */
type UnitType =
  | "sqft"
  | "rft"
  | "cubic"
  | "auger_12"
  | "auger_15"
  | "auger_18"
  | "cbft";

type ProjectOption = { key: string; label: string };
type SelectorOption<K extends string = string> = { key: K; label: string };

const UNIT_TYPE_OPTIONS: SelectorOption<UnitType>[] = [
  { key: "sqft", label: "Square Feet (SQFT)" },
  { key: "rft", label: "Running Feet (RFT)" },
  { key: "cubic", label: "Cubic Meter (m³)" },
  { key: "auger_12", label: "12 Augurs" },
  { key: "auger_15", label: "15 Augurs" },
  { key: "auger_18", label: "18 Augurs" },
  { key: "cbft", label: "Cubic Feet (CBFT)" },
];

const unitLabel = (u: UnitType) =>
  UNIT_TYPE_OPTIONS.find((x) => x.key === u)?.label ?? u;

const positiveNumber = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
};
const nonNegativeInt = (v: string) => {
  if (v === "" || v === null || v === undefined) return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
};
const required = (v: any) =>
  !(v === null || v === undefined || v === "" || v === "Select Project" || v === "Select Property");

/* -------------------------------------------------------------------------- */
/*                                 Dialog Box                                 */
/* -------------------------------------------------------------------------- */

const DialogBox = ({
  visible,
  onClose,
  message,
  isSuccess,
  onAddAnother,
}: {
  visible: boolean;
  onClose: () => void;
  message: string;
  isSuccess: boolean;
  onAddAnother?: () => void;
}) => {
  const handleOK = () => {
    onClose();
    if (isSuccess) router.push("/HomeScreen");
  };
  const handleAddAnother = () => {
    onClose();
    onAddAnother?.();
  };

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.dialogBox}>
          <TText style={styles.dialogMessage}>{message}</TText>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.dialogButton, { backgroundColor: "#2563EB" }]} onPress={handleOK}>
              <TText style={styles.dialogButtonText}>OK</TText>
            </TouchableOpacity>
            {isSuccess && (
              <TouchableOpacity style={[styles.dialogButton, { backgroundColor: "#6c757d" }]} onPress={handleAddAnother}>
                <TText style={styles.dialogButtonText}>Add Another</TText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Small UI helpers                          */
/* -------------------------------------------------------------------------- */

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <TText style={styles.fieldLabel}>{children}</TText>
);

const FieldBox = ({
  children,
  hasError,
}: {
  children: React.ReactNode;
  hasError?: boolean;
}) => (
  <View style={[styles.fieldBox, hasError && styles.errorBox]}>{children}</View>
);

const RightIcon = ({ name }: { name: any }) => (
  <View pointerEvents="none" style={styles.rightIconWrap}>
    <Ionicons name={name} size={18} color="#9CA3AF" />
  </View>
);

/* -------------------------------------------------------------------------- */
/*                                  Main                                      */
/* -------------------------------------------------------------------------- */

const ManPower = () => {
  const params = useLocalSearchParams();
  const engineer = (params.employee_code as string) || "";

  const [contractorOrLabour, setContractorOrLabour] = useState<PersonType>("Contractor");
  const [contractorName, setContractorName] = useState("");
  const [labourName, setLabourName] = useState("");
  const [remarks, setRemarks] = useState("");

  const [numHours, setNumHours] = useState("0");
  const [sqUnit, setSqUnit] = useState("0");

  const [numWorkers, setNumWorkers] = useState("");
  const [currentWeekDates, setCurrentWeekDates] = useState<Date[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [labors, setLabors] = useState<Labour[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);

  const [phases, setPhases] = useState<Phase[]>([]);
  const [phaseId, setPhaseId] = useState("");
  const [phaseName, setPhaseName] = useState("");

  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMessage, setDialogMessage] = useState("");

  const [contractorId, setContractorId] = useState("");
  const [labourId, setLabourId] = useState("");

  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<ProjectOption[]>([]);

  const [property, setProperty] = useState("Select Property");
  const [project, setProject] = useState("Select Project");

  const [projectId, setProjectId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  const [isSuccess, setIsSuccess] = useState(false);

  const [workDurationType, setWorkDurationType] = useState<WorkDuration>("hourly");
  const [dayType, setDayType] = useState<DayType>("");
  const [contractorType, setContractorType] = useState<ContractorType>("Contractor");

  /** ✅ Updated */
  const [unitType, setUnitType] = useState<UnitType>("sqft");

  const [entryType, setEntryType] = useState<EntryType>("Regular");
  const [skilledCount, setSkilledCount] = useState("");
  const [unskilledCount, setUnskilledCount] = useState("");

  // validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // telemetry throttle refs
  const lastRemarksLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });
  const lastQtyLogRef = useRef<{ at: number; len: number }>({ at: 0, len: 0 });
  type UnitEntry = {
    id: string;
    unit_type: UnitType;
    quantity: string; // keep string for TextInput
  };
  
  const makeUnitEntry = (u: UnitType = "sqft"): UnitEntry => ({
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    unit_type: u,
    quantity: "0",
  });
  
  const [unitEntries, setUnitEntries] = useState<UnitEntry[]>([
    makeUnitEntry("sqft"),
  ]);
  
  /* ------------------------------ Telemetry mount ------------------------------ */
  useEffect(() => {
    try {
      updateDynamicContext?.({
        screen: "ManPower",
        engineerCode: engineer || null,
      });

      trackScreen?.("ManPower", {
        engineerCode: engineer || null,
      });

      const stop = startScreenTimer?.("ManPower", { engineerCode: engineer || null });

      return () => {
        stop?.();
        clearDynamicContext?.();
        flushTelemetry?.({ reason: "screen_unmount" }).catch?.(() => {});
      };
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ bootstrap ------------------------------ */
  useEffect(() => {
    calculateCurrentWeekDates();
    fetchWorkTypes();
  }, []);

  useEffect(() => {
    if (!engineer) return;
    fetchAssignedProjects(engineer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineer]);

  useEffect(() => {
    if (projectId && propertyId) {
      fetchContractors();
      fetchLabors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, propertyId]);

  useEffect(() => {
    if (propertyId) fetchPhases(propertyId);
    else {
      setPhases([]);
      setPhaseId("");
      setPhaseName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => {
    if (contractorOrLabour === "Contractor") {
      const skilled = parseInt(skilledCount) || 0;
      const unskilled = parseInt(unskilledCount) || 0;
      const total = skilled + unskilled;
      setNumWorkers(total ? total.toString() : "");
    }
  }, [skilledCount, unskilledCount, contractorOrLabour]);

  const showDialog = (message: string) => {
    setDialogMessage(message);
    setDialogVisible(true);
  };

  
  /* ------------------------------ Fetchers ------------------------------ */

  const fetchAssignedProjects = async (employeeCode: string) => {
    const url = `${API_BASE}/employee-project/${encodeURIComponent(employeeCode)}`;
    const startedAt = Date.now();

    trackUI?.({ screen: "ManPower", element: "fetch_projects", action: "start", extra: {} });

    try {
      const res = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: true,
        extra: { screen: "ManPower" },
      });

      const list = Array.isArray(res.data) ? res.data : res.data?.projects ?? [];
      const options: ProjectOption[] = list
        .map((p: any) => ({
          key: String(p.project_id ?? p.projectId ?? p.id),
          label: String(p.project_name ?? p.projectName ?? p.name),
        }))
        .filter((p: any) => p.key && p.label);

      setProjectOptions(options);

      trackUI?.({
        screen: "ManPower",
        element: "fetch_projects",
        action: "success",
        extra: { count: options.length, durationMs },
      });

      if (options.length === 0) {
        setProject("Select Project");
        setProjectId(null);
        setPropertyOptions([]);
        setProperty("Select Property");
        setPropertyId(null);
        showDialog("No projects assigned to you. Please contact your admin.");
      } else if (options.length === 1) {
        handleProjectSelect(options[0]);
      }
    } catch (e: any) {
      const durationMs = Date.now() - startedAt;
      trackNetwork?.({
        url,
        method: "GET",
        status: e?.response?.status,
        durationMs,
        ok: false,
        extra: { screen: "ManPower", message: e?.message ?? "error" },
      });

      trackUI?.({ screen: "ManPower", element: "fetch_projects", action: "error", extra: { message: e?.message } });

      showDialog("Failed to fetch your assigned projects.");
      setProjectOptions([]);
    }
  };

  const fetchAssignedProperties = async (selectedProjectId: string, employeeCode: string) => {
    const url = `${API_BASE}/employee-properties/${encodeURIComponent(selectedProjectId)}/${encodeURIComponent(employeeCode)}`;
    const startedAt = Date.now();

    trackUI?.({
      screen: "ManPower",
      element: "fetch_properties",
      action: "start",
      extra: { project_id: selectedProjectId },
    });

    try {
      const res = await axios.get(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: true,
        extra: { screen: "ManPower" },
      });

      const list = Array.isArray(res.data) ? res.data : res.data?.properties ?? [];
      const options: ProjectOption[] = list
        .map((prop: any) => ({
          key: String(prop.propertyid ?? prop.property_id ?? prop.id),
          label: String(prop.name ?? prop.property_name ?? prop.title ?? "Unnamed Property"),
        }))
        .filter((p: any) => p.key && p.label);

      setPropertyOptions(options);

      trackUI?.({
        screen: "ManPower",
        element: "fetch_properties",
        action: "success",
        extra: { count: options.length, durationMs },
      });

      if (options.length === 0) {
        setProperty("Select Property");
        setPropertyId(null);
        showDialog("No properties assigned for this project. Please contact your admin.");
      } else if (options.length === 1) {
        setProperty(options[0].label);
        setPropertyId(options[0].key);
      }
    } catch (e: any) {
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: e?.response?.status,
        durationMs,
        ok: false,
        extra: { screen: "ManPower", message: e?.message ?? "error" },
      });

      trackUI?.({ screen: "ManPower", element: "fetch_properties", action: "error", extra: { message: e?.message } });

      showDialog("Failed to fetch your assigned properties.");
      setPropertyOptions([]);
    }
  };

  const fetchContractors = async () => {
    if (!projectId || !propertyId) return;
    const url = `${API_BASE}/manpower/assigned-contractors?project_id=${encodeURIComponent(projectId)}&property_id=${encodeURIComponent(propertyId)}`;
    const startedAt = Date.now();

    trackUI?.({ screen: "ManPower", element: "fetch_contractors", action: "start", extra: { projectId, propertyId } });

    try {
      const response = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: { screen: "ManPower" },
      });

      if (!response.ok) throw new Error("Failed to fetch assigned contractors");
      const data = await response.json();
      setContractors(data || []);
      if ((data || []).length > 0) {
        setContractorName(data[0].contractor_name);
        setContractorId(data[0].contractor_id);
      } else {
        setContractorName("");
        setContractorId("");
      }

      trackUI?.({
        screen: "ManPower",
        element: "fetch_contractors",
        action: "success",
        extra: { count: (data || []).length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({ screen: "ManPower", element: "fetch_contractors", action: "error", extra: { message: e?.message } });
      showDialog("Failed to fetch assigned contractors");
    }
  };

  const fetchLabors = async () => {
    if (!projectId || !propertyId) return;
    const url = `${API_BASE}/manpower/assigned-labors?project_id=${encodeURIComponent(projectId)}&property_id=${encodeURIComponent(propertyId)}`;
    const startedAt = Date.now();

    trackUI?.({ screen: "ManPower", element: "fetch_labors", action: "start", extra: { projectId, propertyId } });

    try {
      const response = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: { screen: "ManPower" },
      });

      if (!response.ok) throw new Error("Failed to fetch assigned labors");
      const data = await response.json();

      const uniqueLabors = (data || []).reduce((acc: Labour[], labour: Labour) => {
        if (!acc.find((l) => l.labor_name === labour.labor_name)) acc.push(labour);
        return acc;
      }, []);
      setLabors(uniqueLabors);

      if (uniqueLabors.length > 0) {
        setLabourName(uniqueLabors[0].labor_name);
        setLabourId(uniqueLabors[0].labor_id);
      } else {
        setLabourName("");
        setLabourId("");
      }

      trackUI?.({
        screen: "ManPower",
        element: "fetch_labors",
        action: "success",
        extra: { count: uniqueLabors.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({ screen: "ManPower", element: "fetch_labors", action: "error", extra: { message: e?.message } });
      showDialog("Failed to fetch assigned labors");
    }
  };

  const fetchWorkTypes = async () => {
    const url = `${API_BASE}/work-types`;
    const startedAt = Date.now();

    trackUI?.({ screen: "ManPower", element: "fetch_work_types", action: "start", extra: {} });

    try {
      const response = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: { screen: "ManPower" },
      });

      if (!response.ok) throw new Error("Failed to fetch work types");
      const data = await response.json();
      setWorkTypes(data.work_types || []);

      trackUI?.({
        screen: "ManPower",
        element: "fetch_work_types",
        action: "success",
        extra: { count: (data.work_types || []).length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({ screen: "ManPower", element: "fetch_work_types", action: "error", extra: { message: e?.message } });
      showDialog("Failed to fetch work types");
    }
  };

  const fetchPhases = async (propId: string) => {
    const url = `${API_BASE}/properties/${encodeURIComponent(propId)}/schedule`;
    const startedAt = Date.now();

    trackUI?.({ screen: "ManPower", element: "fetch_phases", action: "start", extra: { property_id: propId } });

    try {
      const res = await authenticatedFetch(url);
      const durationMs = Date.now() - startedAt;

      trackNetwork?.({
        url,
        method: "GET",
        status: res.status,
        durationMs,
        ok: res.ok,
        extra: { screen: "ManPower" },
      });

      if (!res.ok) throw new Error("Failed to fetch phases");
      const raw = await res.json();

      const arr: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.schedule)
        ? raw.schedule
        : Array.isArray(raw?.phases)
        ? raw.phases
        : [];

      const normalized: Phase[] = arr
        .map((it: any) => ({
          phase_id: String(it.scheduleid ?? it.phase_id ?? it.id ?? ""),
          phase_name: String(it.phasename ?? it.phase_name ?? it.phase ?? it.name ?? "").trim(),
          status: String(it.status ?? it.phase_status ?? it.phaseStatus ?? "").toLowerCase(),
        }))
        .filter((p) => p.phase_id && p.phase_name);

      const inProgress = normalized.filter((p) =>
        ["in progress", "in_progress", "inprogress"].includes(p.status || "")
      );

      setPhases(inProgress);
      setPhaseId("");
      setPhaseName("");

      trackUI?.({
        screen: "ManPower",
        element: "fetch_phases",
        action: "success",
        extra: { count: inProgress.length, durationMs },
      });
    } catch (e: any) {
      trackUI?.({ screen: "ManPower", element: "fetch_phases", action: "error", extra: { message: e?.message } });
      setPhases([]);
      setPhaseId("");
      setPhaseName("");
      showDialog("Failed to fetch phases for this property.");
    }
  };

  /* ------------------------------ Handlers ------------------------------ */

  const handleProjectSelect = (option: ProjectOption) => {
    trackUI?.({
      screen: "ManPower",
      element: "project_select",
      action: "change",
      extra: { project_id: option.key, project_name: option.label },
    });

    setProject(option.label);
    setProjectId(option.key);

    setProperty("Select Property");
    setPropertyId(null);
    setPropertyOptions([]);

    setPhases([]);
    setPhaseId("");
    setPhaseName("");

    if (engineer) fetchAssignedProperties(option.key, engineer);
  };

  const validateForm = (): { ok: boolean; firstError?: string; errors: Record<string, string> } => {
    const e: Record<string, string> = {};

    if (!required(projectId)) e.projectId = "Project is required.";
    if (!required(propertyId)) e.propertyId = "Property is required.";
    if (!selectedDate) e.selectedDate = "Date is required.";
    if (!required(entryType)) e.entryType = "Type is required.";
    if (!required(phaseId)) e.phaseId = "Phase is required.";

    if (contractorOrLabour === "Contractor") {
      if (!required(contractorId)) e.contractorId = "Contractor is required.";
      if (!required(contractorType)) e.contractorType = "Contractor Type is required.";

      if (!nonNegativeInt(skilledCount)) e.skilledCount = "Skilled Workers must be a non-negative integer.";
      if (!nonNegativeInt(unskilledCount)) e.unskilledCount = "Unskilled Workers must be a non-negative integer.";
      const total = (parseInt(skilledCount || "0") || 0) + (parseInt(unskilledCount || "0") || 0);
      if (total <= 0) e.numWorkers = "Total workers must be greater than 0.";

      if (!required(workDurationType)) e.workDurationType = "Work Duration Type is required.";
      if (workDurationType === "hourly") {
        if (!positiveNumber(numHours) || Number(numHours) > 24) e.numHours = "Number of hours must be between 0 and 24.";
      }
      if (workDurationType === "daily") {
        if (!required(dayType)) e.dayType = "Day Type is required for daily duration.";
      }

      if (contractorType === "Contractor") {
        if (!unitEntries || unitEntries.length === 0) {
          e.unitEntries = "At least one measurement is required.";
        } else {
          unitEntries.forEach((u) => {
            if (!required(u.unit_type)) e[`unitType_${u.id}`] = "Unit type is required.";
            if (!positiveNumber(u.quantity)) e[`qty_${u.id}`] = "Quantity must be a non-negative number.";
            if (Number(u.quantity) <= 0) e[`qty_${u.id}`] = "Quantity must be greater than 0.";
          });
        }
      }
      
    } else {
      if (!required(labourId)) e.labourId = "Labour is required.";
      if (!required(workDurationType)) e.workDurationType = "Work Duration Type is required.";
      if (workDurationType === "hourly") {
        if (!positiveNumber(numHours) || Number(numHours) > 24) e.numHours = "Number of hours must be between 0 and 24.";
      }
      if (workDurationType === "daily") {
        if (!required(dayType)) e.dayType = "Day Type is required for daily duration.";
      }
      if (!positiveNumber(numWorkers) || !Number.isInteger(Number(numWorkers)) || Number(numWorkers) <= 0) {
        e.numWorkers = "Number of workers must be an integer greater than 0.";
      }
    }

    const firstError = Object.values(e)[0];
    return { ok: Object.keys(e).length === 0, firstError, errors: e };
  };

  const handleSubmit = async () => {
    const { ok, firstError, errors: errs } = validateForm();
    setErrors(errs);
  
    trackUI?.({
      screen: "ManPower",
      element: "submit",
      action: "attempt",
      extra: {
        ok,
        contractorOrLabour,
        contractorType,
        entryType,
        phaseId,
        // NOTE: unitType/sqUnit are legacy; for multi units we'll log count instead
        unitEntriesCount: unitEntries?.length ?? 0,
        date: selectedDate ? toLocalYMD(selectedDate) : null,
      },
    });
  
    if (!ok) {
      showDialog(firstError || "Please fix the highlighted fields.");
      trackUI?.({
        screen: "ManPower",
        element: "submit",
        action: "blocked_validation",
        extra: { errors: errs },
      });
      return;
    }
  
    const url = `${API_BASE}/daily-work`;
  
    // ✅ base params shared across requests
    const baseParams = {
      project_id: projectId,
      property_id: propertyId,
      engineer_id: engineer,
  
      contractor_id: contractorOrLabour === "Contractor" ? contractorId : null,
      contractor_name: contractorOrLabour === "Contractor" ? contractorName : null,
      labour_id: contractorOrLabour === "Labour" ? labourId : null,
      labour_name: contractorOrLabour === "Labour" ? labourName : null,
  
      date: selectedDate ? toLocalYMD(selectedDate) : null,
  
      work_duration_type: workDurationType,
      hours_worked: workDurationType === "hourly" ? Number(numHours || 0) : null,
      day_type: workDurationType === "daily" ? dayType : null,
  
      contractor_type: contractorOrLabour === "Contractor" ? contractorType : null,
      remarks: remarks || null,
  
      num_workers:
        contractorOrLabour === "Contractor"
          ? (parseInt(skilledCount || "0") || 0) + (parseInt(unskilledCount || "0") || 0)
          : numWorkers
          ? Number(numWorkers)
          : null,
  
      entry_type: entryType,
  
      skilled_count: contractorOrLabour === "Contractor" ? Number(skilledCount || 0) : null,
      unskilled_count: contractorOrLabour === "Contractor" ? Number(unskilledCount || 0) : null,
  
      phase_id: phaseId,
      phase_name: phaseName,
    };
  
    const startedAt = Date.now();
  
    try {
      // ✅ MULTI-UNIT FLOW:
      // Only when contractorOrLabour=Contractor AND contractorType=Contractor
      if (contractorOrLabour === "Contractor" && contractorType === "Contractor") {
        // safety: if somehow empty, stop
        if (!unitEntries || unitEntries.length === 0) {
          setIsSuccess(false);
          showDialog("Please add at least one measurement unit.");
          return;
        }
  
        for (let i = 0; i < unitEntries.length; i++) {
          const u = unitEntries[i];
          const qty = Number(u.quantity || 0);
  
          // legacy mapping per row
          const work_completed_sqft = u.unit_type === "cubic" ? null : qty;
          const work_completed_cubic_meter = u.unit_type === "cubic" ? qty : null;
  
          const dailyWorkParams = {
            ...baseParams,
  
            // per-row unit fields
            unit_type: u.unit_type,
            work_completed_sqft,
            work_completed_cubic_meter,
          };
  
          const response = await authenticatedFetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-client-sync-mode": "online_live",
              "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
            },
            body: JSON.stringify(dailyWorkParams),
          });
  
          const durationMs = Date.now() - startedAt;
  
          trackNetwork?.({
            url,
            method: "POST",
            status: response.status,
            durationMs,
            ok: response.ok,
            extra: {
              screen: "ManPower",
              mode: "multi_unit",
              rowIndex: i,
              unit_type: u.unit_type,
              qty,
            },
          });
  
          if (!response.ok) {
            setIsSuccess(false);
            showDialog("Failed to save one of the measurement entries.");
            trackUI?.({
              screen: "ManPower",
              element: "submit",
              action: "failed_multi_unit_row",
              extra: { rowIndex: i, status: response.status, unit_type: u.unit_type, qty },
            });
            return; // stop on first failure
          }
        }
  
        // ✅ all rows success
        setIsSuccess(true);
        showDialog("Contractor work details saved!");
        resetFields();
        setErrors({});
        trackUI?.({
          screen: "ManPower",
          element: "submit",
          action: "success_multi_unit",
          extra: { durationMs: Date.now() - startedAt, count: unitEntries.length },
        });
        return;
      }
  
      // ✅ SINGLE POST FLOW (Labour OR ContractorType=NMR OR any other case)
      // Use legacy single-unit values here if you still keep them.
      // If you don't want any unit fields in these cases, keep them null.
      const numericQty = Number(sqUnit || 0);
      const work_completed_sqft = unitType === "cubic" ? null : numericQty;
      const work_completed_cubic_meter = unitType === "cubic" ? numericQty : null;
  
      const dailyWorkParams = {
        ...baseParams,
  
        work_completed_sqft,
        work_completed_cubic_meter,
        unit_type: contractorOrLabour === "Contractor" ? unitType : null,
      };
  
      const response = await authenticatedFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-sync-mode": "online_live",
          "x-client-request-source": DAILY_WORK_REQUEST_SOURCE,
        },
        body: JSON.stringify(dailyWorkParams),
      });
  
      const durationMs = Date.now() - startedAt;
  
      trackNetwork?.({
        url,
        method: "POST",
        status: response.status,
        durationMs,
        ok: response.ok,
        extra: { screen: "ManPower", mode: "single" },
      });
  
      if (response.ok) {
        setIsSuccess(true);
        showDialog(`${contractorOrLabour === "Contractor" ? "Contractor" : "Labour"} work details saved!`);
        resetFields();
        setErrors({});
        trackUI?.({ screen: "ManPower", element: "submit", action: "success", extra: { durationMs } });
      } else {
        setIsSuccess(false);
        showDialog("Failed to save daily work details.");
        trackUI?.({ screen: "ManPower", element: "submit", action: "failed", extra: { status: response.status } });
      }
    } catch (e: any) {
      setIsSuccess(false);
      showDialog("An error occurred while submitting the data.");
      trackUI?.({ screen: "ManPower", element: "submit", action: "error", extra: { message: e?.message } });
    }
  };
  

  const resetFields = () => {
    setProject("Select Project");
    setProjectId(null);
    setProperty("Select Property");
    setPropertyId(null);

    setContractorOrLabour("Contractor");
    setContractorName(contractors[0]?.contractor_name || "");
    setContractorId(contractors[0]?.contractor_id || "");

    setLabourName(labors[0]?.labor_name || "");
    setLabourId(labors[0]?.labor_id || "");

    setContractorType("Contractor");
    setWorkDurationType("hourly");
    setDayType("");

    setUnitEntries([makeUnitEntry("sqft")]);

    setNumHours("0");
    setNumWorkers("");
    setSkilledCount("");
    setUnskilledCount("");
    setRemarks("");
    setErrors({});

    setPropertyOptions([]);
    setContractors([]);
    setLabors([]);
    setPhases([]);
    setPhaseId("");
    setPhaseName("");

    const today = new Date();
    const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setSelectedDate(cleanToday);

    if (engineer) fetchAssignedProjects(engineer);

    trackUI?.({ screen: "ManPower", element: "form", action: "reset", extra: {} });
  };

  const calculateCurrentWeekDates = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const base = new Date(startOfWeek);
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });

    setCurrentWeekDates(dates);
    setSelectedDate(today);
  };

  const formatDate = (date: Date | null) =>
    date ? date.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" }) : "Select a Date";

  const err = (k: string) => !!errors[k];

  return (
    <View testID="man-power-root" style={{ flex: 1 }}>
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity
            onPress={() => {
              trackUI?.({ screen: "ManPower", element: "back", action: "click", extra: {} });
              if (router.canGoBack()) router.back();
              else router.push("/HomeScreen");
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Man Power</TText>
        </View>
        <TouchableOpacity
          onPress={() => {
            trackUI?.({ screen: "ManPower", element: "home", action: "click", extra: {} });
            router.push("/HomeScreen");
          }}
        >
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Row: Project + Property */}
        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel>Project</FieldLabel>
            <FieldBox hasError={err("projectId")}>
              <MS
                data={projectOptions}
                initValue={project}
                onChange={(option: ProjectOption) => handleProjectSelect(option)}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>

          <View style={styles.col}>
            <FieldLabel>Property</FieldLabel>
            <FieldBox hasError={err("propertyId")}>
              <MS
                data={propertyOptions}
                initValue={property}
                onChange={(option: ProjectOption) => {
                  trackUI?.({
                    screen: "ManPower",
                    element: "property_select",
                    action: "change",
                    extra: { property_id: option.key, property_name: option.label },
                  });

                  setProperty(option.label);
                  setPropertyId(option.key);

                  setPhaseId("");
                  setPhaseName("");

                  setTimeout(() => {
                    fetchContractors();
                    fetchLabors();
                  }, 0);
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        </View>

        {/* Row: Employee Type (Contractor/Labour) */}
        {/* <View style={styles.formGroup}>
          <FieldLabel>Employee Type</FieldLabel>
          <FieldBox>
            <MS
              data={[
                { key: "Contractor", label: "Contractor" },
                { key: "Labour", label: "Labour" },
              ]}
              initValue={contractorOrLabour}
              onChange={(option: any) => {
                trackUI?.({ screen: "ManPower", element: "contractorOrLabour", action: "change", extra: { to: option.key } });
                setContractorOrLabour(option.key as PersonType);
              }}
              style={styles.selector}
              selectStyle={styles.selectorSelect}
              initValueTextStyle={styles.selectorText}
              optionTextStyle={styles.selectorText}
            />
            <RightIcon name="chevron-down" />
          </FieldBox>
        </View> */}

        {/* Row: Contractor Name OR Labour Name */}
        {contractorOrLabour === "Contractor" ? (
          <View style={styles.formGroup}>
            <FieldLabel>Contractor</FieldLabel>
            <FieldBox hasError={err("contractorId")}>
              <MS
                data={
                  contractors.length > 0
                    ? contractors.map(({ contractor_id, contractor_name }) => ({ key: contractor_id, label: contractor_name }))
                    : [{ key: "no_data", label: "No contractors found" }]
                }
                initValue={contractorName || "Select Contractor"}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({
                      screen: "ManPower",
                      element: "contractor_select",
                      action: "change",
                      extra: { contractor_id: option.key, contractor_name: option.label },
                    });
                    setContractorName(option.label);
                    setContractorId(option.key);
                  }
                }}
                disabled={contractors.length === 0}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        ) : (
          <View style={styles.formGroup}>
            <FieldLabel>Labour</FieldLabel>
            <FieldBox hasError={err("labourId")}>
              <MS
                data={
                  labors.length > 0
                    ? labors.map(({ labor_id, labor_name }) => ({ key: labor_id, label: labor_name }))
                    : [{ key: "no_data", label: "No labors found" }]
                }
                initValue={labourName || "Select Labour"}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({ screen: "ManPower", element: "labour_select", action: "change", extra: { labour_id: option.key } });
                    setLabourName(option.label);
                    setLabourId(option.key);
                  }
                }}
                disabled={labors.length === 0}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        )}

        {/* Row: Phase + Work Duration */}
        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel>Project Phase</FieldLabel>
            <FieldBox hasError={err("phaseId")}>
              <MS
                data={
                  phases.length > 0
                    ? phases.map(({ phase_id, phase_name }) => ({ key: phase_id, label: phase_name }))
                    : [{ key: "no_data", label: "No in-progress phases" }]
                }
                initValue={phaseName || "Select Phase"}
                onChange={(option: any) => {
                  if (option.key !== "no_data") {
                    trackUI?.({
                      screen: "ManPower",
                      element: "phase_select",
                      action: "change",
                      extra: { phase_id: option.key, phase_name: option.label },
                    });
                    setPhaseId(option.key);
                    setPhaseName(option.label);
                  }
                }}
                disabled={phases.length === 0}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
          {contractorOrLabour === "Contractor" && (
        <View style={styles.col}>
            <FieldLabel>Contractor Type</FieldLabel>
            <FieldBox hasError={err("contractorType")}>
              <MS
                data={[
                  { key: "Contractor", label: "Contractor" },
                  { key: "NMR", label: "NMR" },
                ]}
                initValue={contractorType}
                onChange={(option: any) => {
                  trackUI?.({ screen: "ManPower", element: "contractorType", action: "change", extra: { to: option.key } });
                  setContractorType(option.key as ContractorType);
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        )}
       
        </View>
        <View style={styles.row}>

        <View style={styles.col}>
            <FieldLabel>Billing Duration</FieldLabel>
            <FieldBox hasError={err("workDurationType")}>
              <MS
                data={[
                  { key: "hourly", label: "Hourly" },
                  { key: "daily", label: "Daily" },
                ]}
                initValue={workDurationType === "hourly" ? "Hourly" : "Daily"}
                onChange={(option: any) => {
                  trackUI?.({ screen: "ManPower", element: "workDurationType", action: "change", extra: { to: option.key } });
                  setWorkDurationType(option.key as WorkDuration);
                  if (option.key === "hourly") setDayType("");
                  else setNumHours("0");
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>

          {workDurationType === "daily" && (
        <View style={styles.col}>
            <FieldLabel>Day Type</FieldLabel>
            <FieldBox hasError={err("dayType")}>
              <MS
                data={[
                  { key: "half", label: "Half Day" },
                  { key: "full", label: "Full Day" },
                ]}
                initValue={dayType ? (dayType === "half" ? "Half Day" : "Full Day") : "Select"}
                onChange={(option: any) => {
                  trackUI?.({ screen: "ManPower", element: "dayType", action: "change", extra: { to: option.key } });
                  setDayType(option.key as DayType);
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        )}
          </View>
        {/* Row: Date + Entry Type */}
        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel> Date Of Entry</FieldLabel>
            <FieldBox hasError={err("selectedDate")}>
              <MS
                data={currentWeekDates.map((date) => ({ key: date.toISOString(), label: formatDate(date) }))}
                initValue={selectedDate ? formatDate(selectedDate) : "Select a Date"}
                onChange={(option: any) => {
                  trackUI?.({ screen: "ManPower", element: "date_select", action: "change", extra: { to: option.label } });
                  setSelectedDate(new Date(option.key));
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="calendar-outline" />
            </FieldBox>
          </View>

          <View style={styles.col}>
            <FieldLabel>Work Type</FieldLabel>
            <FieldBox hasError={err("entryType")}>
              <MS
                data={[
                  { key: "Regular", label: "Regular" },
                  { key: "Avenue Add On", label: "Avenue Add On" },
                  { key: "Customer Add On", label: "Customer Add On" },
                ]}
                initValue={entryType}
                onChange={(option: any) => {
                  trackUI?.({ screen: "ManPower", element: "entryType", action: "change", extra: { to: option.key } });
                  setEntryType(option.key as EntryType);
                }}
                style={styles.selector}
                selectStyle={styles.selectorSelect}
                initValueTextStyle={styles.selectorText}
                optionTextStyle={styles.selectorText}
              />
              <RightIcon name="chevron-down" />
            </FieldBox>
          </View>
        </View>

        {/* Row: Skilled + Unskilled */}
        {contractorOrLabour === "Contractor" && (
          <View style={styles.row}>
            <View style={styles.col}>
              <FieldLabel>No. of Skilled Workers</FieldLabel>
              <FieldBox hasError={err("skilledCount")}>
                <TextInput
                  style={styles.textInput}
                  value={skilledCount}
                  onChangeText={(v) => {
                    setSkilledCount(v);
                    const now = Date.now();
                    if (now - lastQtyLogRef.current.at > 900 && lastQtyLogRef.current.len !== v.length) {
                      lastQtyLogRef.current = { at: now, len: v.length };
                      trackUI?.({ screen: "ManPower", element: "skilledCount", action: "change", extra: { len: v.length } });
                    }
                  }}
                  keyboardType={Platform.select({ ios: "decimal-pad", android: "numeric", default: "decimal-pad" }) as KeyboardTypeOptions}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
              </FieldBox>
            </View>

            <View style={styles.col}>
              <FieldLabel>No. of Unskilled Workers</FieldLabel>
              <FieldBox hasError={err("unskilledCount")}>
                <TextInput
                  style={styles.textInput}
                  value={unskilledCount}
                  onChangeText={(v) => {
                    setUnskilledCount(v);
                    const now = Date.now();
                    if (now - lastQtyLogRef.current.at > 900 && lastQtyLogRef.current.len !== v.length) {
                      lastQtyLogRef.current = { at: now, len: v.length };
                      trackUI?.({ screen: "ManPower", element: "unskilledCount", action: "change", extra: { len: v.length } });
                    }
                  }}
                  keyboardType={Platform.select({ ios: "decimal-pad", android: "numeric", default: "decimal-pad" }) as KeyboardTypeOptions}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
              </FieldBox>
            </View>
          </View>
        )}

        {/* Row: Total Work Hours + Total Workers */}
        <View style={styles.row}>
          <View style={styles.col}>
            <FieldLabel>Total Work Hours</FieldLabel>
            <FieldBox hasError={err("numHours")}>
              <TextInput
                style={styles.textInput}
                value={numHours}
                onChangeText={setNumHours}
                editable={workDurationType === "hourly"}
                {...getDecimalInputProps()}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </FieldBox>
          </View>

          <View style={styles.col}>
            <FieldLabel>Number of Workers</FieldLabel>
            <FieldBox hasError={err("numWorkers")}>
              <TextInput
                style={[styles.textInput, contractorOrLabour === "Contractor" ? styles.disabledText : null]}
                value={numWorkers}
                onChangeText={setNumWorkers}
                editable={contractorOrLabour !== "Contractor"}
                keyboardType={Platform.select({ ios: "decimal-pad", android: "numeric", default: "decimal-pad" }) as KeyboardTypeOptions}
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </FieldBox>
          </View>
        </View>

        {/* Row: Measurement Unit + Total Area */}
        {contractorOrLabour === "Contractor" && contractorType === "Contractor" && (
  <View style={styles.unitsWrap}>
    {/* Title row */}
    <View style={styles.unitsHeaderRow}>
      <TText style={styles.unitsTitle}>Unit of Measurements</TText>

      <TouchableOpacity
        style={styles.addUnitBtn}
        onPress={() => {
          setUnitEntries((prev) => [
            ...prev,
            makeUnitEntry(prev[prev.length - 1]?.unit_type || "sqft"),
          ]);
          trackUI?.({ screen: "ManPower", element: "unit_add", action: "click", extra: {} });
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={18} color="#fff" />
        <TText style={styles.addUnitBtnText}>Add</TText>
      </TouchableOpacity>
    </View>

    {/* Column headers (only once) */}
    <View style={styles.unitsTableHead}>
                <TText style={[styles.unitsColHead, { flex: 1, width: 140 }]}>Unit Type</TText>
                <TText style={[styles.unitsColHead, { width: 60 }]}>Quantity</TText>
                <View style={{ width: 56 }} />
              </View>

    {/* Rows */}
    {unitEntries.map((entry, idx) => (
      <View key={entry.id} style={styles.unitsRow}>
        {/* Unit dropdown */}
        <View style={{ flex: 1 ,width:120}}>
        <FieldBox hasError={!!errors[`unitType_${entry.id}`]}>
            <MS
              data={UNIT_TYPE_OPTIONS as any}
              initValue={unitLabel(entry.unit_type)}
              onChange={(option: any) => {
                setUnitEntries((prev) =>
                  prev.map((x) =>
                    x.id === entry.id ? { ...x, unit_type: option.key as UnitType } : x
                  )
                );
                trackUI?.({
                  screen: "ManPower",
                  element: "unit_type_row",
                  action: "change",
                  extra: { row: idx, to: option.key },
                });
              }}
              style={styles.selector}
              selectStyle={styles.selectorSelect}
              initValueTextStyle={styles.selectorText}
              optionTextStyle={styles.selectorText}
            />
            <RightIcon name="chevron-down" />
          </FieldBox>
        </View>

        {/* Quantity input */}
        <View style={{ width: 60 }}>
        <FieldBox hasError={!!errors[`qty_${entry.id}`]}>
            <TextInput
              style={styles.textInput}
              value={entry.quantity}
              onChangeText={(v) =>
                setUnitEntries((prev) =>
                  prev.map((x) => (x.id === entry.id ? { ...x, quantity: v } : x))
                )
              }
              {...getDecimalInputProps()}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
            />
          </FieldBox>
        </View>

        {/* Remove */}
        <TouchableOpacity
          style={[
            styles.removeUnitBtn,
            unitEntries.length === 1 ? styles.removeUnitBtnDisabled : null,
          ]}
          disabled={unitEntries.length === 1}
          onPress={() => {
            setUnitEntries((prev) => prev.filter((x) => x.id !== entry.id));
            trackUI?.({ screen: "ManPower", element: "unit_remove", action: "click", extra: { row: idx } });
          }}
          activeOpacity={0.85}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={unitEntries.length === 1 ? "#9CA3AF" : "#DC2626"}
          />
        </TouchableOpacity>
      </View>
    ))}
  </View>
)}



        {/* Remarks */}
        <View style={styles.formGroup}>
          <FieldLabel>Remarks / Notes</FieldLabel>
          <FieldBox>
            <TextInput
              style={[styles.textInput, styles.remarksInput]}
              value={remarks}
              onChangeText={(t) => {
                setRemarks(t);
                const now = Date.now();
                if (now - lastRemarksLogRef.current.at > 1200 && lastRemarksLogRef.current.len !== t.length) {
                  lastRemarksLogRef.current = { at: now, len: t.length };
                  trackUI?.({ screen: "ManPower", element: "remarks", action: "change", extra: { len: t.length } });
                }
              }}
              placeholder="Example value is fine"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </FieldBox>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={() => {
            trackUI?.({ screen: "ManPower", element: "submit", action: "click", extra: {} });
            handleSubmit();
          }}
        >
          <TText style={styles.submitButtonText}>Submit</TText>
        </TouchableOpacity>

        <DialogBox
          visible={dialogVisible}
          onClose={() => setDialogVisible(false)}
          message={dialogMessage}
          isSuccess={isSuccess}
          onAddAnother={resetFields}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7FB", paddingHorizontal: 14, paddingTop: 10 },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    justifyContent: "space-between",
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },

  formGroup: { marginTop:8},

  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  col: { flex: 1 },

  fieldLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 6,
    fontWeight: "500",
  },

  fieldBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 35,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "relative",
  },
  errorBox: { borderColor: "#DC2626", backgroundColor: "#FFF7F7" },
  selector: { borderColor: "transparent" },
  selectorSelect: { borderWidth: 0, padding: 0, justifyContent: "center" },
  selectorText: { fontSize: 15, color: "#111827" },

  textInput: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "400",
    paddingVertical: 8,
  },

  remarksInput: {
    minHeight: 44,
    fontWeight: "500",
  },

  disabledText: { color: "#6B7280" },

  rightIconWrap: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },

  submitButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 18,
    marginBottom: 18,
  },
  submitButtonText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  unitsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  
  unitsWrap: {
    marginTop: 12,
  },
  
  unitsTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  
  addUnitBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  
  addUnitBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  
  unitsTableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
    paddingHorizontal: 2,
  },

  unitsColHead: { fontSize: 13, fontWeight: "700", color: "#6B7280" },

  unitsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 5,
  },

  
  removeUnitBtn: {
    width: 56,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  
  removeUnitBtnDisabled: {
    opacity: 0.6,
  },
  

  buttonRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  dialogBox: { width: "82%", padding: 18, backgroundColor: "#FFF", borderRadius: 14, alignItems: "center" },
  dialogMessage: { fontSize: 16, marginBottom: 16, textAlign: "center", color: "#111827" },
  dialogButton: { marginTop: 4, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: "#2563EB" },
  dialogButtonText: { color: "#FFF", fontWeight: "700" },
});

export default ManPower;
