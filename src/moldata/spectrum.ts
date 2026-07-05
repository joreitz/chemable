export interface Stick { x: number; y: number; }
export interface PlotOpts {
    sticks: Stick[]; xLabel: string;
    width: number;                    // FWHM in x-Einheit
    shape: "gauss" | "lorentz";
    invertX?: boolean;
}

export function plotSpectrum(canvas: HTMLCanvasElement, o: PlotOpts) {
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height, L = 46, R = 10, T = 10, B = 30;
    ctx.clearRect(0, 0, W, H);
    if (!o.sticks.length) return;
    const xs = o.sticks.map(s => s.x);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    const pad = (x1 - x0) * 0.05 + 3 * o.width;
    x0 -= pad; x1 += pad;
    const w = Math.max(o.width, (x1 - x0) / 2000);
    const N = 800, ys = new Float64Array(N);
    for (let i = 0; i < N; i++) {
        const x = x0 + (x1 - x0) * i / (N - 1);
        let y = 0;
        for (const s of o.sticks) {
            const d = (x - s.x) / (w / 2);
            y += o.shape === "gauss" ? s.y * Math.exp(-Math.LN2 * d * d) : s.y / (1 + d * d);
        }
        ys[i] = y;
    }
    const yME = Math.max(...ys) || 1, yMS = Math.max(...o.sticks.map(s => s.y)) || 1;
    const px = (x: number) => { let f = (x - x0) / (x1 - x0); if (o.invertX) f = 1 - f; return L + f * (W - L - R); };
    const py = (f: number) => T + (1 - f) * (H - T - B);
    ctx.strokeStyle = "#999"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
    ctx.fillStyle = "#666"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
    for (let i = 0; i <= 6; i++) {
        const x = x0 + (x1 - x0) * i / 6, X = px(x);
        ctx.beginPath(); ctx.moveTo(X, H - B); ctx.lineTo(X, H - B + 4); ctx.stroke();
        ctx.fillText(x1 - x0 > 100 ? String(Math.round(x)) : x.toFixed(2), X, H - B + 14);
    }
    ctx.fillText(o.xLabel, L + (W - L - R) / 2, H - 3);
    ctx.strokeStyle = "#c7d2fe";                                  // Sticks (hell)
    for (const s of o.sticks) { ctx.beginPath(); ctx.moveTo(px(s.x), py(0)); ctx.lineTo(px(s.x), py(s.y / yMS * 0.95)); ctx.stroke(); }
    ctx.strokeStyle = "#4f46e5"; ctx.lineWidth = 1.5; ctx.beginPath();  // Envelope
    for (let i = 0; i < N; i++) {
        const X = px(x0 + (x1 - x0) * i / (N - 1)), Y = py(ys[i] / yME * 0.95);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
}