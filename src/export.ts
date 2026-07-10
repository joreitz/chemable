// src/export.ts
import { Atom, Bond } from "./types";
import { getAtomLabel } from "./chemistry";
import { calculateBondOffsetDirection } from "./geometry";
import { parseChemicalRichText, isBondOnRightSide } from "./draw";
import { uiState } from "./core/ui-state";
import { jsPDF } from "jspdf";
import { drawScene } from "./draw";

function buildSvgRichText(text: string, baseFontSize: number): string {
    const normalizeMap: Record<string, string> = {
        '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
        '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
        '⁺':'+','⁻':'-'
    };
    let normalized = text.split('').map(c => normalizeMap[c] || c).join('');

    const subFontSize = baseFontSize * 0.60; 
    const subDy = baseFontSize * 0.30;  
    const supDy = -baseFontSize * 0.30; 

    let parsed = normalized;
    parsed = parsed.replace(/_\((.*?)\)/g, `<tspan dy="${subDy}px" font-size="${subFontSize}px">$1</tspan><tspan dy="${-subDy}px" font-size="${baseFontSize}px">&#8203;</tspan>`);
    parsed = parsed.replace(/\^\((.*?)\)/g, `<tspan dy="${supDy}px" font-size="${subFontSize}px">$1</tspan><tspan dy="${-supDy}px" font-size="${baseFontSize}px">&#8203;</tspan>`);
    parsed = parsed.replace(/([A-Za-z\]\)])(\d+)/g, `$1<tspan dy="${subDy}px" font-size="${subFontSize}px">$2</tspan><tspan dy="${-subDy}px" font-size="${baseFontSize}px">&#8203;</tspan>`);
    
    parsed = parsed.replace(/(\d*)([+-])$/, (_, digits, sign) => {
        if (sign === '−') sign = '-'; 
        return `<tspan dy="${supDy}px" font-size="${subFontSize}px">${digits}${sign}</tspan><tspan dy="${-supDy}px" font-size="${baseFontSize}px">&#8203;</tspan>`;
    });
    return parsed;
}

export function generateSVG(allAtoms: Atom[], allBonds: Bond[], selectedIds: Set<number>, fontSize: number = 16): string {
    const isSelection = selectedIds.size > 0;
    const exportAtoms = isSelection ? allAtoms.filter(a => selectedIds.has(a.id)) : allAtoms;
    
    if (exportAtoms.length === 0) return ""; 

    const exportAtomIds = new Set(exportAtoms.map(a => a.id));
    const exportBonds = allBonds.filter(b => exportAtomIds.has(b.id1) && exportAtomIds.has(b.id2));

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return ""; 
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const atomData = new Map<number, any>();
    exportAtoms.forEach(atom => {
        const z = atom.z || 0;
        const scale = Math.max(0.7, Math.min(1.3, 1 + (z * 0.005))); 
        const currentFontSize = fontSize * scale;
        const fontToUse = atom.fontFamily || (uiState ? uiState.globalFontFamily : "Arial");
        ctx.font = `${currentFontSize}px ${fontToUse}`;

        const bondOnRight = isBondOnRightSide(atom, allBonds, allAtoms);
        const showH = uiState ? uiState.showImplicitHydrogens : true;
        
        let rawLabel = atom.customLabel || getAtomLabel(atom, allBonds, bondOnRight, showH);
        if (atom.customLabel && atom.autoFlip && bondOnRight) {
            rawLabel = rawLabel.split('').reverse().join('');
        }
        
        const unicodeLabel = parseChemicalRichText(rawLabel);
        const isHidden = unicodeLabel === "";
        
        const textWidth = ctx.measureText(unicodeLabel || "C").width;
        const bgRadiusX = Math.max(currentFontSize * 0.75, (textWidth / 2) + (currentFontSize * 0.25));
        const bgRadiusY = currentFontSize * 0.85;

        let shiftX = 0;
        const isTextElement = atom.element === "TEXT";
        if (!isHidden && ((atom.customLabel && atom.alignFirstLetter) || (!atom.customLabel && unicodeLabel.length > atom.element.length))) {
            const firstChar = atom.customLabel ? unicodeLabel.charAt(0) : (isTextElement ? unicodeLabel.charAt(0) : atom.element);
            const elementWidth = ctx.measureText(firstChar).width;
            const offset = (textWidth / 2) - (elementWidth / 2);
            shiftX = bondOnRight ? -offset : offset;
        }

        atomData.set(atom.id, {
            rawLabel, unicodeLabel, isHidden, textWidth, bgRadiusX, bgRadiusY, 
            shiftX, currentFontSize, scale, fontToUse, bondOnRight
        });
    });

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
    .atom-text { font-weight: bold; fill: #000; text-anchor: middle; dominant-baseline: central; }
  </style>\n`;

    const drawables: any[] = [];
    exportBonds.forEach(bond => {
        const a1 = exportAtoms.find(a => a.id === bond.id1)!;
        const a2 = exportAtoms.find(a => a.id === bond.id2)!;
        drawables.push({ type: 'bond', z: ((a1.z || 0) + (a2.z || 0)) / 2, bond, a1, a2 });
    });

    exportAtoms.forEach(atom => {
        if (atom.element !== "DUMMY") drawables.push({ type: 'atom', z: (atom.z || 0), atom });
    });

    drawables.sort((a, b) => a.z - b.z);

    drawables.forEach(item => {
        if (item.type === 'bond') {
            const { bond, a1, a2 } = item;
            const data1 = atomData.get(a1.id);
            const data2 = atomData.get(a2.id);
            if (!data1 || !data2) return;

            const x1 = a1.x + offX, y1 = a1.y + offY;
            const x2 = a2.x + offX, y2 = a2.y + offY;
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len === 0) return;

            const nx = -dy / len, ny = dx / len;
            const strokeWidth = Math.min(6, Math.max(0.5, 2 + (item.z * 0.06)));
            const styleObj = `stroke-width: ${strokeWidth}; stroke: ${bond.color || '#000'};`;

            const absCos = Math.abs(dx / len);
            const absSin = Math.abs(dy / len);
            const r1 = (data1 && !data1.isHidden) ? (absCos * (data1.elemWidth / 2 + 4) + absSin * (data1.currentFontSize * 0.6)) : 0;
            const r2 = (data2 && !data2.isHidden) ? (absCos * (data2.elemWidth / 2 + 4) + absSin * (data2.currentFontSize * 0.6)) : 0;
            
            if (len <= r1 + r2) return; 
            
            const sx = x1 + (dx / len) * r1;
            const sy = y1 + (dy / len) * r1;
            const ex = x2 - (dx / len) * r2;
            const ey = y2 - (dy / len) * r2;

            const offset = bond.spacing || (uiState ? uiState.globalBondSpacing : 6);

            if (bond.type === 1) {
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
            } else if (bond.type === 2) {
                const a1Conns = allBonds.filter(b => b.id1 === a1.id || b.id2 === a1.id).length;
                const a2Conns = allBonds.filter(b => b.id1 === a2.id || b.id2 === a2.id).length;
                
                if (a1Conns === 1 || a2Conns === 1) {
                    const hOff = offset / 2;
                    svg += `  <line class="bond" x1="${sx + nx * hOff}" y1="${sy + ny * hOff}" x2="${ex + nx * hOff}" y2="${ey + ny * hOff}" style="${styleObj}" />\n`;
                    svg += `  <line class="bond" x1="${sx - nx * hOff}" y1="${sy - ny * hOff}" x2="${ex - nx * hOff}" y2="${ey - ny * hOff}" style="${styleObj}" />\n`;
                } else {
                    const dir = calculateBondOffsetDirection(a1, a2, allBonds, allAtoms);
                    const shX = nx * (offset * dir), shY = ny * (offset * dir);
                    const px = (dx / len) * 3, py = (dy / len) * 3; 
                    svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                    svg += `  <line class="bond" x1="${sx + shX + px}" y1="${sy + shY + py}" x2="${ex + shX - px}" y2="${ey + shY - py}" style="${styleObj}" />\n`;
                }
            } else if (bond.type === 3) {
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${sx + nx*offset}" y1="${sy + ny*offset}" x2="${ex + nx*offset}" y2="${ey + ny*offset}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${sx - nx*offset}" y1="${sy - ny*offset}" x2="${ex - nx*offset}" y2="${ey - ny*offset}" style="${styleObj}" />\n`;
            } else if (bond.type === 4) { 
                svg += `  <line class="bond" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" style="${styleObj}" />\n`;
                const headlen = 12;
                const angle = Math.atan2(dy, dx);
                const h1x = ex - headlen * Math.cos(angle - Math.PI / 6);
                const h1y = ey - headlen * Math.sin(angle - Math.PI / 6);
                const h2x = ex - headlen * Math.cos(angle + Math.PI / 6);
                const h2y = ey - headlen * Math.sin(angle + Math.PI / 6);
                svg += `  <line class="bond" x1="${ex}" y1="${ey}" x2="${h1x}" y2="${h1y}" style="${styleObj}" />\n`;
                svg += `  <line class="bond" x1="${ex}" y1="${ey}" x2="${h2x}" y2="${h2y}" style="${styleObj}" />\n`;
            } else if (bond.type === 5) { 
                const sw = 1.0, ew = Math.min(8, Math.max(3.0, 5.0 + (item.z * 0.05))); 
                svg += `  <polygon points="${sx + nx * sw},${sy + ny * sw} ${sx - nx * sw},${sy - ny * sw} ${ex - nx * ew},${ey - ny * ew} ${ex + nx * ew},${ey + ny * ew}" fill="${bond.color || '#000'}" />\n`;
            } else if (bond.type === 6) { 
                for (let i = 0; i < 6; i++) {
                    const frac = i / 5;
                    const cx = sx + (ex - sx) * frac, cy = sy + (ey - sy) * frac;
                    const cw = 1.0 + (4.0 * frac); 
                    svg += `  <line class="bond" x1="${cx + nx * cw}" y1="${cy + ny * cw}" x2="${cx - nx * cw}" y2="${cy - ny * cw}" style="${styleObj}" />\n`;
                }
            }
        } else {
            // --- ATOME ZEICHNEN ---
            const { atom } = item;
            const data = atomData.get(atom.id);
            if (!data || data.isHidden) return;

            const ax = atom.x + offX + data.shiftX; 
            const ay = atom.y + offY;
            
            let additions = "";
            if (atom.charge) {
                const isPositive = atom.charge > 0;
                const absCharge = Math.abs(atom.charge);
                const angle = atom.chargeAngle !== undefined ? atom.chargeAngle : (data.bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
                
                const badgeX = ax + Math.cos(angle) * (data.bgRadiusX + data.currentFontSize * 0.25);
                const badgeY = ay + Math.sin(angle) * (data.bgRadiusY + data.currentFontSize * 0.25);
                const badgeRadius = Math.max(7 * data.scale, data.currentFontSize * 0.42);

                additions += `  <circle cx="${badgeX}" cy="${badgeY}" r="${badgeRadius}" fill="#fff" stroke="${atom.color || '#000'}" stroke-width="${1.5 * data.scale}" />\n`;
                
                const chargeFontSize = Math.max(10 * data.scale, fontSize * 0.6);
                // FIX: Minus-Zeichen sind im SVG nie mittig. Wir verschieben die Höhe optisch um 12% der Schriftgröße nach unten!
                const textCenterY = badgeY + (chargeFontSize * 0.12);
                
                additions += `  <text font-family="${data.fontToUse}" font-weight="bold" font-size="${chargeFontSize}px" fill="${atom.color || '#000'}" x="${badgeX}" y="${textCenterY}" text-anchor="middle" dominant-baseline="central">${isPositive ? "+" : "-"}</text>\n`;
                
                if (absCharge > 1) {
                    const numFontSize = Math.max(12 * data.scale, fontSize * 0.7);
                    additions += `  <text font-family="${data.fontToUse}" font-weight="bold" font-size="${numFontSize}px" fill="${atom.color || '#000'}" x="${badgeX - badgeRadius - (fontSize * 0.1)}" y="${badgeY + (numFontSize * 0.12)}" text-anchor="end" dominant-baseline="central">${absCharge}</text>\n`;
                }
            }
            if (atom.radical) {
                const angle = atom.chargeAngle !== undefined ? atom.chargeAngle : (data.bondOnRight ? -Math.PI * 0.8 : -Math.PI * 0.2);
                const chargeOffset = atom.charge ? (data.currentFontSize * 0.85) : 0;
                const radX = ax + Math.cos(angle) * (data.bgRadiusX + data.currentFontSize * 0.25 + chargeOffset);
                const radY = ay + Math.sin(angle) * (data.bgRadiusY + data.currentFontSize * 0.25 + chargeOffset);
                additions += `  <circle cx="${radX}" cy="${radY}" r="${Math.max(2, data.currentFontSize*0.15)}" fill="${atom.color || '#000'}" />\n`;
            }

            const svgLabel = buildSvgRichText(data.rawLabel, data.currentFontSize);
            svg += `  <text class="atom-text" font-family="${data.fontToUse}" x="${ax}" y="${ay}" font-size="${data.currentFontSize}px" fill="${atom.color || '#000'}">${svgLabel}</text>\n`;
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

export function generateHighResPNG(atoms: Atom[], bonds: Bond[], fontSize: number = 16): string | null {
    if (atoms.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    atoms.forEach(a => {
        if (a.element !== "DUMMY") {
            if (a.x < minX) minX = a.x;
            if (a.y < minY) minY = a.y;
            if (a.x > maxX) maxX = a.x;
            if (a.y > maxY) maxY = a.y;
        }
    });

    const padding = 40 + fontSize; 
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;
    
    const scale = 4;
    
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width * scale;
    offscreenCanvas.height = height * scale;
    const ctx = offscreenCanvas.getContext("2d");
    
    if (!ctx) return null;

    // Magischer Fix für den Hintergrund & 4x Zoom
    const originalReset = ctx.resetTransform.bind(ctx);
    ctx.resetTransform = () => {
        originalReset();
        ctx.scale(scale, scale); 
    };

    ctx.resetTransform();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const exportOptions: any = {
        ...(uiState || {}), 
        fontSize: fontSize, // Hier nutzen wir den sauberen Parameter!
        panX: -minX + padding, 
        panY: -minY + padding,
        showGrid: false,
        selectedAtomId: null,
        selectedAtomIds: new Set<number>(),
        dragStartAtom: null,
        lassoPath: []
    };

    drawScene(ctx, width, height, atoms, bonds, exportOptions);

    return offscreenCanvas.toDataURL("image/png", 1.0);
}