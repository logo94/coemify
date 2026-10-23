// Album: lettura dei file scelti, elenco brani e invio finale a n8n
// (ex /api/upload-temp + /api/upload-final in modalità album)
import { CONFIG } from "./config.js";
import { getSession, AuthError } from "./session.js";
import { readTags, writeTags } from "./tags.js";
import { state, setCover } from "./state.js";
import { reportError } from "./errors.js";
import { markDuplicates } from "./library.js";
import { showAlert, safeFileName, escapeHtml } from "./utils.js";

let nextId = 1;

function isMp3(file) {
    return file && (file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"));
}

function formatDuration(seconds) {
    if (!seconds) return "";
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

// ---------- Apertura dei file (restano nel browser finché non si preme "Salva") ----------
export async function openFiles(fileList) {
    const files = [...(fileList || [])];
    if (files.length === 0) {
        showAlert("Nessun file selezionato", "warning");
        return false;
    }

    const mp3s = files.filter(isMp3);
    files.filter(f => !isMp3(f)).forEach(f => showAlert(`${f.name}: sono consentiti solo file MP3`, "danger"));

    const results = await Promise.allSettled(mp3s.map(readTags));
    const loaded = [];
    results.forEach((r, i) => {
        if (r.status === "fulfilled") loaded.push({ file: mp3s[i], tags: r.value });
        else showAlert(`${mp3s[i].name}: impossibile leggere il file`, "danger");
    });
    if (loaded.length === 0) return false;

    // Ordine: numero di traccia dai tag, poi nome file
    loaded.sort((a, b) =>
        (a.tags.track_number ?? Infinity) - (b.tags.track_number ?? Infinity) ||
        a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));

    // Metadati dell'album dal primo file, copertina dal primo che ne ha una
    const first = loaded[0].tags;
    document.getElementById("artist").value = first.artist;
    document.getElementById("album").value = first.album;
    document.getElementById("genre").value = first.genre;
    document.getElementById("release_date").value = first.release_date;
    setCover(loaded.find(t => t.tags.picture)?.tags.picture.data ?? null);

    state.tracks = loaded.map(({ file, tags }, index) => ({
        id: nextId++,
        file,
        title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
        trackNumber: tags.track_number || index + 1,
        duration: tags.duration,
    }));
    renderTracks();
    return true;
}

// ---------- Elenco brani ----------
function renderTracks() {
    const list = document.getElementById("trackList");
    document.getElementById("trackListSection").style.display = "block";
    list.innerHTML = "";

    for (const track of state.tracks) {
        const card = document.createElement("div");
        card.className = "card track-card m-2 p-2 rounded";
        card.dataset.id = track.id;
        card.innerHTML = `
            <div class="track-item p-1 rounded">
                <div class="d-flex align-items-center">
                    <input type="number" min="1"
                        class="form-control form-control-sm border-0 border-bottom track-number me-2"
                        style="width: 30px;" value="${escapeHtml(track.trackNumber)}">
                    <div class="position-relative w-100">
                        <input type="text" placeholder="Titolo traccia"
                            class="form-control form-control-sm border-0 border-bottom w-100 title track-title"
                            value="${escapeHtml(track.title)}">
                        <span class="duplicate-badge">Duplicato</span>
                    </div>
                    <span class="ms-2 duration small">${formatDuration(track.duration)}</span>
                    <span class="track-status"></span>
                    <button type="button" class="track-remove" title="Togli dall'album">×</button>
                </div>
            </div>`;

        card.querySelector(".track-number").addEventListener("input", e => { track.trackNumber = e.target.value; });
        card.querySelector(".track-title").addEventListener("input", e => {
            track.title = e.target.value;
            markDuplicates();
        });
        card.querySelector(".track-remove").addEventListener("click", () => {
            state.tracks = state.tracks.filter(t => t.id !== track.id);
            card.remove();
            if (state.tracks.length === 0) location.reload();
        });

        list.appendChild(card);
    }
}

function setTrackStatus(id, status, title = "") {
    const el = document.querySelector(`.track-card[data-id="${id}"] .track-status`);
    if (!el) return;
    el.className = `track-status ${status}`;
    el.textContent = { busy: "…", ok: "✓", err: "✗" }[status] || "";
    el.title = title;
}

// ---------- Invio a n8n, un brano alla volta ----------
async function sendToN8n(blob, filename, token) {
    const body = new FormData();
    body.append("action", "upload");
    body.append("token", token);
    body.append("filename", filename);
    body.append("file", blob, filename);

    let response;
    try {
        response = await fetch(CONFIG.N8N_WEBHOOK_URL, { method: "POST", body });
    } catch {
        throw new Error("impossibile contattare il server di caricamento (n8n)");
    }
    if (response.status === 401) throw new AuthError("Token di upload non valido");
    if (response.status === 413) throw new Error(`file troppo grande per n8n (max ${CONFIG.MAX_UPLOAD_MB} MB)`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `n8n ha risposto ${response.status}`);
}

function setBusy(busy, text = "Salva in Navidrome") {
    const save = document.getElementById("finalUpload");
    save.disabled = busy;
    save.textContent = text;
    document.getElementById("search-meta").disabled = busy;
    document.getElementById("uploadSpinner").style.display = busy ? "inline-block" : "none";
}

export async function finalUpload() {
    const shared = {
        artist: document.getElementById("artist").value.trim(),
        album: document.getElementById("album").value.trim(),
        genre: document.getElementById("genre").value.trim(),
        release_date: document.getElementById("release_date").value.trim(),
    };

    if (state.tracks.length === 0) return showAlert("Nessun brano da caricare", "warning");
    if (!shared.artist) return showAlert("Artista obbligatorio", "warning");
    if (!state.cover) return showAlert("Copertina obbligatoria", "warning");
    if (state.tracks.some(t => !t.title.trim())) return showAlert("Ogni brano deve avere un titolo", "warning");

    const session = getSession();
    if (!session) return reportError(new AuthError("Sessione scaduta"));

    const maxBytes = CONFIG.MAX_UPLOAD_MB * 1024 * 1024;
    const total = state.tracks.length;
    const errors = [];
    const uploaded = [];

    for (const [i, track] of state.tracks.entries()) {
        setBusy(true, `Caricamento ${i + 1}/${total}...`);
        setTrackStatus(track.id, "busy");
        const title = track.title.trim();
        try {
            const blob = await writeTags(track.file, {
                ...shared, title, track_number: track.trackNumber,
            }, state.cover);
            if (blob.size > maxBytes) throw new Error(`file troppo grande (max ${CONFIG.MAX_UPLOAD_MB} MB)`);

            await sendToN8n(blob, `${safeFileName(`${shared.artist} - ${title}`)}.mp3`, session.uploadToken);
            setTrackStatus(track.id, "ok");
            uploaded.push(track.id);
        } catch (error) {
            if (error instanceof AuthError) {
                setBusy(false);
                return reportError(error);
            }
            setTrackStatus(track.id, "err", error.message);
            errors.push(`${title}: ${error.message}`);
        }
    }

    setBusy(false);

    if (errors.length === 0) {
        showAlert(`Album '${shared.album || shared.artist}' caricato con successo! (${total} tracce)`, "success");
        setTimeout(() => location.reload(), 3000);
        return;
    }

    // Restano in elenco solo i brani non caricati, così "Salva" riprova soltanto quelli
    state.tracks = state.tracks.filter(t => !uploaded.includes(t.id));
    uploaded.forEach(id => document.querySelector(`.track-card[data-id="${id}"]`)?.remove());
    errors.forEach(e => showAlert(`Errore: ${e}`, "danger"));
    if (uploaded.length) showAlert(`${uploaded.length} brani caricati, ${errors.length} non riusciti: premi di nuovo "Salva" per riprovare.`, "warning");
}
