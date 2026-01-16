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

// Локальный путь оставляем как запасной вариант (если захочешь self-host).
export const FFMPEG_BASE = '/assets/ffmpeg';

export async function ensureFFmpegLibLoaded() {
  if (window.FFmpeg && typeof window.FFmpeg.createFFmpeg === 'function') return true;

  const candidates = [
    // 1) предпочтительно — стабильный CDN (пинованная версия)
    'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
  ];

  // 2) локальная копия (если ты её держишь в public/assets/ffmpeg)
  if (location.protocol !== 'file:') {
    candidates.push(`${FFMPEG_BASE}/ffmpeg.min.js`);
  }

  // 3) запасной CDN
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
