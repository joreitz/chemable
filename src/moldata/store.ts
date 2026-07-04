import { MolDataset, Species, DataEntry, EntryKind } from "./types";
import { SolvEntry } from "./types";

const fs = (window as any).require("fs");
const path = (window as any).require("path");
const os = (window as any).require("os");

export const ROOT = path.join(os.homedir(), "ChemableData");
const uid = () => Math.random().toString(36).slice(2, 10);

export function listDatasets(): string[] {
    try { return fs.readdirSync(ROOT).filter((d: string) =>
        fs.existsSync(path.join(ROOT, d, "manifest.json"))); } catch { return []; }
}
export function createDataset(name: string): MolDataset {
    const dir = path.join(ROOT, name);
    fs.mkdirSync(path.join(dir, "files"), { recursive: true });
    const ds: MolDataset = { name, created: new Date().toISOString(), species: [] };
    saveDataset(ds); return ds;
}
export function loadDataset(name: string): MolDataset {
    return JSON.parse(fs.readFileSync(path.join(ROOT, name, "manifest.json"), "utf8"));
}
export function saveDataset(ds: MolDataset) {
    fs.writeFileSync(path.join(ROOT, ds.name, "manifest.json"), JSON.stringify(ds, null, 2));
}
export function addSpecies(ds: MolDataset, label: string, charge: number, mult: number): Species {
    const s: Species = { id: uid(), label, charge, multiplicity: mult, entries: [] };
    ds.species.push(s); saveDataset(ds); return s;
}
function guessKind(name: string): EntryKind {
    if (/\.cube?$/i.test(name)) return "cube";
    if (/\.out$/i.test(name))   return "orca-out";
    if (/\.xyz$/i.test(name))   return "xyz";
    return "file";
}

export function addFile(ds: MolDataset, sp: Species, srcPath: string): DataEntry {
    const base = path.basename(srcPath);
    let dest = base, i = 2;
    while (fs.existsSync(path.join(ROOT, ds.name, "files", dest)))
        dest = base.replace(/(\.[^.]*)?$/, ` (${i++})$1`);
    fs.copyFileSync(srcPath, path.join(ROOT, ds.name, "files", dest));
    const e: DataEntry = { id: uid(), kind: guessKind(base), label: base, file: dest };
    sp.entries.push(e); saveDataset(ds); return e;
}
export function absPath(ds: MolDataset, e: DataEntry): string {
    return path.join(ROOT, ds.name, "files", e.file);
}  
export function addSolvation(ds: MolDataset, sp: Species, s: SolvEntry) {
    (sp.solvation ??= []).push(s); saveDataset(ds);
}