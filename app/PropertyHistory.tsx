import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  ActivityIndicator,
  Linking,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
const { width, height } = Dimensions.get("window");
const DEFAULT_ICON_URL =
  "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png";

interface ApiFile {
  file_id: string;
  task_id: number;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  update_id: number;
  schedule_id: number;
  uploaded_at: string;
}

interface ApiResponse {
  files: {
    propertyid: string;
    files: ApiFile[];
  }[];
}

interface DocumentItem {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
  fileType: string;
  fileUrl: string;
  uploadedAt: string | null;
  uploadedAtTs: number;
}

type FolderKey = "pdf" | "images" | "others";

const PAGE_SIZE = 21;

const getPrefsKey = (propertyId: string, folder: FolderKey) =>
  `propertyHistoryPrefs:${propertyId}:${folder}`;

// ✅ Always safe embed viewer for WEB
const googleViewerNg = (url: string) => {
  const encoded = encodeURIComponent((url || "").trim());
  return `https://drive.google.com/viewerng/viewer?embedded=true&url=${encoded}`;
};

// ✅ Android fallback chain (direct -> viewerng -> gview)
const buildPdfViewerCandidates = (pdfUrl: string) => {
  const cleaned = (pdfUrl || "").trim();
  const encoded = encodeURIComponent(cleaned);

  const viewerNg = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encoded}`;
  const gview = `https://docs.google.com/gview?embedded=1&url=${encoded}`;

  return [cleaned, viewerNg, gview];
};

// ✅ WEB: download without opening new tab
const webDownload = (url: string, fileName?: string) => {
  try {
    // @ts-ignore - document exists only on web
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "";
    a.rel = "noopener noreferrer";
    // @ts-ignore
    document.body.appendChild(a);
    a.click();
    // @ts-ignore
    document.body.removeChild(a);
  } catch (e) {
    // @ts-ignore
    window.open(url, "_blank");
  }
};

// ✅ stable cache file name per URL
const makePdfCachePath = (url: string) => {
  const cleaned = (url || "").trim();
  const safe = encodeURIComponent(cleaned).replace(/%/g, "_");
  return `${FileSystem.cacheDirectory}pdf_${safe}.pdf`;
};

type Props = {
  propertyId: string;
  projectId: string;
  userDetails?: any;
};

export default function PropertyHistory(props: Props) {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  // ✅ Still supports opening directly via router params (fallback)
  const routeParams =
    useLocalSearchParams<{
      propertyId?: string;
      projectId?: string;
      userDetails?: string;
    }>();

  // ✅ props first, params fallback
  const resolvedPropertyId = (props?.propertyId || routeParams?.propertyId || "").toString();
  const resolvedProjectId = (props?.projectId || routeParams?.projectId || "").toString();

  // userDetails: prefer prop, else decode param if present
  const resolvedUserDetails = useMemo(() => {
    if (props?.userDetails) return props.userDetails;

    const raw = routeParams?.userDetails;
    if (!raw) return null;

    try {
      return JSON.parse(decodeURIComponent(String(raw)));
    } catch {
      return null;
    }
  }, [props?.userDetails, routeParams?.userDetails]);

  const basePropertyId = useMemo(
    () => (resolvedPropertyId?.trim() ? resolvedPropertyId.trim() : "LAK_RES_001_LuxuryVilla"),
    [resolvedPropertyId]
  );

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderKey | null>(null);

  // image preview
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // pdf preview
  const [pdfPreviewVisible, setPdfPreviewVisible] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ✅ Candidate URLs + attempt index (WebView fallback)
  const [pdfCandidates, setPdfCandidates] = useState<string[]>([]);
  const [pdfAttempt, setPdfAttempt] = useState(0);

  // ✅ Force re-render of viewer on Retry / Attempt change
  const [pdfRenderKey, setPdfRenderKey] = useState(0);

  // ✅ Cached local PDF path (native)
  const [pdfLocalUri, setPdfLocalUri] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState<number>(0);

  // grid vs list
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // sorting
  const [sortKey, setSortKey] = useState<"name" | "date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setLoading(true);
        setError(null);

        const id = basePropertyId;
        const res = await fetch(`${APP_API_BASE_URL}/file/property/${id}`);
        if (!res.ok) throw new Error(`API error ${res.status}`);

        const data: ApiResponse = await res.json();
        const fileList = data?.files?.[0]?.files ?? [];

        const mapped: DocumentItem[] = fileList.map((f, index) => {
          const mime = f.file_type;
          const name = f.file_name;
          const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "FILE";
          const isImage = mime?.startsWith("image/");

          const uploadedAt = f.uploaded_at || null;
          const ts = uploadedAt ? new Date(uploadedAt).getTime() : 0;

          return {
            id: index + 1,
            title: name,
            subtitle: ext,
            imageUrl: isImage ? f.file_url : DEFAULT_ICON_URL,
            fileType: mime,
            fileUrl: f.file_url,
            uploadedAt,
            uploadedAtTs: isNaN(ts) ? 0 : ts,
          };
        });

        setDocuments(mapped);
      } catch (e) {
        console.log(e);
        setError("Failed to load files");
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, [basePropertyId]);

  const folders = useMemo(() => {
    const pdfs: DocumentItem[] = [];
    const images: DocumentItem[] = [];
    const others: DocumentItem[] = [];

    documents.forEach((d) => {
      if (d.fileType === "application/pdf") pdfs.push(d);
      else if (d.fileType?.startsWith("image/")) images.push(d);
      else others.push(d);
    });

    return {
      pdf: { title: "Plans", items: pdfs },
      images: { title: "Images", items: images },
      others: { title: "Other Files", items: others },
    };
  }, [documents]);

  // ✅ Ensure we always have an active tab (first non-empty folder)
  useEffect(() => {
    if (activeFolder) return;

    const order: FolderKey[] = ["pdf", "images", "others"];
    const first = order.find((k) => folders[k].items.length > 0) || null;
    if (first) setActiveFolder(first);
  }, [folders, activeFolder]);

  // load persisted prefs when folder changes
  useEffect(() => {
    const loadPrefs = async () => {
      if (!activeFolder) return;

      try {
        const key = getPrefsKey(basePropertyId, activeFolder);
        const raw = await AsyncStorage.getItem(key);

        if (!raw) {
          if (activeFolder === "images") {
            setSortKey("date");
            setSortOrder("desc");
          } else {
            setSortKey("name");
            setSortOrder("asc");
          }
          setViewMode("grid");
          setVisibleCount(PAGE_SIZE);
          return;
        }

        const parsed = JSON.parse(raw) as {
          sortKey?: "name" | "date";
          sortOrder?: "asc" | "desc";
          viewMode?: "grid" | "list";
        };

        if (parsed.sortKey) setSortKey(parsed.sortKey);
        if (parsed.sortOrder) setSortOrder(parsed.sortOrder);
        if (parsed.viewMode) setViewMode(parsed.viewMode);

        setVisibleCount(PAGE_SIZE);
      } catch (e) {
        console.log("Failed to load prefs", e);
        setVisibleCount(PAGE_SIZE);
      }
    };

    loadPrefs();
  }, [activeFolder, basePropertyId]);

  // save prefs whenever sort/view changes
  useEffect(() => {
    const savePrefs = async () => {
      if (!activeFolder) return;

      try {
        const key = getPrefsKey(basePropertyId, activeFolder);
        const payload = JSON.stringify({
          sortKey,
          sortOrder,
          viewMode,
        });
        await AsyncStorage.setItem(key, payload);
      } catch (e) {
        console.log("Failed to save prefs", e);
      }
    };

    savePrefs();
  }, [sortKey, sortOrder, viewMode, activeFolder, basePropertyId]);

  const openExternal = async (url: string) => {
    try {
      if (Platform.OS === "web") {
        // @ts-ignore
        window.open(url, "_blank");
        return;
      }
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert("Unable to open file");
    } catch {
      Alert.alert("Error opening file");
    }
  };

  const openImagePreview = (url: string) => {
    setPreviewImageUrl(url);
    setPreviewVisible(true);
  };

  // ✅ download + cache and then open instantly
  const downloadPdfToCache = async (remoteUrl: string) => {
    const url = (remoteUrl || "").trim();
    if (!url) return null;

    const localPath = makePdfCachePath(url);

    try {
      const info = await FileSystem.getInfoAsync(localPath);
      if (info.exists && info.size && info.size > 0) {
        return info.uri;
      }

      setPdfProgress(0);

      const dl = FileSystem.createDownloadResumable(
        url,
        localPath,
        {},
        (p) => {
          if (!p.totalBytesExpectedToWrite) return;
          const progress = p.totalBytesWritten / p.totalBytesExpectedToWrite;
          setPdfProgress(progress);
        }
      );

      const res = await dl.downloadAsync();
      return res?.uri ?? null;
    } catch (e) {
      console.log("PDF download/cache failed", e);
      return null;
    }
  };

  const openPdfPreview = async (url: string) => {
    setPdfError(null);
    setPdfLoading(true);
    setPdfLocalUri(null);
    setPdfProgress(0);

    setPreviewPdfUrl(url);
    setPdfPreviewVisible(true);

    if (Platform.OS === "web") {
      setPdfCandidates([googleViewerNg(url)]);
      setPdfAttempt(0);
      setPdfRenderKey((k) => k + 1);
      setPdfLoading(false);
      return;
    }

    const localUri = await downloadPdfToCache(url);

    if (localUri) {
      setPdfLocalUri(localUri);
      setPdfLoading(false);

      try {
        const supported = await Linking.canOpenURL(localUri);
        if (supported) await Linking.openURL(localUri);
      } catch (e) {
        console.log("Failed to open local PDF", e);
      }
      return;
    }

    const candidates = buildPdfViewerCandidates(url);
    setPdfCandidates(candidates);
    setPdfAttempt(0);
    setPdfRenderKey((k) => k + 1);
    setPdfLoading(false);
  };

  const handleOpenItem = (item: DocumentItem) => {
    if (item.fileType?.startsWith("image/")) {
      openImagePreview(item.fileUrl);
      return;
    }
    if (item.fileType === "application/pdf") {
      openPdfPreview(item.fileUrl);
      return;
    }

    if (Platform.OS === "web") {
      webDownload(item.fileUrl, item.title);
      return;
    }

    openExternal(item.fileUrl);
  };

  const sortItems = (items: DocumentItem[]) => {
    const sorted = [...items].sort((a, b) => {
      if (sortKey === "name") {
        const cmp = a.title.localeCompare(b.title);
        return sortOrder === "asc" ? cmp : -cmp;
      } else {
        const cmp = a.uploadedAtTs - b.uploadedAtTs;
        return sortOrder === "asc" ? cmp : -cmp;
      }
    });
    return sorted;
  };

  const folderIconMap: Record<FolderKey, string> = {
    pdf: "📄",
    images: "🖼️",
    others: "📎",
  };

  const toggleSortOrder = () => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));

  const currentPdfUri =
    pdfCandidates.length > 0
      ? pdfCandidates[Math.min(pdfAttempt, pdfCandidates.length - 1)]
      : null;

  const tryNextPdfCandidate = (reason: string, nativeEvent?: any) => {
    console.log("PDF preview failed:", reason, nativeEvent);

    if (pdfAttempt + 1 < pdfCandidates.length) {
      setPdfAttempt((prev) => prev + 1);
      setPdfLoading(true);
      setPdfError(null);
      setPdfRenderKey((k) => k + 1);
      return;
    }

    setPdfLoading(false);
    setPdfError("PDF preview blocked inside the app. Tap Open to view it.");
  };

  const availableTabs = useMemo(() => {
    const order: FolderKey[] = ["pdf", "images", "others"];
    return order
      .filter((k) => folders[k].items.length > 0)
      .map((k) => ({
        key: k,
        title: folders[k].title,
        count: folders[k].items.length,
        emoji: folderIconMap[k],
      }));
  }, [folders]);

  const onTabPress = (k: FolderKey) => {
    setActiveFolder(k);
    setVisibleCount(PAGE_SIZE);
    setViewMode("grid");
  };

  const renderList = (items: DocumentItem[]) => {
    const sorted = sortItems(items);
    const visibleItems = sorted.slice(0, visibleCount);

    return (
      <View>
        {visibleItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.listItem}
            onPress={() => handleOpenItem(item)}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.listIcon} />
            <View style={{ flex: 1 }}>
              <TText style={styles.listTitle} numberOfLines={1}>
                {item.title}
              </TText>
              <TText style={styles.listSubtitle}>
                {item.subtitle}
                {item.uploadedAt ? ` • ${item.uploadedAt.slice(0, 10)}` : ""}
              </TText>
            </View>
          </TouchableOpacity>
        ))}

        {items.length > visibleItems.length && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length))}
          >
            <TText style={styles.loadMoreText}>
              Load more ({items.length - visibleItems.length} remaining)
            </TText>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderGrid = (items: DocumentItem[]) => {
    const sorted = sortItems(items);
    const visibleItems = sorted.slice(0, visibleCount);

    return (
      <View>
        <View style={styles.folderGrid}>
          {visibleItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.gridItem}
              onPress={() => handleOpenItem(item)}
            >
              <Image source={{ uri: item.imageUrl }} style={styles.documentImage} />
              <TText numberOfLines={2} style={styles.documentTitle}>
                {item.title}
              </TText>
              <TText style={styles.documentSubtitle}>
                {item.subtitle}
                {item.uploadedAt ? ` • ${item.uploadedAt.slice(0, 10)}` : ""}
              </TText>
            </TouchableOpacity>
          ))}
        </View>

        {items.length > visibleItems.length && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, items.length))}
          >
            <TText style={styles.loadMoreText}>
              Load more ({items.length - visibleItems.length} remaining)
            </TText>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const activeItems = activeFolder ? folders[activeFolder].items : [];

  return (
    <SafeAreaView style={styles.container} testID="property-history-root">
      {loading ? (
        <ActivityIndicator size="large" color={C.primaryStrong} style={{ marginTop: 30 }} />
      ) : error ? (
        <TText style={styles.error}>{error}</TText>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* (optional debug) */}
          {/* <TText>propertyId={basePropertyId} projectId={resolvedProjectId}</TText> */}

          {availableTabs.length > 0 && (
            <View style={styles.tabsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInner}>
                {availableTabs.map((t) => {
                  const isActive = t.key === activeFolder;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                      onPress={() => onTabPress(t.key)}
                      activeOpacity={0.85}
                    >
                      <TText style={[styles.tabText, isActive && styles.tabTextActive]}>
                        {t.emoji} {t.title}
                      </TText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {activeFolder && (
            <View style={styles.topControlsRow}>
              <View style={styles.sortRow}>
                <TText style={styles.sortLabel}>Sort:</TText>

                <TouchableOpacity
                  style={[styles.sortBtn, sortKey === "name" && styles.sortBtnActive]}
                  onPress={() => setSortKey("name")}
                >
                  <TText style={[styles.sortBtnText, sortKey === "name" && styles.sortBtnTextActive]}>Name</TText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sortBtn, sortKey === "date" && styles.sortBtnActive]}
                  onPress={() => setSortKey("date")}
                >
                  <TText style={[styles.sortBtnText, sortKey === "date" && styles.sortBtnTextActive]}>Date</TText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sortOrderBtn} onPress={toggleSortOrder}>
                  <Ionicons
                    name={sortOrder === "asc" ? "arrow-up-circle-outline" : "arrow-down-circle-outline"}
                    size={20}
                    color={C.primaryStrong}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.viewToggleRow}>
                <TouchableOpacity
                  style={[styles.viewToggleBtn, viewMode === "list" && styles.activeViewBtn]}
                  onPress={() => setViewMode("list")}
                >
                  <TText style={[styles.viewToggleText, viewMode === "list" && styles.activeViewText]}>List</TText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.viewToggleBtn, viewMode === "grid" && styles.activeViewBtn]}
                  onPress={() => setViewMode("grid")}
                >
                  <TText style={[styles.viewToggleText, viewMode === "grid" && styles.activeViewText]}>Grid</TText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeFolder ? viewMode === "grid" ? renderGrid(activeItems) : renderList(activeItems) : (
            <TText style={styles.error}>No files found.</TText>
          )}
        </ScrollView>
      )}

      {/* IMAGE PREVIEW MODAL WITH ZOOM */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={styles.previewCloseButton} onPress={() => setPreviewVisible(false)}>
            <TText style={styles.previewCloseText}>✕</TText>
          </TouchableOpacity>

          {previewImageUrl && (
            <ReactNativeZoomableView
              maxZoom={3}
              minZoom={1}
              zoomStep={0.5}
              initialZoom={1}
              bindToBorders={true}
              style={styles.zoomContainer}
            >
              <Image source={{ uri: previewImageUrl }} style={styles.previewImage} resizeMode="contain" />
            </ReactNativeZoomableView>
          )}
        </View>
      </Modal>

      {/* PDF PREVIEW MODAL */}
      <Modal visible={pdfPreviewVisible} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          <TouchableOpacity
            style={styles.previewCloseButton}
            onPress={() => {
              setPdfPreviewVisible(false);
              setPreviewPdfUrl(null);
              setPdfError(null);
              setPdfLoading(true);
              setPdfCandidates([]);
              setPdfAttempt(0);
              setPdfLocalUri(null);
              setPdfProgress(0);
            }}
          >
            <TText style={styles.previewCloseText}>✕</TText>
          </TouchableOpacity>

          {previewPdfUrl && (
            <TouchableOpacity style={styles.openExternalBtn} onPress={() => openExternal(previewPdfUrl)}>
              <Ionicons name="open-outline" size={18} color="#fff" />
              <TText style={styles.openExternalText}>Open</TText>
            </TouchableOpacity>
          )}

          <View style={styles.pdfContainer}>
            {pdfLocalUri ? (
              <View style={styles.pdfInfoBox}>
                <Ionicons name="checkmark-circle-outline" size={26} color={C.white} />
                <TText style={styles.pdfInfoText}>PDF opened in your device viewer.</TText>
                <TText style={styles.pdfInfoSubText}>Next time it will open instantly (cached).</TText>
              </View>
            ) : currentPdfUri ? (
              <>
                {pdfLoading && (
                  <View style={styles.pdfLoadingOverlay}>
                    <ActivityIndicator size="large" color={C.white} />
                    {Platform.OS !== "web" && pdfProgress > 0 ? (
                      <TText style={styles.pdfLoadingText}>
                        Downloading… {Math.round(pdfProgress * 100)}%
                      </TText>
                    ) : (
                      <TText style={styles.pdfLoadingText}>
                        Loading PDF… ({pdfAttempt + 1}/{Math.max(pdfCandidates.length, 1)})
                      </TText>
                    )}
                  </View>
                )}

                {pdfError ? (
                  <View style={styles.pdfErrorBox}>
                    <TText style={styles.pdfErrorText}>{pdfError}</TText>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => {
                        setPdfError(null);
                        setPdfLoading(true);
                        setPdfAttempt(0);
                        setPdfRenderKey((k) => k + 1);
                      }}
                    >
                      <TText style={styles.retryText}>Retry</TText>
                    </TouchableOpacity>
                  </View>
                ) : Platform.OS === "web" ? (
                  // @ts-ignore (iframe only on web)
                  <iframe
                    key={`pdf-iframe-${pdfRenderKey}-${pdfAttempt}`}
                    src={currentPdfUri}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderWidth: 0,
                      borderStyle: "none",
                      borderColor: "transparent",
                      borderRadius: 12,
                      backgroundColor: "transparent",
                    }}
                    onLoad={() => setPdfLoading(false)}
                    onError={() => {
                      setPdfLoading(false);
                      setPdfError("PDF preview failed in web. Tap Open.");
                    }}
                  />
                ) : (
                  <WebView
                    key={`pdf-webview-${pdfRenderKey}-${pdfAttempt}`}
                    source={{ uri: currentPdfUri }}
                    style={styles.pdfWebView}
                    originWhitelist={["*"]}
                    mixedContentMode="always"
                    javaScriptEnabled
                    domStorageEnabled
                    setSupportMultipleWindows={false}
                    cacheEnabled
                    onLoadStart={() => setPdfLoading(true)}
                    onLoadEnd={() => setPdfLoading(false)}
                    onError={(e) => {
                      setPdfLoading(false);
                      tryNextPdfCandidate("onError", e?.nativeEvent);
                    }}
                    onHttpError={(e) => {
                      setPdfLoading(false);
                      tryNextPdfCandidate("onHttpError", e?.nativeEvent);
                    }}
                  />
                )}
              </>
            ) : (
              <View style={styles.pdfErrorBox}>
                <TText style={styles.pdfErrorText}>No PDF to preview.</TText>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------- STYLES ----------
const createStyles = (C: any) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg  },
  error: { color: C.danger, textAlign: "center", marginTop: 20 },

  tabsWrap: { marginBottom: 10 },
  tabsInner: { paddingVertical: 6, paddingHorizontal: 2 },

  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 10,
  },
  tabBtnActive: { backgroundColor: C.primaryStrong, borderColor: C.primaryStrong },
  tabText: { fontSize: 10, fontWeight: "700", color: C.text },
  // ✅ readable on blue
  tabTextActive: { color: "#fff" },

  topControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  sortRow: { flexDirection: "row", alignItems: "center" },
  sortLabel: { fontSize: 10, color: C.mutedText, marginRight: 4 },

  sortBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 4,
  },
  sortBtnActive: { backgroundColor: C.primaryStrong, borderColor: C.primaryStrong },
  sortBtnText: { fontSize: 10, color: C.text },
  sortBtnTextActive: { color: "#fff", fontWeight: "600" },
  sortOrderBtn: { marginLeft: 2, paddingHorizontal: 4, paddingVertical: 2 },

  viewToggleRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  viewToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: C.surfaceAlt,
    marginLeft: 6,
  },
  activeViewBtn: { backgroundColor: C.primaryStrong },
  viewToggleText: { color: C.text, fontWeight: "600" },
  activeViewText: { color: "#FFF" },

  folderGrid: { flexDirection: "row", flexWrap: "wrap" },
  gridItem: {
    flexBasis: "31%",
    marginHorizontal: "1%",
    padding: 10,
    marginBottom: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    backgroundColor: C.surface,
    elevation: 1,
  },

  documentImage: { width: 60, height: 60, borderRadius: 6, marginBottom: 6 },
  documentTitle: { fontSize: 11, fontWeight: "500", textAlign: "center", color: C.text },
  documentSubtitle: { fontSize: 10, color: C.mutedText, textAlign: "center" },

  previewOverlay: {
    flex: 1,
    backgroundColor: C.overlayStrong,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomContainer: { width, height, justifyContent: "center", alignItems: "center" },
  previewImage: { width: width * 0.92, height: height * 0.72, borderRadius: 12 },

  previewCloseButton: { position: "absolute", top: 40, right: 20, zIndex: 20 },
  previewCloseText: { color: "#FFF", fontSize: 15, fontWeight: "700" },

  pdfContainer: { width: width, height: height, paddingTop: 70 },
  pdfWebView: { flex: 1, backgroundColor: "transparent" },

  pdfLoadingOverlay: { position: "absolute", top: 120, left: 0, right: 0, alignItems: "center", zIndex: 10 },
  pdfLoadingText: { color: "#fff", marginTop: 10, fontWeight: "600" },

  pdfErrorBox: { marginTop: 120, alignItems: "center", paddingHorizontal: 24 },
  pdfErrorText: { color: "#fff", fontSize: 10, textAlign: "center", marginBottom: 10 },

  retryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.primaryStrong },
  retryText: { color: "#fff", fontWeight: "700" },

  openExternalBtn: {
    position: "absolute",
    top: 42,
    left: 18,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.primaryStrong,
  },
  openExternalText: { color: "#fff", marginLeft: 6, fontWeight: "700" },

  pdfInfoBox: { marginTop: 140, alignItems: "center", paddingHorizontal: 24 },
  pdfInfoText: { color: "#fff", fontSize: 10, fontWeight: "700", marginTop: 8, textAlign: "center" },
  // ✅ was dark-on-dark, now readable
  pdfInfoSubText: { color: C.subtleText, fontSize: 10, marginTop: 6, textAlign: "center" },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 10,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  listIcon: { width: 42, height: 42, marginRight: 12, borderRadius: 6 },
  listTitle: { fontSize: 10, fontWeight: "600", color: C.text },
  listSubtitle: { fontSize: 11, color: C.mutedText },

  loadMoreBtn: { paddingVertical: 10, alignItems: "center", marginTop: 4 },
  loadMoreText: { color: C.primaryStrong, fontWeight: "600" },
});
