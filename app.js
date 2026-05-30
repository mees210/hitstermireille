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
// Supports BOTH normal (zwart op wit) and inverted (wit op donker) QR codes.
// Strategy: start the camera stream zelf via getUserMedia, trek frames naar een
// hidden canvas, scan die normaal én geïnverteerd elke ~100ms met jsQR.

let cameraStream = null;
let scanLoopActive = false;
let scanCanvas = null;
let scanCtx = null;
let scanVideo = null;

async function startScanning() {
  if (isScanning) return;

  const readerEl = document.getElementById('reader');
  if (!readerEl) return;

  readerEl.innerHTML = '';
  setScanStatus('Camera wordt gestart…');

  // Lazy-load jsQR (lightweight, works with inverted QR via invert option)
  await loadJsQR();

  try {
    // Request camera
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 640 },
      },
      audio: false,
    });

    // Create video element inside #reader
    scanVideo = document.createElement('video');
    scanVideo.setAttribute('playsinline', '');
    scanVideo.setAttribute('autoplay', '');
    scanVideo.setAttribute('muted', '');
    scanVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:18px;display:block;';
    readerEl.appendChild(scanVideo);

    scanVideo.srcObject = cameraStream;
    await scanVideo.play();

    // Hidden canvas for frame processing
    scanCanvas = document.createElement('canvas');
    scanCanvas.width = 640;
    scanCanvas.height = 640;
    scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

    isScanning = true;
    scanLoopActive = true;
    setScanStatus('Houd de QR-code voor de camera');

    requestAnimationFrame(scanLoop);

  } catch (err) {
    console.error('[Scanner] Could not start:', err);
    isScanning = false;
    scanLoopActive = false;

    const msg = String(err);
    if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
      setScanStatus('⚠️ Cameratoegang geweigerd. Geef toestemming in je instellingen.');
    } else if (msg.includes('NotFoundError')) {
      setScanStatus('⚠️ Geen camera gevonden op dit apparaat.');
    } else {
      setScanStatus('⚠️ Camera kon niet starten. Probeer opnieuw.');
    }
  }
}

// Load jsQR dynamically (small lib, ~26kb, handles inverted QR natively)
function loadJsQR() {
  return new Promise((resolve, reject) => {
    if (window.jsQR) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Frame scanning loop — checks normal AND inverted every frame
function scanLoop() {
  if (!scanLoopActive || !scanVideo || scanVideo.readyState < 2) {
    if (scanLoopActive) requestAnimationFrame(scanLoop);
    return;
  }

  const vw = scanVideo.videoWidth;
  const vh = scanVideo.videoHeight;
  if (!vw || !vh) {
    if (scanLoopActive) requestAnimationFrame(scanLoop);
    return;
  }

  // Draw current video frame to canvas
  scanCanvas.width = vw;
  scanCanvas.height = vh;
  scanCtx.drawImage(scanVideo, 0, 0, vw, vh);

  const imageData = scanCtx.getImageData(0, 0, vw, vh);

  // 1. Try normal scan
  let result = window.jsQR(imageData.data, vw, vh, {
    inversionAttempts: 'attemptBoth', // ← this is the key: tries both normal and inverted
  });

  if (result && result.data) {
    onQrSuccess(result.data);
    return; // Stop loop after success
  }

  if (scanLoopActive) requestAnimationFrame(scanLoop);
}

function onQrSuccess(decodedText) {
  if (!isScanning) return; // Prevent double-trigger

  const key = decodedText.trim().toLowerCase();
  console.log('[Scanner] QR detected:', key);

  const song = songDatabase[key];

  if (!song) {
    setScanStatus(`❓ Onbekende kaart: "${decodedText}"`);
    if (navigator.vibrate) navigator.vibrate(50);
    return;
  }

  // Haptic feedback + stop scanner
  if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
  stopScannerOnly();

  // Navigate to playing screen
  showScreen('playing');
  playAudio(song.file, key);
}

function stopCameraStream() {
  scanLoopActive = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (scanVideo) {
    scanVideo.srcObject = null;
    scanVideo = null;
  }
  scanCtx = null;
  scanCanvas = null;
}

async function stopScannerOnly() {
  isScanning = false;
  stopCameraStream();

  // Also stop html5QrCode if somehow still running
  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch (_) {}
    html5QrCode = null;
  }

  // Clear the reader element
  const readerEl = document.getElementById('reader');
  if (readerEl) readerEl.innerHTML = '';
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