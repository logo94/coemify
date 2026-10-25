// Modalità "YouTube": siti di download mostrati dentro Coemify.
// L'elenco dei siti sta in fonti.json (nella cartella principale), non nel codice.
import { showAlert } from "./utils.js";

const SOURCES_FILE = "fonti.json";
const LAST_SOURCE_KEY = "coemify.lastSource";

let sources = [];
let current = -1;

const $ = id => document.getElementById(id);

function remember(url) {
    try { localStorage.setItem(LAST_SOURCE_KEY, url); } catch { /* ignora */ }
}

function lastUsed() {
    try { return localStorage.getItem(LAST_SOURCE_KEY); } catch { return null; }
}

function validSource(s) {
    try {
        return typeof s?.nome === "string" && ["http:", "https:"].includes(new URL(s.url).protocol);
    } catch {
        return false;
    }
}

export async function loadSources() {
    const select = $("sourceSelect");
    try {
        const response = await fetch(SOURCES_FILE, { cache: "no-cache" });
        if (!response.ok) throw new Error(response.status);
        const data = await response.json();
        sources = (data.fonti || []).filter(validSource);
    } catch (error) {
        console.error(error);
        sources = [];
    }

    select.innerHTML = "";
    if (sources.length === 0) {
        select.innerHTML = "<option>Nessuna fonte configurata</option>";
        select.disabled = true;
        $("ytFrameNote").textContent = `Aggiungi i siti di download nel file ${SOURCES_FILE}.`;
        return;
    }

    sources.forEach((s, i) => {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = s.incorporabile === false ? `${s.nome} (nuova scheda)` : s.nome;
        select.appendChild(option);
    });

    // Si riparte dall'ultima fonte usata, se c'è ancora
    const saved = sources.findIndex(s => s.url === lastUsed());
    current = saved >= 0 ? saved : 0;
    select.value = current;
}

// Il riquadro si carica solo quando si apre la modalità YouTube
export function showSource(index = current) {
    if (!sources.length) return;
    current = (index + sources.length) % sources.length;
    $("sourceSelect").value = current;

    const source = sources[current];
    const frame = $("ytFrame");
    const blocked = $("ytBlocked");
    remember(source.url);

    if (source.incorporabile === false) {
        frame.removeAttribute("src");
        frame.style.display = "none";
        blocked.style.display = "flex";
        $("ytBlockedName").textContent = source.nome;
    } else {
        blocked.style.display = "none";
        frame.style.display = "block";
        if (frame.getAttribute("src") !== source.url) frame.src = source.url;
    }
}

export function openCurrentInTab() {
    if (sources[current]) window.open(sources[current].url, "_blank", "noopener");
}

export function setupYoutubeMode() {
    $("sourceSelect").addEventListener("change", e => showSource(Number(e.target.value)));
    $("nextSource").addEventListener("click", () => {
        showSource(current + 1);
        showAlert(`Provo con ${sources[current]?.nome}`, "info");
    });
    $("openSourceTab").addEventListener("click", openCurrentInTab);
    $("ytBlockedOpen").addEventListener("click", openCurrentInTab);
}
