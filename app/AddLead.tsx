import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Image } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import ModalSelector from "@/components/AppModalSelect";

import TText from "@/components/TText";
import {useTheme } from "@/src/theme/ThemeProvider";
import SalesFooterNav from "./SalesFooterNav";
import {
  createSalesLead,
  getSalesLeadMasters,
  type CreateSalesLeadInput,
  type SalesLeadMasterOption,
} from "@/utils/salesLeads";

type SelectorOption = { key: string; label: string };
const CHANNEL_OPTIONS: SelectorOption[] = [
  { key: "call", label: "Call" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
];

const AVENUE_LOGO_URL =
  "https://avenuerealty.in/wp-content/uploads/2022/12/cropped-Avenue-reality-logo.png";

const AddLead: React.FC = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const router = useRouter();
  const params = useLocalSearchParams();

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [source, setSource] = useState("");
  const [stageKey, setStageKey] = useState("fresh");
  const [jobTypeCode, setJobTypeCode] = useState("");
  const [valueAmount, setValueAmount] = useState("");
  const [channel, setChannel] = useState("call");
  const [notes, setNotes] = useState("");
  const [cachedEmployeeCode, setCachedEmployeeCode] = useState("");
  const [sourceOptions, setSourceOptions] = useState<SelectorOption[]>([]);
  const [stageOptions, setStageOptions] = useState<SelectorOption[]>([]);
  const [jobTypeOptions, setJobTypeOptions] = useState<SelectorOption[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);

  const navParams = useMemo(
    () => ({
      first_name: String(params.first_name || ""),
      last_name: String(params.last_name || ""),
      email: String(params.email || ""),
      job_title: String(params.job_title || ""),
      employee_code: String(params.employee_code || ""),
      phone_number: String(params.phone_number || ""),
    }),
    [params]
  );

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem("cached_employee")
      .then((raw) => {
        if (!mounted || !raw) return;
        try {
          const parsed = JSON.parse(raw);
          setCachedEmployeeCode(String(parsed?.employee_code || "").trim());
        } catch {}
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadMasters = async () => {
      const employeeCode = String(navParams.employee_code || cachedEmployeeCode || "").trim();
      if (!employeeCode) return;
      setMastersLoading(true);
      try {
        const masters = await getSalesLeadMasters({
          employeeCode,
          role: navParams.job_title,
        });
        if (!mounted) return;

        const toOptions = (items: SalesLeadMasterOption[]) =>
          items
            .filter((item) => String(item?.code || "").trim())
            .map((item) => ({
              key: String(item.code),
              label: String(item.label || item.code),
            }));

        const nextStageOptions = toOptions(masters.stages);
        const nextSourceOptions = toOptions(masters.sources);
        const nextJobTypeOptions = toOptions(masters.job_types);

        setStageOptions(nextStageOptions);
        setSourceOptions(nextSourceOptions);
        setJobTypeOptions(nextJobTypeOptions);

        if (nextStageOptions.length && !nextStageOptions.some((item) => item.key === stageKey)) {
          setStageKey(nextStageOptions[0].key);
        }
        if (nextSourceOptions.length && !nextSourceOptions.some((item) => item.key === source)) {
          setSource(nextSourceOptions[0].key);
        }
      } catch (error) {
        console.warn("[AddLead] Failed to load CRM masters", error);
      } finally {
        if (mounted) setMastersLoading(false);
      }
    };

    loadMasters();
    return () => {
      mounted = false;
    };
  }, [navParams.employee_code, navParams.job_title, cachedEmployeeCode]);

  const saveLead = async () => {
    if (!name.trim()) {
      Alert.alert("Missing details", "Lead name is required.");
      return;
    }

    const ownerEmployeeCode = String(navParams.employee_code || cachedEmployeeCode || "").trim();
    if (!ownerEmployeeCode) {
      Alert.alert("Missing employee", "Employee code is required to create a lead.");
      return;
    }

    if (!stageKey.trim()) {
      Alert.alert("Missing stage", "Please select a valid lead stage.");
      return;
    }

    if (!source.trim()) {
      Alert.alert("Missing source", "Please select a valid lead source.");
      return;
    }

    if (!channel.trim()) {
      Alert.alert("Missing channel", "Please select a valid preferred channel.");
      return;
    }

    const normalizedValueText = valueAmount.replace(/,/g, "").trim();
    const parsedValueAmount = normalizedValueText ? Number(normalizedValueText) : null;
    if (normalizedValueText && !Number.isFinite(parsedValueAmount)) {
      Alert.alert("Invalid amount", "Lead value must be a valid number.");
      return;
    }

    const payload: CreateSalesLeadInput = {
      name: name.trim(),
      lead_code: null,
      stage_key: stageKey.trim(),
      status_key: "active",
      priority_key: "medium",
      owner_employee_code: ownerEmployeeCode,
      source_code: source.trim(),
      job_type_code: jobTypeCode.trim() || null,
      location_text: location.trim() || null,
      value_amount: parsedValueAmount,
      currency: "INR",
      preferred_channel_key: channel.trim() || "call",
      next_action_notes: notes.trim() || null,
    };

    try {
      await createSalesLead({
        employeeCode: ownerEmployeeCode,
        role: navParams.job_title,
        body: payload,
      });
    } catch (error: any) {
      Alert.alert("Create Lead Failed", error?.message || "Unable to create lead.");
      return;
    }

    router.replace({ pathname: "/SalesLeads", params: navParams } as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={{ uri: AVENUE_LOGO_URL }} style={styles.headerLogo} resizeMode="contain" />
        </View>
        <TText style={[styles.headerTitle, { color: C.text }]}>Add Lead</TText>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => router.push({ pathname: "/HomeScreen", params: navParams } as any)} style={styles.headerBtn}>
            <Ionicons name="home" size={22} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.headerDivider, { backgroundColor: C.border }]} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: C.surface }]}>
          {mastersLoading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" color={C.primaryStrong} />
              <TText style={[styles.loaderText, { color: C.mutedText }]}>Loading lead options…</TText>
            </View>
          ) : null}

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Lead Name</TText>
            <TextInput value={name} onChangeText={setName} placeholder="Enter lead name" placeholderTextColor={C.mutedText} style={[styles.input, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]} />
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Stage</TText>
            <ModalSelector
              data={stageOptions}
              initValue=""
              onChange={(option: any) => setStageKey(String(option.key || ""))}
              disabled={stageOptions.length === 0}
              optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: "rgba(15, 23, 42, 0.35)" }}
              cancelText="Cancel"
            >
              <View style={[styles.selectInput, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <TText style={[styles.selectText, { color: stageKey ? C.text : C.mutedText }]}>
                  {stageOptions.find((item) => item.key === stageKey)?.label || "Select stage"}
                </TText>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={C.mutedText} />
              </View>
            </ModalSelector>
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Location</TText>
            <TextInput value={location} onChangeText={setLocation} placeholder="Enter location" placeholderTextColor={C.mutedText} style={[styles.input, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]} />
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Lead Value</TText>
            <TextInput value={valueAmount} onChangeText={setValueAmount} placeholder="1250000" placeholderTextColor={C.mutedText} keyboardType="numeric" style={[styles.input, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]} />
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Source</TText>
            <ModalSelector
              data={sourceOptions}
              initValue=""
              onChange={(option: any) => setSource(String(option.key || ""))}
              disabled={sourceOptions.length === 0}
              optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: "rgba(15, 23, 42, 0.35)" }}
              cancelText="Cancel"
            >
              <View style={[styles.selectInput, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <TText style={[styles.selectText, { color: source ? C.text : C.mutedText }]}>
                  {sourceOptions.find((item) => item.key === source)?.label || "Select source"}
                </TText>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={C.mutedText} />
              </View>
            </ModalSelector>
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Job Type</TText>
            <ModalSelector
              data={[{ key: "", label: "None" }, ...jobTypeOptions]}
              initValue=""
              onChange={(option: any) => setJobTypeCode(String(option.key || ""))}
              optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: "rgba(15, 23, 42, 0.35)" }}
              cancelText="Cancel"
            >
              <View style={[styles.selectInput, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <TText style={[styles.selectText, { color: jobTypeCode ? C.text : C.mutedText }]}>
                  {jobTypeOptions.find((item) => item.key === jobTypeCode)?.label || "Select job type"}
                </TText>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={C.mutedText} />
              </View>
            </ModalSelector>
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Preferred Channel</TText>
            <ModalSelector
              data={CHANNEL_OPTIONS}
              initValue=""
              onChange={(option: any) => setChannel(String(option.key || "call"))}
              optionTextStyle={{ color: C.text, textAlign: "center" }}
              optionContainerStyle={{ backgroundColor: C.surface, borderBottomColor: C.border }}
              cancelStyle={{ backgroundColor: C.surface }}
              cancelTextStyle={{ color: C.text }}
              overlayStyle={{ backgroundColor: "rgba(15, 23, 42, 0.35)" }}
              cancelText="Cancel"
            >
              <View style={[styles.selectInput, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                <TText style={[styles.selectText, { color: channel ? C.text : C.mutedText }]}>
                  {CHANNEL_OPTIONS.find((item) => item.key === channel)?.label || "Select channel"}
                </TText>
                <MaterialIcons name="keyboard-arrow-down" size={20} color={C.mutedText} />
              </View>
            </ModalSelector>
          </View>

          <View style={styles.field}>
            <TText style={[styles.label, { color: C.mutedText }]}>Notes</TText>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Add lead notes" placeholderTextColor={C.mutedText} multiline textAlignVertical="top" style={[styles.input, styles.textarea, { backgroundColor: C.surfaceAlt, borderColor: C.border, color: C.text }]} />
          </View>

          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: C.primaryStrong }]} onPress={saveLead}>
            <TText style={[styles.saveText, { color: C.white }]}>Save Lead</TText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <SalesFooterNav activeTab="leads" params={navParams} showBackButton />
    </View>
  );
};

const createStyles = (C: any) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 12,
      backgroundColor: C.surface,
    },
    headerDivider: {
      height: 1,
      marginHorizontal: 14,
    },
    headerLeft: {
      width: 84,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerRight: {
      width: 84,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    headerLogo: { width: 72, height: 40 },
    headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800" },
    content: { padding: 14, paddingBottom: 24 },
    card: { borderRadius: 18, padding: 18 },
    cardTitle: { fontSize: 20, fontWeight: "900" },
    cardText: { fontSize: 13, fontWeight: "600", lineHeight: 20, marginTop: 8 },
    loaderRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
    loaderText: { marginLeft: 8, fontSize: 12, fontWeight: "600" },
    field: { marginTop: 16 },
    label: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", marginBottom: 8 },
    input: {
      minHeight: 40,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 12,
    },
    selectInput: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    selectText: {
      fontSize: 14,
      fontWeight: "600",
      flex: 1,
      paddingRight: 8,
    },
    textarea: { minHeight: 96 },
    saveBtn: {
      marginTop: 20,
      minHeight: 50,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: { fontSize: 14, fontWeight: "800" },
  });

export default AddLead;
