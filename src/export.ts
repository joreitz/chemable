// src/export.ts
import { Atom, Bond } from "./types";
import { getAtomLabel } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";

// Hilfsfunktion aus draw.ts kopiert, um Abhängigkeiten zu minimieren
function getNeighborCoords(atomA: Atom, atomB: Atom, allBonds: Bond[], allAtoms: Atom[]): { x: number, y: number }[] {
    const neighbors: { x: number, y: number }[] = [];
    for (const bond of allBonds) {
        if (bond.id1 === atomA.id || bond.id2 === atomA.id) {
            const otherId = (bond.id1 === atomA.id) ? bond.id2 : bond.id1;
            if (otherId !== atomB.id) {
                const neighbor = allAtoms.find(a => a.id === otherId);
                if (neighbor) neighbors.push({ x: neighbor.x, y: neighbor.y });
            }
        }
        if (bond.id1 === atomB.id || bond.id2 === atomB.id) {
            const otherId = (bond.id1 === atomB.id) ? bond.id2 : bond.id1;
            if (otherId !== atomA.id) {
                const neighbor = allAtoms.find(a => a.id === otherId);
                if (neighbor) neighbors.push({ x: neighbor.x, y: neighbor.y });
            }
        }
    }
    return neighbors;
}

export function generateSVG(allAtoms: Atom[], allBonds: Bond[], selectedIds: Set<number>): string {
    // 1. Filtern: Exportieren wir alles oder nur die Auswahl?
    const isSelection = selectedIds.size > 0;
    const exportAtoms = isSelection ? allAtoms.filter(a => selectedIds.has(a.id)) : allAtoms;
    
    if (exportAtoms.length === 0) return ""; // Nichts zu exportieren

    const exportAtomIds = new Set(exportAtoms.map(a => a.id));
    // Nur Bindungen exportieren, bei denen beide Enden im Export sind
    const exportBonds = allBonds.filter(b => exportAtomIds.has(b.id1) && exportAtomIds.has(b.id2));

    // 2. Bounding Box (Ränder) berechnen
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    exportAtoms.forEach(a => {
        if (a.x < minX) minX = a.x;
        if (a.y < minY) minY = a.y;
        if (a.x > maxX) maxX = a.x;
        if (a.y > maxY) maxY = a.y;
    });

    const padding = 20;
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;
    
    // Offset, um alles in die obere linke Ecke des SVGs zu schieben
    const offX = -minX + padding;
    const offY = -minY + padding;

    // 3. SVG String aufbauen
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    svg += `  <style>
    .bond { stroke: #000; stroke-width: 2; stroke-linecap: round; }
    .atom-bg { fill: #fff; }
    .atom-text { font-family: Arial, sans-serif; font-weight: bold; font-size: 16px; fill: #000; text-anchor: middle; dominant-baseline: central; }
  </style>\n`;

    // 4. Bindungen zeichnen
    exportBonds.forEach(bond => {
        const a1 = exportAtoms.find(a => a.id === bond.id1)!;
        const a2 = exportAtoms.find(a => a.id === bond.id2)!;

        const x1 = a1.x + offX, y1 = a1.y + offY;
        const x2 = a2.x + offX, y2 = a2.y + offY;

        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len === 0) return;

        const nx = -dy / len, ny = dx / len;
        
        if (bond.type === 1) {
            svg += `  <line class="bond" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />\n`;
        } else if (bond.type === 2) {
            const neighbors = getNeighborCoords(a1, a2, allBonds, allAtoms);
            const direction = calculateBondOffsetDirection(a1, a2, neighbors);
            const offset = 5 * direction;
            
            svg += `  <line class="bond" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />\n`;
            
            const shiftX = nx * offset, shiftY = ny * offset;
            const ux = dx / len, uy = dy / len;
            const px = ux * 3, py = uy * 3; // Padding
            
            svg += `  <line class="bond" x1="${x1 + shiftX + px}" y1="${y1 + shiftY + py}" x2="${x2 + shiftX - px}" y2="${y2 + shiftY - py}" />\n`;
        } else if (bond.type === 3) {
            svg += `  <line class="bond" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />\n`;
            const o = 4;
            svg += `  <line class="bond" x1="${x1 + nx*o}" y1="${y1 + ny*o}" x2="${x2 + nx*o}" y2="${y2 + ny*o}" />\n`;
            svg += `  <line class="bond" x1="${x1 - nx*o}" y1="${y1 - ny*o}" x2="${x2 - nx*o}" y2="${y2 - ny*o}" />\n`;
        }
    });

    // 5. Atome zeichnen
    exportAtoms.forEach(atom => {
        const label = getAtomLabel(atom, allBonds);
        const isHidden = label === "";
        
        if (isHidden) return;

        const ax = atom.x + offX;
        const ay = atom.y + offY;

        // Näherung für die Breite im SVG
        const textWidth = label.length * 10; 
        const bgRadiusX = Math.max(12, textWidth / 2 + 4);
        const bgRadiusY = 13;

        // Ovoid als weißer Hintergrund
        svg += `  <ellipse class="atom-bg" cx="${ax}" cy="${ay}" rx="${bgRadiusX}" ry="${bgRadiusY}" />\n`;
        
        // Radikal
        if (atom.radical) {
            svg += `  <circle cx="${ax + bgRadiusX - 2}" cy="${ay - bgRadiusY + 2}" r="2.5" fill="#000" />\n`;
        }

        // Text (ersetzt subscripts durch SVG tspan)
        // Einfache Variante: Rendern des puren Strings. Subscripts sehen im SVG passabel aus, 
        // da die Unicode-Subscripts aus chemistry.ts verwendet werden (z.B. CH₃).
        svg += `  <text class="atom-text" x="${ax}" y="${ay}">${label}</text>\n`;
    });
    // 6. Chemische Daten als JSON in <desc> einbetten (kann später beim Import wieder ausgelesen werden!!)
    const dataToEmbed = JSON.stringify({ atoms: exportAtoms, bonds: exportBonds });
    svg += `  <desc id="chemable-data">${dataToEmbed}</desc>\n`;

    svg += `</svg>`;
    return svg;
}