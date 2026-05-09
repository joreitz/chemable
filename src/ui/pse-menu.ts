// src/ui/pse-menu.ts
import { state } from "../state";
import { periodicTable } from "../pse";
import { elementLayout } from "../pse_layout";

export function initPSEMenu() {
    const pseMenu = document.getElementById('pse-menu');
    const pseGrid = document.getElementById('pse-grid');
    const currentElDisplay = document.getElementById('current-element-display');

    function initPSE() {
        if (!pseGrid) return;
        pseGrid.innerHTML = ""; 

        for (const [symbol, pos] of Object.entries(elementLayout)) {
            const data = periodicTable[symbol];
            if (!data) continue; 

            const btn = document.createElement('div');
            btn.className = 'element-btn';
            btn.innerText = symbol;
            
            btn.style.gridColumn = pos.col.toString();
            btn.style.gridRow = pos.row.toString();
            btn.style.backgroundColor = data.colorValue || "#eee";

            btn.addEventListener('click', () => {
                state.setCurrentElement(symbol);
                if (currentElDisplay) currentElDisplay.innerText = `[ ${symbol} ]`;
                if (pseMenu) pseMenu.style.display = 'none';
            });

            pseGrid.appendChild(btn);
        }
    }

    initPSE();

    // Buttons
    document.getElementById('btn-pse')?.addEventListener('click', () => {
        if (pseMenu) {
            const isVisible = pseMenu.style.display === 'block';
            pseMenu.style.display = isVisible ? 'none' : 'block';
        }
    });

    document.getElementById('btn-close-pse')?.addEventListener('click', () => {
        if (pseMenu) pseMenu.style.display = 'none';
    });
}