// app/c.tsx

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

// Web-only OpenLayers support
let Map: any,
  TileLayer: any,
  OSM: any,
  ViewOL: any,
  Feature: any,
  Point: any,
  VectorLayer: any,
  VectorSource: any,
  Icon: any,
  Style: any,
  fromLonLat: any;

if (Platform.OS === "web") {
  Map = require("ol/Map").default;
  TileLayer = require("ol/layer/Tile").default;
  OSM = require("ol/source/OSM").default;
  ViewOL = require("ol/View").default;
  Feature = require("ol/Feature").default;
  Point = require("ol/geom/Point").default;
  VectorLayer = require("ol/layer/Vector").default;
  VectorSource = require("ol/source/Vector").default;
  Icon = require("ol/style/Icon").default;
  Style = require("ol/style/Style").default;
  fromLonLat = require("ol/proj").fromLonLat;
}

const DEFAULT_LAT = 16.4634167;
const DEFAULT_LNG = 80.7547222;

type Props = {
  propertyId?: string;
  propertyLocation?: string;
  online?: boolean;
};

const PropertyDetailsScreen: React.FC<Props> = ({
  propertyId = "",
  propertyLocation = "",
  online = true,
}) => {
  const { theme } = useTheme();
  const C = theme.colors;
  const styles = useMemo(() => createStyles(C), [C]);
  const cleanPropertyId = Array.isArray(propertyId) ? propertyId[0] : propertyId;
  const cleanLocation = Array.isArray(propertyLocation)
    ? propertyLocation[0]
    : propertyLocation;

  const [isLoading, setIsLoading] = useState(true);
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapFailed, setMapFailed] = useState(false);

  const geocodeLocation = useCallback(async (place: string): Promise<[number, number] | null> => {
    try {
      if (!place?.trim()) return null;

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        place
      )}`;

      const response = await fetch(url, {
        headers: {
          "Accept-Language": "en",
        },
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return null;

      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return [lat, lon];
        }
      }

      return null;
    } catch (error) {
      console.log("Geocode failed:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const getCoordinates = async () => {
      try {
        setIsLoading(true);

        if (!online) {
          if (mounted) setCoordinates(null);
          return;
        }

        if (!cleanLocation?.trim()) {
          if (mounted) setCoordinates(null);
          return;
        }

        const result = await geocodeLocation(cleanLocation);

        if (!mounted) return;

        if (result) {
          setCoordinates(result);
        } else {
          setCoordinates(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    getCoordinates();

    return () => {
      mounted = false;
    };
  }, [cleanLocation, geocodeLocation, online]);

  const lat = coordinates?.[0] ?? DEFAULT_LAT;
  const lng = coordinates?.[1] ?? DEFAULT_LNG;

  const openNavigation = useCallback(() => {
    if (!online) {
      Alert.alert("Offline", "Directions need internet.");
      return;
    }

    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    Linking.openURL(googleMapsUrl).catch(() => {
      Alert.alert("Error", "Could not open Maps.");
    });
  }, [lat, lng, online]);

  const nativeMapHtml = useMemo(() => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
          />
          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          />
          <style>
            html, body, #map {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #eef2f7;
            }
            .leaflet-container {
              width: 100%;
              height: 100%;
              font-family: sans-serif;
            }
          </style>
        </head>
        <body>
          <div id="map"></div>

          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
            (function () {
              var lat = ${lat};
              var lng = ${lng};

              var map = L.map('map', {
                zoomControl: true,
                attributionControl: true
              }).setView([lat, lng], 15);

              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
              }).addTo(map);

              L.marker([lat, lng]).addTo(map);

              setTimeout(function () {
                map.invalidateSize();
              }, 250);
            })();
          </script>
        </body>
      </html>
    `;
  }, [lat, lng]);

  return (
    <View style={styles.root} testID="property-details-screen-root">
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.primaryStrong} />
          <TText style={styles.loadingText}>Loading map...</TText>
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <TText style={styles.cardTitle}>🗺️ Location</TText>

            <View style={styles.coordPill}>
              <Ionicons name="pin-outline" size={14} color={C.primaryStrong} />
              <TText style={styles.coordPillText}>
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </TText>
            </View>
          </View>

          <TText style={styles.locationLine} numberOfLines={2}>
            {cleanLocation || "Location not available"}
          </TText>

          <View style={styles.mapShell}>
            {Platform.OS === "web" ? (
              <WebMap lat={lat} lng={lng} />
            ) : (
              <>
                {mapLoading && (
                  <View style={styles.mapOverlay}>
                    <ActivityIndicator size="small" color={C.primaryStrong} />
                    <TText style={styles.mapOverlayText}>Loading map view...</TText>
                  </View>
                )}

                {mapFailed ? (
                  <View style={styles.mapErrorBox}>
                    <Ionicons name="alert-circle-outline" size={22} color={C.danger} />
                    <TText style={styles.mapErrorText}>
                      Map preview could not load on mobile.
                    </TText>
                  </View>
                ) : (
                  <WebView
                    originWhitelist={["*"]}
                    source={{ html: nativeMapHtml }}
                    style={styles.map}
                    javaScriptEnabled
                    domStorageEnabled
                    startInLoadingState
                    mixedContentMode="always"
                    setSupportMultipleWindows={false}
                    onLoadStart={() => {
                      setMapLoading(true);
                      setMapFailed(false);
                    }}
                    onLoadEnd={() => {
                      setMapLoading(false);
                    }}
                    onError={(syntheticEvent) => {
                      console.log("Map WebView error:", syntheticEvent?.nativeEvent);
                      setMapLoading(false);
                      setMapFailed(true);
                    }}
                    onHttpError={(syntheticEvent) => {
                      console.log("Map WebView HTTP error:", syntheticEvent?.nativeEvent);
                      setMapLoading(false);
                      setMapFailed(true);
                    }}
                  />
                )}
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, !online && styles.primaryBtnDisabled]}
            onPress={openNavigation}
            activeOpacity={0.85}
          >
            <Ionicons
              name="navigate-outline"
              size={18}
              color={C.white}
              style={{ marginRight: 6 }}
            />
            <TText style={styles.primaryBtnText}>Open Directions</TText>
          </TouchableOpacity>

          {!online && (
            <TText style={styles.mapHint}>
              Offline: geocoding and directions are disabled.
            </TText>
          )}

          {online && !coordinates && (
            <TText style={styles.mapHint}>
              Could not find exact coordinates for "{cleanLocation || "-"}", showing default location.
            </TText>
          )}

          <TText style={styles.hiddenText}>{cleanPropertyId}</TText>
        </View>
      )}
    </View>
  );
};

const WebMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const mapId = React.useMemo(() => `map_${Math.random().toString(16).slice(2)}`, []);

  useEffect(() => {
    if (!Map) return;

    const map = new Map({
      target: mapId,
      layers: [new TileLayer({ source: new OSM() })],
      view: new ViewOL({
        center: fromLonLat([lng, lat]),
        zoom: 12,
      }),
    });

    const marker = new Feature({
      geometry: new Point(fromLonLat([lng, lat])),
    });

    marker.setStyle(
      new Style({
        image: new Icon({
          src: "https://openlayers.org/en/latest/examples/data/icon.png",
          anchor: [0.5, 1],
        }),
      })
    );

    const vectorLayer = new VectorLayer({
      source: new VectorSource({
        features: [marker],
      }),
    });

    map.addLayer(vectorLayer);

    return () => {
      map.setTarget(undefined);
    };
  }, [lat, lng, mapId]);

  return (
    <div
      id={mapId}
      style={{
        width: "100%",
        height: 280,
        borderRadius: 16,
        overflow: "hidden",
      }}
    />
  );
};

const createStyles = (C: any) => StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    minHeight: 0,
    backgroundColor: C.bg,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },

  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: C.text,
  },

  locationLine: {
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
    color: C.mutedText,
  },

  coordPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.primarySoft,
    borderWidth: 1,
    borderColor: C.border,
  },

  coordPillText: {
    fontSize: 11,
    fontWeight: "900",
    color: C.primaryStrong,
  },

  mapShell: {
    height: 280,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    position: "relative",
  },

  map: {
    width: "100%",
    height: "100%",
    backgroundColor: C.surfaceAlt,
  },

  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.overlay,
  },

  mapOverlayText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: C.mutedText,
  },

  mapErrorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: C.surface,
  },

  mapErrorText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: C.danger,
    textAlign: "center",
  },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: C.primaryStrong,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },

  primaryBtnDisabled: {
    opacity: 0.6,
  },

  primaryBtnText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "900",
  },

  mapHint: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: C.mutedText,
  },

  loadingContainer: {
    height: 240,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },

  loadingText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: C.mutedText,
  },

  hiddenText: {
    height: 0,
    width: 0,
    opacity: 0,
  },
});

export default PropertyDetailsScreen;
