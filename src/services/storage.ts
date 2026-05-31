import { Preferences } from '@capacitor/preferences';
import { ScanResult } from '../types';

const HISTORY_KEY = 'facescan_history';

// Helper to check if Capacitor Preferences is available and working
async function isCapacitorAvailable(): Promise<boolean> {
  try {
    // Attempt a simple check
    await Preferences.get({ key: '_test_pref_' });
    return true;
  } catch {
    return false;
  }
}

export async function getScanHistory(): Promise<ScanResult[]> {
  try {
    const isCap = await isCapacitorAvailable();
    if (isCap) {
      const { value } = await Preferences.get({ key: HISTORY_KEY });
      if (value) {
        return JSON.parse(value) as ScanResult[];
      }
    } else {
      // Fallback for browser preview
      const localValue = localStorage.getItem(HISTORY_KEY);
      if (localValue) {
        return JSON.parse(localValue) as ScanResult[];
      }
    }
  } catch (error) {
    console.error('Error fetching scan history:', error);
    throw new Error('Unable to load history.');
  }
  return [];
}

export async function saveScanResult(result: ScanResult): Promise<void> {
  try {
    const history = await getScanHistory();
    // Add new result first (newest first)
    const updatedHistory = [result, ...history];
    const stringified = JSON.stringify(updatedHistory);

    const isCap = await isCapacitorAvailable();
    if (isCap) {
      await Preferences.set({
        key: HISTORY_KEY,
        value: stringified,
      });
    } else {
      // Fallback for browser preview
      localStorage.setItem(HISTORY_KEY, stringified);
    }
  } catch (error) {
    console.error('Error saving scan result:', error);
    throw new Error('Could not save scan to history.');
  }
}

export async function clearScanHistory(): Promise<void> {
  try {
    const isCap = await isCapacitorAvailable();
    if (isCap) {
      await Preferences.remove({ key: HISTORY_KEY });
    } else {
      localStorage.removeItem(HISTORY_KEY);
    }
  } catch (error) {
    console.error('Error clearing scan history:', error);
    throw new Error('Could not clear history.');
  }
}
