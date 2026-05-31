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
  checkIOSInstall();   // ← eerste check, blokkeert de rest als nodig
  registerServiceWorker();
  loadSongDatabase();
  setupAudioListeners();
  lockOrientation();
});

// =============================================
// iOS INSTALLATIE DETECTIE
// Toont de install-overlay op iOS Safari als
// de app NIET als standalone PWA geopend is.
// =============================================

function checkIOSInstall() {
  // 1. Detecteer iOS / iPadOS
  //    navigator.standalone bestaat alleen op iOS Safari
  //    iPad met iPadOS 13+ rapporteert zichzelf als MacIntel,
  //    maar heeft wel ontouchend — vandaar de dubbele check.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (!isIOS) return; // Niet iOS → niets doen

  // 2. Detecteer standalone mode
  //    navigator.standalone = true  →  geïnstalleerde PWA (iOS Safari)
  //    display-mode: standalone      →  geïnstalleerde PWA (moderne browsers)
  const isStandalone =
    ('standalone' in navigator && navigator.standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;

  if (isStandalone) return; // Al als PWA geopend → niets doen

  // 3. Toon overlay en blokkeer de rest van de app
  showIOSOverlay();
}

function showIOSOverlay() {
  const overlay = document.getElementById('ios-install-overlay');
  if (!overlay) return;

  // Maak overlay zichtbaar
  overlay.style.display = 'block';

  // Blokkeer scrollen op de body (de overlay heeft eigen scroll)
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';

  // Blokkeer alle pointer-events op de app-schermen
  document.querySelectorAll('.screen, #rotate-overlay').forEach(el => {
    el.style.pointerEvents = 'none';
    el.setAttribute('aria-hidden', 'true');
  });

  // Overlay is zelf toegankelijk
  overlay.setAttribute('aria-hidden', 'false');

  // Voorkom dat touchmove buiten de overlay scrolt
  document.addEventListener('touchmove', preventBodyScroll, { passive: false });

  // Herlaadfunctie: verberg overlay als app opnieuw geactiveerd wordt als standalone
  // (gebruiker heeft geïnstalleerd en opent nu via beginscherm)
  document.addEventListener('visibilitychange', recheckOnResume);
  window.addEventListener('focus', recheckOnResume);
}

function preventBodyScroll(e) {
  // Sta scrollen toe binnen de overlay zelf
  const overlay = document.getElementById('ios-install-overlay');
  if (overlay && overlay.contains(e.target)) return;
  e.preventDefault();
}

function recheckOnResume() {
  const isStandalone =
    ('standalone' in navigator && navigator.standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches;

  if (isStandalone) {
    hideIOSOverlay();
  }
}

function hideIOSOverlay() {
  const overlay = document.getElementById('ios-install-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }

  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';

  document.querySelectorAll('.screen, #rotate-overlay').forEach(el => {
    el.style.pointerEvents = '';
    el.removeAttribute('aria-hidden');
  });

  document.removeEventListener('touchmove', preventBodyScroll);
  document.removeEventListener('visibilitychange', recheckOnResume);
  window.removeEventListener('focus', recheckOnResume);
}


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