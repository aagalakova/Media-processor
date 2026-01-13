// Auto-extracted from index.html

import { setFFmpegStatus } from '../ui/status.js';
import { ensureFFmpegLibLoaded } from '../ffmpeg/ffmpegLoader.js';

export class VideoProcessor {
  constructor() {
    this.ffmpeg = null;
    this.isFFmpegReady = false;
    this.loadedCorePath = null;
    this.coreMode = '—';
    this.initFFmpeg();
  }

  async initFFmpeg() {
    if (location.protocol === 'file:') {
      setFFmpegStatus('FFmpeg: открыт как file:// — открой через Vercel (https://...)', 'err');
      console.warn('Открыто как file://. FFmpeg core/wasm не загрузится. Открой через https.');
      return;
    }

    setFFmpegStatus('FFmpeg: загружаю библиотеку…', 'warn');

    const ok = await ensureFFmpegLibLoaded();
    if (!ok) {
      setFFmpegStatus('FFmpeg: библиотека не загрузилась (проверь путь/CORS)', 'err');
      console.warn('FFmpeg не подключён. Видео/аудио будут обрабатываться без перекодирования.');
      return;
    }

    try {
      const { createFFmpeg } = window.FFmpeg;

      const hasSAB = (typeof SharedArrayBuffer !== 'undefined');
      const isolated = (self.crossOriginIsolated === true);
      const canUseMT = hasSAB && isolated;

      const mtCoreCandidates = [
        '/ffmpeg/ffmpeg-core.js',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
      ];

      const stCoreCandidates = [
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.11.0/dist/ffmpeg-core.js'
      ];

      const coreCandidates = canUseMT ? mtCoreCandidates : stCoreCandidates;

      if (!canUseMT) {
        setFFmpegStatus('FFmpeg: нет SharedArrayBuffer → включи COOP/COEP. Сейчас fallback (slow).', 'warn');
        console.warn('SharedArrayBuffer недоступен. Нужны COOP/COEP заголовки на Vercel.');
      }

      for (const corePath of coreCandidates) {
        try {
          this.ffmpeg = createFFmpeg({ log: true, corePath });
          console.log('Загружаем FFmpeg core:', corePath);
          await this.ffmpeg.load();

          this.isFFmpegReady = true;
          this.loadedCorePath = corePath;
          this.coreMode = canUseMT ? 'multi-thread' : 'single-thread';

          const where = corePath.includes('http') ? 'CDN' : 'local';
          setFFmpegStatus(`FFmpeg: готов ✅ (${where}, ${this.coreMode})`, 'ok');

          console.log('✅ FFmpeg успешно загружен (corePath):', corePath, 'mode:', this.coreMode);
          return;
        } catch (e) {
          console.warn('❌ Не удалось загрузить corePath:', corePath, e);
          this.ffmpeg = null;
          this.isFFmpegReady = false;
        }
      }

      setFFmpegStatus('FFmpeg: core не удалось загрузить (local/CDN)', 'err');
      console.error('❌ FFmpeg core не удалось загрузить ни локально, ни с CDN.');
    } catch (e) {
      setFFmpegStatus('FFmpeg: ошибка инициализации', 'err');
      console.error('❌ Ошибка инициализации FFmpeg:', e);
    }
  }

  safeUnlink(path) { try { this.ffmpeg && this.ffmpeg.FS('unlink', path); } catch (e) {} }

  getVideoExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = { mp4:'mp4', mov:'mov', avi:'avi', mkv:'mkv', webm:'webm', ogg:'ogg', wmv:'wmv', flv:'flv', m4v:'m4v', '3gp':'3gp' };
    return map[ext] || 'mp4';
  }

  getAudioExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = { mp3:'mp3', wav:'wav', ogg:'ogg', flac:'flac', aac:'aac', m4a:'m4a' };
    return map[ext] || 'mp3';
  }

  /* ===== VIDEO ===== */
  async processVideo(file, settings) {
    const { resolution='640x360', quality='medium', format='mp4' } = settings;

    if (!this.isFFmpegReady || !this.ffmpeg) {
      console.warn('⚠️ FFmpeg не готов/недоступен, возвращаю оригинальное видео');
      return file;
    }

    try {
      return await this.processVideoWithFFmpeg(file, resolution, quality, format);
    } catch (error) {
      console.error('❌ Ошибка FFmpeg обработки видео, возвращаю оригинальный файл:', error);
      return file;
    }
  }

  async processVideoWithFFmpeg(file, resolution, quality, format) {
    const { ffmpeg } = this;
    const [width, height] = resolution.split('x').map(Number);

    const crfValues = { high: 18, medium: 23, low: 28 };
    const crf = crfValues[quality] || 23;

    const bitrateValues = { high: '1500k', medium: '1000k', low: '500k' };
    const videoBitrate = bitrateValues[quality] || '1000k';

    const inputData = await file.arrayBuffer();
    const inputName = `vinput.${this.getVideoExtension(file.name)}`;
    const outputName = `voutput.${format}`;

    ffmpeg.FS('writeFile', inputName, new Uint8Array(inputData));

    const command = [
      '-i', inputName,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'libx264',
      '-b:v', videoBitrate,
      '-crf', String(crf),
      '-preset', 'fast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputName
    ];

    await ffmpeg.run(...command);

    const out = ffmpeg.FS('readFile', outputName);
    this.safeUnlink(inputName);
    this.safeUnlink(outputName);

    return new Blob([out], { type: 'video/mp4' });
  }

  /* ===== AUDIO (реальное перекодирование) ===== */
  async processAudio(file, settings) {
    const { format='mp3', bitrate=192 } = settings;

    if (!this.isFFmpegReady || !this.ffmpeg) {
      console.warn('⚠️ FFmpeg не доступен, возвращаю оригинальное аудио без изменений');
      return file;
    }

    try {
      return await this.processAudioWithFFmpeg(file, format, bitrate);
    } catch (error) {
      console.error('❌ Ошибка FFmpeg обработки аудио, возвращаю оригинальный файл:', error);
      return file;
    }
  }

  async processAudioWithFFmpeg(file, format, bitrate) {
    const { ffmpeg } = this;

    const inputData = await file.arrayBuffer();
    const inputExt = this.getAudioExtension(file.name);
    const inputName = `ainput.${inputExt}`;
    const outputName = `aoutput.${format}`;

    ffmpeg.FS('writeFile', inputName, new Uint8Array(inputData));

    const bps = `${Math.max(32, Math.min(320, Number(bitrate) || 192))}k`;

    const mp3Primary = ['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', bps, '-ar', '44100', '-ac', '2', '-y', outputName];
    const mp3Fallback = ['-i', inputName, '-vn', '-c:a', 'mp3',       '-b:a', bps, '-ar', '44100', '-ac', '2', '-y', outputName];

    const oggPrimary = ['-i', inputName, '-vn', '-c:a', 'libvorbis',  '-b:a', bps, '-ar', '44100', '-ac', '2', '-y', outputName];
    const oggFallback = ['-i', inputName, '-vn', '-c:a', 'vorbis',    '-b:a', bps, '-ar', '44100', '-ac', '2', '-y', outputName];

    const runWithFallback = async (primary, fallback) => {
      try { await ffmpeg.run(...primary); }
      catch (e) { console.warn('⚠️ primary codec failed, trying fallback', e); await ffmpeg.run(...fallback); }
    };

    if (format === 'ogg') await runWithFallback(oggPrimary, oggFallback);
    else await runWithFallback(mp3Primary, mp3Fallback);

    const out = ffmpeg.FS('readFile', outputName);
    this.safeUnlink(inputName);
    this.safeUnlink(outputName);

    const mime = (format === 'ogg') ? 'audio/ogg' : 'audio/mpeg';
    return new Blob([out], { type: mime });
  }

  cancel() {
    if (!this.ffmpeg) return;
    try {
      const files = this.ffmpeg.FS('readdir', '/');
      files.forEach(f => {
        if (f !== '.' && f !== '..') {
          try { this.ffmpeg.FS('unlink', `/${f}`); } catch (e) {}
        }
      });
    } catch (e) {}
  }
}

/* =======================
   Utils
======================= */
