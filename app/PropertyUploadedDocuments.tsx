import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Modal,
  Dimensions,
  SafeAreaView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

interface Document {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
}

const PropertyUploadedDocuments = () => {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([
    { id: 1, title: "Financial Report", subtitle: "PDF", imageUrl: "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png" },
    { id: 2, title: "Property Tax", subtitle: "PDF", imageUrl: "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png" },
    { id: 3, title: "Blueprint", subtitle: "JPEG", imageUrl: "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png" },
    { id: 4, title: "Mortgage Documents", subtitle: "PDF", imageUrl: "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png" },
    { id: 5, title: "Contract Agreement", subtitle: "PDF", imageUrl: "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png" },
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<Document | null>(null);
  const { width } = Dimensions.get("window");
  const numColumns = width > 600 ? 3 : 2; // ✅ Dynamically adjust columns

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png", "application/vnd.ms-excel"],
        copyToCacheDirectory: false,
      });

      if (result.canceled) return;

      setSelectedFile({
        id: documents.length + 1,
        title: result.assets[0].name || "Untitled Document",
        subtitle: result.assets[0].mimeType?.split("/")[1].toUpperCase() || "FILE",
        imageUrl: result.assets[0].mimeType?.startsWith("image")
          ? result.assets[0].uri
          : "https://cdn.usegalileo.ai/sdxl10/b3dc7877-4a8a-48df-972d-014d03411c70.png",
      });
    } catch (error) {
      console.error("File selection error:", error);
    }
  };

  const saveDocument = () => {
    if (selectedFile) {
      setDocuments([...documents, selectedFile]);
      setSelectedFile(null);
      setModalVisible(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="property-uploaded-documents-root">
      <TText style={styles.header}>Uploaded Documents</TText>

      {/* ✅ Replacing `FlatList` with `ScrollView` */}
      <ScrollView contentContainerStyle={styles.gridContainer}>
        {documents.map((item) => (
          <View key={item.id} style={styles.gridItem}>
            <Image source={{ uri: item.imageUrl }} style={styles.documentImage} />
            <TText style={styles.documentTitle}>{item.title}</TText>
            <TText style={styles.documentSubtitle}>{item.subtitle}</TText>
          </View>
        ))}
      </ScrollView>

      {/* Upload Button */}
      <TouchableOpacity style={styles.uploadButton} onPress={() => setModalVisible(true)}>
        <TText style={styles.uploadButtonText}>Upload New Document</TText>
      </TouchableOpacity>

      {/* Upload Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TText style={styles.modalTitle}>Upload Document</TText>

            {selectedFile ? (
              <View style={styles.filePreview}>
                <Image source={{ uri: selectedFile.imageUrl }} style={styles.fileImage} />
                <TText style={styles.fileName}>{selectedFile.title}</TText>
                <TText style={styles.fileType}>{selectedFile.subtitle}</TText>
              </View>
            ) : (
              <TText style={styles.noFileText}>No file selected</TText>
            )}

            <TouchableOpacity style={styles.browseButton} onPress={pickDocument}>
              <TText style={styles.browseButtonText}>Browse</TText>
            </TouchableOpacity>

            <View style={styles.buttonContainer}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <TText style={styles.cancelButtonText}>Cancel</TText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveDocument} disabled={!selectedFile}>
                <TText style={styles.saveButtonText}>Save</TText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  gridContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  gridItem: {
    flex: 1,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#a2a2a3",
  },
  documentImage: { width: 56, height: 56, borderRadius: 8, marginBottom: 8 },
  documentTitle: { fontSize: 14, fontWeight: "500", textAlign: "center" },
  documentSubtitle: { fontSize: 12, fontWeight: "400", textAlign: "center" },
  header: { textAlign: "center", fontSize: 18, fontWeight: "bold", marginVertical: 12 },
  uploadButton: { margin: 16, paddingVertical: 12, backgroundColor: "#4A90E2", borderRadius: 8, alignItems: "center" },
  uploadButtonText: { fontSize: 16, color: "#FFFFFF", fontWeight: "bold" },
  modalContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { width: 300, backgroundColor: "white", padding: 16, borderRadius: 8, alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  filePreview: { alignItems: "center", marginBottom: 10 },
  fileImage: { width: 56, height: 56, borderRadius: 8, marginBottom: 4 },
  fileName: { fontSize: 14, fontWeight: "500" },
  fileType: { fontSize: 12, color: "gray" },
  noFileText: { fontSize: 14, color: "gray", marginBottom: 10 },
  browseButton: { backgroundColor: '#4A90E2', padding: 10, borderRadius: 5, marginBottom: 10 },
  browseButtonText: { color: 'white', fontWeight: 'bold' },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: 'red' },
  saveButton: { padding: 10 },
  saveButtonText: { color: 'green', fontWeight: 'bold' },
});

export default PropertyUploadedDocuments;
