import { useSmartSearch } from "../hooks/useSmartSearch";
import React, { useState, useEffect } from 'react';
import { 
  View, TouchableOpacity, StyleSheet, FlatList, TextInput, Dimensions, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import TText from "@/components/TText";
import { useFontScale } from "@/context/FontScaleContext";

import { API_BASE_URL as APP_API_BASE_URL } from "../utils/apiBase";
import { authenticatedFetch } from "../utils/auth";
const CutomerProperties = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { projectId, projectName } = params;
  const userDetails = params;
  console.log("Propeties screen  project", params)

  const [data, setData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [numColumns, setNumColumns] = useState(1);

  const filteredData = useSmartSearch({
    data,
    query: searchQuery,
    keys: ['name', 'subtype', 'assignedemployee'],
  });

  const API_URL = `${APP_API_BASE_URL}/projects_m/${projectId}/properties`;

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const response = await authenticatedFetch(API_URL);
        const jsonData = await response.json();
        setData(jsonData.properties || []);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    fetchProperties();

    const handleResize = () => {
      const screenWidth = Dimensions.get("window").width;
      setNumColumns(screenWidth < 600 ? 1 : screenWidth < 900 ? 2 : 3);
    };

    handleResize();
    const subscription = Dimensions.addEventListener("change", handleResize);
    return () => subscription?.remove();
  }, []);

  const handleSearch = (query: string) => setSearchQuery(query);

  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'in progress':
        return '#d1e7dd';
      case 'not started':
        return '#ffeeba';
      case 'available':
        return '#d1e7dd';
      case 'sold':
        return '#f8d7da';
      case 'pending':
        return '#fff3cd';
      case 'planning':
        return '#e0e7ff'; // light lavender
      case 'ongoing':
      case 'on going':
        return '#d1ecf1'; // light teal
      default:
        return '#e7e7ff';
    }
  };
  
  const getStatusTextColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'in progress':
      case 'available':
        return '#155724';
      case 'not started':
      case 'pending':
        return '#856404';
      case 'sold':
        return '#721c24';
      case 'planning':
        return '#5a4cdb'; // darker lavender
      case 'ongoing':
      case 'on going':
        return '#0c5460'; // teal text
      default:
        return '#6c63ff';
    }
  };
  

  const renderListItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.propertyCard}
      activeOpacity={0.8}
      onPress={() =>
        router.push({
          pathname: "/CustomerPropertiesListScreen",
          params: {
            propertyId: item.propertyid,
            projectId: projectId,
            projectLocation: params.projectLocation, // ✅ use from params, not item
            propertyName: item.name,
            userDetails: JSON.stringify(userDetails),
          },
        })
      }
    >
      <View style={styles.propertyDetails}>
        <TText style={styles.propertyName}>{item.name}</TText>
        <TText style={styles.subType}>{item.subtype}</TText>
        <TText style={styles.listedBy}>{item.assignedemployee}</TText>
      </View>

      <View
  style={[
    styles.statusContainer,
    {
      backgroundColor: getStatusColor(item.status || 'Available'),
      borderColor: getStatusTextColor(item.status || 'Available'),
    },
  ]}
>
  <TText style={[styles.statusText, { color: getStatusTextColor(item.status) }]}>
    {(item.status || 'Available').toUpperCase()}
  </TText>
</View>

    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6c63ff" />
        <TText style={styles.loadingText}>Loading properties...</TText>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="customer-properties-root">
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleContainer}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#5a5a5c" />
          </TouchableOpacity>
          <TText style={styles.headerTitle}>Properties</TText>
        </View>

        <TouchableOpacity onPress={() => router.push("/CustomerHomeScreen")}>
          <Ionicons name="home" size={24} color="#5a5a5c" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search properties"
          value={searchQuery}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={filteredData}
        renderItem={renderListItem}
        keyExtractor={(item: any) =>
          item.propertyid ? item.propertyid.toString() : Math.random().toString()
        }
        contentContainerStyle={styles.listContainer}
        numColumns={numColumns}
        key={numColumns}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9F9F9' },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
    justifyContent: 'space-between',
  },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 10 },
  searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
  searchInput: { padding: 10, borderRadius: 8, backgroundColor: '#E4E4E4' },
  listContainer: { paddingHorizontal: 8 },
  propertyCard: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    elevation: 3,
  },
  propertyDetails: { flexDirection: 'column' },
  propertyName: { fontWeight: '700', fontSize: 14, color: '#2b2b2b',textTransform:"capitalize" },
  subType: { fontWeight: '500', fontSize: 14, color: '#2b2b2b' },
  listedBy: { color: '#5a5a5c', fontSize: 14 },
  statusContainer: {
    position: 'absolute',
    top: 15,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: { fontWeight: '700', fontSize: 12 },
  loadingText: { marginTop: 10, fontSize: 16, color: '#6c63ff' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default CutomerProperties;
