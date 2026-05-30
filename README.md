# Hitster PWA — Setup Handleiding

## Mappenstructuur

```
Hitster-App/
├── index.html
├── style.css
├── app.js
├── songs.json
├── sw.js
├── manifest.json
├── assets/
│   ├── homelogo.png       ← jouw ronde logo/foto voor het startscherm
│   ├── afspeelcirkel.gif  ← geanimeerde cirkel achter de play-knop
│   ├── icon-192.png       ← app-icoon 192×192 px
│   └── icon-512.png       ← app-icoon 512×512 px
└── songs/
    ├── skyfall.mp3
    ├── flowers.mp3
    └── ...                ← al je .mp3 bestanden
```

## Stap 1 — Bestanden plaatsen

1. Zet je `.mp3` bestanden in de map `songs/`
2. Zet je afbeeldingen in de map `assets/`
3. Open `songs.json` en vul de keys in die overeenkomen met je QR-codes:
   ```json
   {
     "qr001": { "file": "songs/jouw-nummer.mp3" },
     "qr002": { "file": "songs/ander-nummer.mp3" }
   }
   ```

## Stap 2 — QR-codes maken

- Ga naar bijv. https://www.qr-code-generator.com/
- Kies type: **tekst / vrije tekst**
- Vul in: `qr001` (exact de key uit songs.json)
- Download → print → plak op achterkant kaart

## Stap 3 — Hosten (HTTPS verplicht!)

**Optie A — GitHub Pages (gratis, makkelijkst):**
1. Maak een gratis account op github.com
2. Maak een nieuw repository aan (bijv. `hitster`)
3. Upload alle bestanden
4. Ga naar Settings → Pages → Source: main branch
5. Je app staat op: `https://jouwusername.github.io/hitster/`

**Optie B — Netlify (drag & drop):**
1. Ga naar netlify.com → Log in
2. Sleep je hele `Hitster-App` map naar het dashboard
3. Klaar! Je krijgt direct een https:// link

**Optie C — Vercel:**
1. Ga naar vercel.com → Log in
2. Import project → Upload map
3. Automatisch HTTPS

## Stap 4 — Installeren op telefoon

**iPhone (Safari):**
1. Open de HTTPS-link in Safari
2. Tik op het Deel-icoon (vierkantje met pijl omhoog)
3. Kies "Zet op beginscherm"

**Android (Chrome):**
1. Open de HTTPS-link in Chrome
2. Tik op de drie puntjes (⋮)
3. Kies "App installeren" of "Toevoegen aan startscherm"

## Tips

- Test lokaal met VS Code + Live Server extensie (rechtermuisklik op index.html → Open with Live Server)
- De app werkt offline zodra hij éénmaal geladen is
- Voeg nieuwe nummers toe door songs.json bij te werken en opnieuw te uploaden