import { Capacitor } from '@capacitor/core';

const APP_PACKAGE = 'com.facescan.app';

/** Opens the system app settings screen on native devices. */
export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const intentUrl = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${APP_PACKAGE};scheme=package;end`;
    window.location.href = intentUrl;
    return;
  }

  if (platform === 'ios') {
    window.location.href = 'app-settings:';
  }
}
