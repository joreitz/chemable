// src/templates.ts

export type TemplateData = {
    atoms: { id: number, element: string, x: number, y: number }[],
    bonds: { id1: number, id2: number, type: number }[]
};

const L = 60; // Die Standard-Bindungslänge in Pixeln
const H = L * Math.sqrt(3) / 2; // ~34.64 (Höhe eines gleichseitigen Dreiecks für perfekte Hexagone)

export const MOLECULE_TEMPLATES: Record<string, TemplateData> = {
    "Benzol": {
        atoms: [
            { id: 1, element: 'C', x: H, y: L/2 },
            { id: 2, element: 'C', x: 0, y: L },
            { id: 3, element: 'C', x: -H, y: L/2 },
            { id: 4, element: 'C', x: -H, y: -L/2 },
            { id: 5, element: 'C', x: 0, y: -L },
            { id: 6, element: 'C', x: H, y: -L/2 }
        ],
        bonds: [
            { id1: 1, id2: 2, type: 2 }, // Doppelbindung
            { id1: 2, id2: 3, type: 1 }, // Einfachbindung
            { id1: 3, id2: 4, type: 2 },
            { id1: 4, id2: 5, type: 1 },
            { id1: 5, id2: 6, type: 2 },
            { id1: 6, id2: 1, type: 1 }
        ]
    },
    "Cyclohexan": {
        atoms: [
            { id: 1, element: 'C', x: H, y: L/2 },
            { id: 2, element: 'C', x: 0, y: L },
            { id: 3, element: 'C', x: -H, y: L/2 },
            { id: 4, element: 'C', x: -H, y: -L/2 },
            { id: 5, element: 'C', x: 0, y: -L },
            { id: 6, element: 'C', x: H, y: -L/2 }
        ],
        bonds: [
            { id1: 1, id2: 2, type: 1 },
            { id1: 2, id2: 3, type: 1 },
            { id1: 3, id2: 4, type: 1 },
            { id1: 4, id2: 5, type: 1 },
            { id1: 5, id2: 6, type: 1 },
            { id1: 6, id2: 1, type: 1 }
        ]
    },
    "Cyclopentan": {
        // Perfektes Fünfeck mit Winkeln (90, 162, 234, 306, 18)
        atoms: [
            { id: 1, element: 'C', x: 0, y: -L },
            { id: 2, element: 'C', x: L * 0.95, y: -L * 0.31 },
            { id: 3, element: 'C', x: L * 0.59, y: L * 0.81 },
            { id: 4, element: 'C', x: -L * 0.59, y: L * 0.81 },
            { id: 5, element: 'C', x: -L * 0.95, y: -L * 0.31 }
        ],
        bonds: [
            { id1: 1, id2: 2, type: 1 },
            { id1: 2, id2: 3, type: 1 },
            { id1: 3, id2: 4, type: 1 },
            { id1: 4, id2: 5, type: 1 },
            { id1: 5, id2: 1, type: 1 }
        ]
    }
};