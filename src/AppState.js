// Auto-extracted from index.html

import { FileUtils } from './core/FileUtils.js';
import { MediaProcessor } from './core/MediaProcessor.js';
import { setFFmpegStatus } from './ui/status.js';

export class AppState {
  constructor() {
    this.files = [];
    this.processedFiles = [];
    this.currentSettings = this.getDefaultSettings();
    this.mediaProcessor = new MediaProcessor();
    this.lastBrandRecommendations = null;

    // === smart naming plan (правка C/E) ===
    this.smartPlanCounts = null;   // { key: number }
    this.smartCounters = null;     // { key: number }

    this.initEventListeners();
    this.updateUI();
  }

  getDefaultSettings() {
    return {
      imageSizes: '1200x600, 800x400, 400x200',
      selectedBackground: 'white',
      selectedVideoResolution: '640x360',
      selectedVideoQuality: 'medium',
      selectedVideoFormat: 'mp4'
    };
  }

  initEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const processBtn = document.getElementById('processBtn');

    fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      this.handleFiles(e.dataTransfer.files);
    });

    this.initVideoSettingsListeners();
    this.initBackgroundColorListeners();

    processBtn.addEventListener('click', () => this.startProcessing());

    // Делегируем rename на document, чтобы не зависеть от того, когда/как перерисован #fileList.
    document.addEventListener('change', (e) => {
      if (!(e.target instanceof Element)) return;
      const input = e.target.closest('input[data-action="rename"][data-index]');
      if (!input) return;
      const index = Number(input.dataset.index);
      if (Number.isFinite(index)) this.updateFileName(index, input.value);
    });


    // Delegated clicks for static and dynamic UI controls (replaces inline onclick handlers)
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target.closest('[data-action]');
      if (!el) return;

      const action = el.dataset.action;
      try {
        switch (action) {
          case 'remove': {
            e.preventDefault();
            const index = Number(el.dataset.index);
            if (Number.isFinite(index)) this.removeFile(index);
            break;
          }
          case 'open-file-picker':
            e.preventDefault();
            fileInput && fileInput.click();
            break;
          case 'reset-all':
            e.preventDefault();
            this.resetAllSettings();
            break;
          case 'clear-all-checkboxes':
            e.preventDefault();
            this.clearAllCheckboxes();
            break;
          case 'ai-advice':
            e.preventDefault();
            this.getAIAdvice();
            break;
          case 'analyze-images':
            e.preventDefault();
            this.analyzeAllImages();
            break;
          case 'select-all':
            e.preventDefault();
            if (el.dataset.scope) this.selectAllCheckboxes(el.dataset.scope);
            break;
          case 'clear-scope':
            e.preventDefault();
            if (el.dataset.scope) this.clearCheckboxes(el.dataset.scope);
            break;
          case 'analyze-brand':
            e.preventDefault();
            this.analyzeBrandAssets();
            break;
          case 'apply-custom-color':
            e.preventDefault();
            this.applyCustomColor();
            break;
          case 'load-preset':
            e.preventDefault();
            if (el.dataset.preset) this.loadPreset(el.dataset.preset);
            break;
          case 'download-single': {
            e.preventDefault();
            const n = Number(el.dataset.index);
            if (Number.isFinite(n)) this.downloadSingleFile(n);
            break;
          }
          case 'apply-brand-recommendations':
            e.preventDefault();
            this.applyBrandRecommendations();
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Action handler error:', action, err);
      }
    });

    const smartRenamingCheckbox = document.getElementById('smartRenaming');
    const useOriginalNamesCheckbox = document.getElementById('useOriginalNames');
    const globalBaseInput = document.getElementById('globalBaseName');

    smartRenamingCheckbox && smartRenamingCheckbox.addEventListener('change', () => this.updateNamingExample());
    useOriginalNamesCheckbox && useOriginalNamesCheckbox.addEventListener('change', () => this.updateNamingExample());
    globalBaseInput && globalBaseInput.addEventListener('input', () => this.updateNamingExample());
  }

  initVideoSettingsListeners() {
    document.querySelectorAll('.resolution-option').forEach(option => {
      option.addEventListener('click', (e) => {
        document.querySelectorAll('.resolution-option').forEach(opt => opt.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.currentSettings.selectedVideoResolution = e.currentTarget.dataset.resolution;
      });
    });

    document.querySelectorAll('.video-format-option').forEach(option => {
      option.addEventListener('click', (e) => {
        document.querySelectorAll('.video-format-option').forEach(opt => opt.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.currentSettings.selectedVideoFormat = e.currentTarget.dataset.format;
      });
    });

    document.querySelectorAll('.video-quality-option').forEach(option => {
      option.addEventListener('click', (e) => {
        document.querySelectorAll('.video-quality-option').forEach(opt => opt.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        this.currentSettings.selectedVideoQuality = e.currentTarget.dataset.quality;
      });
    });
  }

  initBackgroundColorListeners() {
    document.querySelectorAll('.background-color-option').forEach(option => {
      option.addEventListener('click', (e) => {
        const selected = e.currentTarget.dataset.background;
        this.setBackgroundSelection(selected);
      });
    });

    const picker = document.getElementById('customColorPicker');
    const hex = document.getElementById('customColorHex');

    picker.addEventListener('input', (e) => {
      hex.value = e.target.value;
      this.updateCustomPreview();
    });

    hex.addEventListener('input', (e) => {
      const value = e.target.value;
      if (value.startsWith('#') && (value.length === 4 || value.length === 7)) {
        picker.value = value;
        this.updateCustomPreview();
      }
    });

    this.updateCustomPreview();
  }

  updateCustomPreview() {
    const hex = document.getElementById('customColorHex').value;
    const preview = document.getElementById('customBgPreview');
    if (preview) preview.style.background = (this.isValidHex(hex) ? hex : '#ffffff');
  }

  isValidHex(color) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  setBackgroundSelection(selected) {
    document.querySelectorAll('.background-color-option').forEach(opt => opt.classList.remove('selected'));
    const opt = document.querySelector(`.background-color-option[data-background="${selected}"]`);
    if (opt) opt.classList.add('selected');
    this.currentSettings.selectedBackground = selected;
  }

  applyCustomColor() {
    this.setBackgroundSelection('custom');
  }

  handleFiles(fileList) {
    const files = Array.from(fileList);
    files.forEach(file => {
      file.customName = file.name.replace(/\.[^/.]+$/, '');
      this.files.push(file);
    });
    this.updateUI();
  }

  updateUI() {
    const fileList = document.getElementById('fileList');
    const emptyState = document.getElementById('emptyState');
    const statsInfo = document.getElementById('statsInfo');

    if (this.files.length === 0) {
      emptyState.classList.remove('hidden');
      statsInfo.textContent = '';
      fileList.innerHTML = '';
      fileList.appendChild(emptyState);
      this.updateNamingExample();
      return;
    }

    emptyState.classList.add('hidden');

    let html = '';
    let totalSize = 0;
    let imageCount = 0;
    let audioCount = 0;
    let videoCount = 0;

    this.files.forEach((file, index) => {
      totalSize += file.size;
      const type = FileUtils.getFileType(file.name);
      if (type === 'Изображение') imageCount++;
      if (type === 'Аудио') audioCount++;
      if (type === 'Видео') videoCount++;

      html += `
        <div class="file-item" data-index="${index}">
          <div class="file-info">
            <span class="file-icon">${this.getFileIcon(type)}</span>
            <div>
              <input type="text"
                class="rename-input"
                value="${FileUtils.escapeHtmlAttr(file.customName)}"
                data-action="rename" data-index="${index}"
                placeholder="Введите имя файла">
              <div class="file-size">${FileUtils.formatFileSize(file.size)} • ${type}</div>
            </div>
          </div>
          <button class="cancel-btn" data-action="remove" data-index="${index}">Удалить</button>
        </div>
      `;
    });

    fileList.innerHTML = html;

    let stats = `${this.files.length} файлов • ${FileUtils.formatFileSize(totalSize)}`;
    if (imageCount > 0) stats += ` • ${imageCount} изображений`;
    if (audioCount > 0) stats += ` • ${audioCount} аудио`;
    if (videoCount > 0) stats += ` • ${videoCount} видео`;

    statsInfo.textContent = stats;
    this.updateNamingExample();
  }

  getFileIcon(type) {
    switch (type) {
      case 'Изображение': return '🖼️';
      case 'Аудио': return '🎵';
      case 'Видео': return '🎬';
      default: return '📄';
    }
  }

  updateFileName(index, newName) {
    if (index >= 0 && index < this.files.length) {
      this.files[index].customName = newName || this.files[index].name.replace(/\.[^/.]+$/, '');
      this.updateNamingExample();
    }
  }

  removeFile(index) {
    if (index >= 0 && index < this.files.length) {
      this.files.splice(index, 1);
      this.updateUI();
    }
  }

  getGlobalBaseName() {
    const input = document.getElementById('globalBaseName');
    if (!input) return '';
    return input.value.trim() || '';
  }

  extractNumberFromName(name) {
    const match = name.match(/(\d+)/);
    return match ? match[1] : '';
  }

  updateNamingExample() {
    const exampleEl = document.getElementById('namingExample');
    if (!exampleEl) return;

    if (this.files.length === 0) {
      exampleEl.textContent = 'logo.png или logo_1.png, logo_2.png';
      return;
    }

    const useSmart = document.getElementById('smartRenaming')?.checked || false;
    const useOriginal = document.getElementById('useOriginalNames')?.checked || false;
    const globalBase = this.getGlobalBaseName();

    const firstFile = this.files[0];
    const type = FileUtils.getFileType(firstFile.name);

    if (useOriginal) {
      const ext = (firstFile.name.split('.').pop() || '').toLowerCase();
      const base = firstFile.name.replace(/\.[^/.]+$/, '');
      exampleEl.textContent = `${base}.${ext}, ${base}_2.${ext}, ${base}_3.${ext}`;
      return;
    }

    if (useSmart && globalBase && type === 'Аудио') {
      const nums = this.files.slice(0, 3).map(f => this.extractNumberFromName(f.name)).filter(Boolean);
      if (nums.length) {
        exampleEl.textContent = nums.map(n => `${globalBase}${n}.mp3`).join(', ');
        return;
      }
    }

    const baseName = useSmart ? (globalBase || this.getSmartPrefix(type)) : (firstFile.customName || firstFile.name.replace(/\.[^/.]+$/, '') || 'file');

    // при useSmart показываем нумерацию, чтобы было понятно что будет уникально
    if (useSmart) {
      if (type === 'Видео') exampleEl.textContent = `${baseName}_1.mp4, ${baseName}_2.mp4, ${baseName}_3.mp4`;
      else if (type === 'Аудио') exampleEl.textContent = `${baseName}_1.mp3, ${baseName}_2.mp3, ${baseName}_3.mp3`;
      else exampleEl.textContent = `${baseName}_1.png, ${baseName}_2.png, ${baseName}_3.png`;
      return;
    }

    if (type === 'Аудио') exampleEl.textContent = `${baseName}.mp3, ${baseName}_2.mp3, ${baseName}_3.mp3`;
    else if (type === 'Видео') exampleEl.textContent = `${baseName}.mp4, ${baseName}_2.mp4, ${baseName}_3.mp4`;
    else exampleEl.textContent = `${baseName}.png, ${baseName}_2.png, ${baseName}_3.png`;
  }

  /* =======================
     SMART PLAN (правка C):
     считаем, сколько файлов выйдет в каждой группе (type+base+ext),
     чтобы:
       - если всего 1 → base.ext
       - если >1 → base_1.ext, base_2.ext ...
  ======================= */
  prepareSmartNamingPlan(settings) {
    const useSmart = document.getElementById('smartRenaming')?.checked || false;
    if (!useSmart) {
      this.smartPlanCounts = null;
      this.smartCounters = null;
      return;
    }

    const globalBase = this.getGlobalBaseName();

    const baseForType = (type) => (globalBase || this.getSmartPrefix(type));

    const sizes = FileUtils.parseSizes(document.getElementById('imageSizes')?.value || '');
    const sizeCount = sizes.length ? sizes.length : 1;

    const selectedFormats = [];
    if (document.getElementById('formatPNG')?.checked) selectedFormats.push('png');
    if (document.getElementById('formatJPG')?.checked) selectedFormats.push('jpg');

    const plan = {};

    const add = (key, n) => {
      plan[key] = (plan[key] || 0) + n;
    };

    for (const file of this.files) {
      const type = FileUtils.getFileType(file.name);

      if (type === 'Изображение') {
        const base = baseForType(type);

        const formats = selectedFormats.length
          ? selectedFormats
          : [FileUtils.inferImageFormatFromFile(file)];

        for (const fmt of formats) {
          add(`${type}:${base}:${fmt}`, sizeCount);
        }
      }

      if (type === 'Видео') {
        const base = baseForType(type);
        const fmt = (settings.selectedVideoFormat || 'mp4').toLowerCase();
        add(`${type}:${base}:${fmt}`, 1);
      }

      // Аудио в smart режиме у тебя отдельной логикой base+digits,
      // его в этот план не включаем.
    }

    this.smartPlanCounts = plan;
    this.smartCounters = {};
  }

  /* =======================
     generateFileName (исправлено C + E):
     - useOriginalNames: при нескольких вариантах добавляет суффикс
     - useSmart: использует глобальные счётчики (уникально для нескольких файлов)
     - audio smart base+digits оставлен как было
  ======================= */
  generateFileName(baseName, format, type, originalName, index, fileIndex, totalVariants) {
    const useSmart = document.getElementById('smartRenaming')?.checked || false;
    const useOriginal = document.getElementById('useOriginalNames')?.checked || false;
    const globalBase = this.getGlobalBaseName();

    const originalExt = (originalName.split('.').pop() || '').toLowerCase();
    const ext = (format || originalExt || '').toLowerCase() || 'dat';
    const originalBase = originalName.replace(/\.[^/.]+$/, '') || baseName || 'file';

    // E) useOriginalNames + multiple variants
    if (useOriginal) {
      if (totalVariants && totalVariants > 1) {
        if (index === 1) return `${originalBase}.${ext}`;
        return `${originalBase}_${index}.${ext}`;
      }
      return `${originalBase}.${ext}`;
    }

    // аудио: base + number из оригинала
    if (useSmart && globalBase && type === 'Аудио') {
      const num = this.extractNumberFromName(originalName);
      if (num) return `${globalBase}${num}.${ext}`;
      // если числа нет — падаем на общий smart-счётчик ниже
    }

    let nameBase = useSmart ? (globalBase || this.getSmartPrefix(type)) : (baseName || originalBase || 'file');

    // C) smart naming: уникальные имена для нескольких файлов/вариантов
    if (useSmart) {
      const key = `${type}:${nameBase}:${ext}`;
      const total = this.smartPlanCounts ? (this.smartPlanCounts[key] || 0) : 0;

      if (total <= 1) {
        return `${nameBase}.${ext}`;
      }

      const next = (this.smartCounters[key] || 0) + 1;
      this.smartCounters[key] = next;
      return `${nameBase}_${next}.${ext}`;
    }

    // обычный режим (не smart)
    if (index === 1) return `${nameBase}.${ext}`;
    return `${nameBase}_${index}.${ext}`;
  }

  getSmartPrefix(type) {
    switch (type) {
      case 'Изображение': return 'image';
      case 'Аудио': return 'audio';
      case 'Видео': return 'video';
      default: return 'file';
    }
  }

  async startProcessing() {
    if (this.files.length === 0) {
      alert('Пожалуйста, загрузите файлы для обработки');
      return;
    }

    const processBtn = document.getElementById('processBtn');
    const progressBar = document.getElementById('progressBar');
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    const downloadSection = document.getElementById('downloadSection');

    processBtn.disabled = true;
    processBtn.textContent = '🔄 Обработка...';

    progressBar.classList.remove('hidden');
    progress.style.width = '0%';

    result.classList.add('hidden');
    downloadSection.classList.add('hidden');
    this.processedFiles = [];

    const settings = {
      imageSizes: document.getElementById('imageSizes').value,
      selectedBackground: this.currentSettings.selectedBackground,
      selectedVideoResolution: this.currentSettings.selectedVideoResolution,
      selectedVideoQuality: this.currentSettings.selectedVideoQuality,
      selectedVideoFormat: this.currentSettings.selectedVideoFormat
    };

    // === важная правка: строим smart-план ДО обработки ===
    this.prepareSmartNamingPlan(settings);

    try {
      await this.mediaProcessor.processFiles(
        this.files,
        settings,
        (percent) => { progress.style.width = `${percent}%`; },
        (processedBatch) => {
          this.processedFiles.push(...processedBatch);
          this.updateResultsUI();
        }
      );

      progress.style.width = '100%';
      result.classList.remove('hidden');
      downloadSection.classList.remove('hidden');
      document.getElementById('downloadAllBtn').onclick = () => this.downloadAllAsZip();

    } catch (error) {
      console.error('Ошибка обработки:', error);
      this.showError('Ошибка обработки: ' + error.message);
    } finally {
      processBtn.disabled = false;
      processBtn.textContent = '🚀 Начать обработку';
    }
  }

  updateResultsUI() {
    const resultFiles = document.getElementById('resultFiles');
    let html = '';
    let totalOriginal = 0;
    let totalCompressed = 0;

    this.processedFiles.forEach((file, index) => {
      totalOriginal += file.originalSize;
      totalCompressed += file.compressedSize;

      const compression = file.originalSize > 0 ? Math.round((1 - file.compressedSize / file.originalSize) * 100) : 0;
      const compressionText = compression > 0 ? ` (сжатие: ${compression}%)` : '';
      const note = file.note ? `<div style="font-size:0.8em;color:#666;">${file.note}</div>` : '';

      html += `
        <div class="result-file">
          <div>
            <strong>${FileUtils.escapeHtmlAttr(file.name)}</strong>
            <div class="file-size-compression">
              ${FileUtils.formatFileSize(file.originalSize)} →
              ${FileUtils.formatFileSize(file.compressedSize)}${compressionText}
              ${file.resolution ? ` • ${file.resolution}` : ''}
              ${file.format ? ` • ${String(file.format).toUpperCase()}` : ''}
              ${file.bitrate ? ` • ${file.bitrate}` : ''}
            </div>
            ${note}
          </div>
           <button class="download-btn" data-action="download-single" data-index="${index}">📥 Скачать</button>
        </div>
      `;
    });

    const totalCompression = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0;

    const statsHtml = `
      <div style="margin-bottom:15px;padding:10px;background:#d4edda;border-radius:8px;">
        <strong>📊 Итоговая статистика:</strong><br>
        Обработано файлов: ${this.processedFiles.length}<br>
        Общий размер: ${FileUtils.formatFileSize(totalOriginal)} → ${FileUtils.formatFileSize(totalCompressed)}<br>
        Общее сжатие: ${totalCompression}%
      </div>
    `;

    resultFiles.innerHTML = statsHtml + html;
  }

  downloadSingleFile(index) {
    if (index >= 0 && index < this.processedFiles.length) {
      const file = this.processedFiles[index];
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  async downloadAllAsZip() {
    try {
      const zip = new JSZip();
      const folder = zip.folder("processed_files");

      this.processedFiles.forEach(file => folder.file(file.name, file.blob));

      const readme = `
Обработанные медиафайлы
Дата: ${new Date().toLocaleDateString()}
Всего файлов: ${this.processedFiles.length}

Настройки обработки:
- Фон изображений: ${this.currentSettings.selectedBackground}
- Разрешение видео: ${this.currentSettings.selectedVideoResolution}
- Качество видео: ${this.currentSettings.selectedVideoQuality}
- Формат видео: ${this.currentSettings.selectedVideoFormat}

Создано с помощью MediaProcessor | Relation-AI
      `.trim();

      folder.file("README.txt", readme);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `processed_files_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка создания ZIP:', error);
      this.showError('Ошибка создания архива: ' + error.message);
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'temp-message error-message';
    errorDiv.innerHTML = `<strong>❌ Ошибка:</strong> ${FileUtils.escapeHtmlAttr(message)}`;

    const container = document.querySelector('.container');
    container.insertBefore(errorDiv, container.children[1]);

    setTimeout(() => errorDiv.remove(), 6000);
  }

  /* =======================
     AI: советник (реальный)
  ======================= */
  getAIAdvice() {
    const aiTip = document.getElementById('aiTip');
    const aiResults = document.getElementById('aiResults');
    const aiStats = document.getElementById('aiStats');
    const aiTipsList = document.getElementById('aiTipsList');

    const total = this.files.length;
    const images = this.files.filter(f => FileUtils.getFileType(f.name) === 'Изображение');
    const audios = this.files.filter(f => FileUtils.getFileType(f.name) === 'Аудио');
    const videos = this.files.filter(f => FileUtils.getFileType(f.name) === 'Видео');
    const totalSize = this.files.reduce((s, f) => s + f.size, 0);

    const tips = [];

    const ffmpegReady = this.mediaProcessor?.videoProcessor?.isFFmpegReady;
    const corePath = this.mediaProcessor?.videoProcessor?.loadedCorePath || '—';
    const coreMode = this.mediaProcessor?.videoProcessor?.coreMode || '—';

    if (!ffmpegReady) {
      tips.push('FFmpeg WASM сейчас недоступен → видео/аудио могут выходить “как оригинал”. Если видишь SharedArrayBuffer/CORS — добавь COOP/COEP через vercel.json и/или проверь пути /ffmpeg/*.');
    } else {
      tips.push(`FFmpeg готов ✅ (${coreMode}, corePath: ${corePath.includes('http') ? 'CDN' : 'local'})`);
    }

    const png = document.getElementById('formatPNG').checked;
    const jpg = document.getElementById('formatJPG').checked;
    if (images.length && !png && !jpg) tips.push('Для изображений не выбраны форматы вывода (PNG/JPG). Сейчас будет использован формат исходника автоматически.');

    const mp3 = document.getElementById('audioMP3').checked;
    const ogg = document.getElementById('audioOGG').checked;
    if (audios.length && !mp3 && !ogg) tips.push('Для аудио не выбран формат (MP3/OGG). Иначе аудио выйдет “как есть”.');

    const useSmart = document.getElementById('smartRenaming').checked;
    const base = this.getGlobalBaseName();
    if (useSmart && !base) tips.push('Умное переименование включено, но “общее имя” пустое → заполни, иначе будет image/audio/video.');
    if (useSmart && base && audios.length) tips.push('Для аудио умное переименование использует цифры из исходного имени: base+число (пример: audio_hook333.mp3).');

    if (videos.length > 2) tips.push('Видео > 2 шт: лучше обрабатывать 1–2 видео за раз, иначе возможны вылеты по памяти (особенно на больших файлах).');

    const bg = this.currentSettings.selectedBackground;
    if (jpg && bg === 'transparent') tips.push('Выбран “Прозрачный” фон, но JPG прозрачность не поддерживает → будет заливка белым.');

    const sizesRaw = (document.getElementById('imageSizes').value || '').split(',').map(s => s.trim()).filter(Boolean);
    if (sizesRaw.length > 8) tips.push('Слишком много размеров изображений → сильная нагрузка и большой ZIP. Лучше 3–6 размеров за раз.');

    if (aiTip) {
      aiTip.querySelector('.ai-tip-header strong').textContent = 'Рекомендации готовы';
      aiTip.querySelector('.ai-tip-content').textContent = tips[0] || 'Нет рекомендаций — всё выглядит нормально.';
    }

    aiStats.innerHTML = `
      <strong>📌 Сводка:</strong><br>
      Файлов: ${total} • ${FileUtils.formatFileSize(totalSize)}<br>
      Изображения: ${images.length} • Аудио: ${audios.length} • Видео: ${videos.length}<br>
      Видео: ${this.currentSettings.selectedVideoResolution}, качество: ${this.currentSettings.selectedVideoQuality}
    `;

    aiTipsList.innerHTML = tips.map(t => `<div class="ai-tip-item">${t}</div>`).join('');
    aiResults.classList.remove('hidden');
  }

  /* =======================
     AI: анализ изображений
  ======================= */
  async analyzeAllImages() {
    const aiResults = document.getElementById('aiResults');
    const aiStats = document.getElementById('aiStats');
    const aiTipsList = document.getElementById('aiTipsList');

    const images = this.files.filter(f => FileUtils.getFileType(f.name) === 'Изображение');
    if (!images.length) {
      this.showError('Нет изображений для анализа.');
      return;
    }

    const results = [];
    for (const file of images.slice(0, 30)) {
      const info = await this.getImageInfo(file);
      results.push(info);
    }

    const big = results.filter(r => r.megapixels >= 4).length;
    const small = results.filter(r => r.megapixels < 1).length;

    aiStats.innerHTML = `
      <strong>🎨 Анализ изображений:</strong><br>
      Проанализировано: ${results.length}<br>
      ≥4MP: ${big} • &lt;1MP: ${small}<br>
      Совет: не увеличивай размер больше исходного, чтобы избежать мыла.
    `;

    aiTipsList.innerHTML = results.map(r => {
      const warn = r.tooSmall ? ' ⚠️ мало пикселей' : '';
      return `<div class="ai-tip-item"><strong>${FileUtils.escapeHtmlAttr(r.name)}</strong><br>${r.w}×${r.h} (${r.megapixels.toFixed(2)} MP) • ${FileUtils.formatFileSize(r.size)}${warn}</div>`;
    }).join('');

    aiResults.classList.remove('hidden');
  }

  getImageInfo(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const w = img.width, h = img.height;
          const mp = (w * h) / 1_000_000;
          resolve({
            name: file.name,
            size: file.size,
            w, h,
            megapixels: mp,
            tooSmall: (w < 600 || h < 600)
          });
        };
        img.onerror = () => resolve({ name: file.name, size: file.size, w: 0, h: 0, megapixels: 0, tooSmall: true });
        img.src = e.target.result;
      };
      reader.onerror = () => resolve({ name: file.name, size: file.size, w: 0, h: 0, megapixels: 0, tooSmall: true });
      reader.readAsDataURL(file);
    });
  }

  /* =======================
     AI: анализ бренда (палитра + рекомендации)
  ======================= */
  async analyzeBrandAssets() {
    const out = document.getElementById('brandAnalysisResults');
    out.classList.add('hidden');
    out.innerHTML = '';

    const images = this.files.filter(f => FileUtils.getFileType(f.name) === 'Изображение');
    if (!images.length) {
      this.showError('Для анализа бренда нужны изображения.');
      return;
    }

    const sample = images.slice(0, 6);
    const paletteMap = new Map();
    let brightnessSum = 0;
    let brightnessCount = 0;

    let squareish = 0;
    let wide = 0;
    let tall = 0;

    for (const file of sample) {
      const { colors, avgBrightness, ratio } = await this.sampleImageColors(file);
      brightnessSum += avgBrightness;
      brightnessCount++;

      if (ratio > 0.85 && ratio < 1.18) squareish++;
      else if (ratio >= 1.18) wide++;
      else tall++;

      for (const [hex, count] of colors.entries()) {
        paletteMap.set(hex, (paletteMap.get(hex) || 0) + count);
      }
    }

    const avgB = brightnessCount ? (brightnessSum / brightnessCount) : 0.6;

    const top = [...paletteMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([hex]) => hex);

    const recommendedBg = (avgB < 0.45) ? 'white' : 'lightgray';
    const recommendedPreset = (squareish >= wide && squareish >= tall) ? 'logos' : (tall > wide ? 'vertical' : 'creatives');

    this.lastBrandRecommendations = { recommendedBg, recommendedPreset, palette: top };

    const paletteHtml = top.length
      ? `<div class="color-palette">${top.map(hex => `<div class="color-swatch" style="background:${hex}" data-hex="${hex}"></div>`).join('')}</div>`
      : `<div style="opacity:.9;">Не удалось построить палитру (попробуй PNG/JPG без SVG).</div>`;

    out.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div><strong>🎯 Результаты анализа бренда</strong></div>
         <button class="ai-btn secondary" data-action="apply-brand-recommendations" style="flex:0 0 auto;">✅ Применить рекомендации</button>
      </div>
      <div style="margin-top:10px;opacity:.95;">
        Средняя “светлота” визуала: <strong>${Math.round(avgB * 100)}%</strong><br>
        Рекомендованный фон: <strong>${recommendedBg}</strong> • Рекомендованный пресет: <strong>${recommendedPreset}</strong>
      </div>
      <div style="margin-top:10px;"><strong>Палитра (топ цветов):</strong>${paletteHtml}</div>
      <div style="margin-top:10px;font-size:.92em;opacity:.9;">
        Совет: закрепи палитру (2 нейтрала + 1 акцент) и делай одинаковые подложки → карточки будут выглядеть “брендово”.
      </div>
    `;

    out.classList.remove('hidden');

    if (document.getElementById('aiAnalysis').checked) {
      this.applyBrandRecommendations();
    }
  }

  applyBrandRecommendations() {
    if (!this.lastBrandRecommendations) return;

    const { recommendedBg, recommendedPreset } = this.lastBrandRecommendations;
    this.setBackgroundSelection(recommendedBg);
    this.loadPreset(recommendedPreset);

    const aiTip = document.getElementById('aiTip');
    if (aiTip) {
      aiTip.querySelector('.ai-tip-header strong').textContent = 'Рекомендации применены';
      aiTip.querySelector('.ai-tip-content').textContent = `Фон: ${recommendedBg}, пресет размеров: ${recommendedPreset}.`;
    }
  }

  sampleImageColors(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const max = 180;
          const scale = Math.min(max / img.width, max / img.height, 1);
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));

          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);

          const data = ctx.getImageData(0, 0, w, h).data;

          const colors = new Map();
          let bSum = 0;
          let bN = 0;

          const step = 6;
          for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
              const i = (y * w + x) * 4;
              const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
              if (a < 30) continue;

              const q = 32;
              const rq = Math.floor(r / q) * q;
              const gq = Math.floor(g / q) * q;
              const bq = Math.floor(b / q) * q;

              const hex = '#' + [rq, gq, bq].map(v => v.toString(16).padStart(2, '0')).join('');
              colors.set(hex, (colors.get(hex) || 0) + 1);

              const br = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
              bSum += br;
              bN++;
            }
          }

          const ratio = img.width / img.height;
          resolve({ colors, avgBrightness: bN ? bSum / bN : 0.6, ratio });
        };
        img.onerror = () => resolve({ colors: new Map(), avgBrightness: 0.6, ratio: 1 });
        img.src = e.target.result;
      };
      reader.onerror = () => resolve({ colors: new Map(), avgBrightness: 0.6, ratio: 1 });
      reader.readAsDataURL(file);
    });
  }

  /* =======================
     misc controls
  ======================= */
  resetAllSettings() {
    this.currentSettings = this.getDefaultSettings();
    document.getElementById('imageSizes').value = this.currentSettings.imageSizes;

    document.querySelectorAll('.resolution-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('.resolution-option[data-resolution="640x360"]').classList.add('selected');

    document.querySelectorAll('.video-format-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('.video-format-option[data-format="mp4"]').classList.add('selected');

    document.querySelectorAll('.video-quality-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('.video-quality-option[data-quality="medium"]').classList.add('selected');

    this.setBackgroundSelection('white');

    alert('Настройки сброшены!');
    this.updateNamingExample();
  }

  clearAllCheckboxes() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    this.updateNamingExample();
    alert('Все галочки убраны!');
  }

  selectAllCheckboxes(type) {
    let selector = '';
    switch (type) {
      case 'image': selector = '#formatPNG, #formatJPG'; break;
      case 'audio': selector = '#audioMP3, #audioOGG'; break;
      case 'ai': selector = '#aiAnalysis'; break;
    }
    if (selector) document.querySelectorAll(selector).forEach(cb => cb.checked = true);
    this.updateNamingExample();
  }

  clearCheckboxes(type) {
    let selector = '';
    switch (type) {
      case 'image': selector = '#formatPNG, #formatJPG'; break;
      case 'audio': selector = '#audioMP3, #audioOGG'; break;
      case 'ai': selector = '#aiAnalysis'; break;
    }
    if (selector) document.querySelectorAll(selector).forEach(cb => cb.checked = false);
    this.updateNamingExample();
  }

  loadPreset(preset) {
    switch (preset) {
      case 'creatives': document.getElementById('imageSizes').value = '1200x600, 800x400, 600x300'; break;
      case 'vertical': document.getElementById('imageSizes').value = '1080x1920, 800x1400, 400x700'; break;
      case 'logos': document.getElementById('imageSizes').value = '800x800, 400x400, 200x200'; break;
      case 'icons': document.getElementById('imageSizes').value = '256x256, 128x128, 64x64, 32x32'; break;
    }
    alert(`Пресет "${preset}" загружен!`);
    this.updateNamingExample();
  }
}

/* =======================
   Init
======================= */
let appState;
