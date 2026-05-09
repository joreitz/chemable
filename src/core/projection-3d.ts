// src/core/projection-3d.ts
import { Atom } from "../types";

export function rotateAtoms3D(atoms: Atom[], dx: number, dy: number) {
    if (atoms.length === 0) return;

    const angleX = dy * -0.01; 
    const angleY = dx * 0.01;

    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);

    let cx = 0, cy = 0, cz = 0;
    atoms.forEach(a => {
        if (a.orig3DX === undefined) {
            a.orig3DX = a.x;
            a.orig3DY = a.y;
            a.orig3DZ = a.z || 0;
        }
        cx += a.orig3DX!;
        cy += a.orig3DY!;
        cz += a.orig3DZ!;
    });
    cx /= atoms.length;
    cy /= atoms.length;
    cz /= atoms.length;

    // 3. Jedes Atom um das Zentrum rotieren
    atoms.forEach(atom => {
        // Verschiebe Atom in den Ursprung (relativ zum Zentrum)
        let rx = atom.orig3DX! - cx;
        let ry = atom.orig3DY! - cy;
        let rz = atom.orig3DZ! - cz;

        // Rotation um Y-Achse (links/rechts Mausbewegung)
        let tempX = rx * cosY + rz * sinY;
        let tempZ = -rx * sinY + rz * cosY;
        rx = tempX;
        rz = tempZ;

        // Rotation um X-Achse (hoch/runter Mausbewegung)
        let tempY = ry * cosX - rz * sinX;
        tempZ = ry * sinX + rz * cosX;
        ry = tempY;
        rz = tempZ;

        // Zurückspeichern: Wieder das Zentrum addieren
        atom.orig3DX = rx + cx;
        atom.orig3DY = ry + cy;
        atom.orig3DZ = rz + cz;

        // Die fertigen Koordinaten an das Canvas übergeben!
        atom.x = atom.orig3DX;
        atom.y = atom.orig3DY;
        atom.z = atom.orig3DZ;
    });
}