/* =============================================
   HITSTER PWA — app.js
   QR Scanner + Audio Logic
   ============================================= */

'use strict';

// === STATE ===
let html5QrCode = null;
let songDatabase = {};
let audioPlayer = null;
let isScanning = false;
let progressInterval = null;

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  audioPlayer = document.getElementById('audio-player');
  registerServiceWorker();
  loadSongDatabase();
  setupAudioListeners();
  lockOrientation();
});

// === SERVICE WORKER ===
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

// === LOCK ORIENTATION ===
function lockOrientation() {
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('portrait').catch(() => {
      // Silently fail — iOS doesn't support this API, CSS overlay handles it
    });
  }
}

// === SONG DATABASE ===
async function loadSongDatabase() {
  try {
    const response = await fetch('songs.json');
    if (!response.ok) throw new Error('songs.json not found');
    songDatabase = await response.json();
    console.log('[Hitster] Song database loaded:', Object.keys(songDatabase).length, 'songs');
  } catch (err) {
    console.error('[Hitster] Could not load songs.json:', err);
    songDatabase = {};
  }
}

// === SCREEN NAVIGATION ===
function showScreen(id) {
  // Stop audio if leaving playing screen
  if (id !== 'playing') {
    pauseAudio();
  }

  // Stop scanner if leaving scanner screen
  if (id !== 'scanner' && isScanning) {
    stopScannerOnly();
  }

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.add('hidden');
    screen.classList.remove('active');
  });

  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
}

function goHome() {
  stopAudio();
  showScreen('home');
}

function goToScanner() {
  showScreen('scanner');
  setTimeout(() => startScanning(), 100);
}

// === APP START ===
function startApp() {
  showScreen('scanner');
  setTimeout(() => startScanning(), 200);
}

// === QR SCANNER ===
async function startScanning() {
  if (isScanning) return;

  const readerEl = document.getElementById('reader');
  if (!readerEl) return;

  // Clear previous instance
  readerEl.innerHTML = '';

  setScanStatus('Camera wordt gestart…');

  try {
    html5QrCode = new Html5Qrcode('reader');

    const config = {
      fps: 15,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
      showTorchButtonIfSupported: false,
      showZoomSliderIfSupported: false,
      defaultZoomValueIfSupported: 1,
      // Disable built-in UI chrome
      disableFlip: false,
      rememberLastUsedCamera: true,
    };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      onQrSuccess,
      onQrError
    );

    isScanning = true;
    setScanStatus('Houd de QR-code voor de camera');

    // Hide html5-qrcode default header/footer elements
    cleanupScannerUI();

  } catch (err) {
    console.error('[Scanner] Could not start:', err);
    isScanning = false;

    if (err.name === 'NotAllowedError' || String(err).includes('NotAllowedError')) {
      setScanStatus('⚠️ Cameratoegang geweigerd. Geef toestemming in je instellingen.');
    } else if (err.name === 'NotFoundError' || String(err).includes('NotFoundError')) {
      setScanStatus('⚠️ Geen camera gevonden op dit apparaat.');
    } else {
      setScanStatus('⚠️ Camera kon niet starten. Probeer opnieuw.');
    }
  }
}

function cleanupScannerUI() {
  // Remove extra UI elements added by html5-qrcode library
  setTimeout(() => {
    const reader = document.getElementById('reader');
    if (!reader) return;

    // Hide default UI elements the library adds
    const selectors = [
      '#reader__dashboard',
      '#reader__dashboard_section',
      '#reader__dashboard_section_csr',
      '#reader__header_message',
      '#reader__status_span',
      '#reader__camera_selection',
      'select',
      'button:not(#playpause-btn):not(.btn):not(.back-btn):not(.btn-playing)',
    ];

    selectors.forEach(sel => {
      reader.querySelectorAll(sel).forEach(el => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
      });
    });
  }, 500);
}

function onQrSuccess(decodedText) {
  const key = decodedText.trim().toLowerCase();
  console.log('[Scanner] QR detected:', key);

  const song = songDatabase[key];

  if (!song) {
    setScanStatus(`❓ Onbekende kaart: "${decodedText}"`);
    // Brief vibration feedback
    if (navigator.vibrate) navigator.vibrate(50);
    return;
  }

  // Haptic + stop scanner
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  stopScannerOnly();

  // Navigate to playing screen
  showScreen('playing');
  playAudio(song.file, key);
}

function onQrError(errorMessage) {
  // Suppress continuous scan errors (normal when no QR in view)
}

async function stopScannerOnly() {
  if (!html5QrCode) return;
  isScanning = false;
  try {
    const state = html5QrCode.getState();
    if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
      await html5QrCode.stop();
    }
  } catch (err) {
    // Ignore stop errors
  }
  html5QrCode = null;
}

async function stopScanning() {
  await stopScannerOnly();
  showScreen('home');
}

function setScanStatus(msg) {
  const el = document.getElementById('scan-status');
  if (el) el.textContent = msg;
}

// === AUDIO ===
function playAudio(filePath, key) {
  stopAudio();

  const label = document.getElementById('now-playing-label');
  if (label) label.textContent = key.toUpperCase();

  audioPlayer.src = filePath;
  audioPlayer.load();
  audioPlayer.play().catch(err => {
    console.error('[Audio] Playback failed:', err);
  });

  setPlayIcon('pause');
  startProgressTracker();

  // Keep GIF running
  const gif = document.getElementById('play-visual');
  if (gif) gif.classList.remove('paused');
}

function pauseAudio() {
  if (!audioPlayer.paused) {
    audioPlayer.pause();
    setPlayIcon('play');
    const gif = document.getElementById('play-visual');
    if (gif) gif.classList.add('paused');
  }
}

function stopAudio() {
  clearProgressInterval();
  audioPlayer.pause();
  audioPlayer.src = '';
  audioPlayer.load();
  setPlayIcon('play');
  setProgress(0);
  const gif = document.getElementById('play-visual');
  if (gif) gif.classList.add('paused');
}

function togglePlayPause() {
  if (audioPlayer.paused) {
    audioPlayer.play().catch(console.error);
    setPlayIcon('pause');
    const gif = document.getElementById('play-visual');
    if (gif) gif.classList.remove('paused');
  } else {
    pauseAudio();
  }
}

function setPlayIcon(state) {
  const icon = document.getElementById('play-icon');
  if (!icon) return;
  icon.className = state === 'pause'
    ? 'fa-solid fa-pause'
    : 'fa-solid fa-play';
}

// === PROGRESS BAR ===
function startProgressTracker() {
  clearProgressInterval();
  progressInterval = setInterval(() => {
    if (!audioPlayer.duration) return;
    const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    setProgress(pct);
    setTimeLabel('time-current', audioPlayer.currentTime);
    setTimeLabel('time-total', audioPlayer.duration);
  }, 500);
}

function clearProgressInterval() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function setProgress(pct) {
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = pct + '%';
}

function setTimeLabel(id, seconds) {
  const el = document.getElementById(id);
  if (!el || isNaN(seconds)) return;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

// === AUDIO EVENT LISTENERS ===
function setupAudioListeners() {
  audioPlayer.addEventListener('ended', () => {
    clearProgressInterval();
    setPlayIcon('play');
    setProgress(100);
    const gif = document.getElementById('play-visual');
    if (gif) gif.classList.add('paused');
  });

  audioPlayer.addEventListener('play', () => {
    setPlayIcon('pause');
    startProgressTracker();
  });

  audioPlayer.addEventListener('pause', () => {
    setPlayIcon('play');
    clearProgressInterval();
  });

  audioPlayer.addEventListener('error', (e) => {
    console.error('[Audio] Error loading file:', e);
    const label = document.getElementById('now-playing-label');
    if (label) label.textContent = '⚠️ Bestand niet gevonden';
  });
}