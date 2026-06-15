import { View } from "react-native";
import React, { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import PropertyChats from "./PropertyChats";
import TText from "@/components/TText";
import {
  buildPropertyRouteContext,
  isPropertyRouteContextComplete,
  loadLastPropertyRouteContext,
} from "@/utils/propertyRouteContext";

export default function PropertyChatsWrapper() {
  const params = useLocalSearchParams();
  const routeContext = useMemo(() => buildPropertyRouteContext(params), [params]);
  const [fallbackContext, setFallbackContext] = useState<any>(null);

  useEffect(() => {
    let active = true;

    if (isPropertyRouteContextComplete(routeContext)) {
      setFallbackContext(null);
      return () => {
        active = false;
      };
    }

    loadLastPropertyRouteContext()
      .then((cached) => {
        if (active) setFallbackContext(cached);
      })
      .catch(() => {
        if (active) setFallbackContext(null);
      });

    return () => {
      active = false;
    };
  }, [routeContext]);

  const resolvedContext =
    isPropertyRouteContextComplete(routeContext) ? routeContext : fallbackContext;

  if (!isPropertyRouteContextComplete(resolvedContext)) {
    return <TText>Missing propertyId, userDetails, or projectId</TText>;
  }

  return (
    <View testID="property-chats-wrapper-root" style={{ flex: 1 }}>
      <PropertyChats
        propertyId={resolvedContext.propertyId}
        projectId={resolvedContext.projectId}
        userDetails={resolvedContext.userDetails}
      />
    </View>
  );
}
