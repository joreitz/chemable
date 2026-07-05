const NMRSIM = (window as any).require("nmr-simulation");

export interface SpinInput { shifts: number[]; js: [number, number, number][]; } // [i, j, J_Hz]

export function simulate1H(inp: SpinInput, freqMHz = 400, from?: number, to?: number, points = 4096, lineWidth = 2): { x: number[]; y: number[] } {
    const n = inp.shifts.length;
    // fromPrediction-Format: pro Spin {atomIDs, nbAtoms, delta, j: [{assignment, coupling}]}
    const pred = inp.shifts.map((d, i) => ({
        atomIDs: [String(i)], nbAtoms: 1, delta: d,
        j: inp.js.filter(([a, b]) => a === i || b === i)
                 .map(([a, b, J]) => ({ assignment: [String(a === i ? b : a)], coupling: J })),
    }));
    const spinSystem = NMRSIM.SpinSystem.fromPrediction(pred);
    spinSystem.ensureClusterSize({ maxClusterSize: 10 });
    const x0 = from ?? Math.min(...inp.shifts) - 0.5;
    const x1 = to   ?? Math.max(...inp.shifts) + 0.5;
    const spec = NMRSIM.simulate1D(spinSystem, {
        frequency: freqMHz, from: x0, to: x1, lineWidth: lineWidth, nbPoints: points,
    });
    const y: number[] = Array.from(spec.y ?? spec);   // je nach Version {x,y} oder nur y-Array
    const x: number[] = Array.from({ length: y.length }, (_, i) => x0 + (x1 - x0) * i / (y.length - 1));
    const im = y.indexOf(Math.max(...y));
    console.log(`[nmr-sim] Peak-Max at x=${x[im]?.toFixed(3)} ppm (Window ${x0.toFixed(2)}..${x1.toFixed(2)})`);
    return { x, y };
}