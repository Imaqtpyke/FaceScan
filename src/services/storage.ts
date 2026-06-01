import { Preferences } from '@capacitor/preferences';
import { ScanResult } from '../types';

const HISTORY_KEY = 'facescan_history';

export async function getScanHistory(): Promise<ScanResult[]> {
  try {
    try {
      const { value } = await Preferences.get({ key: HISTORY_KEY });
      if (value) {
        return JSON.parse(value) as ScanResult[];
      }
      return [];
    } catch (prefError) {
      console.warn('Capacitor Preferences failed, falling back to localStorage:', prefError);
      const localValue = localStorage.getItem(HISTORY_KEY);
      if (localValue) {
        return JSON.parse(localValue) as ScanResult[];
      }
      return [];
    }
  } catch (error) {
    console.error('Error fetching scan history:', error);
    throw new Error('Unable to load history.');
  }
}

export async function saveScanResult(result: ScanResult): Promise<void> {
  try {
    const history = await getScanHistory();
    // Add new result first (newest first)
    const updatedHistory = [result, ...history];
    const stringified = JSON.stringify(updatedHistory);

    try {
      await Preferences.set({
        key: HISTORY_KEY,
        value: stringified,
      });
    } catch (prefError) {
      console.warn('Capacitor Preferences failed to save, falling back to localStorage:', prefError);
      localStorage.setItem(HISTORY_KEY, stringified);
    }
  } catch (error) {
    console.error('Error saving scan result:', error);
    throw new Error('Could not save scan to history.');
  }
}

export async function deleteScanResult(id: string): Promise<void> {
  try {
    const history = await getScanHistory();
    const updated = history.filter((item) => item.id !== id);
    const stringified = JSON.stringify(updated);

    try {
      await Preferences.set({ key: HISTORY_KEY, value: stringified });
    } catch (prefError) {
      console.warn('Capacitor Preferences failed to delete entry, falling back to localStorage:', prefError);
      localStorage.setItem(HISTORY_KEY, stringified);
    }
  } catch (error) {
    console.error('Error deleting scan result:', error);
    throw new Error('Could not delete scan entry.');
  }
}

export async function clearScanHistory(): Promise<void> {
  try {
    try {
      await Preferences.remove({ key: HISTORY_KEY });
    } catch (prefError) {
      console.warn('Capacitor Preferences failed to clear, falling back to localStorage:', prefError);
      localStorage.removeItem(HISTORY_KEY);
    }
  } catch (error) {
    console.error('Error clearing scan history:', error);
    throw new Error('Could not clear history.');
  }
}
