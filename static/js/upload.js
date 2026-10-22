// Lettura del file scelto e invio finale a n8n (ex upload-temp + upload-final)
import { CONFIG } from "./config.js";
import { getSession, AuthError } from "./session.js";
import { readTags, writeTags } from "./tags.js";
import { state, setCover } from "./state.js";
import { reportError } from "./errors.js";
import { showAlert, safeFileName, setLoading } from "./utils.js";

const FIELDS = ["title", "artist", "album", "genre", "duration", "release_date"];

export function isMp3(file) {
    return file && (file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"));
}

// Lettura dei tag in locale: il file non lascia il computer finché non si preme "Salva"
export async function openFile(file) {
    if (!isMp3(file)) {
        showAlert("Sono consentiti solo file MP3", "warning");
        return false;
    }

    let tags;
    try {
        tags = await readTags(file);
    } catch (error) {
        reportError(error, "Impossibile leggere il file");
        return false;
    }

    state.file = file;
    for (const field of FIELDS) {
        document.getElementById(field).value = tags[field] ?? "";
    }
    setCover(tags.picture?.data ?? null);
    document.getElementById("fileInfo").textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    return true;
}

export async function finalUpload() {
    const data = Object.fromEntries(FIELDS.map(f => [f, document.getElementById(f).value.trim()]));

    if (!state.file) return showAlert("Nessun file selezionato", "warning");
    if (!data.title || !data.artist) return showAlert("Titolo e autore sono obbligatori", "warning");

    const session = getSession();
    if (!session) return reportError(new AuthError("Sessione scaduta"));

    setLoading(true);
    try {
        const tagged = await writeTags(state.file, data, state.cover);

        const maxBytes = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;
        if (tagged.size > maxBytes) {
            throw new Error(`File troppo grande (max ${CONFIG.MAX_UPLOAD_MB} MB)`);
        }

        const filename = `${safeFileName(`${data.artist} - ${data.title}`)}.mp3`;
        const body = new FormData();
        body.append("action", "upload");
        body.append("token", session.uploadToken);
        body.append("filename", filename);
        body.append("file", tagged, filename);

        let response;
        try {
            response = await fetch(CONFIG.N8N_WEBHOOK_URL, { method: "POST", body });
        } catch {
            throw new Error("Impossibile contattare il server di caricamento (n8n)");
        }

        if (response.status === 401) throw new AuthError("Token di upload non valido");
        if (response.status === 413) throw new Error(`File troppo grande per n8n (max ${CONFIG.MAX_UPLOAD_MB} MB)`);

        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || `n8n ha risposto ${response.status}`);

        showAlert(`Caricato: ${filename}. Navidrome lo mostrerà alla prossima scansione.`, "success");
        setTimeout(() => location.reload(), 3000);
    } catch (error) {
        reportError(error, "Upload non riuscito");
    } finally {
        setLoading(false);
    }
}
