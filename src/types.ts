export interface ClassPredictionScore {
  classLabel: string;
  displayName: string;
  studentId?: string;
  confidence: number;
}

export interface ScanResult {
  id: string;
  photoBase64: string;
  name: string;
  studentId?: string;
  confidence: number;
  timestamp: string;
  status: 'success' | 'warning' | 'error';
  /** Top class label from the model (for debugging / display) */
  topClassLabel?: string;
  /** All class scores after analysis, highest first */
  classPredictions?: ClassPredictionScore[];
  /** Thresholds used when this scan was classified */
  thresholds?: {
    highPercent: number;
    lowPercent: number;
  };
}

export type ScreenState = 'camera' | 'results';

export type CameraDirectionType = 'front' | 'rear';
