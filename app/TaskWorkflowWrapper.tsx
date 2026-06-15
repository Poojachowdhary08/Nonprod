import React, { useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import TaskWorkflow from './TaskWorkflow';
import { useFontScale } from "@/context/FontScaleContext";
import TText from '@/components/TText';
import { ThemeProvider, useTheme } from "@/src/theme/ThemeProvider";

const TaskWorkflowWrapper = () => {
  const { theme } = useTheme();
  const C = theme.colors;
  const router = useRouter();
  const { propertyId, userDetails } = useLocalSearchParams();

  const parsedUser = userDetails
    ? JSON.parse(decodeURIComponent(userDetails as string))
    : null;

  const handleBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.push('/HomeScreen');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }} testID="task-workflow-wrapper-root">
      <View style={[styles.headerContainer, { backgroundColor: C.headerBg, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <TText style={[styles.title, { color: C.text }]}>Task Workflow</TText>
        <TouchableOpacity onPress={() => router.push('/HomeScreen')}>
          <Ionicons name='home' size={24} color={C.mutedText} />
        </TouchableOpacity>
      </View>

      <View style={[styles.workflowContainer, { backgroundColor: C.surface, borderColor: C.border }]}>
  <TaskWorkflow
    propertyId={propertyId as string}
    userDetails={parsedUser}
  />
</View>

    </View>
  );
};

const styles = StyleSheet.create({
    headerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#EAEAEA',
        justifyContent: 'space-between',
      },
      workflowContainer: {
        flex: 1,
        borderWidth: 2,
        borderColor: 'white',
        borderRadius: 10,
        margin: 10,
        overflow: 'hidden', // optional, to clip TaskWorkflow content inside rounded corners
      },
      
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
    color: '#1D3557',
  },
});


export default TaskWorkflowWrapper;
