import * as faceapi from 'face-api.js';
import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';
import { faceApiAvailable } from './faceModel';

/**
 * Capture a photo using @capacitor/camera
 */
export async function capturePhoto(direction: 'front' | 'rear'): Promise<string> {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    direction: direction === 'front' ? CameraDirection.Front : CameraDirection.Rear,
  });

  if (!image.base64String) {
    throw new Error('No image data returned from camera.');
  }

  return image.base64String;
}

function loadImage(base64String: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64String.startsWith('data:')
      ? base64String
      : `data:image/jpeg;base64,${base64String}`;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image into preprocessing pipeline.'));
  });
}

/**
 * Preprocesses a base64 image:
 * 1. Detect face with face-api.js SSD MobileNet V1
 * 2. Crop face region with 20% padding
 * 3. Resize to 224×224 for Teachable Machine
 * Returns null if no face or score below 0.5
 */
export async function preprocessImage(base64String: string): Promise<HTMLCanvasElement | null> {
  const img = await loadImage(base64String);

  const canvas = document.createElement('canvas');
  canvas.width = 224;
  canvas.height = 224;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (!faceApiAvailable) {
    const size = Math.min(img.width, img.height);
    const offsetX = (img.width - size) / 2;
    const offsetY = (img.height - size) / 2;
    ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 224, 224);
    return canvas;
  }

  // Teachable Machine models are trained on 224x224 square images.
  // face-api.js detects the face bounding box first so TM only sees
  // the face — not background, clothing, or lighting.
  const detection = await faceapi.detectSingleFace(
    img,
    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
  );

  if (!detection || detection.score < 0.5) {
    return null;
  }

  const { x, y, width, height } = detection.box;
  const padding = Math.min(width, height) * 0.2;

  let cropX = Math.max(0, x - padding);
  let cropY = Math.max(0, y - padding);
  let cropW = Math.min(img.width - cropX, width + padding * 2);
  let cropH = Math.min(img.height - cropY, height + padding * 2);

  const size = Math.max(cropW, cropH);
  const centerX = cropX + cropW / 2;
  const centerY = cropY + cropH / 2;
  cropX = Math.max(0, centerX - size / 2);
  cropY = Math.max(0, centerY - size / 2);
  cropW = Math.min(size, img.width - cropX);
  cropH = Math.min(size, img.height - cropY);

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 224, 224);

  return canvas;
}

/** Base64 JPEG from a 224×224 canvas (for history thumbnail). */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.9);
}
