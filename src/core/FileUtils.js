// Auto-extracted from index.html

export class FileUtils {
  static getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const imageExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const audioExts = ['mp3','wav','ogg','flac','aac','m4a'];
    const videoExts = ['mp4','mov','avi','mkv','webm','wmv','flv','m4v','3gp'];
    if (imageExts.includes(ext)) return 'Изображение';
    if (audioExts.includes(ext)) return 'Аудио';
    if (videoExts.includes(ext)) return 'Видео';
    return 'Другой';
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б','КБ','МБ','ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static inferImageFormatFromFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'png') return 'png';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
    const t = (file.type || '').toLowerCase();
    if (t.includes('png')) return 'png';
    return 'jpg';
  }

  static parseSizes(raw) {
    const out = [];
    const parts = String(raw || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const p of parts) {
      const m = p.toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/);
      if (!m) continue;
      const w = Math.max(1, parseInt(m[1], 10));
      const h = Math.max(1, parseInt(m[2], 10));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) out.push({ w, h });
    }
    return out;
  }

  static escapeHtmlAttr(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
