// src/export.ts
import { Atom, Bond } from "./types";
import { getAtomLabel } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";
import { parseChemicalRichText, isBondOnRightSide } from "./draw";

// --- KUGELSICHERER SVG RICH-TEXT PARSER ---
// Wandelt Unicode-Tiefstellungen (z.B. ₃) und HTML-Tags (<sub>) in echte SVG-Knoten um,
// die in jedem Programm (Inkscape, Illustrator, Browser) sauber gerendert werden!
function toSVGRichText(str: string): string {
    const subMap: Record<string, string> = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9' };
    const supMap: Record<string, string> = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'-' };

    let res = "";
    let i = 0;
    while (i < str.length) {
        let char = str[i];
        if (subMap[char] !== undefined) {
            let subStr = "";
            while (i < str.length && subMap[str[i]] !== undefined) { subStr += subMap[str[i]]; i++; }
            res += `<tspan baseline-shift="sub" font-size="0.75em">${subStr}</tspan>`;
        } else if (supMap[char] !== undefined) {
            let supStr = "";
            while (i < str.length && supMap[str[i]] !== undefined) { supStr += supMap[str[i]]; i++; }
            res += `<tspan baseline-shift="super" font-size="0.75em">${supStr}</tspan>`;
        } else {
            res += char;
            i++;
        }
    }
    // Falls das Canvas echtes HTML ausgibt, fangen wir das auch ab:
    res = res.replace(/<sub>(.*?)<\/sub>/g, '<tspan baseline-shift="sub" font-size="0.75em">$1</tspan>');
    res = res.replace(/<sup>(.*?)<\/sup>/g, '<tspan baseline-shift="super" font-size="0.75em">$1</tspan>');
    return res;
}

export function generateSVG(allAtoms: Atom[], allBonds: Bond[], selectedIds: Set<number>, fontSize: number = 16): string {
    const isSelection = selectedIds.size > 0;
    const exportAtoms = isSelection ? allAtoms.filter(a => selectedIds.has(a.id)) : allAtoms;
    
    if (exportAtoms.length === 0) return ""; 

    const exportAtomIds = new Set(exportAtoms.map(a => a.id));
    const exportBonds = allBonds.filter(b => exportAtomIds.has(b.id1) && exportAtomIds.has(b.id2));

    // Bounding Box
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
    const offX = -minX + padding;
    const offY = -minY + padding;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    svg += `  <style>
    .bond { stroke: #000; stroke-linecap: round; }
    .atom-text { font-family: Arial, sans-serif; font-weight: bold; fill: #000; text-anchor: middle; dominant-baseline: central; }
  </style>\n`;

    // PAINTER'S ALGORITHM FÜR SVG
    const drawables: any[] = [];
    exportBonds.forEach(bond => {
        const a1 = exportAtoms.find(a => a.id === bond.id1)!;
        const a2 = exportAtoms.find(a => a.id === bond.id2)!;
        const zA = ((a1.z || 0) + (a2.z || 0)) / 2;
        drawables.push({ type: 'bond', z: zA, bond, a1, a2 });
    });

    exportAtoms.forEach(atom => {
        if (atom.element !== "DUMMY") drawables.push({ type: 'atom', z: (atom.z || 0), atom });
    });

    drawables.sort((a, b) => a.z - b.z);

    // Labels vorab berechnen (wichtig für die Lücken-Berechnung der Bindungen)
    const labelCache = new Map<number, string>();
    exportAtoms.forEach(atom => {
        const bondOnRight = isBondOnRightSide(atom, allBonds, allAtoms);
        let rawLabel = atom.customLabel || getAtomLabel(atom, allBonds, bondOnRight);
        if (atom.customLabel && atom.autoFlip && bondOnRight) rawLabel = rawLabel.split('').reverse().join('');
        labelCache.set(atom.id, parseChemicalRichText(rawLabel));
    });

    drawables.forEach(item => {
        if (item.type === 'bond') {
            const { bond, a1, a2 } = item;
            const x1 = a1.x + offX, y1 = a1.y + offY;
            const x2 = a2.x + offX, y2 = a2.y + offY;
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len === 0) return;

            const nx = -dy / len, ny = dx / len;
            const strokeWidth = Math.min(6, Math.max(0.5, 2 + (item.z * 0.06)));
            const styleObj = `stroke-width: ${strokeWidth}; stroke: ${bond.color || '#000'};`;

            // --- ELLIPTISCHE LÜCKE (Wie auf dem Canvas) ---
            const getR = (atom: Atom, id: number) => {
                const lbl = labelCache.get(id) || "";
                if (!lbl) return 0;
                // Grobe Schätzung der Textbreite für SVG (entspricht Canvas measureText)
                const estTextWidth = lbl.length * (fontSize * 0.6);
                const absCos = Math.abs(dx / len);
                const absSin = Math.abs(dy / len);
                return absCos * (estTextWidth / 2 + 4) + absSin * (fontSize * 0.6);
            };

            const r1 = getR(a1, a1.id);
            const r2 = getR(a2, a2.id);
            
            if (len <= r1 + r2) return;
            const sx = x1 + (dx / len) * r1;
            const sy = y1 + (dy / len) * r1;
            const ex = x2 - (dx / len) * r2;
            const ey = y2 - (dy / len) * r2;

            const offset = bond.spacing || 5;

            if (bond.type === 1) {
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
            } else if (bond.type === 2) {
                // --- KORREKTE DOPPELBINDUNG ---
                const a1Connections = allBonds.filter(b => b.id1 === a1.id || b.id2 === a1.id).length;
                const a2Connections = allBonds.filter(b => b.id1 === a2.id || b.id2 === a2.id).length;
                const isTerminal = a1Connections === 1 || a2Connections === 1;

                if (isTerminal) {
                    // Symmetrisch in der Mitte
                    const halfOffset = offset / 2;
                    svg += `  <line class="bond" x1="${sx + nx * halfOffset}" y1="${sy + ny * halfOffset}" x2="${ex + nx * halfOffset}" y2="${ey + ny * halfOffset}" style="${styleObj}" />\n`;
                    svg += `  <line class="bond" x1="${sx - nx * halfOffset}" y1="${sy - ny * halfOffset}" x2="${ex - nx * halfOffset}" y2="${ey - ny * halfOffset}" style="${styleObj}" />\n`;
                } else {
                    // Eine Zentriert, eine verschoben
                    const direction = calculateBondOffsetDirection(a1, a2, allBonds, allAtoms);
                    const shiftX = nx * (offset * direction), shiftY = ny * (offset * direction);
                    const px = (dx / len) * 3, py = (dy / len) * 3; 
                    svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                    svg += `  <line class="bond" x1="${sx + shiftX + px}" y1="${sy + shiftY + py}" x2="${ex + shiftX - px}" y2="${ey + shiftY - py}" style="${styleObj}" />\n`;
                }
            } else if (bond.type === 3) {
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${sx + nx*offset}" y1="${sy + ny*offset}" x2="${ex + nx*offset}" y2="${ey + ny*offset}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${sx - nx*offset}" y1="${sy - ny*offset}" x2="${ex - nx*offset}" y2="${ey - ny*offset}" style="${styleObj}" />\n`;
            } else if (bond.type === 4) { // Reaktionspfeil
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                const headlen = 12;
                const angle = Math.atan2(dy, dx);
                const h1x = ex - headlen * Math.cos(angle - Math.PI / 6);
                const h1y = ey - headlen * Math.sin(angle - Math.PI / 6);
                const h2x = ex - headlen * Math.cos(angle + Math.PI / 6);
                const h2y = ey - headlen * Math.sin(angle + Math.PI / 6);
                svg += `  <line class="bond" x1="${ex}" y1="${ey}" x2="${h1x}" y2="${h1y}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${ex}" y1="${ey}" x2="${h2x}" y2="${h2y}" style="${styleObj}" />\n`;
            } else if (bond.type === 5) { // KEIL
                const sw = 1.0; 
                const ew = Math.min(8, Math.max(3.0, 5.0 + (item.z * 0.05))); 
                const p1x = sx + nx * sw, p1y = sy + ny * sw;
                const p2x = sx - nx * sw, p2y = sy - ny * sw;
                const p3x = ex - nx * ew, p3y = ey - ny * ew;
                const p4x = ex + nx * ew, p4y = ey + ny * ew;
                svg += `  <polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y} ${p4x},${p4y}" fill="${bond.color || '#000'}" />\n`;
            } else if (bond.type === 6) { // DASHES
                const hashes = 6; 
                for (let i = 0; i < hashes; i++) {
                    const fraction = i / (hashes - 1);
                    const cx = sx + (ex - sx) * fraction;
                    const cy = sy + (ey - sy) * fraction;
                    const cw = 1.0 + (4.0 * fraction); 
                    svg += `  <line class="bond" x1="${cx + nx * cw}" y1="${cy + ny * cw}" x2="${cx - nx * cw}" y2="${cy - ny * cw}" style="${styleObj}" />\n`;
                }
            }
        } else {
            // --- ATOME ZEICHNEN ---
            const { atom } = item;
            const htmlLabel = labelCache.get(atom.id) || "";
            if (htmlLabel === "") return;

            const bondOnRight = isBondOnRightSide(atom, allBonds, allAtoms);
            const svgLabel = toSVGRichText(htmlLabel);

            let shiftX = 0;
            if ((atom.customLabel && atom.alignFirstLetter) || (!atom.customLabel && htmlLabel.length > atom.element.length)) {
                // Präzisere Zentrierung im SVG
                const offset = (htmlLabel.length * (fontSize * 0.6) / 2) - (fontSize * 0.3);
                shiftX = bondOnRight ? -offset : offset;
            }

            const ax = atom.x + offX + shiftX; 
            const ay = atom.y + offY;
            const scale = Math.max(0.7, Math.min(1.3, 1 + ((atom.z || 0) * 0.005))); 
            
            // --- LADUNGEN UND RADIKALE INS SVG EXPORTIEREN ---
            let additions = "";
            if (atom.charge) {
                const isPositive = atom.charge > 0;
                const absCharge = Math.abs(atom.charge);
                let angle = atom.chargeAngle !== undefined ? atom.chargeAngle : (bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
                const bgRadiusX = Math.max(fontSize * 0.75, (htmlLabel.length * fontSize * 0.3) + (fontSize * 0.25));
                const bgRadiusY = fontSize * 0.85;
                const badgeX = ax + Math.cos(angle) * (bgRadiusX + fontSize * 0.25);
                const badgeY = ay + Math.sin(angle) * (bgRadiusY + fontSize * 0.25);
                const badgeRadius = Math.max(7 * scale, fontSize * 0.42);

                additions += `  <circle cx="${badgeX}" cy="${badgeY}" r="${badgeRadius}" fill="#fff" stroke="${atom.color || '#000'}" stroke-width="${1.5 * scale}" />\n`;
                additions += `  <text font-family="Arial, sans-serif" font-weight="bold" font-size="${Math.max(10*scale, fontSize*0.6)}px" fill="${atom.color || '#000'}" x="${badgeX}" y="${badgeY + 1*scale}" text-anchor="middle" dominant-baseline="central">${isPositive ? "+" : "−"}</text>\n`;
                if (absCharge > 1) {
                    additions += `  <text font-family="Arial, sans-serif" font-weight="bold" font-size="${Math.max(12*scale, fontSize*0.7)}px" fill="${atom.color || '#000'}" x="${badgeX - badgeRadius - (fontSize*0.1)}" y="${badgeY + 1*scale}" text-anchor="end" dominant-baseline="central">${absCharge}</text>\n`;
                }
            }
            if (atom.radical) {
                let angle = atom.chargeAngle !== undefined ? atom.chargeAngle : (bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
                const bgRadiusX = Math.max(fontSize * 0.75, (htmlLabel.length * fontSize * 0.3) + (fontSize * 0.25));
                const bgRadiusY = fontSize * 0.85;
                const chargeOffset = atom.charge ? (fontSize * 0.85) : 0;
                const radX = ax + Math.cos(angle) * (bgRadiusX + fontSize * 0.25 + chargeOffset);
                const radY = ay + Math.sin(angle) * (bgRadiusY + fontSize * 0.25 + chargeOffset);
                additions += `  <circle cx="${radX}" cy="${radY}" r="${Math.max(2, fontSize*0.15)}" fill="${atom.color || '#000'}" />\n`;
            }

            svg += `  <text class="atom-text" x="${ax}" y="${ay}" font-size="${fontSize * scale}px" fill="${atom.color || '#000'}">${svgLabel}</text>\n`;
            svg += additions;
        }
    });

    const dataToEmbed = JSON.stringify({ atoms: exportAtoms, bonds: exportBonds });
    svg += `  <desc id="chemable-data">${dataToEmbed}</desc>\n`;
    svg += `</svg>`;
    
    return svg;
}

export function generateXYZ(atoms: Atom[]): string {
    if (atoms.length === 0) return "";
    let xyz = `${atoms.length}\nGenerated by Chemable Editor\n`;
    atoms.forEach(atom => {
        xyz += `${atom.element}\t${(atom.x * 0.05).toFixed(4)}\t${(atom.y * -0.05).toFixed(4)}\t${((atom.z || 0) * 0.05).toFixed(4)}\n`;
    });
    return xyz;
}

export function convertSdfToXyz(sdfData: string): string {
    const lines = sdfData.split('\n');
    if (lines.length < 4) throw new Error("Ungültiges SDF Format");
    const countLine = lines[3];
    const numAtoms = parseInt(countLine.substring(0, 3).trim(), 10);
    if (isNaN(numAtoms)) throw new Error("Atomanzahl konnte nicht gelesen werden");

    let xyz = `${numAtoms}\nGenerated by Chemable Editor (3D)\n`;
    for (let i = 0; i < numAtoms; i++) {
        const line = lines[4 + i];
        if (!line) continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) xyz += `${parts[3]}\t${parseFloat(parts[0]).toFixed(4)}\t${parseFloat(parts[1]).toFixed(4)}\t${parseFloat(parts[2]).toFixed(4)}\n`;
    }
    return xyz;
}