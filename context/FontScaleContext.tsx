import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

type FontScaleCtx = {
  fontScale: number;
  setFontScale: (v: number) => void;
  fs: (n: number) => number;
};

const Ctx = createContext<FontScaleCtx | null>(null);

const KEY = "app_font_scale";
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const makeFS = (scale: number) => (n: number) => Math.round(n * scale * 10) / 10;

export const FontScaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontScale, _setFontScale] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        // If there is no saved value yet, keep the default (1.0) instead of
        // converting null -> 0 and clamping to the minimum.
        if (raw == null || raw.trim() === "") return;

        const v = Number(raw);
        if (Number.isFinite(v)) _setFontScale(clamp(v, 0.85, 1.4));
      } catch {}
    })();
  }, []);

  const setFontScale = useCallback(async (v: number) => {
    const next = clamp(v, 0.85, 1.4);
    _setFontScale(next);
    try {
      await AsyncStorage.setItem(KEY, String(next));
    } catch {}
  }, []);

  const fs = useMemo(() => makeFS(fontScale), [fontScale]);
  const value = useMemo(() => ({ fontScale, setFontScale, fs }), [fontScale, setFontScale, fs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export function useFontScale() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFontScale must be used inside FontScaleProvider");
  return v;
}
