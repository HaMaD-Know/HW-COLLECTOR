import { Camera, CameraErrorCode, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
import { blobToBase64 } from './image-storage/capacitor-file-adapter';

export interface PickedPhoto {
  base64: string;
  mimeType: 'image/jpeg';
  /** data: URL for immediate preview. */
  previewUrl: string;
  width: number;
  height: number;
}

export class PhotoError extends Error {
  constructor(
    message: string,
    public readonly permissionDenied = false,
  ) {
    super(message);
    this.name = 'PhotoError';
  }
}

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

const CANCEL_CODES = new Set<string>([
  CameraErrorCode.TakePhotoCancelled,
  CameraErrorCode.ChooseMediaCancelled,
  CameraErrorCode.EditPhotoCancelled,
]);
const DENIED_CODES = new Set<string>([CameraErrorCode.CameraPermissionDenied, CameraErrorCode.GalleryPermissionDenied]);

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
}

/**
 * Opens the camera or the photo library. Returns null if the user cancels.
 * The result is re-encoded as a JPEG of at most 1600px on its longest edge, so
 * stored files and backups stay small and the temporary picker file is not needed.
 */
export async function pickPhoto(source: 'camera' | 'gallery'): Promise<PickedPhoto | null> {
  let media: MediaResult | undefined;
  try {
    if (source === 'camera') {
      media = await Camera.takePhoto({
        quality: 90,
        targetWidth: MAX_EDGE,
        targetHeight: MAX_EDGE,
        correctOrientation: true,
        saveToGallery: false,
        webUseInput: true,
      });
    } else {
      const result = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: false,
        quality: 90,
        targetWidth: MAX_EDGE,
        targetHeight: MAX_EDGE,
        correctOrientation: true,
        webUseInput: true,
      });
      media = result.results[0];
    }
  } catch (error) {
    const code = errorCode(error);
    const message = error instanceof Error ? error.message : String(error);
    if (CANCEL_CODES.has(code) || /cancel/i.test(message)) return null;
    if (DENIED_CODES.has(code) || /permission|denied/i.test(message)) {
      throw new PhotoError(
        source === 'camera'
          ? 'Camera access is off. Allow it in your device settings, or choose a photo from the gallery.'
          : 'Photo library access is off. Allow it in your device settings.',
        true,
      );
    }
    if (code === CameraErrorCode.NoCameraAvailable) throw new PhotoError('No camera is available on this device.');
    throw new PhotoError('Could not open the photo. Please try again.');
  }
  if (!media) return null;

  const url = media.webPath ?? (media.thumbnail ? `data:image/jpeg;base64,${media.thumbnail}` : undefined);
  if (!url) throw new PhotoError('The selected photo could not be read.');
  const blob = await fetch(url).then((r) => r.blob()).catch(() => null);
  if (!blob) throw new PhotoError('The selected photo could not be read.');
  return normalizeImage(blob);
}

/** Decodes any browser-supported image and re-encodes it as a bounded JPEG. */
export async function normalizeImage(blob: Blob): Promise<PickedPhoto> {
  if (!blob.type.startsWith('image/') && blob.type !== '') throw new PhotoError('That file is not an image.');
  const bitmap = await loadImage(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('This device could not process the image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap.source, 0, 0, width, height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!jpeg) throw new PhotoError('This device could not process the image.');
  const base64 = await blobToBase64(jpeg);
  return { base64, mimeType: 'image/jpeg', previewUrl: `data:image/jpeg;base64,${base64}`, width, height };
}

async function loadImage(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to <img> decoding (older WebViews, HEIC on some devices)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new PhotoError('This image format could not be opened.'));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
