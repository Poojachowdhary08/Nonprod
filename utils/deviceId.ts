import { Platform } from 'react-native';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

// AsyncStorage only works in native
let AsyncStorage: any;
if (Platform.OS !== 'web') {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

const STORAGE_KEY = 'device_id';

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      // 🔹 Web: use localStorage
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = uuidv4();
        localStorage.setItem(STORAGE_KEY, id);
        console.log('🆕 Created new web device_id:', id);
      } else {
        console.log('♻️ Using existing web device_id:', id);
      }
      return id;
    } else {
      // 🔹 Native: use AsyncStorage
      let id = await AsyncStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = uuidv4();
        await AsyncStorage.setItem(STORAGE_KEY, id);
        console.log('🆕 Created new native device_id:', id);
      } else {
        console.log('♻️ Using existing native device_id:', id);
      }
      return id;
    }
  } catch (e) {
    console.warn('⚠️ Failed to access persistent storage, using volatile device_id:', e);
    return uuidv4();
  }
}
