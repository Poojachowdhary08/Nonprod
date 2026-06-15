import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface RegisterOptions {
  employee_code: string;
  serverUrl: string; 
}


const PUSH_TOKEN_STORAGE_KEY = "last_registered_push_token";

export const useRegisterPushToken = ({ employee_code, serverUrl }: RegisterOptions) => {
  useEffect(() => {
    const register = async () => {
      try {
        if (Platform.OS === "web") {
          console.log("🔇 Skipping push token registration on web");
          return;
        }

        if (!Device.isDevice) {
          console.warn("🚫 Must use physical device for push notifications");
          return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== "granted") {
          console.warn("🚫 Push notification permission not granted");
          return;
        }

        const { data: token } = await Notifications.getExpoPushTokenAsync();

        const previousToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
        if (previousToken === token) {
          console.log("🔁 Push token already registered");
          return;
        }

        const platform = Platform.OS;
        const device_id = Constants.deviceName || "unknown";

        const response = await fetch(`${serverUrl}/register-push-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_code, token, platform, device_id }),
        });

        if (!response.ok) {
          throw new Error(`Failed to register push token: ${await response.text()}`);
        }

        await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
        console.log("✅ Push token registered to backend");

      } catch (err: any) {
        console.error("❌ Error in push token registration:", err.message || err);
      }
    };

    if (employee_code && serverUrl) {
      register();
    }
  }, [employee_code, serverUrl]);
};