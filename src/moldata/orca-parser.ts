export interface OrcaData {
    meta?: { inputLine?: string; charge?: number; mult?: number; runtime?: string; version?: string };
    finalEnergyEh?: number;
    coords?: { el: string; x: number; y: number; z: number }[];
    dipole?: { x: number; y: number; z: number; debye?: number };
    s2?: number;
    mulliken?: { idx: number; el: string; charge: number; spin?: number }[];
    brokenSym?: { sHS?: number; s2HS?: number; s2BS?: number; eHS?: number; eBS?: number;
                  coupling?: string; J1?: number; J2?: number; J3?: number };  // J in cm-1
    freqs?: number[];                                        // alle Moden inkl. 0.00, negative = imaginär
    ir?: { mode: number; freq: number; intensity: number }[]; // km/mol
    thermo?: { zpeEh?: number; enthalpyEh?: number; gibbsEh?: number };
    tddft?: { state: number; eV: number; cm1: number; s2?: number; mult?: number;
              contribs: { from: string; to: string; weight: number }[] }[];
    absorption?: { to: string; eV: number; cm1: number; nm: number; fosc: number }[];
    nmr?: { idx: number; el: string; isotropic: number; anisotropy: number }[];
    solvation?: { model?: string; solvent?: string; epsilon?: number };  // trial: Format???
    ssc?: { a: number; b: number; elA: string; elB: string; rAB: number; isoHz: number }[];
}

// letztes Vorkommen Header-Anker
function lastBlock(lines: string[], anchor: RegExp): string[] | null {
    let at = -1;
    for (let i = 0; i < lines.length; i++) if (anchor.test(lines[i])) at = i;
    return at < 0 ? null : lines.slice(at);
}
const lastMatch = (text: string, re: RegExp): RegExpMatchArray | null => {
    let m: RegExpMatchArray | null = null;
    for (const x of text.matchAll(new RegExp(re, re.flags.includes("g") ? re.flags : re.flags + "g"))) m = x;
    return m;
};
const num = (s?: string) => (s === undefined ? undefined : parseFloat(s));

// ---  out:Partial<OrcaData> 
type BlockFn = (text: string, lines: string[]) => Partial<OrcaData>;

const pMeta: BlockFn = (t) => {
    const input = [...t.matchAll(/\|\s*\d+>\s*(!.*)/g)].map(m => m[1].trim()).join(" ");
    return { meta: {
        inputLine: input || undefined,
        charge: num(lastMatch(t, /Total Charge\s+Charge\s+\.+\s+(-?\d+)/)?.[1]),
        mult:   num(lastMatch(t, /Multiplicity\s+Mult\s+\.+\s+(\d+)/)?.[1]),
        version: lastMatch(t, /Program Version\s+(\S+)/)?.[1],
        runtime: lastMatch(t, /TOTAL RUN TIME:\s*(.+)/)?.[1]?.trim(),
    }};
};
const pSSC: BlockFn = (t) => {
    if (!/NMR SPIN-SPIN COUPLING CONSTANTS/.test(t)) return {};
    const ssc: OrcaData["ssc"] = [];
    const re = /NUCLEUS A = ([A-Z][a-z]?)\s+(\d+) NUCLEUS B = ([A-Z][a-z]?)\s+(\d+)[\s\S]*?r\(AB\) =\s+([\d.]+)[\s\S]*?J\[\d+,\d+\]\(Total\).*?iso=\s+(-?[\d.]+)/g;
    for (const m of t.matchAll(re))
        ssc.push({ elA: m[1], a: +m[2], elB: m[3], b: +m[4], rAB: +m[5], isoHz: +m[6] });
    return ssc.length ? { ssc } : {};
};
const pEnergy: BlockFn = (t) => ({ finalEnergyEh: num(lastMatch(t, /FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)/)?.[1]) });
const pCoords: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^CARTESIAN COORDINATES \(ANGSTROEM\)/);
    if (!b) return {};
    const coords: OrcaData["coords"] = [];
    for (let i = 2; i < b.length; i++) {   // [0]=Header [1]=Strichzeile
        const m = b[i].match(/^\s*([A-Z][a-z]?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/);
        if (!m) break;
        coords.push({ el: m[1], x: +m[2], y: +m[3], z: +m[4] });
    }
    return coords.length ? { coords } : {};
};
const pDipole: BlockFn = (t) => {
    const m = lastMatch(t, /Total Dipole Moment\s+:\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
    if (!m) return {};
    return { dipole: { x: +m[1], y: +m[2], z: +m[3], debye: num(lastMatch(t, /Magnitude \(Debye\)\s+:\s+([\d.]+)/)?.[1]) } };
};
const pS2: BlockFn = (t) => ({ s2: num(lastMatch(t, /Expectation value of <S\*\*2>\s+:\s+(-?[\d.]+)/)?.[1]) });
const pMulliken: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^MULLIKEN ATOMIC CHARGES( AND SPIN POPULATIONS)?/);
    if (!b) return {};
    const rows: OrcaData["mulliken"] = [];
    for (let i = 2; i < b.length; i++) {
        const m = b[i].match(/^\s*(\d+)\s+([A-Z][a-z]?)\s*:\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/);
        if (!m) break;
        rows.push({ idx: +m[1], el: m[2], charge: +m[3], spin: m[4] !== undefined ? +m[4] : undefined });
    }
    return rows.length ? { mulliken: rows } : {};
};
const pBrokenSym: BlockFn = (t) => {
    if (!/BROKEN SYMMETRY MAGNETIC COUPLING ANALYSIS/.test(t)) return {};
    const g = (re: RegExp) => num(lastMatch(t, re)?.[1]);
    return { brokenSym: {
        sHS:  g(/S\(High-Spin\)\s+=\s+(-?[\d.]+)/),
        s2HS: g(/<S\*\*2>\(High-Spin\)\s+=\s+(-?[\d.]+)/),
        s2BS: g(/<S\*\*2>\(BrokenSym\)\s+=\s+(-?[\d.]+)/),
        eHS:  g(/E\(High-Spin\)\s+=\s+(-?[\d.]+)\s+Eh/),
        eBS:  g(/E\(BrokenSym\)\s+=\s+(-?[\d.]+)\s+Eh/),
        coupling: lastMatch(t, /\((ANTIFERROMAGNETIC|FERROMAGNETIC) coupling\)/)?.[1],
        J1: g(/J\(1\)\s*=\s*(-?[\d.]+)\s*cm\*\*-1/),
        J2: g(/J\(2\)\s*=\s*(-?[\d.]+)\s*cm\*\*-1/),
        J3: g(/J\(3\)\s*=\s*(-?[\d.]+)\s*cm\*\*-1/),
    }};
};
const pFreq: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^VIBRATIONAL FREQUENCIES/);
    if (!b) return {};
    const freqs: number[] = [];
    for (const line of b.slice(1)) {
        const m = line.match(/^\s*(\d+):\s+(-?[\d.]+)\s+cm\*\*-1/);
        if (m) freqs.push(+m[2]);
        else if (freqs.length && line.trim() && !/^-+$|Scaling factor/.test(line.trim())) break;
    }
    return freqs.length ? { freqs } : {};
};
const pIR: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^IR SPECTRUM/);
    if (!b) return {};
    const ir: OrcaData["ir"] = [];
    for (const line of b.slice(1)) {
        const m = line.match(/^\s*(\d+):\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
        if (m) ir.push({ mode: +m[1], freq: +m[2], intensity: +m[4] });
        else if (ir.length && line.trim()) break;
    }
    return ir.length ? { ir } : {};
};
const pThermo: BlockFn = (t) => {
    const th = {
        zpeEh:      num(lastMatch(t, /Zero point energy\s+\.\.\.\s+(-?[\d.]+)\s+Eh/)?.[1]),
        enthalpyEh: num(lastMatch(t, /Total Enthalpy\s+\.\.\.\s+(-?[\d.]+)\s+Eh/)?.[1]),
        gibbsEh:    num(lastMatch(t, /Final Gibbs free energy\s+\.\.\.\s+(-?[\d.]+)\s+Eh/)?.[1]),
    };
    return th.zpeEh !== undefined || th.gibbsEh !== undefined ? { thermo: th } : {};
};
const pTDDFT: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^TD-DFT(\/TDA)? EXCITED STATES/);
    if (!b) return {};
    const states: OrcaData["tddft"] = [];
    let cur: NonNullable<OrcaData["tddft"]>[number] | null = null;
    for (const line of b) {
        const s = line.match(/^STATE\s+(\d+):\s+E=\s+(-?[\d.]+)\s+au\s+(-?[\d.]+)\s+eV\s+(-?[\d.]+)\s+cm\*\*-1(?:\s+<S\*\*2>\s*=\s*(-?[\d.]+))?(?:\s+Mult\s+(\d+))?/);
        if (s) { cur = { state: +s[1], eV: +s[3], cm1: +s[4], s2: num(s[5]), mult: s[6] ? +s[6] : undefined, contribs: [] }; states.push(cur); continue; }
        const c = line.match(/^\s*(\S+)\s*->\s*(\S+)\s*:\s*([\d.]+)/);
        if (c && cur) cur.contribs.push({ from: c[1], to: c[2], weight: +c[3] });
        if (/EXCITATION SPECTRA|ABSORPTION SPECTRUM/.test(line)) break;
    }
    return states.length ? { tddft: states } : {};
};
const pAbsorption: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /ABSORPTION SPECTRUM VIA TRANSITION ELECTRIC DIPOLE MOMENTS/);
    if (!b) return {};
    const rows: OrcaData["absorption"] = [];
    for (const line of b) {
        const m = line.match(/^\s*\S+\s+->\s+(\S+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.eE+-]+)/);
        if (m) rows.push({ to: m[1], eV: +m[2], cm1: +m[3], nm: +m[4], fosc: +m[5] });
        else if (rows.length && line.trim() && !/^-+$/.test(line.trim())) break;
    }
    return rows.length ? { absorption: rows } : {};
};
const pNMR: BlockFn = (_t, lines) => {
    const b = lastBlock(lines, /^CHEMICAL SHIELDING SUMMARY \(ppm\)/);
    if (!b) return {};
    const rows: OrcaData["nmr"] = [];
    for (const line of b) {
        const m = line.match(/^\s*(\d+)\s+([A-Z][a-z]?)\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        if (m) rows.push({ idx: +m[1], el: m[2], isotropic: +m[3], anisotropy: +m[4] });
        else if (rows.length && line.trim()) break;
    }
    return rows.length ? { nmr: rows } : {};
};
// TRIAL
const pSolvation: BlockFn = (t) => {
    if (!/CPCM|SMD|C-PCM/i.test(t)) return {};
    return { solvation: {
        model: /SMD/.test(t) ? "SMD" : "CPCM",
        solvent: lastMatch(t, /Solvent\s*(?::|\.+)\s*(\S+)/i)?.[1],
        epsilon: num(lastMatch(t, /[Ee]psilon\s*(?::|\.+)\s*([\d.]+)/)?.[1]),
    }};
};

// --- Registry: neuer Block = Funktion oben + Eintrag hier ---
const BLOCKS: BlockFn[] = [pMeta, pEnergy, pCoords, pDipole, pS2, pMulliken, pBrokenSym,
                           pFreq, pIR, pThermo, pTDDFT, pAbsorption, pNMR, pSolvation, pSSC];

export function parseOrca(text: string): OrcaData {
    const lines = text.split(/\r?\n/);
    const out: OrcaData = {};
    for (const fn of BLOCKS) {
        try { Object.assign(out, fn(text, lines)); }
        catch (e) { console.warn("[orca-parser] Block übersprungen:", e); }
    }
    return out;
}