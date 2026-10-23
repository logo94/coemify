// Autocompilazione e controlli sulla libreria Navidrome (ex api.js)
import { getArtists, getAlbumNames, getGenres, getArtistSongTitles, getArtistAlbums, coverUrl, fetchCoverBytes } from "./navidrome.js";
import { escapeHtml } from "./utils.js";
import { reportError } from "./errors.js";
import { setCover } from "./state.js";

function fillDatalist(id, values, withIds = false) {
    const list = document.getElementById(id);
    list.innerHTML = "";
    for (const item of values) {
        const option = document.createElement("option");
        option.value = withIds ? item.name : item;
        if (withIds) option.dataset.id = item.id;
        list.appendChild(option);
    }
}

export async function loadOptions() {
    try {
        const [artists, albums, genres] = await Promise.all([getArtists(), getAlbumNames(), getGenres()]);
        fillDatalist("artists", artists, true);
        fillDatalist("albums", albums);
        fillDatalist("genres", genres);
    } catch (error) {
        reportError(error, "Impossibile caricare artisti/album/generi");
    }
}

// ---------- Duplicati: badge rosso sui titoli già presenti per l'artista ----------
let knownTitles = { artist: null, titles: new Set() };

export function markDuplicates() {
    document.querySelectorAll(".track-title").forEach(input => {
        const isDup = knownTitles.titles.has(input.value.trim().toLowerCase());
        input.classList.toggle("is-duplicate", isDup);
        input.parentElement.querySelector(".duplicate-badge").style.display = isDup ? "block" : "none";
    });
}

export async function checkDuplicates() {
    const artist = document.getElementById("artist").value.trim();
    try {
        if (artist.toLowerCase() !== knownTitles.artist) {
            knownTitles = { artist: artist.toLowerCase(), titles: await getArtistSongTitles(artist) };
        }
    } catch (error) {
        reportError(error, "Controllo duplicati non riuscito");
    }
    markDuplicates();
}

// ---------- Album dell'artista (colonna destra) ----------
function emptyItem(text) {
    const li = document.createElement("li");
    li.className = "list-group-item text-center bg-transparent border-0";
    li.textContent = text;
    return li;
}

export async function loadArtistAlbums() {
    const list = document.getElementById("sameArtistList");
    const badge = document.getElementById("album-badge");
    const input = document.getElementById("artist");
    const option = [...document.getElementById("artists").options].find(o => o.value === input.value);

    list.innerHTML = "";
    badge.textContent = "";

    if (!option?.dataset.id) {
        list.appendChild(emptyItem("Nessun album trovato."));
        return;
    }

    try {
        const albums = await getArtistAlbums(option.dataset.id);
        if (albums.length === 0) {
            list.appendChild(emptyItem("Nessun album trovato."));
            return;
        }
        badge.textContent = albums.length;

        for (const album of albums) {
            const li = document.createElement("li");
            li.className = "list-group-item bg-transparent border-0 border-bottom d-flex align-items-center";

            const img = document.createElement("img");
            img.src = coverUrl(album.cover);
            img.className = "cover-thumb me-3";
            img.style.cursor = "pointer";
            img.title = "Usa questo album";
            img.onerror = () => { img.src = "static/img/default.png"; };

            // Click sulla copertina: compila album, anno, genere e usa la stessa copertina
            img.addEventListener("click", async () => {
                document.getElementById("album").value = album.name || "";
                document.getElementById("genre").value = album.genre || "";
                document.getElementById("release_date").value = album.year || "";
                if (album.cover) {
                    try {
                        setCover(await fetchCoverBytes(album.cover));
                    } catch (error) {
                        reportError(error, "Copertina non scaricata");
                    }
                }
            });

            const info = document.createElement("div");
            info.innerHTML = `<strong>${escapeHtml(album.name)}</strong><br>${escapeHtml(album.year || "?")} | ${escapeHtml(album.genre || "-")}`;

            li.append(img, info);
            list.appendChild(li);
        }
    } catch (error) {
        reportError(error, "Album dell'artista non caricati");
    }
}
