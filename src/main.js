// Auto-extracted from index.html

import { AppState } from './AppState.js';

let appState;
document.addEventListener('DOMContentLoaded', () => {
  appState = new AppState();
  window.appState = appState;

  document.getElementById('customColorHex').addEventListener('change', (e) => {
    let value = e.target.value.trim();
    if (!value.startsWith('#')) value = '#' + value;
    e.target.value = value;
    if (value.length === 4 || value.length === 7) {
      document.getElementById('customColorPicker').value = value;
      appState.updateCustomPreview();
    }
  });

  window.appState = appState;
});
