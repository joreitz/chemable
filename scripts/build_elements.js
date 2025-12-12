// scripts/build-elements.js
const fs = require('fs');
const path = require('path');

// 1. Die Rohdaten (CSV-Format)
const csvData = `
H,Hydrogen,1,32,32,32,2.20,1,#FFFFFF
He,Helium,2,46,,,0,0,#D9FFFF
Li,Lithium,3,133,124,,0.98,1,#CC80FF
Be,Beryllium,4,102,90,85,1.57,2,#C2FF00
B,Boron,5,85,78,73,2.04,3,#FFB5B5
C,Carbon,6,75,67,60,2.55,4,#909090
N,Nitrogen,7,71,60,54,3.04,3|4,#3050F8
O,Oxygen,8,63,57,53,3.44,2,#FF0D0D
F,Fluorine,9,64,59,53,3.98,1,#90E050
Ne,Neon,10,67,96,,0,0,#B3E3F5
Na,Sodium,11,155,160,,0.93,1,#AB5CF2
Mg,Magnesium,12,139,132,127,1.31,2,#8AFF00
Al,Aluminium,13,126,113,111,1.61,3,#BFA6A6
Si,Silicon,14,116,107,102,1.90,4,#F0C8A0
P,Phosphorus,15,111,102,94,2.19,3|5,#FF8000
S,Sulfur,16,103,94,95,2.58,2|4|6,#FFFF30
Cl,Chlorine,17,99,95,93,3.16,1,#1FF01F
K,Potassium,19,196,193,,0.82,1,#8F40D4
Ca,Calcium,20,171,147,133,1.00,2,#3DFF00
Fe,Iron,26,116,109,102,1.83,2|3|6,#E06633
Cu,Copper,29,112,115,,1.90,1|2,#C88033
Br,Bromine,35,114,109,110,2.96,1,#A62929
I,Iodine,53,133,127,125,2.66,1|3|5|7,#940094
Au,Gold,79,124,121,114,2.54,1|3,#FFD123
`;

// 2. Der Parser (Die Logik)
function parseCSV(csv) {
    // split('\n') erzeugt bei Windows manchmal \r Zeichen, daher trimmen wir jede Zeile später
    const lines = csv.trim().split('\n');
    const result = {};

    lines.forEach((line, index) => {
        // --- FIX: Leere Zeilen überspringen ---
        if (!line || line.trim() === '') {
            return; 
        }

        const parts = line.split(',');
        
        // --- FIX: Prüfen ob genug Daten da sind ---
        if (parts.length < 8) {
            console.warn(`Warnung: Zeile ${index + 1} übersprungen (zu wenig Spalten): "${line}"`);
            return;
        }

        // Leerzeichen um die Werte entfernen
        const cleanParts = parts.map(p => p ? p.trim() : "");

        const [symbol, name, z, r1, r2, r3, en, val, color] = cleanParts;

        // --- FIX: Sicherheitscheck für val ---
        if (!val) {
            console.warn(`Warnung: Kein Valenz-Wert für ${symbol}`);
            return;
        }

        const elementData = {
            atomicNumber: parseInt(z),
            elementSymbol: symbol,
            name: name,
            covSingleBondRadius: parseFloat(r1),
            ...(r2 && { covDoubleBondRadius: parseFloat(r2) }),
            ...(r3 && { covTripleBondRadius: parseFloat(r3) }),
            electronegativity: parseFloat(en),
            valency: val.split('|').map(v => parseInt(v)), // Hier passierte der Fehler
            colorValue: color || "#CCCCCC" // Fallback Farbe
        };

        result[symbol] = elementData;
    });

    return result;
}

// 3. Ausführen und Speichern
console.log("🛠️  Baue Periodensystem...");
try {
    const periodicTable = parseCSV(csvData);
    
    // Pfad zur Ausgabedatei (src/elements.json)
    // Wir nutzen ../src/ damit es aus dem scripts-Ordner richtig rauskommt
    const outputPath = path.join(__dirname, '../src/elements.json');

    fs.writeFileSync(outputPath, JSON.stringify(periodicTable, null, 2));

    console.log(`✅ Fertig! Datei gespeichert unter: ${outputPath}`);
    console.log(`   Enthält ${Object.keys(periodicTable).length} Elemente.`);
} catch (err) {
    console.error("❌ Fehler beim Bauen:", err);
}