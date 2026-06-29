// src/chemistry/rdkit-3d.ts
import { execFile } from 'child_process';
import * as util from 'util';
import * as path from 'path';

const execFileAsync = util.promisify(execFile);

export let RDKit: any = null;

export function initRDKit() {
    if ((window as any).initRDKitModule) {
        (window as any).initRDKitModule({
            locateFile: () => "https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.wasm"
        }).then((instance: any) => {
            RDKit = instance;
            console.log("RDKit loaded!");
        });
    }
}

// --- Python-Interpreter (python vs python3 vs py), Ergebnis cachen ---
let pythonCmdPromise: Promise<string> | null = null;

function pythonCandidates(): string[] {
    // Windows hat meist 'python'/'py', macOS/Linux meist 'python3'.
    return process.platform === "win32"
        ? ["python", "py", "python3"]
        : ["python3", "python"];
}

async function resolvePython(): Promise<string> {
    if (!pythonCmdPromise) {
        pythonCmdPromise = (async () => {
            for (const cmd of pythonCandidates()) {
                try {
                    await execFileAsync(cmd, ["--version"]);
                    return cmd; // erster, der antwortet, gewinnt
                } catch { /* nächsten probieren */ }
            }
            // Nichts gefunden -> Default zurückgeben, damit der echte Aufruf
            // einen Fehler wirft statt schon hier zu krepieren.
            return process.platform === "win32" ? "python" : "python3";
        })();
    }
    return pythonCmdPromise;
}

//     SMILES mit (), #, [], = usw. werden jetzt als Literal übergeben statt vom
//     Shell-Quoting zerlegt zu werden. ---
async function runEngine(smiles: string, mode: "2d" | "3d"): Promise<string> {
    const cleanSmiles = smiles.trim().replace(/^SMILES=/i, "");
    const scriptPath = path.join(__dirname, '../../engine_3d.py');
    const python = await resolvePython();

    console.log(`[RDKit Python] ${python} ${scriptPath} "${cleanSmiles}" ${mode}`);

    const { stdout, stderr } = await execFileAsync(
        python,
        [scriptPath, cleanSmiles, mode],
        { maxBuffer: 1024 * 1024 * 16 }
    );

    if (stderr && stderr.includes("ERROR")) throw new Error(stderr);
    return stdout;
}

export async function generate2DModelPython(smiles: string): Promise<string> {
    try {
        return await runEngine(smiles, "2d");
    } catch (err: any) {
        throw new Error(`Python 2D Fehler: ${err.message}`);
    }
}

export async function generate3DModelPython(smiles: string): Promise<string> {
    try {
        return await runEngine(smiles, "3d");
    } catch (err: any) {
        console.error("[RDKit Python System-Fehler]:", err);
        throw new Error(`Python Startfehler: ${err.message}`);
    }
}