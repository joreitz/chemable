// src/plugins/eht.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { generateSmiles } from "../smiles";
const { exec } = require('child_process'); // Node.js Feature!
const fs = require('fs');
const path = require('path');
const isDev = !process.resourcesPath.includes('app.asar'); // Prüfen, ob wir im Code-Modus sind
const binPath = isDev 
    ? path.join(process.cwd(), 'bin', process.platform) 
    : path.join(process.resourcesPath, 'external-bin');

const obabelExe = path.join(binPath, process.platform === 'win32' ? 'obabel.exe' : 'obabel');
const rustEhtExe = path.join(binPath, process.platform === 'win32' ? 'eht_calculator.exe' : 'eht_calculator');

let pluginContext: ChemableContext | null = null;

export const ehtPlugin: ChemablePlugin = {
    id: "com.chemable.eht",
    name: "EHT Calculator",
    version: "1.0.0",
    
    onLoad: (context: ChemableContext) => {
        pluginContext = context;
        console.log(`[Plugin] EHT Calculator geladen!`);
    },
    
    execute: async () => {
        if (!pluginContext) return;
        
        const atoms = pluginContext.getAtoms();
        const bonds = pluginContext.getBonds();
        
        if (atoms.length === 0) {
            pluginContext.showMessage("Das Zeichenbrett ist leer!");
            return;
        }

        // 1. SMILES aus der 2D-Zeichnung generieren
        const smiles = generateSmiles(atoms, bonds);
        console.log("Generierter SMILES:", smiles);

        const tempDir = process.cwd(); // Oder ein spezieller Temp-Ordner
        const xyzFile = path.join(tempDir, 'temp_molecule.xyz');
        
        // Pfad zu deiner Rust-Binary (muss angepasst werden!)
        const rustEhtBinary = path.join(tempDir, 'dein_rust_eht_calculator.exe'); // oder ./eht_calc auf Mac/Linux

        pluginContext.showMessage("⏳ Generiere 3D Struktur und starte EHT-Rechnung...\nDas kann einen Moment dauern.");

        // 2. OpenBabel aufrufen, um aus SMILES eine 3D-XYZ Datei zu machen
        // Voraussetzung: OpenBabel ist auf dem PC installiert und im PATH (oder wir legen die obabel.exe dazu)
        const obabelCmd = `obabel -:"${smiles}" -O "${xyzFile}" --gen3d`;
        
        exec(obabelCmd, (error: any, stdout: string, stderr: string) => {
            if (error) {
                pluginContext?.showMessage(`❌ Fehler bei der 3D-Generierung (Ist OpenBabel installiert?):\n${stderr}`);
                return;
            }

            // 3. Wenn 3D erfolgreich war -> Rust EHT-Calculator aufrufen!
            // Wir nehmen an, dass dein Rust-Programm die XYZ-Datei als Argument nimmt.
            const ehtCmd = `"${rustEhtBinary}" "${xyzFile}"`;
            
            exec(ehtCmd, (ehtError: any, ehtStdout: string, ehtStderr: string) => {
                if (ehtError) {
                    pluginContext?.showMessage(`❌ Fehler beim Ausführen der EHT-Rechnung:\n${ehtStderr}`);
                    return;
                }

                // 4. Output Parsen und anzeigen
                // Hier könntest du den ehtStdout noch schön formatieren, 
                // z.B. nur die HOMO/LUMO Energien oder die Löwdin-Populationen extrahieren.
                
                pluginContext?.showMessage(
                    `✅ EHT-Rechnung erfolgreich!\n\n` +
                    `SMILES: ${smiles}\n` +
                    `========================\n` +
                    `RUST OUTPUT:\n` +
                    `${ehtStdout}`
                );

                // Aufräumen (optional)
                if (fs.existsSync(xyzFile)) {
                    fs.unlinkSync(xyzFile);
                }
            });
        });
    },
    
    onUnload: () => {
        pluginContext = null;
    }
};