import rawElements from './elements.json';

export interface ElementData {
    atomicNumber: number;
    elementSymbol: string;
    name: string;
    covSingleBondRadius: number;
    covDoubleBondRadius?: number;
    covTripleBondRadius?: number;
    electronegativity: number;
    valency: number[];
    colorValue: string;
};
export const periodicTable: Record<string, ElementData> = rawElements as unknown as Record<string, ElementData>;