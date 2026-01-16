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

// CDN base for FFmpeg core assets (ffmpeg-core.js, ffmpeg-core.wasm, ffmpeg-core.worker.js)
// VideoProcessor uses this to build corePath: `${FFMPEG_BASE}/ffmpeg-core.js`
// Use a pinned, known-good single-thread core bundle from unpkg.
// VideoProcessor will use: `${FFMPEG_BASE}/ffmpeg-core.js`
export const FFMPEG_BASE = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist';

// Where to load the FFmpeg JS library (ffmpeg.min.js) from
const FFMPEG_LIB_LOCAL = '/assets/ffmpeg/ffmpeg.min.js';
// Pin the library bundle via unpkg to avoid mismatches with locally vendored files.
const FFMPEG_LIB_CDN = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';

export async function ensureFFmpegLibLoaded() {
  if (window.FFmpeg && typeof window.FFmpeg.createFFmpeg === 'function') return true;

  const candidates = [];

  // Try CDN first to avoid accidental version/variant mismatches in a locally copied ffmpeg.min.js.
  candidates.push(FFMPEG_LIB_CDN);

  // Optional local fallback (if served via http/https)
  if (location.protocol !== 'file:') candidates.push(FFMPEG_LIB_LOCAL);

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
