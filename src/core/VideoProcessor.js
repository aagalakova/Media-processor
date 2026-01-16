import { ensureFFmpegLibLoaded } from '../ffmpeg/ffmpegLoader.js';
import { setFFmpegStatus } from '../ui/status.js';

function withTimeout(promise, ms, label = 'timeout') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

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

    // Для стабильности используем официальную single-thread core, которая совместима с ffmpeg.wasm v0.11.x.
    // Важно: задаём corePath/workerPath/wasmPath явно, чтобы не зависеть от эвристик подстановки путей.
    const CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.11.0/dist';
    const corePath = `${CORE_BASE}/ffmpeg-core.js`;
    const workerPath = `${CORE_BASE}/ffmpeg-core.worker.js`;
    const wasmPath = `${CORE_BASE}/ffmpeg-core.wasm`;

    // Отображаем режим. Multi-thread (SAB) отключаем сознательно — для MT нужен @ffmpeg/core-mt и COOP/COEP.
    setFFmpegStatus('FFmpeg: single-thread core (@ffmpeg/core@0.11.0)', 'warn');

    try {
      this.ffmpeg = createFFmpeg({ log: true, corePath, workerPath, wasmPath });
      await withTimeout(this.ffmpeg.load(), 60000, 'FFmpeg load timeout');

      this.isFFmpegReady = true;
      this.loadedCorePath = corePath;
      this.coreMode = 'single-thread';

      setFFmpegStatus('FFmpeg: готов ✅ (CDN, single-thread)', 'ok');
    } catch (e) {
      console.warn('FFmpeg core load failed:', corePath, e);
      this.ffmpeg = null;
      this.isFFmpegReady = false;
      this.loadedCorePath = null;
      this.coreMode = '—';
      setFFmpegStatus('FFmpeg: core не удалось загрузить (CDN)', 'err');
    }
  }

  async ensureReady() {
    if (this.isFFmpegReady && this.ffmpeg) return true;
    await this.initFFmpeg();
    return this.isFFmpegReady && !!this.ffmpeg;
  }

  cancel() {
    try {
      if (this.ffmpeg && typeof this.ffmpeg.exit === 'function') {
        this.ffmpeg.exit();
      }
    } catch (e) {
      console.warn('FFmpeg exit failed:', e);
    } finally {
      this.ffmpeg = null;
      this.isFFmpegReady = false;
      this.loadedCorePath = null;
      this.coreMode = '—';
    }
  }

  async processAudio(file, { format = 'mp3', bitrate = 128 } = {}) {
    const ok = await this.ensureReady();
    if (!ok) return file;

    const fmt = String(format || 'mp3').toLowerCase();
    const br = `${parseInt(bitrate, 10) || 128}k`;

    const { fetchFile } = window.FFmpeg;

    const inExt = (file.name.split('.').pop() || 'mp3').toLowerCase();
    const inputName = `input.${inExt}`;
    const outputName = `output.${fmt}`;

    try {
      this.ffmpeg.FS('writeFile', inputName, await fetchFile(file));

      if (fmt === 'ogg') {
        try {
          await withTimeout(
            this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libvorbis', '-b:a', br, outputName),
            5 * 60 * 1000,
            'FFmpeg audio run timeout'
          );
        } catch (eVorbis) {
          console.warn('OGG/Vorbis encode failed, fallback to Opus:', eVorbis);
          await withTimeout(
            this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libopus', '-b:a', br, outputName),
            5 * 60 * 1000,
            'FFmpeg audio run timeout'
          );
        }
      } else {
        await withTimeout(
          this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', br, outputName),
          5 * 60 * 1000,
          'FFmpeg audio run timeout'
        );
      }

      const data = this.ffmpeg.FS('readFile', outputName);
      const mime = (fmt === 'ogg') ? 'audio/ogg' : 'audio/mpeg';
      return new Blob([data.buffer], { type: mime });
    } catch (e) {
      console.error('processAudio failed:', e);
      return file;
    } finally {
      try { this.ffmpeg.FS('unlink', inputName); } catch {}
      try { this.ffmpeg.FS('unlink', outputName); } catch {}
    }
  }

  async processVideo(file, { format = 'mp4', resolution = '640x360', quality = 'medium' } = {}) {
    const ok = await this.ensureReady();
    if (!ok) return file;

    // На данный момент контейнер оставляем mp4 (см. mime ниже)
    const fmt = String(format || 'mp4').toLowerCase();
    const [wStr, hStr] = String(resolution || '640x360').split('x');
    const w = Math.max(2, parseInt(wStr, 10) || 640);
    const h = Math.max(2, parseInt(hStr, 10) || 360);

    const crfMap = { high: 18, medium: 23, low: 28 };
    const crf = crfMap[String(quality || 'medium')] ?? 23;

    const { fetchFile } = window.FFmpeg;

    const inExt = (file.name.split('.').pop() || 'mp4').toLowerCase();
    const inputName = `input.${inExt}`;
    const outputName = `output.${fmt}`;

    // Сохраняем пропорции, уменьшаем до целевого, дополняем черным до точного размера.
    // Если исходник меньше целевого — не апскейлим (decrease).
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

    try {
      this.ffmpeg.FS('writeFile', inputName, await fetchFile(file));

      await withTimeout(
        this.ffmpeg.run(
          '-i', inputName,
          '-vf', vf,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', String(crf),
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          outputName
        ),
        10 * 60 * 1000,
        'FFmpeg video run timeout'
      );

      const data = this.ffmpeg.FS('readFile', outputName);
      const mime = 'video/mp4';
      return new Blob([data.buffer], { type: mime });
    } catch (e) {
      console.error('processVideo failed:', e);
      return file;
    } finally {
      try { this.ffmpeg.FS('unlink', inputName); } catch {}
      try { this.ffmpeg.FS('unlink', outputName); } catch {}
    }
  }
}
