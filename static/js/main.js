import { CONFIG } from "./config.js";
import { getSession, login, logout, AuthError } from "./session.js";
import { setSessionExpiredHandler } from "./errors.js";
import { loadOptions, checkDuplicates, loadArtistAlbums } from "./library.js";
import { openFile, finalUpload } from "./upload.js";
import { searchMetadata } from "./musicbrainz.js";
import { setCover } from "./state.js";
import { debounce, showAlert } from "./utils.js";

const $ = id => document.getElementById(id);

function show(section) {
    $("loginSection").style.display = section === "login" ? "block" : "none";
    $("uploadSection").style.display = section === "upload" ? "block" : "none";
    $("dashboardContent").style.display = section === "dashboard" ? "flex" : "none";
    $("logoutBtn").style.display = section === "login" ? "none" : "inline-block";
}

async function enterApp() {
    show("upload");
    await loadOptions();
}

async function handleFile(file) {
    if (!file) return;
    if (await openFile(file)) {
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

    // ---------- Scelta del file ----------
    const dropZone = $("dropZone");
    const fileInput = $("audioFile");

    dropZone.addEventListener("click", () => fileInput.click());
    ["dragenter", "dragover", "dragleave", "drop"].forEach(name =>
        dropZone.addEventListener(name, e => { e.preventDefault(); e.stopPropagation(); }));
    dropZone.addEventListener("dragover", () => dropZone.classList.add("dragover"));
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", e => {
        dropZone.classList.remove("dragover");
        handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

    // ---------- Autocompilazione ----------
    $("title").addEventListener("input", debounce(checkDuplicates, 500));
    $("artist").addEventListener("input", debounce(() => {
        checkDuplicates();
        loadArtistAlbums();
    }, 500));

    // ---------- Copertina manuale ----------
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
