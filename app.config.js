// app.config.js (NON-PROD / DEV)

const GOOGLE_SERVICES_PATH = "./google-services.json";

export default ({ config }) => ({
  ...config,

  // 🔹 Different app name & slug so you can visually identify dev vs prod
  name: "AvenueConnect Dev",
  slug: "avenueconnect-dev",

  version: "2.0.47", // your dev versioning, totally fine
  icon: "./assets/images/icon.png",
  scheme: "myapp",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,

  // 👇 EAS CLI asked you to add this
  owner: "jaswanth-datso",

  ios: {
    supportsTablet: true,
    // 🔹 Different from prod so later iOS can have separate dev build if needed
    bundleIdentifier: "com.jaswanthdatso.AvenueMobileApp.dev",
    infoPlist: {
      NSCameraUsageDescription:
        "This app needs access to your camera to take photos for task updates.",
      NSPhotoLibraryUsageDescription:
        "This app needs access to your photo library to attach images.",
      NSPhotoLibraryAddUsageDescription:
        "This app needs permission to save images to your photo library.",
    },
  },

  android: {
    package: "com.datso.AvenueConnect.dev",
    versionCode: 145,
    permissions: [
      "CAMERA",
      "RECORD_AUDIO",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "ACCESS_MEDIA_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "INTERNET",
    ],
    googleServicesFile: GOOGLE_SERVICES_PATH,
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },

  plugins: [
    "expo-router",
    [
      "expo-speech-recognition",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to use the microphone.",
        speechRecognitionPermission: "Allow $(PRODUCT_NAME) to use speech recognition.",
        androidSpeechServicePackages: ["com.google.android.googlequicksearchbox"],
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/adaptive-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
    // ⭐ THIS is the missing piece — now Gradle will respect SDK 35
    [
      "expo-build-properties",
      {
        android: {
          targetSdkVersion: 35,
          compileSdkVersion: 35,
          minSdkVersion: 24,

        },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    router: {
      origin: false,
    },
    eas: {
      // 🔹 THIS links this folder to your new dev Expo project
      projectId: "f98f3814-7d81-40fb-a455-281174c20b82",
    },
  },
});
