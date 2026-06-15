import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, Theme, ThemeMode, ThemePref, ThemeSchedule } from "./theme";

type Ctx = {
  theme: Theme;
  pref: ThemePref;
  schedule: ThemeSchedule;
  setPref: (p: ThemePref) => void;
  setSchedule: (next: ThemeSchedule) => void;
};

const ThemeContext = createContext<Ctx | null>(null);
const KEY = "APP_THEME_PREF";
const SCHEDULE_KEY = "APP_THEME_SCHEDULE";
const DEFAULT_SCHEDULE: ThemeSchedule = {
  darkStartMinutes: 19 * 60,
  lightStartMinutes: 7 * 60,
};

const isValidMinutes = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 24 * 60;

const normalizeSchedule = (raw: any): ThemeSchedule => ({
  darkStartMinutes: isValidMinutes(raw?.darkStartMinutes)
    ? raw.darkStartMinutes
    : DEFAULT_SCHEDULE.darkStartMinutes,
  lightStartMinutes: isValidMinutes(raw?.lightStartMinutes)
    ? raw.lightStartMinutes
    : DEFAULT_SCHEDULE.lightStartMinutes,
});

const resolveCustomMode = (schedule: ThemeSchedule, now: Date): ThemeMode => {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const { darkStartMinutes, lightStartMinutes } = schedule;

  if (darkStartMinutes === lightStartMinutes) return "dark";

  const isOvernight = darkStartMinutes > lightStartMinutes;
  const isDarkWindow = isOvernight
    ? currentMinutes >= darkStartMinutes || currentMinutes < lightStartMinutes
    : currentMinutes >= darkStartMinutes && currentMinutes < lightStartMinutes;

  return isDarkWindow ? "dark" : "light";
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme(); // "light" | "dark" | null
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [schedule, setScheduleState] = useState<ThemeSchedule>(DEFAULT_SCHEDULE);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      const [savedPref, savedSchedule] = await Promise.all([
        AsyncStorage.getItem(KEY),
        AsyncStorage.getItem(SCHEDULE_KEY),
      ]);

      if (
        savedPref === "light" ||
        savedPref === "dark" ||
        savedPref === "system" ||
        savedPref === "custom"
      ) {
        setPrefState(savedPref);
      }

      if (savedSchedule) {
        try {
          setScheduleState(normalizeSchedule(JSON.parse(savedSchedule)));
        } catch {}
      }
    })();
  }, []);

  useEffect(() => {
    if (pref !== "custom") return;
    const interval = setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => clearInterval(interval);
  }, [pref]);

  const setPref = async (p: ThemePref) => {
    setPrefState(p);
    await AsyncStorage.setItem(KEY, p);
  };

  const setSchedule = async (next: ThemeSchedule) => {
    const normalized = normalizeSchedule(next);
    setScheduleState(normalized);
    await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(normalized));
    setNowTick(Date.now());
  };

  const mode: ThemeMode = useMemo(() => {
    if (pref === "system") return system === "dark" ? "dark" : "light";
    if (pref === "custom") return resolveCustomMode(schedule, new Date(nowTick));
    return pref;
  }, [pref, schedule, system, nowTick]);

  const theme = useMemo(() => (mode === "dark" ? darkTheme : lightTheme), [mode]);

  return (
    <ThemeContext.Provider value={{ theme, pref, schedule, setPref, setSchedule }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
