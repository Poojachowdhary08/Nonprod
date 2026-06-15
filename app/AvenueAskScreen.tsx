import React, { useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import TText from "@/components/TText";
import { useSpeechToText } from "@/utils/useSpeechToText";
import { useTheme } from "@/src/theme/ThemeProvider";

const AVENUE_ASK_ROBOT =
  "https://cdn-icons-png.flaticon.com/512/4712/4712035.png";

type Props = {
  employeeName?: string;
  online?: boolean;
  onBack?: () => void;
};

const AvenueAskScreen: React.FC<Props> = ({ employeeName = "—", online, onBack }) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const greet = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  // input state
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput | null>(null);

  // voice state
  const baseTextRef = useRef<string>("");
  const liveTranscriptRef = useRef<string>("");
  const applyTranscript = (transcript: string) => {
    const clean = transcript.trim();
    liveTranscriptRef.current = clean;
    const base = baseTextRef.current.trim();
    setText(base ? `${base} ${clean}`.trim() : clean);
  };

  const { isListening, startListening, stopListening } = useSpeechToText({
    lang: "en-IN",
    continuous: true,
    interimResults: true,
    dedupeFinal: false,
    unavailableMessage:
      "Speech recognition is not supported in this browser or device. Try Chrome or a supported Android build.",
    onStart: () => {
      baseTextRef.current = text.trim();
      liveTranscriptRef.current = "";
      inputRef.current?.focus?.();
    },
    onEnd: () => {
      liveTranscriptRef.current = "";
    },
    onPartialTranscript: (transcript) => {
      applyTranscript(transcript);
    },
    onFinalTranscript: (transcript) => {
      applyTranscript(transcript);
    },
    onError: (message) => {
      Alert.alert("Voice input", message);
    },
  });

  const toggleVoice = () => {
    if (isListening) {
      void stopListening();
      return;
    }
    void startListening();
  };

  const handleSend = () => {
    const q = text.trim();
    if (!q) {
      Alert.alert("Avenue Ask", "Type something first.");
      return;
    }

    // TODO: connect your actual ask API here
    Alert.alert("Avenue Ask", `Sending: ${q}`);
    setText("");
  };

  return (
    <View style={styles.container} testID="avenue-ask-screen-root">
      {/* Header like screenshot */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          activeOpacity={0.8}
          onPress={() => onBack?.()}
        >
          {/* <MaterialIcons name="arrow-back" size={22} color="#111827" /> */}
        </TouchableOpacity>

        <View style={styles.headerTitleRow}>
          <TText style={styles.headerTitle}>Avenue Ask</TText>
        </View>

        <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.8}>
          {/* <MaterialIcons name="more-vert" size={22} color="#111827" /> */}
        </TouchableOpacity>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.botCircle}>
            <Image
              source={{ uri: AVENUE_ASK_ROBOT }}
              style={styles.botImg}
              resizeMode="contain"
            />
          </View>

          <TText style={styles.greeting}>
            {greet}, {employeeName}
          </TText>

          <TText style={styles.headline}>
            Your <TText style={styles.headlineBlue}>Avenue Ask</TText> for{"\n"}
            your Queries.
          </TText>
        </View>

        {/* Quick Cards */}
        <View style={styles.cardGrid}>
          <QuickCard
            title="Inventory"
            sub="Get the items that are in low stock in the warehouse"
            icon="inventory-2"
            color={C.primary}
            cardBg={C.surface}
            borderColor={C.border}
          />
          <QuickCard
            title="Projects"
            sub="Give a list of issued inventory requests"
            icon="apartment"
            color={C.primary}
            cardBg={C.surface}
            borderColor={C.border}
          />
          <QuickCard
            title="Man Power"
            sub="Give a list of issued inventory requests"
            icon="groups"
            color={C.primary}
            cardBg={C.surface}
            borderColor={C.border}
          />
          <QuickCard
            title="Invoices"
            sub="Give a list of issued inventory requests"
            icon="receipt-long"
            color={C.primary}
            cardBg={C.surface}
            borderColor={C.border}
          />
        </View>

        {/* Bottom input bar */}
        <View style={styles.inputRow}>

          <View style={styles.inputWrap}>
            <TextInput
              ref={(r) => (inputRef.current = r)}
              placeholder="Ask something here..."
              placeholderTextColor={C.subtleText}
              style={styles.input}
              value={text}
              onChangeText={setText}
              editable={true}
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            {/* ✅ MIC: Web voice-to-text */}
            <TouchableOpacity
              style={styles.micBtn}
              activeOpacity={0.85}
              onPress={toggleVoice}
            >
              <MaterialIcons
                name={isListening ? "graphic-eq" : "mic"}
                size={20}
                color={isListening ? C.primary : C.mutedText}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sendBtn} activeOpacity={0.85} onPress={handleSend}>
            <MaterialIcons name="send" size={22} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* status */}
        <TText
          style={[
            styles.statusText,
            { color: online === false ? C.danger : C.mutedText },
          ]}
        >
          {online === false
            ? "Offline mode"
            : isListening
            ? "Listening… (tap mic to stop)"
            : "Tap the mic and speak"}
        </TText>
      </View>
    </View>
  );
};

function QuickCard({
  title,
  sub,
  icon,
  color,
  cardBg,
  borderColor,
}: {
  title: string;
  sub: string;
  icon: any;
  color: string;
  cardBg: string;
  borderColor: string;
}) {
  return (
    <TouchableOpacity
      style={[
        baseStyles.card,
        { backgroundColor: cardBg, borderColor },
      ]}
      activeOpacity={0.9}
    >
      <View style={baseStyles.cardTop}>
        <TText style={[baseStyles.cardTitle, { color }]}>{title}</TText>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <TText style={baseStyles.cardSub}>{sub}</TText>
    </TouchableOpacity>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "web" ? 0 : 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minHeight: 86,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 13, fontWeight: "900" },
  cardSub: { marginTop: 6, fontSize: 11, fontWeight: "600" },
});

const createStyles = (C: ReturnType<typeof useTheme>["theme"]["colors"]) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 56,
    backgroundColor: C.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    justifyContent: "space-between",
  },
  headerIconBtn: { padding: 8, borderRadius: 10 },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },

  body: { flex: 1, padding: 14 },

  hero: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 18,
  },
  botCircle: {
    height: 86,
    width: 86,
    borderRadius: 999,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  botImg: { height: 58, width: 58 },
  greeting: { marginTop: 14, fontSize: 14, fontWeight: "700", color: C.mutedText },
  headline: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "900",
    color: C.text,
    textAlign: "center",
    lineHeight: 28,
  },
  headlineBlue: { color: C.primary, fontWeight: "700" },

  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: "auto",
    paddingBottom: 6,
  },
  sideBtn: {
    height: 42,
    width: 42,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  input: { flex: 1, height: 42, fontSize: 13, fontWeight: "700", color: C.text },
  attachBtn: { padding: 6 },
  micBtn: { padding: 6 },
  sendBtn: {
    height: 42,
    width: 42,
    borderRadius: 12,
    backgroundColor: C.primaryStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: { marginTop: 6, fontSize: 11, fontWeight: "700" },
});

export default AvenueAskScreen;
