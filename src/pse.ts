export interface ElementData {
    elementSymbol: string;
    covSingleBondRadius: number;
    covDoubleBondRadius: number; //radii after Pyykköö
    covTripleBondRadius: number;
    electronegativity: number;
    valency : Array<number>;
    colorValue: string;
}

export const periodicTable: Record<string, ElementData> = {
    "C": {
        elementSymbol: "C",
        covSingleBondRadius: 75,
        covDoubleBondRadius: 67,
        covTripleBondRadius: 60,
        electronegativity: 2.55,
        valency: [4,3,2,1],
        colorValue: "#000000ff"
    },
    // hier mehr Elemente einfügen
    "H": {
        elementSymbol: "H",
        covSingleBondRadius: 32,
        covDoubleBondRadius: 32,
        covTripleBondRadius: 32,
        electronegativity: 2.2,
        valency: [1, 2],
        colorValue: "#4444462b"
    },
    "O": {
        elementSymbol: "O",
        covSingleBondRadius: 63,
        covDoubleBondRadius: 57,
        covTripleBondRadius: 53,
        electronegativity: 3.44,
        valency: [1, 2],
        colorValue: "#3030eb2b"
    },
}