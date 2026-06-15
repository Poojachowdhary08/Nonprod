import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Dimensions,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";
import RNHTMLtoPDF from "react-native-html-to-pdf";
import { captureRef } from "react-native-view-shot";
import TText from "@/components/TText";
import ScheduleLockDialog from "@/components/ScheduleLockDialog";
import { buildScheduleLockState, findBlockingAncestor, isOnHoldStatus } from "@/utils/scheduleLocks";
import { useTheme } from "@/src/theme/ThemeProvider";
import { authenticatedFetch } from "@/utils/auth";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";

type NoteItem = {
  note_id: string;
  note_text: string;
  created_at: string;
  created_by: string;
};

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
  _synthetic?: boolean;
};

type Props = {
  propertyId: string;
  userDetails: string;
};

const escapePdfText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const encodeSvgDataUri = (svg: string) => {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
};

const wrapSvgText = (value: string, maxChars: number, maxLines = 2) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines.length ? lines : ["Untitled"];
};

const getExportTheme = (status?: string) => {
  const normalized = (status || "").toLowerCase();
  if (normalized.includes("complete")) {
    return { bg: "#DCFCE7", border: "#86EFAC", accent: "#16A34A" };
  }
  if (normalized.includes("progress")) {
    return { bg: "#DBEAFE", border: "#93C5FD", accent: "#2563EB" };
  }
  if (normalized.includes("hold")) {
    return { bg: "#FEE2E2", border: "#FCA5A5", accent: "#DC2626" };
  }
  return { bg: "#F8FAFC", border: "#CBD5E1", accent: "#64748B" };
};

const formatExportDate = (dateValue?: string) => {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  return isNaN(date.getTime()) ? "—" : format(date, "MMM d, yyyy");
};

const buildWorkflowSvgDataUri = (
  schedule: ScheduleItem[],
  edges: { from: number; to: number }[],
  nodeWidth: number,
  nodeHeight: number
) => {
  const padding = 48;
  const exportXScale = 0.62;
  const exportYScale = 0.46;
  const exportNodeWidth = Math.round(nodeWidth * 0.6);
  const exportNodeHeight = Math.round(nodeHeight * 0.58);
  const minX = Math.min(...schedule.map((item) => (item.x || 0) * exportXScale));
  const minY = Math.min(...schedule.map((item) => (item.y || 0) * exportYScale));
  const maxX = Math.max(...schedule.map((item) => (item.x || 0) * exportXScale + exportNodeWidth));
  const maxY = Math.max(...schedule.map((item) => (item.y || 0) * exportYScale + exportNodeHeight));
  const width = Math.max(760, maxX - minX + padding * 2);
  const height = Math.max(420, maxY - minY + padding * 2);
  const xOf = (x?: number) => (x || 0) * exportXScale - minX + padding;
  const yOf = (y?: number) => (y || 0) * exportYScale - minY + padding;

  const edgeSvg = edges
    .map((edge) => {
      const from = schedule.find((item) => item.scheduleid === edge.from);
      const to = schedule.find((item) => item.scheduleid === edge.to);
      if (!from || !to) return "";

      const x1 = xOf(from.x) + exportNodeWidth / 2;
      const y1 = yOf(from.y) + exportNodeHeight;
      const x2 = xOf(to.x) + exportNodeWidth / 2;
      const y2 = yOf(to.y);
      const midY = y1 + (y2 - y1) / 2;

      return `
        <path d="M ${x1} ${y1} V ${midY} H ${x2} V ${y2}" fill="none" stroke="#94A3B8" stroke-width="2" />
        <circle cx="${x2}" cy="${y2}" r="4" fill="#94A3B8" />
      `;
    })
    .join("");

  const nodeSvg = schedule
    .map((item) => {
      const theme = getExportTheme(item.status);
      const x = xOf(item.x);
      const y = yOf(item.y);
      const titleLines = wrapSvgText(item.phasename || "Untitled", 24, 2);
      const titleSvg = titleLines
        .map(
          (line, index) =>
            `<tspan x="${x + 11}" dy="${index === 0 ? 0 : 12}">${escapeXml(line)}</tspan>`
        )
        .join("");

      return `
        <g>
          <rect x="${x}" y="${y}" width="${exportNodeWidth}" height="${exportNodeHeight}" rx="7" fill="${theme.bg}" stroke="${theme.border}" stroke-width="1.1" />
          <rect x="${x}" y="${y + 8}" width="3.5" height="${exportNodeHeight - 16}" rx="2" fill="${theme.accent}" />
          <text x="${x + 11}" y="${y + 19}" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#111827">${titleSvg}</text>
          <text x="${x + 11}" y="${y + 46}" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#475569">PLANNED START</text>
          <text x="${x + 11}" y="${y + 57}" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#111827">${escapeXml(formatExportDate(item.exp_startdate))}</text>
          <text x="${x + 92}" y="${y + 46}" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#475569">PLANNED END</text>
          <text x="${x + 92}" y="${y + 57}" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#111827">${escapeXml(formatExportDate(item.exp_enddate))}</text>
          <text x="${x + 11}" y="${y + 73}" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#475569">ACTUAL START</text>
          <text x="${x + 11}" y="${y + 84}" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#111827">${escapeXml(formatExportDate(item.startdate))}</text>
          <text x="${x + 92}" y="${y + 73}" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#475569">ACTUAL END</text>
          <text x="${x + 92}" y="${y + 84}" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" fill="#111827">${escapeXml(formatExportDate(item.enddate))}</text>
        </g>
      `;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#F8FAFC" />
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;

  return encodeSvgDataUri(svg);
};

const dataUriToBytes = (dataUri: string) => {
  const base64 = dataUri.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getJpegSize = (bytes: Uint8Array) => {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return { width: 1200, height: 800 };
};

const ensureJpegDataUri = (dataUri: string) => {
  if (/^data:image\/jpe?g/i.test(dataUri)) {
    return Promise.resolve(dataUri);
  }

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not create image canvas"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    image.onerror = () => reject(new Error("Could not prepare graph image"));
    image.src = dataUri;
  });
};

const buildGraphPdfBlob = (jpegDataUri: string, title: string) => {
  const encoder = new TextEncoder();
  const imageBytes = dataUriToBytes(jpegDataUri);
  const imageSize = getJpegSize(imageBytes);
  const pageWidth = 842;
  const margin = 36;
  const titleHeight = 32;
  const maxImageWidth = pageWidth - margin * 2;
  const scale = Math.min(maxImageWidth / imageSize.width, 1.6);
  const drawWidth = imageSize.width * scale;
  const drawHeight = imageSize.height * scale;
  const pageHeight = Math.max(595, drawHeight + margin * 2 + titleHeight);
  const imageX = (pageWidth - drawWidth) / 2;
  const imageY = margin;
  const titleY = pageHeight - margin - 18;
  const contentBytes = encoder.encode(
    [
      `BT /F1 18 Tf ${margin} ${titleY} Td (${escapePdfText(title)}) Tj ET`,
      `q ${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${imageX.toFixed(2)} ${imageY.toFixed(2)} cm /Im1 Do Q`,
    ].join("\n")
  );
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let position = 0;

  const addBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    position += bytes.length;
  };
  const addText = (text: string) => addBytes(encoder.encode(text));
  const addObject = (id: number, body: string) => {
    offsets[id] = position;
    addText(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const addStreamObject = (id: number, dictionary: string, stream: Uint8Array) => {
    offsets[id] = position;
    addText(`${id} 0 obj\n<< ${dictionary} /Length ${stream.length} >>\nstream\n`);
    addBytes(stream);
    addText("\nendstream\nendobj\n");
  };

  addText("%PDF-1.4\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  addObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  addObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im1 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`
  );
  addStreamObject(
    4,
    `/Type /XObject /Subtype /Image /Width ${imageSize.width} /Height ${imageSize.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
    imageBytes
  );
  addStreamObject(5, "", contentBytes);
  addObject(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const xrefOffset = position;
  const objectCount = 7;
  addText(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let i = 1; i < objectCount; i++) {
    addText(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  addText(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: "application/pdf" });
};

const downloadWebBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const TaskWorkflow = ({ propertyId }: Props) => {
  const { theme: appTheme } = useTheme();
  const nav = useRouter();
  const C = appTheme.colors;
  const { width: winW, height: winH } = Dimensions.get("window");
  const isMobile = winW < 768;

  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 160;
  const xSpacing = 340;
  const ySpacing = 240;

  const params = useLocalSearchParams();
  const user = params.userDetails ? JSON.parse(params.userDetails as string) : null;

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [edges, setEdges] = useState<{ from: number; to: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [canvasSize, setCanvasSize] = useState({ width: winW * 3, height: winH * 3 });

  const zoomableRef = useRef<any>(null);
  const graphRef = useRef<View>(null);
  const [zoom, setZoom] = useState(isMobile ? 0.6 : 0.8);
  const [isExporting, setIsExporting] = useState(false);

  const [selectedTask, setSelectedTask] = useState<ScheduleItem | null>(null);
  const [modalType, setModalType] = useState<"hold" | "resume" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonType, setReasonType] = useState<"Customer" | "Avenue" | "">("");

  const [lockedTask, setLockedTask] = useState<ScheduleItem | null>(null);

  const STATUS_THEMES: Record<string, any> = {
    completed: { bg: C.successSoft, border: "rgba(34,197,94,0.35)", accent: C.success },
    "in progress": { bg: C.primarySoft, border: "rgba(59,130,246,0.35)", accent: C.primaryStrong },
    inprogress: { bg: C.primarySoft, border: "rgba(59,130,246,0.35)", accent: C.primaryStrong },
    pending: { bg: C.pill, border: C.border, accent: C.primaryStrong },
    Pending: { bg: C.pill, border: C.border, accent: C.primaryStrong },
    hold: { bg: C.dangerSoft, border: "rgba(239,68,68,0.22)", accent: C.danger },
    "on hold": { bg: C.dangerSoft, border: "rgba(239,68,68,0.22)", accent: C.danger },
    unknown: { bg: C.surfaceAlt, border: C.border, accent: C.navIconInactive },
  };

  const lockState = useMemo(() => buildScheduleLockState(schedule), [schedule]);
  const workflowLockState = useMemo(
    () =>
      buildScheduleLockState(
        schedule.map((item) =>
          isOnHoldStatus(item.status) ? item : { ...item, status: "" }
        )
      ),
    [schedule]
  );

  const goToWorkflow = useCallback(() => {
    setLockedTask(null);
    nav.push({
      pathname: "/TaskWorkflowWrapper",
      params: {
        propertyId,
        userDetails: encodeURIComponent(JSON.stringify(user || {})),
      },
    });
  }, [nav, propertyId, user]);

  const projectSummary = useMemo(() => {
    if (!schedule.length) return { progress: 0, plannedStart: "—", actualEnd: "—" };

    const realTasks = schedule.filter((s) => !s._synthetic);
    if (!realTasks.length) return { progress: 0, plannedStart: "—", actualEnd: "—" };

    let totalCompletion = 0;
    let minPlannedStart: Date | null = null;
    let maxActualEnd: Date | null = null;

    realTasks.forEach((task) => {
      const status = task.status?.toLowerCase() || "";
      totalCompletion += status.includes("complete") ? 100 : task.completion_percentage || 0;

      if (task.exp_startdate) {
        const d = new Date(task.exp_startdate);
        if (!isNaN(d.getTime()) && (!minPlannedStart || d < minPlannedStart)) {
          minPlannedStart = d;
        }
      }

      if (task.enddate) {
        const d = new Date(task.enddate);
        if (!isNaN(d.getTime()) && (!maxActualEnd || d > maxActualEnd)) {
          maxActualEnd = d;
        }
      }
    });

    return {
      progress: Math.round(totalCompletion / realTasks.length),
      plannedStart: minPlannedStart ? format(minPlannedStart, "MMM d, yyyy") : "—",
      actualEnd: maxActualEnd ? format(maxActualEnd, "MMM d, yyyy") : "—",
    };
  }, [schedule]);

  const formatDate = (d?: string) => {
    if (!d) return "—";
    const date = new Date(d);
    return isNaN(date.getTime()) ? "—" : format(date, "MMM d, yyyy");
  };

  const fetchScheduleAndNotes = async () => {
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
          layout(
            cid,
            x + idx * xSpacing - ((children.length - 1) * xSpacing) / 2,
            y + ySpacing
          );
        });
      };

      const roots = data.schedule.filter((n: any) => !n.depends_on_scheduleid?.length);

      const initialXOffset = 1000;
      const initialYOffset = 100;
      const minNodeGap = 24;

      roots.forEach((r: any, i: number) => layout(r.scheduleid, initialXOffset + i * xSpacing, initialYOffset));

      const rows = new Map<number, ScheduleItem[]>();
      positioned.forEach((node) => {
        const rowKey = Math.round((node.y || 0) / ySpacing);
        if (!rows.has(rowKey)) rows.set(rowKey, []);
        rows.get(rowKey)!.push(node);
      });

      rows.forEach((rowNodes) => {
        rowNodes.sort((a, b) => (a.x || 0) - (b.x || 0));
        for (let i = 1; i < rowNodes.length; i++) {
          const prev = rowNodes[i - 1];
          const current = rowNodes[i];
          const minAllowedX = (prev.x || 0) + NODE_WIDTH + minNodeGap;
          if ((current.x || 0) < minAllowedX) {
            current.x = minAllowedX;
          }
        }
      });

      setSchedule(positioned);

      if (positioned.length > 0) {
        const maxX = Math.max(...positioned.map((n) => (n.x || 0) + NODE_WIDTH + 1000));
        const maxY = Math.max(...positioned.map((n) => (n.y || 0) + NODE_HEIGHT + 1000));
        setCanvasSize({ width: maxX, height: maxY });
      } else {
        setCanvasSize({ width: winW * 3, height: winH * 3 });
      }

      const edgeList: { from: number; to: number }[] = [];
      data.schedule.forEach((item: any) => {
        (item.depends_on_scheduleid || []).forEach((dep: any) =>
          edgeList.push({ from: dep, to: item.scheduleid })
        );
      });
      setEdges(edgeList);
    } catch (e) {
      console.error("fetchScheduleAndNotes error:", e);
      Alert.alert("Error", "Could not fetch workflow data");
    } finally {
      setIsLoading(false);
    }
  };

  const openHoldLogsScreen = () => {
    nav.push({
      pathname: "/TaskHoldLogsScreen",
      params: {
        propertyId,
      },
    } as any);
  };

  const exportGraphAsPdf = async () => {
    if (!schedule.length) {
      Alert.alert("Export unavailable", "There is no workflow graph to export yet.");
      return;
    }

    if (!graphRef.current || isExporting) return;

    setIsExporting(true);
    try {
      const fileName = `task-workflow-${propertyId}-${Date.now()}.pdf`;

      if (Platform.OS === "web") {
        const graphSvgDataUri = buildWorkflowSvgDataUri(schedule, edges, NODE_WIDTH, NODE_HEIGHT);
        const jpegDataUri = await ensureJpegDataUri(graphSvgDataUri);
        const pdfBlob = buildGraphPdfBlob(jpegDataUri, "Task Workflow Graph");
        downloadWebBlob(pdfBlob, fileName);
        return;
      }

      const uri = await captureRef(graphRef.current, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      const imageBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const pdf = await RNHTMLtoPDF.convert({
        html: `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>
                @page { margin: 24px; }
                body {
                  margin: 0;
                  font-family: Arial, sans-serif;
                  color: #111827;
                  background: #ffffff;
                }
                h1 {
                  font-size: 18px;
                  margin: 0 0 16px;
                }
                img {
                  width: 100%;
                  height: auto;
                  display: block;
                }
              </style>
            </head>
            <body>
              <h1>Task Workflow Graph</h1>
              <img src="data:image/png;base64,${imageBase64}" />
            </body>
          </html>
        `,
        fileName: fileName.replace(/\.pdf$/i, ""),
        directory: "Documents",
      });

      if (!pdf.filePath) {
        throw new Error("PDF file path was not returned");
      }

      const exportUri = pdf.filePath.startsWith("file://") ? pdf.filePath : `file://${pdf.filePath}`;

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(exportUri, {
          mimeType: "application/pdf",
          dialogTitle: "Download workflow graph PDF",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("PDF exported", exportUri);
      }
    } catch (e) {
      console.error("exportGraphAsPdf error:", e);
      Alert.alert("Export failed", "Could not export the workflow graph as PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleHoldResumeAction = async () => {
    if (!reason || (modalType === "hold" && !reasonType)) {
      Alert.alert("Required", "Please fill in all fields.");
      return;
    }

    const endpoint = modalType === "hold" ? "hold-schedule" : "resume-schedule";
    const body = new FormData();

    body.append("scheduleid", selectedTask?.scheduleid.toString() || "");
    body.append("propertyid", propertyId);

    if (modalType === "hold") {
      body.append("hold_type", reasonType);
      body.append("hold_reason", reason);
      body.append("hold_by_email", user?.email || "");
    } else {
      body.append("resume_reason", reason);
      body.append("resumed_by_email", user?.email || "");
    }

    try {
      const res = await authenticatedFetch(`${APP_API_BASE_URL}/${endpoint}`, {
        method: "POST",
        body,
      });

      if (res.ok) {
        setModalType(null);
        setReason("");
        setReasonType("");
        fetchScheduleAndNotes();
      } else {
        Alert.alert("Error", "Action failed");
      }
    } catch (e) {
      console.error("handleHoldResumeAction error:", e);
      Alert.alert("Error", "Action failed");
    }
  };

  const openTaskForm = (item: ScheduleItem) => {
    if (item._synthetic) return;

    if (workflowLockState.lockedIds.has(item.scheduleid)) {
      setLockedTask(item);
      return;
    }

    const scheduleMap = new Map<number, ScheduleItem>();
    schedule.forEach((task) => scheduleMap.set(task.scheduleid, task));
    const blockingParent = findBlockingAncestor(scheduleMap, lockState.onHoldIds, item);

    nav.push({
      pathname: "/TaskManagementForm",
      params: {
        schedule: encodeURIComponent(JSON.stringify(item)),
        ...user,
        isLocked: blockingParent ? "true" : "false",
        lockingParentName: blockingParent?.phasename ?? "",
        lockingParentStatus: blockingParent?.status ?? "",
      },
    });
  };

  useEffect(() => {
    fetchScheduleAndNotes();
  }, [propertyId]);

  const openTaskMenu = (item: ScheduleItem) => {
    if (workflowLockState.downstreamIds.has(item.scheduleid)) {
      setLockedTask(item);
      return;
    }

    setSelectedTask(item);
    const isOnHold = isOnHoldStatus(item.status);
    setModalType(isOnHold ? "resume" : "hold");
  };

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]} testID="task-workflow-root">
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
          <Pressable style={[styles.iconBtn, { backgroundColor: C.surfaceAlt }]} onPress={fetchScheduleAndNotes}>
            <Ionicons name="refresh-outline" size={22} color={C.text} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: C.surfaceAlt }, isExporting && styles.disabledBtn]}
            onPress={exportGraphAsPdf}
            disabled={isExporting}
          >
            <Ionicons name="download-outline" size={22} color={C.text} />
          </Pressable>
          <Pressable style={[styles.iconBtn, { backgroundColor: C.surfaceAlt }]} onPress={openHoldLogsScreen}>
            <Ionicons name="list-outline" size={22} color={C.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.canvasWrapper}>
        <ReactNativeZoomableView
          ref={zoomableRef}
          initialZoom={zoom}
          minZoom={0.2}
          maxZoom={2.5}
          contentWidth={canvasSize.width}
          contentHeight={canvasSize.height}
          bindToBorders={false}
          panToMove={true}
          pinchToZoom={true}
          doubleTapZoomToCenter={true}
          style={{ backgroundColor: C.bg }}
        >
          <View
            ref={graphRef}
            collapsable={false}
            style={{ width: canvasSize.width, height: canvasSize.height, backgroundColor: C.bg }}
          >
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
                      { left: x1, top: y1, width: 2, height: (y2 - y1) / 2 },
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
                      },
                    ]}
                  />
                  <View style={[styles.arrowHead, { left: x2 - 4, top: y2 - 6 }]} />
                </React.Fragment>
              );
            })}

            {schedule.map((item) => {
              const isBlocked = workflowLockState.lockedIds.has(item.scheduleid);
              const isDownstreamBlocked = workflowLockState.downstreamIds.has(item.scheduleid);
              const isOnHold = workflowLockState.onHoldIds.has(item.scheduleid);
              const theme = STATUS_THEMES[item.status?.toLowerCase()] || STATUS_THEMES.unknown;

              return (
                <View key={item.scheduleid} style={[styles.nodeContainer, { left: item.x, top: item.y }]}>
                  <Animated.View
                    entering={FadeInDown}
                    style={[
                      styles.nodeCard,
                      {
                        backgroundColor: theme.bg,
                        borderColor: isBlocked ? C.borderStrong : theme.border,
                      },
                    ]}
                  >
                    <Pressable onPress={() => openTaskForm(item)} style={StyleSheet.absoluteFill} />

                    <View
                      style={[
                        styles.statusAccent,
                        { backgroundColor: isBlocked ? C.navIconInactive : theme.accent },
                      ]}
                    />

                    <View style={styles.nodeHeader}>
                      <TText style={[styles.nodeTitle, { color: C.text }]}>{item.phasename}</TText>
                      {!isDownstreamBlocked && (
                        <Pressable onPress={() => openTaskMenu(item)} hitSlop={15}>
                          <Ionicons name="ellipsis-vertical" size={20} color={C.text} />
                        </Pressable>
                      )}
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

                    {isBlocked && (
                      <View pointerEvents="none" style={styles.blockedOverlay}>
                        <Ionicons name="lock-closed" size={18} color={C.mutedText} />
                        <TText style={[styles.blockedText, { color: C.mutedText }]}>
                          {isOnHold ? "On hold" : "Waiting on parent hold"}
                        </TText>
                      </View>
                    )}
                  </Animated.View>
                </View>
              );
            })}
          </View>
        </ReactNativeZoomableView>
      </View>

      <View style={styles.zoomControls}>
        <Pressable style={[styles.zoomBtn, { backgroundColor: C.surface }]} onPress={() => zoomableRef.current?.zoomBy(0.2)}>
          <Ionicons name="add" size={24} color={C.text} />
        </Pressable>
        <Pressable style={[styles.zoomBtn, { backgroundColor: C.surface }]} onPress={() => zoomableRef.current?.zoomBy(-0.2)}>
          <Ionicons name="remove" size={24} color={C.text} />
        </Pressable>
      </View>

      <Modal visible={modalType !== null} transparent animationType="fade">
        <View style={[styles.modalBackdrop, { backgroundColor: C.overlayStrong }]}>
          <View style={[styles.holdDialogCard, { backgroundColor: C.surface }]}>
            <TText style={[styles.dialogTitle, { color: C.text }]}>
              {modalType === "hold" ? "Hold Task" : "Resume Task"}
            </TText>
            <TText style={[styles.dialogSub, { color: C.mutedText }]}>{selectedTask?.phasename}</TText>

            {modalType === "hold" && (
              <View>
                <TText style={[styles.typeLabel, { color: C.mutedText }]}>Hold Type</TText>
                <View style={[styles.holdTypeRow, { backgroundColor: C.surfaceAlt }]}>
                  {(["Customer", "Avenue"] as const).map((type) => {
                    const active = reasonType === type;
                    return (
                      <Pressable
                        key={type}
                        style={[styles.holdTypeBtn, active && { backgroundColor: C.primaryStrong }]}
                        onPress={() => setReasonType(type)}
                      >
                        <TText style={[styles.holdTypeText, { color: active ? C.white : C.mutedText }]}>
                          {type}
                        </TText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            <TextInput
              placeholder="Enter Reason"
              placeholderTextColor={C.subtleText}
              style={[
                styles.inputField,
                {
                  height: 80,
                  textAlignVertical: "top",
                  color: C.text,
                  backgroundColor: C.inputBg,
                  borderColor: C.border,
                },
              ]}
              multiline
              value={reason}
              onChangeText={setReason}
            />

            <View style={styles.dialogActions}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: C.surfaceAlt }]}
                onPress={() => setModalType(null)}
              >
                <TText style={{ color: C.text }}>Cancel</TText>
              </Pressable>

              <Pressable
                style={[styles.actionBtn, { backgroundColor: C.primaryStrong }]}
                onPress={handleHoldResumeAction}
              >
                <TText style={{ color: C.white, fontWeight: "bold" }}>Submit</TText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScheduleLockDialog
        visible={!!lockedTask}
        phaseName={lockedTask?.phasename}
        onClose={() => setLockedTask(null)}
        onGoToWorkflow={goToWorkflow}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
    zIndex: 100,
  },

  headerLabel: { fontSize: 13, color: "#666", fontWeight: "500" },
  headerSubLabel: { fontSize: 9, color: "#999", fontWeight: "700" },
  headerDateText: { fontSize: 11, color: "#333", fontWeight: "700" },

  headerActions: { flexDirection: "row", gap: 12, alignItems: "center" },

  iconBtn: {
    flexDirection: "row",
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },

  disabledBtn: {
    opacity: 0.5,
  },

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
    backgroundColor: "#FFF",
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

  nodeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  nodeTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
  },

  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
  },

  dateItem: { width: "50%" },
  dateLabel: { fontSize: 10, color: "#000", fontWeight: "500" },
  dateValue: { fontSize: 11, fontWeight: "600", color: "#000", marginTop: 2 },

  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },

  blockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
    marginTop: 4,
  },

  edgeLine: {
    position: "absolute",
    backgroundColor: "#CBD5E1",
  },

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
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowOpacity: 0.2,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  holdDialogCard: {
    backgroundColor: "#FFF",
    width: "85%",
    borderRadius: 20,
    padding: 25,
    gap: 15,
  },

  dialogTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#000",
  },

  dialogSub: {
    color: "#666",
    fontSize: 13,
    marginTop: -10,
  },

  inputField: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 15,
    backgroundColor: "#F9FAFB",
  },

  typeLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 8,
  },

  holdTypeRow: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: 14,
  },

  holdTypeBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  holdTypeText: {
    fontSize: 12,
    fontWeight: "800",
  },

  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 10,
  },

  actionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
});

export default TaskWorkflow;
