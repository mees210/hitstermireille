# Hitster PWA

Gepersonaliseerd Hitster muziekspel voor Mireille — als Progressive Web App.

## Mapstructuur

```
Hitster-App/
├── index.html          ← Hoofd HTML (4 schermen)
├── style.css           ← Styling & animaties
├── app.js              ← Spellogica, QR-scanner, audio
├── songs.json          ← Koppeling QR-codes ↔ MP3's
├── sw.js               ← Service Worker (offline)
├── manifest.json       ← PWA installatie-config
├── assets/
│   ├── homelogo.png    ← Ronde foto op het startscherm
│   ├── afspeelcirkel.gif ← Animatie achter play-knop
│   ├── icon-192.png    ← App-icoon 192×192px
│   └── icon-512.png    ← App-icoon 512×512px
└── songs/
    ├── skyfall.mp3
    ├── flowers.mp3
    └── angels.mp3      ← Voeg hier al je MP3's toe
```

## Nummers toevoegen

1. Zet je `.mp3` bestanden in de map `songs/`
2. Open `songs.json` en voeg een regel toe per nummer:

```json
{
  "qr001": { "file": "songs/skyfall.mp3" },
  "qr002": { "file": "songs/flowers.mp3" },
  "qr042": { "file": "songs/jouwNummer.mp3" }
}
```

3. De **key** (`"qr042"`) moet exact overeenkomen met de tekst op de QR-code.

## QR-codes aanmaken

Maak QR-codes met **alleen platte tekst** als inhoud (geen URL):
- `qr001`, `qr002`, `qr003`, etc.

Gratis tools: [qr-code-generator.com](https://www.qr-code-generator.com) of [goqr.me](https://goqr.me)

Print ze uit en plak op de achterkant van je speelkaarten.

## Hosten (verplicht voor camera + offline)

### Optie A: GitHub Pages (gratis)
1. Maak een gratis account op [github.com](https://github.com)
2. Maak een nieuw repository aan
3. Upload alle bestanden
4. Ga naar Settings → Pages → Source: main branch
5. Je krijgt een link: `https://jouwNaam.github.io/hitster/`

### Optie B: Netlify (gratis, nog makkelijker)
1. Ga naar [netlify.com](https://netlify.com)
2. Sleep je hele map op de uploadpagina
3. Klaar! Je krijgt direct een `https://` link

### Optie C: Vercel (gratis)
1. Ga naar [vercel.com](https://vercel.com)
2. Importeer vanuit GitHub of upload direct

## Installeren op telefoon

### iOS (Safari):
1. Open de HTTPS-link in **Safari**
2. Tik op het **Deel-icoon** (vierkantje met pijltje)
3. Kies **"Zet op beginscherm"**

### Android (Chrome):
1. Open de HTTPS-link in **Chrome**
2. Tik op de **drie puntjes** (⋮)
3. Kies **"App installeren"** of **"Toevoegen aan startscherm"**

## Lokaal testen

Gebruik VS Code met de **Live Server** extensie, of:

```bash
# Python 3
python3 -m http.server 8000

# Dan open: http://localhost:8000
```

> Camera werkt alleen via `https://` of `localhost`
