import type { CameraDirectionType } from '../types';

export function facingModeForDirection(direction: CameraDirectionType): 'user' | 'environment' {
  return direction === 'rear' ? 'environment' : 'user';
}

export async function startCameraStream(
  direction: CameraDirectionType,
  videoEl: HTMLVideoElement
): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: facingModeForDirection(direction),
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  videoEl.srcObject = stream;
  await videoEl.play().catch(() => undefined);
  return stream;
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function captureVideoFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context.');
  }
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}
