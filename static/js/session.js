import { CONFIG } from "./config.js";

// La sessione (token di upload + credenziali dell'utente Navidrome "uploader")
// viene ricordata nel browser, così la password condivisa si inserisce una volta sola.
const KEY = "coemify.session";
let memorySession = null; // fallback se il browser blocca localStorage

export class AuthError extends Error {}

export function getSession() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* localStorage non disponibile */ }
    return memorySession;
}

function saveSession(session) {
    memorySession = session;
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* ignora */ }
}

export function logout() {
    memorySession = null;
    try { localStorage.removeItem(KEY); } catch { /* ignora */ }
}

export async function login(password) {
    const body = new FormData();
    body.append("action", "login");
    body.append("password", password);

    let response;
    try {
        response = await fetch(CONFIG.N8N_WEBHOOK_URL, { method: "POST", body });
    } catch {
        throw new Error("Impossibile contattare il server di caricamento (n8n).");
    }

    if (response.status === 401) throw new AuthError("Password errata");
    if (!response.ok) throw new Error(`Errore del server di caricamento (${response.status})`);

    const data = await response.json();
    if (!data.uploadToken || !data.navidrome?.user) {
        throw new Error("Risposta di login non valida: controlla la configurazione di n8n.");
    }

    saveSession({
        uploadToken: data.uploadToken,
        navidrome: { user: data.navidrome.user, password: data.navidrome.password },
    });
}
