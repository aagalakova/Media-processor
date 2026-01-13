// Auto-extracted from index.html

export function setFFmpegStatus(text, level = 'warn') {
  const el = document.getElementById('ffmpegStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('ok', 'warn', 'err');
  el.classList.add(level);
}
