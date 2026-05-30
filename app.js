/* ============================================
   HITSTER PWA — APP.JS
   Schermlogica, QR-scanner & Audio
   ============================================ */

'use strict';

// === GLOBALE STATE ===
let songsDatabase = {};
let currentAudio = null;
let isPlaying = false;
let html5QrCode = null;
let scannerActive = false;

// === DOM REFERENTIES ===
const screens = {
  home: document.getElementById('home'),
  scanner: document.getElementById('scanner'),
  playing: document.getElementById('playing'),
  rules: document.getElementById('rules')
};

const playIcon = document.getElementById('play-icon');
const toastEl = document.getElementById('toast');

// === INITIALISATIE ===
document.addEventListener('DOMContentLoaded', async () => {
  // Laad songs database
  await loadSongsDatabase();

  // Registreer Service Worker
  registerServiceWorker();

  // Verberg laadscherm
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => overlay.remove(), 600);
  }
});

// === SERVICE WORKER REGISTRATIE ===
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[App] Service Worker geregistreerd:', reg.scope))
      .catch(err => console.warn('[App] Service Worker registratie mislukt:', err));
  }
}

// === SONGS DATABASE LADEN ===
async function loadSongsDatabase() {
  try {
    const response = await fetch('songs.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    songsDatabase = await response.json();
    console.log('[App] Songs database geladen:', Object.keys(songsDatabase).length, 'nummers');
  } catch (err) {
    console.error('[App] Kon songs.json niet laden:', err);
    showToast('Fout bij laden van nummers');
  }
}

// === SCHERM WISSELEN ===
function showScreen(screenId) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  if (screens[screenId]) {
    screens[screenId].classList.remove('hidden');
  }
}

// === HOME SCHERM ===
function startApp() {
  goToScanner();
}

// === SCANNER SCHERM ===
function goToScanner() {
  stopAudio();
  showScreen('scanner');
  startScanning();
}

async function startScanning() {
  if (scannerActive) return;

  // Controleer of html5-qrcode library geladen is
  if (typeof Html5Qrcode === 'undefined') {
    showToast('QR-scanner niet beschikbaar');
    showScreen('home');
    return;
  }

  try {
    html5QrCode = new Html5Qrcode('reader');

    const qrboxSize = Math.min(220, window.innerWidth - 80);

    await html5QrCode.start(
      { facingMode: 'environment' }, // Gebruik achtercamera
      {
        fps: 10,
        qrbox: { width: qrboxSize, height: qrboxSize },
        aspectRatio: 1.0,
        disableFlip: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      },
      onScanSuccess,
      onScanError
    );

    scannerActive = true;
    console.log('[App] Scanner gestart');
  } catch (err) {
    console.error('[App] Scanner fout:', err);

    if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
      showToast('Camera toegang geweigerd');
    } else {
      showToast('Kon camera niet starten');
    }
    showScreen('home');
  }
}

function onScanSuccess(decodedText) {
  console.log('[App] QR gescand:', decodedText);

  const qrKey = decodedText.trim().toLowerCase();

  if (songsDatabase[qrKey]) {
    // Haptic feedback (werkt op iOS/Android)
    if (navigator.vibrate) navigator.vibrate(80);

    stopScanning();
    playAudio(songsDatabase[qrKey].file);
    showScreen('playing');
  } else {
    // Onbekende QR-code
    showToast('Kaart niet herkend: ' + qrKey);
    console.warn('[App] Geen nummer gevonden voor:', qrKey);
  }
}

function onScanError(errorMessage) {
  // Stille fout — QR-codes worden continu gescand en fouten zijn normaal
}

function stopScanning() {
  if (html5QrCode && scannerActive) {
    html5QrCode.stop()
      .then(() => {
        html5QrCode = null;
        scannerActive = false;
        console.log('[App] Scanner gestopt');
      })
      .catch(err => {
        console.warn('[App] Fout bij stoppen scanner:', err);
        html5QrCode = null;
        scannerActive = false;
      });
  }
}

function stopScanningAndGoHome() {
  stopScanning();
  stopAudio();
  showScreen('home');
}

// === AUDIO AFSPELEN ===
function playAudio(filePath) {
  stopAudio();

  currentAudio = new Audio(filePath);
  currentAudio.preload = 'auto';

  currentAudio.addEventListener('canplaythrough', () => {
    currentAudio.play()
      .then(() => {
        isPlaying = true;
        updatePlayIcon();
        console.log('[App] Audio afspelen:', filePath);
      })
      .catch(err => {
        console.error('[App] Afspelen mislukt:', err);
        showToast('Kon nummer niet afspelen');
      });
  });

  currentAudio.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayIcon();
  });

  currentAudio.addEventListener('error', (e) => {
    console.error('[App] Audio laad fout:', e);
    showToast('MP3 bestand niet gevonden');
    isPlaying = false;
    updatePlayIcon();
  });

  currentAudio.load();
}

function togglePlayPause() {
  if (!currentAudio) return;

  if (isPlaying) {
    currentAudio.pause();
    isPlaying = false;
  } else {
    currentAudio.play().catch(err => console.error('[App] Play mislukt:', err));
    isPlaying = true;
  }

  updatePlayIcon();

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(30);
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  isPlaying = false;
  updatePlayIcon();
}

function updatePlayIcon() {
  if (!playIcon) return;
  if (isPlaying) {
    playIcon.classList.remove('fa-play');
    playIcon.classList.add('fa-pause');
  } else {
    playIcon.classList.remove('fa-pause');
    playIcon.classList.add('fa-play');
  }
}

// === SPELREGELS SCHERM ===
function showRules() {
  showScreen('rules');
}

function backToHome() {
  stopAudio();
  stopScanning();
  showScreen('home');
}

// === TOAST NOTIFICATIE ===
let toastTimeout = null;

function showToast(message) {
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

// === PREVENTIEF: voorkom zoom op iOS ===
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

// Dubbelklik zoom voorkomen
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// === AUDIO SESSIE (iOS achtergrond audio) ===
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // App gaat naar achtergrond — audio gaat door
    console.log('[App] App naar achtergrond');
  }
});
