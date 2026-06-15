import { Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";

const PDFViewer = () => {
  const { url } = useLocalSearchParams();

  if (Platform.OS === "web") {
    return (
      <iframe
        src={url as string}
        width="100%"
        height="100%"
        style={{ border: "none" }}
      />
    );
  }

  return (
    <WebView source={{ uri: url as string }} style={{ flex: 1 }} testID="pdfviewer-root" />
  );
};

export default PDFViewer;
