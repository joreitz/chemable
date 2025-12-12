// src/pse-layout.ts

// Wir definieren für jedes Element die Koordinaten im 18x7 Raster
// row: Zeile (1-7), col: Spalte (1-18)
export const elementLayout: Record<string, { row: number, col: number }> = {
    // Periode 1
    "H":  { row: 1, col: 1 },
    "He": { row: 1, col: 18 },

    // Periode 2
    "Li": { row: 2, col: 1 },
    "Be": { row: 2, col: 2 },
    "B":  { row: 2, col: 13 },
    "C":  { row: 2, col: 14 },
    "N":  { row: 2, col: 15 },
    "O":  { row: 2, col: 16 },
    "F":  { row: 2, col: 17 },
    "Ne": { row: 2, col: 18 },

    // Periode 3
    "Na": { row: 3, col: 1 },
    "Mg": { row: 3, col: 2 },
    "Al": { row: 3, col: 13 },
    "Si": { row: 3, col: 14 },
    "P":  { row: 3, col: 15 },
    "S":  { row: 3, col: 16 },
    "Cl": { row: 3, col: 17 },
    "Ar": { row: 3, col: 18 },

    // Periode 4 (Auszug wichtiger Elemente)
    "K":  { row: 4, col: 1 },
    "Ca": { row: 4, col: 2 },
    "Fe": { row: 4, col: 8 },
    "Cu": { row: 4, col: 11 },
    "Br": { row: 4, col: 17 },
    
    // Andere
    "I":  { row: 5, col: 17 },
    "Au": { row: 6, col: 11 },
};