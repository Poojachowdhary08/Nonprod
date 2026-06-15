import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

const ImageViewer = () => {
    const { url } = useLocalSearchParams();
    const imageUrl = Array.isArray(url) ? url[0] : url;
    

  return (
    <View style={styles.container} testID="image-viewer-root">
<Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
</View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: "100%" }
});

export default ImageViewer;
