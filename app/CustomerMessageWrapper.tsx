import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import CustomerChats from './CustomerChats';
import TText from "@/components/TText";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function CustomerMessagesWrapper() {
  const { theme } = useTheme();
  const C = theme.colors;
  const params = useLocalSearchParams();

  const propertyId = Array.isArray(params.propertyId) ? params.propertyId[0] : params.propertyId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;

  let userDetails = null;
  try {
    const rawUserDetails = Array.isArray(params.userDetails) ? params.userDetails[0] : params.userDetails;
    userDetails = rawUserDetails ? JSON.parse(decodeURIComponent(rawUserDetails)) : null;
  } catch (e) {
    console.warn('Failed to parse userDetails:', e);
  }

  if (!propertyId || !userDetails || !projectId) {
    return (
      <View testID="customer-message-wrapper-missing" style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <TText style={{ color: C.text }}>Missing propertyId, userDetails, or projectId</TText>
      </View>
    );
  }

  return (
    <View testID="customer-message-wrapper-root" style={{ flex: 1, backgroundColor: C.bg }}>
      <CustomerChats
        propertyId={propertyId}
        projectId={projectId}
        userDetails={userDetails}
      />
    </View>
  );
}