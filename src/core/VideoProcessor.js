import { ensureFFmpegLibLoaded, FFMPEG_BASE } from '../ffmpeg/ffmpegLoader.js';
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

    const hasSAB = (typeof SharedArrayBuffer !== 'undefined');
    const isolated = (self.crossOriginIsolated === true);
    const canUseMT = hasSAB && isolated;

    const stCoreCandidates = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.0/dist/ffmpeg-core.js'
    ];

    // Важно: multi-thread (pthread) сборки часто падают "function signature mismatch" при несовместимых
    // комбинациях core/wasm/worker или опций кодирования. Чтобы обработка видео не зависала —
    // принудительно используем single-thread core-st.
    const coreCandidates = stCoreCandidates;

    if (canUseMT) {
      setFFmpegStatus('FFmpeg: multi-thread отключен (forced single-thread)', 'warn');
    } else {
      setFFmpegStatus('FFmpeg: single-thread (no SharedArrayBuffer)', 'warn');
    }

    for (const corePath of coreCandidates) {
      try {
        this.ffmpeg = createFFmpeg({ log: true, corePath });
        await withTimeout(this.ffmpeg.load(), 30000, 'FFmpeg load timeout');

        this.isFFmpegReady = true;
        this.loadedCorePath = corePath;
        this.coreMode = 'single-thread';

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


  async ensureReady() {
    if (this.isFFmpegReady && this.ffmpeg) return true;
    await this.initFFmpeg();
    return this.isFFmpegReady && !!this.ffmpeg;
  }

  cancel() {
    // Прерывание для ffmpeg.wasm не всегда мгновенное, но exit() обычно останавливает воркер.
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

      // Базовые команды для аудио
      // OGG: сначала Vorbis, если не получится — Opus
      if (fmt === 'ogg') {
        try {
          await this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libvorbis', '-b:a', br, outputName);
        } catch (eVorbis) {
          console.warn('OGG/Vorbis encode failed, fallback to Opus:', eVorbis);
          await this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libopus', '-b:a', br, outputName);
        }
      } else {
        // MP3
        await this.ffmpeg.run('-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', br, outputName);
      }

      const data = this.ffmpeg.FS('readFile', outputName);
      const mime = (fmt === 'ogg') ? 'audio/ogg' : 'audio/mpeg';

      return new Blob([data.buffer], { type: mime });
    } catch (e) {
      console.error('processAudio failed:', e);
      return file; // fallback на оригинал
    } finally {
      // cleanup FS (best-effort)
      try { this.ffmpeg.FS('unlink', inputName); } catch {}
      try { this.ffmpeg.FS('unlink', outputName); } catch {}
    }
  }

  async processVideo(file, { resolution = '640x360', quality = 'medium', format = 'mp4' } = {}) {
    const ok = await this.ensureReady();
    if (!ok) return file;

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

    // сохраняем пропорции, уменьшаем до целевого, дополняем черным до точного размера
    const vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

    try {
      this.ffmpeg.FS('writeFile', inputName, await fetchFile(file));

      // Видео: h264 + aac в mp4 (самый совместимый вариант)
      await withTimeout(this.ffmpeg.run(
        '-i', inputName,
        '-vf', vf,
        '-c:v', 'libx264',
        // veryfast в некоторых сборках/режимах может приводить к "function signature mismatch".
        // fast обычно стабильнее.
        '-preset', 'fast',
        '-crf', String(crf),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName
      ), 5 * 60 * 1000, 'FFmpeg run timeout');

      const data = this.ffmpeg.FS('readFile', outputName);
      const mime = 'video/mp4'; // даже если fmt=mp4; другие контейнеры пока не используем в UI
      return new Blob([data.buffer], { type: mime });
    } catch (e) {
      console.error('processVideo failed:', e);
      return file; // fallback
    } finally {
      try { this.ffmpeg.FS('unlink', inputName); } catch {}
      try { this.ffmpeg.FS('unlink', outputName); } catch {}
    }
  }


  // дальше — твои методы processVideo/processAudio и т.д.
  // Важно: initFFmpeg() надо вызвать один раз перед обработкой.
}
