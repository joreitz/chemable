import { ipcRenderer } from "electron";

let latestUrl = "";

function setStatus(html: string) {
    const el = document.getElementById("update-status");
    if (el) el.innerHTML = html;
}
function show() { const d = document.getElementById("update-dialog"); if (d) d.style.display = "block"; }

export function initUpdater() {
    document.getElementById("btn-check-update")?.addEventListener("click", () => { show(); check(false); });
    document.getElementById("update-close")?.addEventListener("click", () => {
        const d = document.getElementById("update-dialog"); if (d) d.style.display = "none";
    });
    document.getElementById("update-open-link")?.addEventListener("click", () => {
        if (latestUrl) ipcRenderer.invoke("open-external", latestUrl);
    });
    document.getElementById("update-install")?.addEventListener("click", async () => {
        const r = await ipcRenderer.invoke("run-autoupdate");
        if (!r.ok) setStatus(`In-App-Update nicht möglich (${r.reason}) – bitte Download-Link nutzen.`);
        else setStatus("Download läuft…");
    });

    ipcRenderer.on("update-progress", (_e, pct: number) => setStatus(`Download… ${pct.toFixed(0)} %`));
    ipcRenderer.on("update-ready", () => {
        setStatus("Update bereit. <button id='update-restart'>Restart & install</button>");
        document.getElementById("update-restart")?.addEventListener("click", () => ipcRenderer.invoke("install-update"));
    });
    ipcRenderer.on("update-error", (_e, msg: string) => setStatus("Fehler: " + msg));

    setTimeout(() => check(true).catch(() => {}), 4000);   // stiller Start-Check
}

async function check(silent: boolean) {
    try {
        const r = await ipcRenderer.invoke("check-update");
        latestUrl = r.url;
        if (r.hasUpdate) {
            show();
            setStatus(`Version ${r.latest} verfügbar (installiert: ${r.current}).<br><pre style="white-space:pre-wrap;max-height:150px;overflow:auto;font-size:11px;">${r.notes}</pre>`);
        } else if (!silent) {
            setStatus(`Chemable ${r.current} ist aktuell.`);
        }
    } catch (e: any) {
        if (!silent) setStatus("Check fehlgeschlagen: " + e.message);
    }
}