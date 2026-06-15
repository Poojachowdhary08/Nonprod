import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useState, useEffect } from "react";
import { 
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFontScale } from "@/context/FontScaleContext";
import TText from "@/components/TText";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
// Define the expected data type for an inventory item
interface InventoryItem {
  id: string;
  parsed_item_name: string;
  item_name: string;
  location: string;
  warehouse: string;
  parsed_warehouse?: string;
  parsed_location?: string;
  created_date?: string;
}

const InventoryScreen: React.FC = () => {
  const router = useRouter(); // ✅ Use router instead of navigation
  const params = useLocalSearchParams();
  console.log ("params in inventory screen",params)

  const employeeDetails = params.employee_details
    ? JSON.parse(
        Array.isArray(params.employee_details)
          ? params.employee_details[0]
          : params.employee_details
      )
    : {};
    console.log("🧠 Parsed employeeDetails:", employeeDetails);

  
    const [numColumns, setNumColumns] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [data, setData] = useState<InventoryItem[]>([]);
  const filteredData = useSmartSearch({
    data,
    query: searchQuery,
    keys: ["parsed_item_name", "parsed_warehouse", "parsed_location"],
  });
  


  const [isLoading, setIsLoading] = useState<boolean>(true);

  const API_URL = `${APP_API_BASE_URL}/all-inventory`;

  useEffect(() => {
    fetchInventory();

    const handleResize = () => {
      const screenWidth = Dimensions.get("window").width;
      setNumColumns(screenWidth < 600 ? 1 : screenWidth < 900 ? 2 : 3);
    };

    handleResize();
    const subscription = Dimensions.addEventListener("change", handleResize);
    return () => subscription?.remove();
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await axios.get(API_URL);

      const parsedData: InventoryItem[] = response.data.inventory.map(
        (item: any) => ({
          id: item.id,
          parsed_item_name: item.parsed_item_name || "Unknown Item",
          item_name: item.item_name || "No Name",
          location: item.location || "Unknown Location",
          warehouse: item.warehouse || "Unknown Warehouse",
          parsed_warehouse: item.parsed_warehouse || "Unknown Warehouse",
          parsed_location: item.parsed_location || item.location,
          created_date: item.created_date || "Unknown Date",
        })
      );

      setData(parsedData);
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  
  const handleItemPress = (item: InventoryItem) => {  
    router.push({
      pathname: "/InventoryItemDetails",
      params: {
        parsed_item_name: item.parsed_item_name,
        parsed_warehouse: item.parsed_warehouse,
        parsed_location: item.parsed_location,
        employee_details: JSON.stringify(
          employeeDetails && Object.keys(employeeDetails).length > 0
            ? employeeDetails
            : params
        ),
        
      },
    });
  };
  

  const renderListItem = ({ item }: { item: InventoryItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleItemPress(item)}>
      <View style={styles.itemContent}>
        {/* <Image
          source={{
            uri: "https://asapsystems.com/wp-content/uploads/2023/04/introducing-the-new-site-transfer-transaction-1.jpg",
          }}
          style={styles.gridImage}
        /> */}
       <View style={styles.itemDetails}>
  <TText style={styles.itemName}>{item.item_name}</TText>

  <View style={styles.iconRow}>
    <Ionicons name="home-outline" size={20} color="#555" />
    <TText style={styles.itemLocation}>{item.warehouse}</TText>
  </View>

  <View style={styles.iconRow}>
    <Ionicons name="location-outline" size={20} color="#555" />
    <TText style={styles.itemLocation}>{item.location}</TText>
  </View>
</View>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
        <TText style={styles.loadingText}>Loading inventory...</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="inventory-screen-root">
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push("/HomeScreen"); // ✅ Go to home if no back history
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>

          <TText style={styles.headerTitle}>Inventory</TText>
        </View>

        <TouchableOpacity onPress={() => router.push("/HomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search inventory"
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filteredData}
        renderItem={renderListItem}
        keyExtractor={(item: any) => item.id || Math.random().toString()}
        contentContainerStyle={styles.listContainer}
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
    padding: 16,
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EAEAEA",
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "bold", marginLeft: 10 },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: { padding: 10, borderRadius: 8, backgroundColor: "#E4E4E4" },
  listContainer: { paddingHorizontal: 8 },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 16,
    elevation: 3,
    flexDirection: "row",
    boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.2)",
    alignItems: "center",
  },
  itemDetails: { flex: 1 },
  itemName: { 
    fontWeight: "700", fontSize: 14, color: "#2b2b2b", width: 320 },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  itemLocation: {
    color: "#555",
    marginLeft: 5, // Adds spacing between icon and text
  },  itemContent: { flexDirection: "row", alignItems: "center" },
  gridImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#E4E4E4",
    marginRight: 12,
  },
  loadingText: { marginTop: 10, fontSize: 16, color: "#6c63ff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});

export default InventoryScreen;