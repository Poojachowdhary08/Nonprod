import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TText from "@/components/TText";

type Props = {
  visible: boolean;
  phaseName?: string | null;
  onClose: () => void;
  onGoToWorkflow: () => void;
};

const ScheduleLockDialog = ({ visible, phaseName, onClose, onGoToWorkflow }: Props) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed" size={20} color="#7C2D12" />
          </View>
          <TText style={styles.title}>Task Locked</TText>
          {phaseName ? <TText style={styles.phaseName}>{phaseName}</TText> : null}
          <TText style={styles.message}>
            Please go to schedule task workflow and resume the task to post updates.
          </TText>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <TText style={styles.secondaryText}>Close</TText>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onGoToWorkflow}>
              <TText style={styles.primaryText}>Go to Workflow</TText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFEDD5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },
  phaseName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginTop: 6,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
    marginTop: 12,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 22,
  },
  secondaryBtn: {
    minWidth: 94,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  primaryBtn: {
    minWidth: 144,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  secondaryText: {
    color: "#111827",
    fontWeight: "700",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

export default ScheduleLockDialog;
