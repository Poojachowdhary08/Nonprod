export type ThemeMode = "light" | "dark";
export type ThemePref = "system" | "custom" | ThemeMode;

export type ThemeSchedule = {
  darkStartMinutes: number;
  lightStartMinutes: number;
};

export type Theme = {
  mode: ThemeMode;
  colors: {
    bg: string;
    bgElevated: string;
    surface: string;
    surfaceAlt: string;
    card: string;
    text: string;
    mutedText: string;
    subtleText: string;
    border: string;
    borderStrong: string;

    primary: string;
    primaryStrong: string;
    primarySoft: string;
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;

    overlay: string;
    overlayStrong: string;
    sliderLine: string;
    tick: string;
    inputBg: string;
    inputFocusBg: string;
    headerBg: string;
    navBg: string;
    pill: string;

    navIconActive: string;
    navIconInactive: string;
    white: string;
  };
};

export const lightTheme: Theme = {
  mode: "light",
  colors: {
    bg: "#F6F7FB",
    bgElevated: "#EEF3F8",
    surface: "#FFFFFF",
    surfaceAlt: "#F8FAFC",
    card: "#FFFFFF",
    text: "#111827",
    mutedText: "#6B7280",
    subtleText: "#94A3B8",
    border: "rgba(0,0,0,0.08)",
    borderStrong: "rgba(0,0,0,0.14)",

    primary: "#2563eb",
    primaryStrong: "#1D4ED8",
    primarySoft: "#E8F0FF",
    success: "#22c55e",
    successSoft: "#F0FDF4",
    danger: "#ef4444",
    dangerSoft: "#FEF2F2",

    overlay: "rgba(0,0,0,0.25)",
    overlayStrong: "rgba(15,23,42,0.64)",
    sliderLine: "rgba(17,24,39,0.22)",
    tick: "rgba(17,24,39,0.22)",
    inputBg: "#F8FAFC",
    inputFocusBg: "#FFFFFF",
    headerBg: "#FFFFFF",
    navBg: "#FFFFFF",
    pill: "#F1F5F9",

    navIconActive: "#2563eb",
    navIconInactive: "#9aa0a6",
    white: "#FFFFFF",
  },
};

export const darkTheme: Theme = {
  mode: "dark",
  colors: {
    bg: "#0B1220",
    bgElevated: "#0F172A",
    surface: "#111827",
    surfaceAlt: "#172033",
    card: "#111827",
    text: "#E5E7EB",
    mutedText: "#9CA3AF",
    subtleText: "#64748B",
    border: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.18)",

    primary: "#60A5FA",
    primaryStrong: "#3B82F6",
    primarySoft: "rgba(59,130,246,0.18)",
    success: "#34d399",
    successSoft: "rgba(52,211,153,0.16)",
    danger: "#F87171",
    dangerSoft: "rgba(248,113,113,0.18)",

    overlay: "rgba(0,0,0,0.60)",
    overlayStrong: "rgba(2,6,23,0.78)",
    sliderLine: "rgba(229,231,235,0.22)",
    tick: "rgba(229,231,235,0.22)",
    inputBg: "#172033",
    inputFocusBg: "#1E293B",
    headerBg: "#111827",
    navBg: "#111827",
    pill: "#172033",

    navIconActive: "#60A5FA",
    navIconInactive: "#6b7280",
    white: "#FFFFFF",
  },
};
