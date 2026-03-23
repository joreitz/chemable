// src/plugins/analyzer.ts
import { ChemablePlugin, ChemableContext } from "../plugin-api";
import { getImplicitHydrogens } from "../chemistry"; // Wir leihen uns die Logik aus dem Kern!

let pluginContext: ChemableContext | null = null;

// Die Standard-Atommassen (in g/mol)
const ATOMIC_MASSES: Record<string, number> = {
    "H" : 1.007,
    "He": 4.002,
    "Li": 6.941,
    "Be": 9.012,
    "B" : 10.811,
    "C" : 12.011,
    "N" : 14.007,
    "O" : 15.999,
    "F" : 18.998,
    "Ne": 20.18,
    "Na": 22.99,
    "Mg": 24.305,
    "Al": 26.982,
    "Si": 28.086,
    "P" : 30.974,
    "S" : 32.065,
    "Cl": 35.453,
    "Ar": 39.948,
    "K" : 39.098,
    "Ca": 40.078,
    "Sc": 44.956,
    "Ti": 47.867,
    "V" : 50.942,
    "Cr": 51.996,
    "Mn": 54.938,
    "Fe": 55.845,
    "Co": 58.933,
    "Ni": 58.693,
    "Cu": 63.546,
    "Zn": 65.38,
    "Ga": 69.723,
    "Ge": 72.64,
    "As": 74.922,
    "Se": 78.96,
    "Br": 79.904,
    "Kr": 83.798,
    "Rb": 85.468,
    "Sr": 87.62,
    "Y" : 88.906,
    "Zr": 91.224,
    "Nb": 92.906,
    "Mo": 95.96,
    "Tc": 98,
    "Ru": 101.07,
    "Rh": 102.906,
    "Pd": 106.42,
    "Ag": 107.868,
    "Cd": 112.411,
    "In": 114.818,
    "Sn": 118.71,
    "Sb": 121.76,
    "Te": 127.6,
    "I" : 126.904,
    "Xe": 131.293,
    "Cs": 132.905,
    "Ba": 137.327,
    "La": 138.905,
    "Ce": 140.116,
    "Pr": 140.908,
    "Nd": 144.242,
    "Pm": 145,
    "Sm": 150.36,
    "Eu": 151.964,
    "Gd": 157.25,
    "Tb": 158.925,
    "Dy": 162.5,
    "Ho": 164.93,
    "Er": 167.259,
    "Tm": 168.934,
    "Yb": 173.054,
    "Lu": 174.967,
    "Hf": 178.49,
    "Ta": 180.948,
    "W" : 183.84,
    "Re": 186.207,
    "Os": 190.23,
    "Ir": 192.217,
    "Pt": 195.084,
    "Au": 196.967,
    "Hg": 200.59,
    "Tl": 204.383,
    "Pb": 207.2,
    "Bi": 208.98,
    "Po": 210,
    "At": 210,
    "Rn": 222,
    "Fr": 223,
    "Ra": 226,
    "Ac": 227,
    "Th": 232.038,
    "Pa": 231.036,
    "U" : 238.029,
    "Np": 237,
    "Pu": 244,
    "Am": 243,
    "Cm": 247,
    "Bk": 247,
    "Cf": 251,
    "Es": 252,
    "Fm": 257,
    "Md": 258,
    "No": 259,
    "Lr": 262,
    "Rf": 261,
    "Db": 262,
    "Sg": 266,
    "Bh": 264,
    "Hs": 267,
    "Mt": 268,
    "Ds": 271,
    "Rg": 272,
    "Cn": 285,
    "Nh": 284,
    "Fl": 289,
    "Mc": 288,
    "Lv": 292,
    "Ts": 295,
    "Og": 294,

};


export const analyzerPlugin: ChemablePlugin = {
    id: "com.chemable.analyzer",
    name: "Molekül-Analyse",
    version: "1.1.0",
    
    onLoad: (context: ChemableContext) => {
        pluginContext = context;
        console.log(`[Plugin] Molekül-Analyse wurde geladen!`);
    },
    
    execute: async () => {
        if (!pluginContext) return;
        
        const atoms = pluginContext.getAtoms();
        const bonds = pluginContext.getBonds();
        
        // Echte chemische Atome filtern (Dummys und Text ignorieren)
        const realAtoms = atoms.filter(a => a.element !== "DUMMY" && a.element !== "TEXT");
        
        if (realAtoms.length === 0) {
            pluginContext.showMessage("Das Zeichenbrett enthält keine auswertbaren Atome!");
            return;
        }

        const counts: Record<string, number> = {};
        let totalMass = 0;

        // 1. Alle Atome durchgehen und zählen + Masse addieren
        realAtoms.forEach(a => {
            // Zähle das Haupt-Atom
            counts[a.element] = (counts[a.element] || 0) + 1;
            totalMass += ATOMIC_MASSES[a.element] || 0;

            // Zähle die unsichtbaren Wasserstoffe
            const hCount = getImplicitHydrogens(a, bonds);
            if (hCount > 0) {
                counts["H"] = (counts["H"] || 0) + hCount;
                totalMass += hCount * ATOMIC_MASSES["H"];
            }
        });

        // 2. Summenformel nach dem "Hill-System" formatieren (Erst C, dann H, dann alphabetisch)
        let formula = "";
        if (counts["C"]) {
            formula += `C${counts["C"] > 1 ? counts["C"] : ""}`;
            delete counts["C"]; // Aus dem Objekt nehmen, damit es später nicht nochmal kommt
        }
        if (counts["H"]) {
            formula += `H${counts["H"] > 1 ? counts["H"] : ""}`;
            delete counts["H"];
        }
        
        // Den Rest alphabetisch sortieren
        const remainingElements = Object.keys(counts).sort();
        for (const el of remainingElements) {
            formula += `${el}${counts[el] > 1 ? counts[el] : ""}`;
        }

        // 3. Ausgabe
        pluginContext.showMessage(
            `📊 Analyse-Ergebnis:\n\n` +
            `Exakte Summenformel:\n${formula}\n\n` +
            `Molare Masse:\n${totalMass.toFixed(3)} g/mol\n\n` +
            `Details:\n` +
            `- Eingezeichnete Atome: ${realAtoms.length}\n` +
            `- Bindungen: ${bonds.filter(b => b.type !== 4).length}`
        );
    },
    
    onUnload: () => {
        pluginContext = null;
    }
};