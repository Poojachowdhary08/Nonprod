import React, { useEffect } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { createPortal } from "react-dom";
import TText from "@/components/TText";

type Props = {
  visible: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  forceUpdate?: boolean;
  onUpdatePress: () => void;
  onClose?: () => void;
};

type ChangelogItem = {
  kind: "title" | "bullet";
  text: string;
};

const normalizeChangelogItems = (value?: string): ChangelogItem[] => {
  return (value || "")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)-]?\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const compact = line.replace(/:$/, "").trim();
      if (/^release notes$/i.test(compact) || /^what'?s new$/i.test(compact) || /^changelog$/i.test(compact)) {
        return { kind: "title", text: compact } as ChangelogItem;
      }
      return { kind: "bullet", text: line } as ChangelogItem;
    });
};

const AppUpdateDialog = ({
  visible,
  currentVersion,
  latestVersion,
  changelog,
  forceUpdate = false,
  onUpdatePress,
  onClose,
}: Props) => {
  const changelogItems = normalizeChangelogItems(changelog);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!visible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  if (!visible) return null;

  const content = (
    <View pointerEvents="auto" style={styles.portal}>
      <Pressable
        style={[
          styles.scrim,
          Platform.OS === "web"
            ? ({ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", cursor: "default" } as any)
            : null,
        ]}
        onPress={forceUpdate ? undefined : onClose}
      >
        <Pressable style={styles.centerWrap} onPress={(e: any) => e?.stopPropagation?.()}>
          <Pressable style={styles.card} onPress={(e: any) => e?.stopPropagation?.()}>
            <View style={styles.badge}>
              <MaterialIcons name={forceUpdate ? "system-update-alt" : "new-releases"} size={20} color="#1D4ED8" />
            </View>

            <TText style={styles.title}>{forceUpdate ? "Update Required" : "Update Available"}</TText>
            <TText style={styles.message}>
              {forceUpdate
                ? "This app version is outdated. Please update to continue."
                : "A newer app version is available. Update now for the latest fixes and improvements."}
            </TText>

            <View style={styles.versionRow}>
              <View style={styles.versionPill}>
                <TText style={styles.versionLabel}>Installed</TText>
                <TText style={styles.versionValue}>{currentVersion || "unknown"}</TText>
              </View>
              <View style={styles.versionPill}>
                <TText style={styles.versionLabel}>Latest</TText>
                <TText style={styles.versionValue}>{latestVersion || "unknown"}</TText>
              </View>
            </View>

            {changelogItems.length ? (
              <View style={styles.notesBox}>
                <TText style={styles.notesTitle}>What&apos;s New</TText>
                {changelogItems.map((item, index) =>
                  item.kind === "title" ? (
                    <TText key={`${item.kind}-${index}`} style={styles.notesSectionTitle}>
                      {item.text}
                    </TText>
                  ) : (
                    <View key={`${item.kind}-${index}`} style={styles.notesBulletRow}>
                      <View style={styles.notesBulletDot} />
                      <TText style={styles.notesItem}>{item.text}</TText>
                    </View>
                  )
                )}
              </View>
            ) : null}

            <View style={styles.actions}>
              {!forceUpdate && onClose ? (
                <Pressable style={styles.secondaryBtn} onPress={onClose}>
                  <TText style={styles.secondaryText}>Later</TText>
                </Pressable>
              ) : null}
              <Pressable style={styles.primaryBtn} onPress={onUpdatePress}>
                <MaterialIcons name="open-in-new" size={16} color="#FFFFFF" />
                <TText style={styles.primaryText}>Update Now</TText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </View>
  );

  if (Platform.OS === "web") {
    return createPortal(content, document.body);
  }

  return content;
};

const styles = StyleSheet.create({
  portal: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2147483647,
    elevation: 9999,
  },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.64)",
  },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(29, 78, 216, 0.14)",
    maxHeight: "88%",
    shadowColor: "#0F172A",
    shadowOpacity: 0.24,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 28,
    transform: [{ translateY: -36 }],
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },
  message: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
  },
  versionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  versionPill: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  versionValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  notesBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  notesSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  notesBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 6,
  },
  notesBulletDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#2563EB",
    marginTop: 6,
    flexShrink: 0,
  },
  notesItem: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
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
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: "#0F172A",
    fontWeight: "700",
  },
  primaryBtn: {
    minWidth: 140,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});

export default AppUpdateDialog;
