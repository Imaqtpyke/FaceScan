import { Camera, CameraDirection, CameraResultType, CameraSource } from '@capacitor/camera';

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
 * Takes a center square crop and resizes to 224×224 for Teachable Machine.
 */
export async function preprocessImage(base64String: string): Promise<HTMLCanvasElement> {
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

  const size = Math.min(img.width, img.height);
  const offsetX = (img.width - size) / 2;
  const offsetY = (img.height - size) / 2;
  ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, 224, 224);

  return canvas;
}

/** Base64 JPEG from a 224×224 canvas (for history thumbnail). */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.9);
}
