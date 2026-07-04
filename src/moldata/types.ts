export type EntryKind = "orca-out" | "cube" | "xyz" | "file";
export interface SolvEntry { method: string; solvent: string; valueEh: number; }

export interface DataEntry {
    id: string;
    kind: EntryKind;
    label: string;      // frei benennbar 
    file: string;       // relativer Pfad unter files/
}

export interface Species {
    id: string;
    label: string;      // z.B. "Fe(II) LS", "Triplett", "cis-Isomer"
    charge: number;
    multiplicity: number;
    note?: string;
    entries: DataEntry[];
    solvation?: SolvEntry[];
}

export interface MolDataset {
    name: string;
    created: string;
    species: Species[];
}