import { isTauri } from './tauriApi';

export function getThumbnailUrl(fileHash: string, mediaType: string = 'photo'): string {
  if (isTauri()) {
    return `puntano-thumb://localhost/${fileHash}.webp`;
  }

  // Elegant gradient placeholder for browser development
  const color1 = mediaType === 'video' ? '%234f46e5' : '%232563eb';
  const color2 = mediaType === 'video' ? '%237c3aed' : '%2338bdf8';
  const label = mediaType === 'video' ? 'VIDEO' : 'PHOTO';

  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="384" height="288" viewBox="0 0 384 288"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="white" fill-opacity="0.8">${label}</text></svg>`;
}
