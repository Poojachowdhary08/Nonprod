import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

type Props = React.ComponentProps<typeof ScrollView> & {
  refreshing: boolean;
  onRefresh: () => void | Promise<void>;
  pullLabel?: string;
  releaseLabel?: string;
};

const MAX_PULL = 120;
const TRIGGER_PULL = 82;
const HOLD_OFFSET = 56;

function getTouchY(event: any): number | null {
  const touches = event?.nativeEvent?.touches;
  if (!touches || !touches.length) return null;
  const point = touches[0];
  const y = Number(point?.clientY ?? point?.pageY ?? point?.screenY);
  return Number.isFinite(y) ? y : null;
}

export default function PullToRefreshScrollView({
  refreshing,
  onRefresh,
  pullLabel = "Pull to refresh",
  releaseLabel = "Release to refresh",
  contentContainerStyle,
  onScroll,
  scrollEventThrottle,
  children,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const C = theme.colors;
  const translateY = useRef(new Animated.Value(0)).current;
  const [pullDistance, setPullDistance] = useState(0);
  const [armed, setArmed] = useState(false);
  const scrollTopRef = useRef(0);
  const touchStartYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const webContentStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      contentContainerStyle,
      {
        paddingTop: 8,
      },
    ],
    [contentContainerStyle]
  );

  const animateTo = (value: number) => {
    Animated.spring(translateY, {
      toValue: value,
      useNativeDriver: true,
      speed: 18,
      bounciness: 6,
    }).start();
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (refreshing) {
      animateTo(HOLD_OFFSET);
      setPullDistance(HOLD_OFFSET);
      setArmed(false);
      return;
    }

    if (!pullingRef.current) {
      animateTo(0);
      setPullDistance(0);
      setArmed(false);
    }
  }, [refreshing]);

  const handleScroll = (event: any) => {
    scrollTopRef.current = Number(event?.nativeEvent?.contentOffset?.y || 0);
    onScroll?.(event);
  };

  const handleTouchStart = (event: any) => {
    if (Platform.OS !== "web" || refreshing) return;
    if (scrollTopRef.current > 0) {
      touchStartYRef.current = null;
      return;
    }
    touchStartYRef.current = getTouchY(event);
  };

  const handleTouchMove = (event: any) => {
    if (Platform.OS !== "web" || refreshing) return;
    if (scrollTopRef.current > 0) return;

    const startY = touchStartYRef.current;
    const currentY = getTouchY(event);
    if (startY === null || currentY === null) return;

    const rawDelta = currentY - startY;
    if (rawDelta <= 0) {
      if (pullingRef.current) {
        pullingRef.current = false;
        setArmed(false);
        setPullDistance(0);
        animateTo(0);
      }
      return;
    }

    pullingRef.current = true;
    const damped = Math.min(MAX_PULL, rawDelta * 0.45);
    setPullDistance(damped);
    setArmed(damped >= TRIGGER_PULL);
    translateY.setValue(damped);
  };

  const handleTouchEnd = () => {
    if (Platform.OS !== "web") return;
    touchStartYRef.current = null;

    if (!pullingRef.current) return;
    pullingRef.current = false;

    if (armed && !refreshing) {
      animateTo(HOLD_OFFSET);
      setPullDistance(HOLD_OFFSET);
      setArmed(false);
      void Promise.resolve(onRefresh());
      return;
    }

    setArmed(false);
    setPullDistance(0);
    animateTo(0);
  };

  if (Platform.OS !== "web") {
    return (
      <ScrollView
        {...rest}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle ?? 16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={C.primary}
            colors={[C.primary]}
          />
        }
      >
        {children}
      </ScrollView>
    );
  }

  const indicatorVisible = refreshing || pullDistance > 0;
  const indicatorLabel = refreshing ? "Refreshing..." : armed ? releaseLabel : pullLabel;

  return (
    <View style={styles.webWrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicatorWrap,
          {
            opacity: indicatorVisible ? 1 : 0,
            transform: [{ translateY: translateY.interpolate({
              inputRange: [0, MAX_PULL],
              outputRange: [-36, 10],
              extrapolate: "clamp",
            }) }],
          },
        ]}
      >
        <View
          style={[
            styles.indicatorPill,
            {
              backgroundColor: C.surface,
              borderColor: armed ? C.primaryStrong : C.border,
            },
          ]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={C.primaryStrong} />
          ) : (
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: armed ? "180deg" : "0deg",
                  },
                ],
              }}
            >
              <TText style={[styles.indicatorArrow, { color: C.primaryStrong }]}>↓</TText>
            </Animated.View>
          )}
          <TText style={[styles.indicatorText, { color: C.text }]}>{indicatorLabel}</TText>
        </View>
      </Animated.View>

      <Animated.View style={{ flex: 1, transform: [{ translateY }] }}>
        <ScrollView
          {...rest}
          contentContainerStyle={webContentStyle}
          onScroll={handleScroll}
          scrollEventThrottle={scrollEventThrottle ?? 16}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  webWrap: {
    flex: 1,
  },
  indicatorWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: "center",
  },
  indicatorPill: {
    minWidth: 168,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  indicatorArrow: {
    fontSize: 14,
    fontWeight: "800",
  },
  indicatorText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
