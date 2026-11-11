/** Where the app keeps its data for offline use on a phone. */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const offlineStorage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(key),
};
