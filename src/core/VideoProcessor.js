import { ensureFFmpegLibLoaded, FFMPEG_BASE } from '../ffmpeg/ffmpegLoader.js';
import { setFFmpegStatus } from '../ui/status.js';

export class VideoProcessor {
  constructor() {
    this.ffmpeg = null;
    this.isFFmpegReady = false;
    this.loadedCorePath = null;
    this.coreMode = '—';
  }

  async initFFmpeg() {
    if (location.protocol === 'file:') {
      setFFmpegStatus('FFmpeg: открыт как file:// — открой через http/https', 'err');
      return;
    }

    setFFmpegStatus('FFmpeg: загружаю библиотеку…', 'warn');

    const ok = await ensureFFmpegLibLoaded();
    if (!ok) {
      setFFmpegStatus('FFmpeg: библиотека не загрузилась (проверь путь)', 'err');
      return;
    }

    const { createFFmpeg } = window.FFmpeg;

    const hasSAB = (typeof SharedArrayBuffer !== 'undefined');
    const isolated = (self.crossOriginIsolated === true);
    const canUseMT = hasSAB && isolated;

    const localCore = `${FFMPEG_BASE}/ffmpeg-core.js`;

    const mtCoreCandidates = [
      localCore,
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    ];

    const stCoreCandidates = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.0/dist/ffmpeg-core.js'
    ];

    const coreCandidates = canUseMT ? mtCoreCandidates : stCoreCandidates;

    if (!canUseMT) {
      setFFmpegStatus('FFmpeg: нет SharedArrayBuffer → fallback (slow)', 'warn');
    }

    for (const corePath of coreCandidates) {
      try {
        this.ffmpeg = createFFmpeg({ log: true, corePath });
        await this.ffmpeg.load();

        this.isFFmpegReady = true;
        this.loadedCorePath = corePath;
        this.coreMode = canUseMT ? 'multi-thread' : 'single-thread';

        const where = corePath.startsWith('http') ? 'CDN' : 'local';
        setFFmpegStatus(`FFmpeg: готов ✅ (${where}, ${this.coreMode})`, 'ok');
        return;
      } catch (e) {
        console.warn('FFmpeg core load failed:', corePath, e);
        this.ffmpeg = null;
        this.isFFmpegReady = false;
      }
    }

    setFFmpegStatus('FFmpeg: core не удалось загрузить (local/CDN)', 'err');
  }

  // дальше — твои методы processVideo/processAudio и т.д.
  // Важно: initFFmpeg() надо вызвать один раз перед обработкой.
}
