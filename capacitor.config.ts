import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.facescan.app',
  appName: 'FaceScan',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Camera: {
      saveToGallery: false
    }
  },
  backgroundColor: '#0F172A'
};

export default config;
