import * as faceapi from 'face-api.js';
import * as tmImage from '@teachablemachine/image';
import personsData from '../data/persons.json';
import { CONFIDENCE_THRESHOLDS, THRESHOLD_LABELS } from '../config/thresholds';
import type { ClassPredictionScore } from '../types';

const modelUrl = '/model/model.json';
const metadataUrl = '/model/metadata.json';
const weightsUrl = '/model/weights.bin';

interface ResolvedMatch {
  name: string;
  studentId?: string;
  confidence: number;
  status: 'success' | 'warning' | 'error';
}

export interface ClassificationResult extends ResolvedMatch {
  topClassLabel: string;
  classPredictions: ClassPredictionScore[];
  thresholds: {
    highPercent: number;
    lowPercent: number;
  };
}

function mapToClassScore(classLabel: string, probability: number): ClassPredictionScore {
  const confidence = Math.round(probability * 100);
  if (classLabel === 'Class 31') {
    return {
      classLabel,
      displayName: 'Environment (no face)',
      confidence,
    };
  }
  const person = personsData.find((p) => p.classLabel === classLabel);
  return {
    classLabel,
    displayName: person?.name ?? classLabel,
    studentId: person?.studentId ?? undefined,
    confidence,
  };
}

function buildClassificationResult(
  topClassLabel: string,
  topProbability: number,
  allPredictions: Array<{ className: string; probability: number }>
): ClassificationResult {
  const resolved = resolvePrediction(topClassLabel, topProbability);
  const classPredictions = allPredictions
    .map((p) => mapToClassScore(p.className, p.probability))
    .sort((a, b) => b.confidence - a.confidence);

  return {
    ...resolved,
    topClassLabel,
    classPredictions,
    thresholds: { ...THRESHOLD_LABELS },
  };
}

export let faceApiAvailable = true;

let loadedModel: tmImage.CustomMobileNet | null = null;
let faceApiModelsLoaded = false;
let modelLoadingErrorOccurred = false;

const FACE_API_MODEL_URI = '/face-api-models/ssd_mobilenetv1';

export async function loadFaceApiModels(): Promise<void> {
  if (faceApiModelsLoaded) return;
  const modelUrl = `${window.location.origin}/face-api-models/ssd_mobilenetv1`;
  console.log('Loading face-api from:', modelUrl);
  try {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(modelUrl);
    console.log('face-api loaded successfully');
    faceApiModelsLoaded = true;
    faceApiAvailable = true;
  } catch (err) {
    console.error('face-api load failed:', err);
    faceApiAvailable = false;
  }
}

/** Load Teachable Machine + face-api.js SSD models (required before capture). */
export async function loadAllModels(): Promise<void> {
  await Promise.all([loadTeachableMachineModel(), loadFaceApiModels()]);
}

/**
 * Load the model from local assets offline
 */
export async function loadTeachableMachineModel(): Promise<tmImage.CustomMobileNet> {
  if (loadedModel) return loadedModel;

  try {
    // Resolve asset URLs utilizing Vite's ?url syntax
    const modelResponse = await fetch(modelUrl);
    if (!modelResponse.ok) throw new Error(`Failed to fetch model.json: ${modelResponse.statusText}`);
    const modelBlob = await modelResponse.blob();
    const modelFile = new File([modelBlob], 'model.json', { type: 'application/json' });

    const metadataResponse = await fetch(metadataUrl);
    if (!metadataResponse.ok) throw new Error(`Failed to fetch metadata.json: ${metadataResponse.statusText}`);
    const metadataBlob = await metadataResponse.blob();
    const metadataFile = new File([metadataBlob], 'metadata.json', { type: 'application/json' });

    const weightsResponse = await fetch(weightsUrl);
    if (!weightsResponse.ok) throw new Error(`Failed to fetch weights.bin: ${weightsResponse.statusText}`);
    const weightsBlob = await weightsResponse.blob();
    const weightsFile = new File([weightsBlob], 'weights.bin', { type: 'application/octet-stream' });

    // Load local files into Teachable Machine
    loadedModel = await tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
    return loadedModel;
  } catch (err) {
    console.error('Recognition model could not be loaded. Check public/model/ files.', err);
    modelLoadingErrorOccurred = true;
    throw err;
  }
}

/**
 * Parses class labels from strings like "John Doe (ID: 2021-00123)"
 * into their name and studentID fields.
 */
export function parseLabel(label: string): { name: string; studentId?: string } {
  // Pattern: "John Doe (ID: 2021-00123)"
  const match = label.match(/^([^(]+)(?:\(ID:\s*([^)]+)\))?/);
  if (match) {
    const name = match[1].trim();
    const studentId = match[2]?.trim();
    return { name, studentId };
  }
  return { name: label };
}

/**
 * Resolves a Teachable Machine classLabel and probability using the persons.json database
 * and confidence thresholds configuration.
 */
export function resolvePrediction(classLabel: string, probability: number): ResolvedMatch {
  const confidence = Math.round(probability * 100);
  const highThreshold = CONFIDENCE_THRESHOLDS.HIGH * 100;
  const lowThreshold = CONFIDENCE_THRESHOLDS.LOW * 100;

  // State C: Environment class → always no-detection, regardless of confidence
  if (classLabel === 'Class 31') {
    return {
      name: 'No person or face detected.',
      confidence: confidence,
      status: 'error',
    };
  }

  const matchedPerson = personsData.find(p => p.classLabel === classLabel);

  // State C: below low threshold OR no matching person in DB
  if (!matchedPerson || matchedPerson.name === null || confidence < lowThreshold) {
    return {
      name: 'No person or face detected.',
      confidence: confidence,
      status: 'error',
    };
  }

  // State A: high confidence
  if (confidence >= highThreshold) {
    return {
      name: matchedPerson.name,
      studentId: matchedPerson.studentId ?? undefined,
      confidence: confidence,
      status: 'success',
    };
  }

  // State B: low-to-high confidence
  return {
    name: matchedPerson.name,
    studentId: matchedPerson.studentId ?? undefined,
    confidence: confidence,
    status: 'warning',
  };
}

/**
 * Classifies an image rendered on a canvas.
 * Falls back gracefully to visual heuristic simulation if WebGL is unavailable or isolated.
 */
export async function classifyCanvas(canvas: HTMLCanvasElement): Promise<ClassificationResult> {
  try {
    const model = await loadTeachableMachineModel();
    
    // Perform standard prediction using Teachable Machine
    console.log('Calling TM model.predict()...');
    const predictions = await model.predict(canvas);
    console.log('TM predictions:', JSON.stringify(predictions));
    
    // Sort descending by probability
    predictions.sort((a, b) => b.probability - a.probability);
    
    const topPrediction = predictions[0];
    return buildClassificationResult(
      topPrediction.className,
      topPrediction.probability,
      predictions
    );
  } catch (err) {
    console.error('Prediction error inside TFJS:', err);
    throw err;
  }
}
