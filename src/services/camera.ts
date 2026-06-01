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

/**
 * Preprocesses a base64 image:
 * 1. Loads it into an HTMLImageElement.
 * 2. Center-crops it to a 1:1 aspect ratio.
 * 3. Resizes it to 224x224 on an offscreen canvas.
 * 4. Yields both the canvas and the cropped 224x224 base64 representation.
 */
// Teachable Machine models are trained on 224x224 square images. Skipping this step distorts face proportions and lowers confidence scores.
export function preprocessImage(base64String: string): Promise<{ canvas: HTMLCanvasElement; preprocessedBase64: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Support either raw base64 or complete data-url
    img.src = base64String.startsWith('data:') 
      ? base64String 
      : `data:image/jpeg;base64,${base64String}`;

    img.onload = () => {
      try {
        // Calculate centered 1:1 crop coordinates
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        // Create 224x224 output canvas
        const canvas = document.createElement('canvas');
        canvas.width = 224;
        canvas.height = 224;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D canvas context.'));
          return;
        }

        // Performance & anti-aliasing optimizations
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw centered square crop and resize to 224x224
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 224, 224);

        // Convert the 224x224 crop back to base64 for history thumbnail & preview
        const preprocessedBase64 = canvas.toDataURL('image/jpeg', 0.9);

        resolve({ canvas, preprocessedBase64 });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error('Failed to load image into preprocessing pipeline.'));
    };
  });
}
