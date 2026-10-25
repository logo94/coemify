import { CONFIG } from "./config.js";
import { getSession, login, logout, AuthError } from "./session.js";
import { setSessionExpiredHandler } from "./errors.js";
import { loadOptions, checkDuplicates, loadArtistAlbums } from "./library.js";
import { openFiles, finalUpload } from "./upload.js";
import { searchMetadata } from "./musicbrainz.js";
import { loadSources, showSource, setupYoutubeMode } from "./youtube.js";
import { setCover } from "./state.js";
import { debounce, showAlert } from "./utils.js";

const $ = id => document.getElementById(id);

function show(section) {
    $("loginSection").style.display = section === "login" ? "block" : "none";
    $("uploadSection").style.display = section === "upload" ? "block" : "none";
    $("dashboardContent").style.display = section === "dashboard" ? "flex" : "none";
    $("logoutBtn").style.display = section === "login" ? "none" : "inline-block";
}

const MODE_KEY = "coemify.mode";

function setMode(mode) {
    const youtube = mode === "youtube";
    $("filePanel").style.display = youtube ? "none" : "block";
    $("youtubePanel").style.display = youtube ? "block" : "none";
    $("uploadSection").classList.toggle("yt-mode", youtube);
    document.querySelectorAll(".mode-btn").forEach(btn => {
        const active = btn.dataset.mode === mode;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", active);
    });
    if (youtube) showSource();
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignora */ }
}

function savedMode() {
    try { return localStorage.getItem(MODE_KEY) || "file"; } catch { return "file"; }
}

async function enterApp() {
    show("upload");
    await loadSources();
    setMode(savedMode());
    await loadOptions();
}

async function handleFiles(files) {
    $("uploadSpinner").style.display = "inline-block";
    const ok = await openFiles(files);
    $("uploadSpinner").style.display = "none";
    if (ok) {
        show("dashboard");
        await Promise.all([checkDuplicates(), loadArtistAlbums()]);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    $("navidromeLink").href = `${CONFIG.NAVIDROME_URL}/app/`;
    setSessionExpiredHandler(() => show("login"));

    // ---------- Login con password condivisa ----------
    $("loginForm").addEventListener("submit", async event => {
        event.preventDefault();
        const button = $("loginForm").querySelector("button");
        button.disabled = true;
        try {
            await login($("password").value);
            $("password").value = "";
            await enterApp();
        } catch (error) {
            showAlert(error.message, error instanceof AuthError ? "warning" : "danger");
        } finally {
            button.disabled = false;
        }
    });

    $("logoutBtn").addEventListener("click", () => {
        logout();
        location.reload();
    });

    // ---------- Scelta dei file (uno o più brani) ----------
    const fileInput = $("audioFile");
    $("dropZone").addEventListener("click", () => fileInput.click());
    $("pickFileLink").addEventListener("click", e => { e.preventDefault(); fileInput.click(); });
    fileInput.addEventListener("change", () => handleFiles(fileInput.files));

    // Rilascio in qualsiasi punto della pagina: un velo copre tutto (anche l'iframe)
    const overlay = $("pageDropOverlay");
    const uploadVisible = () => $("uploadSection").style.display !== "none";
    window.addEventListener("dragenter", e => {
        if (uploadVisible() && e.dataTransfer?.types.includes("Files")) overlay.classList.add("visible");
    });
    window.addEventListener("dragover", e => e.preventDefault());
    window.addEventListener("drop", e => e.preventDefault()); // evita che il browser apra l'MP3
    overlay.addEventListener("dragover", e => e.preventDefault());
    overlay.addEventListener("dragleave", () => overlay.classList.remove("visible"));
    overlay.addEventListener("drop", e => {
        e.preventDefault();
        overlay.classList.remove("visible");
        handleFiles(e.dataTransfer.files);
    });

    // ---------- Modalità File / YouTube ----------
    setupYoutubeMode();
    document.querySelectorAll(".mode-btn").forEach(btn =>
        btn.addEventListener("click", () => setMode(btn.dataset.mode)));

    // ---------- Autocompilazione ----------
    $("artist").addEventListener("input", debounce(() => {
        checkDuplicates();
        loadArtistAlbums();
    }, 500));

    // ---------- Copertina: clic sull'immagine ----------
    $("uploadCoverBtn").addEventListener("click", () => $("coverFile").click());
    $("coverFile").addEventListener("change", async event => {
        const file = event.target.files[0];
        if (file) setCover(new Uint8Array(await file.arrayBuffer()));
    });

    $("search-meta").addEventListener("click", searchMetadata);
    $("finalUpload").addEventListener("click", finalUpload);

    // ---------- Avvio ----------
    if (getSession()) {
        await enterApp();
    } else {
        show("login");
    }
});
