import * as tf from '@tensorflow/tfjs';
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
  if (classLabel === 'Environment') {
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

let loadedModel: tmImage.CustomMobileNet | null = null;
let tfBackendReady = false;

/** Ensure TF.js is using the CPU backend (works in all Android WebViews). */
async function ensureTfBackend(): Promise<void> {
  if (tfBackendReady) return;
  try {
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('TF.js backend ready:', tf.getBackend());
    tfBackendReady = true;
  } catch (err) {
    console.error('TF.js backend init failed:', err);
    throw err;
  }
}

/** Load Teachable Machine model (required before capture). */
export async function loadAllModels(): Promise<void> {
  await loadTeachableMachineModel();
}

/**
 * Load the model from local assets offline
 */
export async function loadTeachableMachineModel(): Promise<tmImage.CustomMobileNet> {
  if (loadedModel) return loadedModel;

  await ensureTfBackend();

  try {
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

    loadedModel = await tmImage.loadFromFiles(modelFile, weightsFile, metadataFile);
    console.log('Teachable Machine model loaded successfully');
    return loadedModel;
  } catch (err) {
    console.error('Recognition model could not be loaded. Check public/model/ files.', err);
    throw err;
  }
}

/**
 * Parses class labels from strings like "John Doe (ID: 2021-00123)"
 * into their name and studentID fields.
 */
export function parseLabel(label: string): { name: string; studentId?: string } {
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
  if (classLabel === 'Environment') {
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
 * Classifies an image rendered on a 224×224 canvas using the TM model.
 */
export async function classifyCanvas(canvas: HTMLCanvasElement): Promise<ClassificationResult> {
  const model = await loadTeachableMachineModel();

  console.log('Calling TM model.predict()...');
  const predictions = await model.predict(canvas);
  console.log('TM predictions:', JSON.stringify(predictions));

  predictions.sort((a, b) => b.probability - a.probability);

  const topPrediction = predictions[0];
  return buildClassificationResult(
    topPrediction.className,
    topPrediction.probability,
    predictions
  );
}
