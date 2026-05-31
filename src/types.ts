export interface ScanResult {
  id: string;
  photoBase64: string;
  name: string;
  studentId?: string;
  confidence: number;
  timestamp: string;
  status: 'success' | 'warning' | 'error'; // success (>= 75%), warning (50-74%), error (< 50%)
}

export type ScreenState = 'camera' | 'results';

export type CameraDirectionType = 'front' | 'rear';
