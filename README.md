# 🚀 Alice och den kallaste planeten 🌈

Ett rymdäventyr av **Alice & Pappa** 💜

Pappa är rymdforskare — och hans radio har frusit fast på den kallaste planeten!
Alice flyger pappas rosa flygplan till rymdbasen, bygger en raket och reser genom
hela solsystemet för att hämta hem honom. På vägen får hon hjälp av
**Draculaura** på Månen 🦇, **Nastya** i rymdbutiken på Guldasteroiden 🎀,
sjöjungfrun **Melinda** under Europas is 🧜‍♀️ och enhörningen **Stella**
på Saturnus ringar 🦄.

## ▶️ Spela

**https://chetic.github.io/alice-rymdaventyr/**

Fungerar i vanliga webbläsare, i **Teslans webbläsare** och som **installerad app**
på surfplatta. Allt sparas automatiskt — tryck *Fortsätt* för att spela vidare.

### 📲 Installera som app (Xiaomi Pad 5 / Android)

1. Öppna länken ovan i **Chrome** på plattan.
2. Tryck på **Installera appen 📲** på startskärmen
   (eller Chrome-menyn ⋮ → *Lägg till på startskärmen* → *Installera*).
3. Klart! Spelet ligger nu som en egen app-ikon och fungerar **helt offline**.

### 🚗 Spela i Teslan

Öppna webbläsaren i bilen (parkerad!) och surfa till länken ovan.
Spelet är byggt för touch och för bilens äldre webbläsarmotor.

## 🎮 Så spelar man

- **Gå/hoppa:** pilknapparna på skärmen (eller piltangenter + mellanslag på dator)
- **✋-knappen:** använd/plocka upp när bubblan visas
- **Flygplanet:** ▲▼ styr höjden, 🔥 ger fart — flyg genom regnbågsringarna!
- **Raketen:** ↺↻ roterar, 🔥 ger skjuts — landa MJUKT på plattan
- **Pussel:** dra med fingret, tryck på det som lyser 💡
- Guldmynt är värda **10** och silvermynt **5** — spara till värmedräkten hos Nastya!

## 🛠️ Teknik (för nyfikna föräldrar)

- Ren HTML5/JavaScript utan byggsteg — ES-moduler rakt i webbläsaren
- Fysikmotor: [Matter.js](https://brm.io/matter-js/) (lådor, pendlar, vågar, raketer)
- All musik komponeras i realtid med Web Audio API — tolv olika teman,
  och musiken växer när Alice lyckas
- All grafik ritas med Canvas-kod — inga bildfiler
- PWA med service worker: helt offline efter första besöket
- Sparning i localStorage

### Köra lokalt

```bash
python3 -m http.server 8000
# öppna http://localhost:8000
```

Hoppa direkt till en scen under utveckling: `?scene=neptune&debug=1`

---

*Byggt med kärlek — och en regnbåge av kod.* 🌈⭐
