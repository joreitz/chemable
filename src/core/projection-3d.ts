// src/core/projection-3d.ts
import { Atom } from "../types";

export function rotateAtoms3D(atoms: Atom[], dx: number, dy: number) {
    if (atoms.length === 0) return;

    // 1. Schwerpunkt der AKTUELLEN (vom Slider skalierten) Atome finden
    let currSumX = 0, currSumY = 0, currSumZ = 0;
    // 2. Schwerpunkt der ORIGINALEN 3D-Struktur finden
    let origSumX = 0, origSumY = 0, origSumZ = 0;
    let count = 0;

    atoms.forEach(a => {
        if (a.element !== "DUMMY") {
            currSumX += a.x; 
            currSumY += a.y; 
            currSumZ += (a.z || 0);
            
            origSumX += (a.orig3DX !== undefined ? a.orig3DX : a.x);
            origSumY += (a.orig3DY !== undefined ? a.orig3DY : a.y);
            origSumZ += (a.orig3DZ !== undefined ? a.orig3DZ : (a.z || 0));
            count++;
        }
    });
    
    if (count === 0) return;

    const currCx = currSumX / count;
    const currCy = currSumY / count;
    const currCz = currSumZ / count;

    const origCx = origSumX / count;
    const origCy = origSumY / count;
    const origCz = origSumZ / count;

    // 3. SKALIERUNGSFAKTOR BERECHNEN: 
    // Wie stark hat der User das Molekül in 2D (mit dem Slider) gestreckt?
    let currRadius = 0;
    let origRadius = 0;
    atoms.forEach(a => {
        if (a.element !== "DUMMY") {
            currRadius += Math.sqrt(Math.pow(a.x - currCx, 2) + Math.pow(a.y - currCy, 2));
            
            const ox = a.orig3DX !== undefined ? a.orig3DX : a.x;
            const oy = a.orig3DY !== undefined ? a.orig3DY : a.y;
            origRadius += Math.sqrt(Math.pow(ox - origCx, 2) + Math.pow(oy - origCy, 2));
        }
    });

    // Faktor bestimmen (Verhindert Division durch 0)
    const scale = (origRadius > 0.001) ? (currRadius / origRadius) : 1.0;

    // 4. MOUSE-FIX: Das Minus bei -dy behebt die invertierte Oben/Unten Steuerung!
    const angleX = -dy * 0.01; 
    const angleY = dx * 0.01; 

    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);

    // 5. ROTATION MIT AUTO-KORREKTUR
    atoms.forEach(a => {
        if (a.element === "DUMMY") return;

        // Hole die Original-3D-Form...
        const ox = a.orig3DX !== undefined ? a.orig3DX : a.x;
        const oy = a.orig3DY !== undefined ? a.orig3DY : a.y;
        const oz = a.orig3DZ !== undefined ? a.orig3DZ : (a.z || 0);

        // ... und blase sie (inklusive Z-Achse!) exakt auf den Wert des Sliders auf!
        let x = (ox - origCx) * scale;
        let y = (oy - origCy) * scale;
        let z = (oz - origCz) * scale;

        // Rotation um die X-Achse (Nicken)
        let newY = y * cosX - z * sinX;
        let newZ = y * sinX + z * cosX;
        y = newY;
        z = newZ;

        // Rotation um die Y-Achse (Gieren)
        let newX = x * cosY + z * sinY;
        newZ = -x * sinY + z * cosY;
        x = newX;
        z = newZ;

        // Setze das Molekül exakt dort ab, wo es auf dem Canvas aktuell liegt (Kein Teleportieren mehr!)
        a.x = x + currCx;
        a.y = y + currCy;
        a.z = z + currCz;

        // Speichere den neuen skalierten & rotierten Zustand für den nächsten Frame,
        // damit es butterweich weiterdreht.
        a.orig3DX = a.x;
        a.orig3DY = a.y;
        a.orig3DZ = a.z;
    });
}