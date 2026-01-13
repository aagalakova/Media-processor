/* =======================
   Helpers: load scripts
======================= */
export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(src);
    s.onerror = () => reject(new Error('Failed to load: ' + src));
    document.head.appendChild(s);
  });
}

/**
 * База для self-hosted FFmpeg ассетов.
 * Структура должна быть:
 *   /assets/ffmpeg/ffmpeg.min.js
 *   /assets/ffmpeg/ffmpeg-core.js
 *   /assets/ffmpeg/ffmpeg-core.wasm
 *   /assets/ffmpeg/ffmpeg-core.worker.js
 */
export const FFMPEG_BASE = '/assets/ffmpeg';

export async function ensureFFmpegLibLoaded() {
  if (window.FFmpeg && typeof window.FFmpeg.createFFmpeg === 'function') return true;

  const candidates = [];

  // локальная загрузка работает только через http/https (не file://)
  if (location.protocol !== 'file:') {
    candidates.push(`${FFMPEG_BASE}/ffmpeg.min.js`);
  }

  // CDN fallback
  candidates.push('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');

  for (const url of candidates) {
    try {
      await loadScript(url);
      if (window.FFmpeg && typeof window.FFmpeg.createFFmpeg === 'function') return true;
    } catch (e) {
      console.warn('FFmpeg lib load failed:', url, e);
    }
  }

  return false;
}
