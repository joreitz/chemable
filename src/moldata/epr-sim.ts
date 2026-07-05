export interface EprSimInput { gx: number; gy: number; gz: number; aisoMHz: number[]; }  // je Kern I=1/2

export function simulateEPR(inp: EprSimInput, freqGHz = 9.5, lwMT = 0.3, points = 2048): { x: number[]; y: number[] } {
    const B0 = (g: number) => 71.4477 * freqGHz / g;   // mT
    // Feldfenster: alle g-Kanten + HFC-Rand + Puffer
    const edges = [inp.gx, inp.gy, inp.gz].map(B0);
    const aSpan = inp.aisoMHz.reduce((s, a) => s + Math.abs(a), 0) / (13.9962 * 2.0023);
    const bMin = Math.min(...edges) - aSpan - 5 * lwMT - 1, bMax = Math.max(...edges) + aSpan + 5 * lwMT + 1;
    // Orientierungs-Sampling -> Absorptions-Histogramm
    const hist = new Float64Array(points);
    const put = (b: number, w: number) => {
        const i = Math.round((b - bMin) / (bMax - bMin) * (points - 1));
        if (i >= 0 && i < points) hist[i] += w;
    };
    const NT = 200, NP = 60;
    for (let it = 0; it < NT; it++) {
        const ct = it / (NT - 1), st = Math.sqrt(1 - ct * ct);   // cos(theta) gleichverteilt = Kugel-uniform
        for (let ip = 0; ip < NP; ip++) {
            const ph = Math.PI / 2 * ip / (NP - 1);              // Oktant reicht (Symmetrie)
            const g = Math.sqrt((inp.gx * st * Math.cos(ph)) ** 2 + (inp.gy * st * Math.sin(ph)) ** 2 + (inp.gz * ct) ** 2);
            let lines = [{ b: B0(g), w: 1 }];
            for (const A of inp.aisoMHz) {                       // jedes I=1/2 verdoppelt
                const a = A / (13.9962 * g);
                lines = lines.flatMap(l => [{ b: l.b - a / 2, w: l.w / 2 }, { b: l.b + a / 2, w: l.w / 2 }]);
            }
            lines.forEach(l => put(l.b, l.w));
        }
    }
    // Gauß-Glättung (Faltung) + 1. Ableitung
    const dB = (bMax - bMin) / (points - 1), sig = lwMT / 2.355, K = Math.ceil(3 * sig / dB);
    const kern = Array.from({ length: 2 * K + 1 }, (_, k) => Math.exp(-(((k - K) * dB) ** 2) / (2 * sig * sig)));
    const abs = new Float64Array(points);
    for (let i = 0; i < points; i++) { let s = 0; for (let k = -K; k <= K; k++) { const j = i + k; if (j >= 0 && j < points) s += hist[j] * kern[k + K]; } abs[i] = s; }
    const x: number[] = [], y: number[] = [];
    for (let i = 1; i < points - 1; i++) { x.push(bMin + i * dB); y.push((abs[i + 1] - abs[i - 1]) / (2 * dB)); }
    return { x, y };
}