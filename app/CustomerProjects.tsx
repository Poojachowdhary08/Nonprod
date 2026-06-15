import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useState, useEffect } from "react";
import { 
  View, TouchableOpacity, StyleSheet, FlatList, Dimensions, Image, ActivityIndicator, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
const CustomerProjects = ({ navigation }: { navigation: any }) => {
  const router = useRouter();
  const params = useLocalSearchParams();
  console.log("Params in projects screen", params)
  const [numColumns, setNumColumns] = useState(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredProjects = useSmartSearch({
    data: projects,
    query: searchQuery,
    keys: ["project_name", "project_manager", "project_location_city"],
  });

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await authenticatedFetch(`${APP_API_BASE_URL}/projects_m`);
        if (!response.ok) {
          throw new Error("Failed to fetch projects");
        }
        const data = await response.json();
        setProjects(data.projects);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();

    const handleResize = () => {
      const screenWidth = Dimensions.get("window").width;
      setNumColumns(screenWidth < 600 ? 1 : screenWidth < 900 ? 2 : 3);
    };

    handleResize();
    const subscription = Dimensions.addEventListener("change", handleResize);
    return () => subscription?.remove();
  }, []);

  const handleSearch = (query: string) => setSearchQuery(query);

  const statusColors = (status: string) => {
    switch (status.toLowerCase()) {
      case "in progress":
      case "ongoing":
        return { background: "#e0f7fa", text: "#006064", border: "#006064" };
      case "completed":
        return { background: "#c8e6c9", text: "#1b5e20", border: "#1b5e20" };
      case "pending":
        return { background: "#fffde7", text: "#f57f17", border: "#f57f17" };
      case "planning":
        return { background: "#e7e7ff", text: "#6c63ff", border: "#6c63ff" };
      default:
        return { background: "#f0f0f0", text: "#333", border: "#333" };
    }
  };


  const renderGridItem = ({ item }: { item: any }) => {
    const { background, text, border } = statusColors(item.project_status);

    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() =>
          router.push({
            pathname: "/CustomerProperties",
            params: {
              projectId: item.project_id,
              projectLocation: item.project_location_city, // 👈 ADD THIS LINE
              ...params, // Optional: include existing params if needed
            },
          })
        }
      >
        <View style={styles.statusContainer}>
          <TText
            style={[
              styles.projectStatus,
              {
                color: text,
                borderColor: text, // Use text color as border color
                backgroundColor: background,
              },
            ]}
          >
            {item.project_status?.toUpperCase()}
          </TText>
        </View>


        <View style={styles.itemContent}>
          <Image
            source={{
              uri: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTqTOVYqIYxtSXKGAycExrfN72vNc4ZP6WtAw&s",
            }}
            style={styles.gridImage}
          />
          <View style={styles.textContainer}>
            <TText style={styles.propertyName}>{item.project_name}</TText>
            <TText style={styles.gridText}>{item.project_manager || "N/A"}</TText>
            <TText style={styles.gridText}>
              {item.project_location_city || "N/A"}
            </TText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
        <TText style={styles.loadingText}>Loading projects...</TText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <TText style={styles.errorText}>Error: {error}</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="customer-projects-root">
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
        </TouchableOpacity>
        <TText style={styles.headerTitle}>Projects </TText>
        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search projects"
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={filteredProjects}
        renderItem={renderGridItem}
        keyExtractor={(item: any) =>
          item.project_id?.toString() || Math.random().toString()
        }
        contentContainerStyle={styles.gridContainer}
        numColumns={numColumns}
        key={numColumns}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9F9F9" },

  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
    justifyContent: "space-between",
  },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: { padding: 10, borderRadius: 8, backgroundColor: "#E4E4E4" },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333333",
    marginLeft: 10,
    fontFamily: "Arial", // Updated font style
  },
  gridImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#E4E4E4",
    marginRight: 12,
  },
  propertyName: { fontWeight: "700", fontSize: 14, color: "#2b2b2b", textTransform: "capitalize" },
  clientName: { color: "#5a5a5c", fontSize: 12 },
  projectStatus: {
    fontWeight: "700",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    fontSize: 12,
    borderWidth: 1,
  },
  statusContainer: {
    position: "absolute",
    top: 15,
    right: 6,
    zIndex: 1,
  },
  gridContainer: { marginTop: 8, paddingHorizontal: 8 },
  gridItem: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    margin: 6,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  textContainer: { flex: 1 },
  gridText: { marginBottom: 4, color: "#4F4F4F" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#6c63ff" },
  errorText: { color: "#FF0000", fontSize: 16 },
});

export default CustomerProjects;
