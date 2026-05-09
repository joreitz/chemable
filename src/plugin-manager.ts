import { ChemablePlugin, ChemableContext } from "./plugin-api";
import { state } from "./state";

const activePlugins: ChemablePlugin[] = [];

const context: ChemableContext = {
    getAtoms: () => state.getAtoms(),
    getBonds: () => state.getBonds(),
    saveState: () => state.saveState(),
    render: () => { /* Wird in renderer.ts per Hook gesetzt */ },
    showMessage: (msg: string) => {
        alert(msg); 
    },
    drawOverlay: (data: any) => {
        console.log("Plugin möchte Overlay zeichnen:", data);
    }
};

export function setPluginRenderHook(renderFn: () => void) {
    context.render = renderFn;
}

export function registerPlugin(plugin: ChemablePlugin) {
    activePlugins.push(plugin);
    plugin.onLoad(context);
    
    const pluginMenu = document.getElementById('plugin-dropdown-content');
    if (pluginMenu && plugin.execute) {
        const btn = document.createElement('button');
        btn.innerText = `🌍 ${plugin.name}`;
        btn.addEventListener('click', async () => {
            try { await plugin.execute!(); } catch (err) { console.error(err); }
        });
        pluginMenu.appendChild(btn);
    }
}

export function triggerPluginStateChange() {
    activePlugins.forEach(plugin => {
        if (plugin.onStateChange) plugin.onStateChange(context);
    });
}