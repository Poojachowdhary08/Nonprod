import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Alert, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
type ParsedQR = {
  parsed_item_name?: string | null;
  parsed_location?: string | null;
  parsed_warehouse?: string | number | null;
};

const buildLookupUrl = ({ parsed_item_name, parsed_location, parsed_warehouse }: ParsedQR) => {
  const url = `${APP_API_BASE_URL}/lookup/inventory?parsed_item_name=${encodeURIComponent(
    String(parsed_item_name ?? "")
  )}&parsed_location=${encodeURIComponent(
    String(parsed_location ?? "")
  )}&parsed_warehouse=${encodeURIComponent(String(parsed_warehouse ?? ""))}`;
  return url;
};

/**
 * Try to parse QR "data" that could be in multiple formats:
 * 1) JSON string: {"parsed_item_name":"red bricks","parsed_location":"Serene_Grande","parsed_warehouse":"1"}
 * 2) URL with query params: https://x?parsed_item_name=...&parsed_location=...&parsed_warehouse=...
 * 3) key:value lines or pairs separated by ; or ,   e.g. "item:red bricks;location:Serene_Grande;warehouse:1"
 * 4) Minimal keys: allow synonyms like item/name, location/site, warehouse/wh
 */
const parseQrData = (raw: string): ParsedQR => {
  const safe = (v?: string | null) =>
    typeof v === "string" ? v.trim() : v ?? null;

  // 1) JSON
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object") {
      return {
        parsed_item_name: safe(o.parsed_item_name ?? o.item ?? o.name),
        parsed_location: safe(o.parsed_location ?? o.location ?? o.site),
        parsed_warehouse: safe(o.parsed_warehouse ?? o.warehouse ?? o.wh),
      };
    }
  } catch {
    // not JSON; continue
  }

  // 2) URL with query params
  try {
    const maybeUrl = new URL(raw);
    const q = maybeUrl.searchParams;
    return {
      parsed_item_name: safe(q.get("parsed_item_name") ?? q.get("item") ?? q.get("name")),
      parsed_location: safe(q.get("parsed_location") ?? q.get("location") ?? q.get("site")),
      parsed_warehouse: safe(q.get("parsed_warehouse") ?? q.get("warehouse") ?? q.get("wh")),
    };
  } catch {
    // not a URL; continue
  }

  // 3) key:value pairs separated by ; or , or newline
  const candidate = raw
    .replace(/\n/g, ";")
    .replace(/,/g, ";")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  if (candidate.length) {
    const map: Record<string, string> = {};
    for (const piece of candidate) {
      const [k, ...rest] = piece.split(":");
      if (!k || !rest.length) continue;
      map[k.trim().toLowerCase()] = rest.join(":").trim();
    }

    const get = (...keys: string[]) => {
      for (const kk of keys) {
        if (map[kk] != null) return map[kk];
      }
      return null;
    };

    return {
      parsed_item_name: safe(get("parsed_item_name", "item", "name")),
      parsed_location: safe(get("parsed_location", "location", "site")),
      parsed_warehouse: safe(get("parsed_warehouse", "warehouse", "wh")),
    };
  }

  // 4) Fallback (unknown format): treat the whole thing as item name
  return {
    parsed_item_name: raw.trim(),
    parsed_location: null,
    parsed_warehouse: null,
  };
};

const ScanImage: React.FC = () => {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [torch, setTorch] = useState<"on" | "off">("off");
  const [scanningLocked, setScanningLocked] = useState(false);
  const lockRef = useRef(false);

  useEffect(() => {
    // Ask once on mount if not already decided
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleGrant = useCallback(() => {
    requestPermission();
  }, [requestPermission]);

  const unlockScanAfterDelay = useCallback(() => {
    lockRef.current = false;
    setScanningLocked(false);
  }, []);

  const handleScanned = useCallback(
    ({ data }: { data: string }) => {
      // Debounce multi-fire
      if (lockRef.current) return;
      lockRef.current = true;
      setScanningLocked(true);

      try {
        const parsed = parseQrData(data);

        if (!parsed.parsed_item_name && !parsed.parsed_location && !parsed.parsed_warehouse) {
          Alert.alert("QR Parsed", "Could not find expected fields. Using raw QR as item name.");
        }

        const url = buildLookupUrl(parsed);

        // If you want to fetch immediately here, uncomment:
        // fetch(url).then(() => {}).catch(()=>{})

        // Navigate to results screen with params so it can call the URL itself
        router.replace({
          pathname: "/ScanQRResult",
          params: {
            parsed_item_name: String(parsed.parsed_item_name ?? ""),
            parsed_location: String(parsed.parsed_location ?? ""),
            parsed_warehouse: String(parsed.parsed_warehouse ?? ""),
          },
        });

      } catch (e: any) {
        Alert.alert("Scan Error", e?.message ?? "Failed to handle QR data");
      } finally {
        // Small delay to avoid immediate re-scan if user returns
        setTimeout(unlockScanAfterDelay, 1500);
      }
    },
    [router, unlockScanAfterDelay]
  );

  if (!permission) {
    // still resolving
    return <View style={styles.center}><TText>Checking camera permission…</TText></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <TText style={{ marginBottom: 12 }}>Camera permission is required to scan QR codes.</TText>
        <TouchableOpacity onPress={handleGrant} style={styles.permissionButton}>
          <TText style={styles.permissionText}>Grant Permission</TText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="scan-image-root">
      <CameraView
        style={styles.camera}
        facing={facing}
        enableTorch={torch === "on"}
        // QR-only
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanningLocked ? undefined : handleScanned}
      >
        {/* simple scan frame */}
        <View style={styles.overlay}>
          <View style={styles.frame} />
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={() => setFacing((p) => (p === "back" ? "front" : "back"))}
            style={styles.circleBtn}
          >
                      <Ionicons name="camera-reverse" size={26} color="#fff" />

          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTorch((t) => (t === "on" ? "off" : "on"))}
            style={styles.circleBtn}          >
            <Ionicons name={torch === "on" ? "flash" : "flash-off"} size={24} color="#fff" />
            <TText style={styles.controlText}>{torch === "on" ? "Torch On" : "Torch Off"}</TText>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace("/HomeScreen")}
            style={styles.circleBtn}
          >
             <Ionicons name="close" size={26} color="#fff" />

          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  permissionButton: {
    backgroundColor: "#0A84FF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  permissionText: { color: "#fff", fontWeight: "600" },

  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: 260,
    height: 260,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#FFFFFFAA",
  },

  controls: {
    position: "absolute",
    bottom: Platform.select({ ios: 28, android: 20 }),
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  controlBtn: {
    backgroundColor: "#00000066",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  circleBtn: {
    backgroundColor: "rgba(0,0,0,0.45)",
    padding: 12,
    borderRadius: 999,
  },
  controlText: { color: "#fff", marginTop: 4, fontSize: 12 },
});

export default ScanImage;
