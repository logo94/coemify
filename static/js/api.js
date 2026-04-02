import { showAlert, normalizeValue } from "./utils.js";

export async function apiRequest(url, params, raw_response=false) {

    const response = await fetch(url, params);

    if (!response.ok) {
        const error = await response.json();
        showAlert(`Errore: ${error.detail || "unknown"}`, 'danger');
        return;
    }

    if (raw_response) return response

    const data = await response.json();

    return data

}

async function loadArtists() {
    const artists = await apiRequest('/api/artists')
    const artistList = document.getElementById("artists");
    artistList.innerHTML = "";
    artists.forEach(artist => {
        const option = document.createElement("option");
        option.value = artist.name;
        option.dataset.id = artist.id
        artistList.appendChild(option);
    });
}

async function loadAlbums() {
    const albums = await apiRequest('/api/albums')
    const albumList = document.getElementById("albums");
    albumList.innerHTML = "";
    albums.forEach(album => {
        const val = normalizeValue(album);
        if (!val) return;
        const option = document.createElement("option");
        option.value = val;
        albumList.appendChild(option);
    });
}

async function loadGenres() {
    const genres = await apiRequest('/api/genres')
    const genreList = document.getElementById("genres");
    genreList.innerHTML = "";
    genres.forEach(genre => {
        const val = normalizeValue(genre);
        if (!val) return;
        const option = document.createElement("option");
        option.value = val;
        genreList.appendChild(option);
    });
}

export async function loadOptions() {
    await loadArtists();
    await loadAlbums();
    await loadGenres()
}

export async function checkDuplicates() {

    const artist = document.getElementById("artist").value.trim();
    if (!artist) return;

    const tracks = await apiRequest(
        `/api/search-duplicates?artist=${encodeURIComponent(artist)}`
    );

    const trackIndex = new Set(
        tracks.map(t => t.toLowerCase().trim())
    );

    const titleInputs = document.querySelectorAll(".title");

    titleInputs.forEach(input => {

        const currentTitle = input.value.toLowerCase().trim();

        // reset stato precedente
        input.classList.remove("is-duplicate");
        const existingMsg = input.closest(".track-item").querySelector(".duplicate-msg");
        if (existingMsg) existingMsg.remove();

        if (trackIndex.has(currentTitle)) {

            input.classList.add("is-duplicate");

            const badge = input.parentElement.querySelector(".duplicate-badge");
            if (badge) badge.style.display = "block";

        } else {

            input.classList.remove("is-duplicate");

            const badge = input.parentElement.querySelector(".duplicate-badge");
            if (badge) badge.style.display = "none";
        }

    });

}

function navidromeCoverUrl(coverId, size = 150) {
    if (!coverId) return "/static/img/default.png";
    return `/api/albums/cover/${coverId}?size=${size}`;
}

export async function loadArtistAlbums() {
    
    const sameArtistList = document.getElementById("sameArtistList");
    sameArtistList.innerHTML = "";

    const input = document.getElementById("artist");
    const list = document.getElementById("artists");

    const option = [...list.options]
        .find(o => o.value === input.value);

    if (option?.dataset.id) {

        const artistId = option.dataset.id
        const albums = await apiRequest(`/api/albums/artist/${encodeURIComponent(artistId)}`)

        if (albums.length < 1 ) {
            const noDuplicates = document.createElement("li");
            noDuplicates.className = "list-group-item text-center bg-transparent border-0";
            noDuplicates.textContent = "Nessun album trovato.";
            sameArtistList.appendChild(noDuplicates);
        } else {

            document.getElementById("album-badge").textContent = albums.length

            albums.forEach(d => {
                const li = document.createElement("li");
                li.className = "list-group-item bg-transparent border-0 border-bottom d-flex align-items-center";

                const img = document.createElement("img");
                img.src = navidromeCoverUrl(d.cover);
                img.className = "cover-thumb me-3";
                img.style.cursor = "pointer";

                // click sulla cover -> auto-riempie il form
                img.addEventListener("click", async () => {
                    document.getElementById("album").value = d.name || "";
                    document.getElementById("genre").value = d.genre || "";
                    document.getElementById("release_date").value = d.year || "";
                    document.getElementById("coverImg").src = img.src;

                    // Scarica l'immagine e creane un File fittizio
                    try {
                        const response = await fetch(img.src);
                        const blob = await response.blob();
                        const file = new File([blob], "cover.jpg", { type: blob.type });

                        // Inietta nel DataTransfer così coverFile.files[0] funziona
                        const dt = new DataTransfer();
                        dt.items.add(file);
                        document.getElementById("coverFile").files = dt.files;
                    } catch (e) {
                        console.warn("Impossibile precaricare la cover:", e);
                    }
                });

                // 2) info testo
                const info = document.createElement("div");
                info.innerHTML = `
                    <strong>${d.name}</strong><br>
                    ${d.year || "?"} | ${d.genre || "-"}
                `;

                li.appendChild(img);
                li.appendChild(info);
                sameArtistList.appendChild(li);

            });

        }

    } else {

        const noDuplicates = document.createElement("li");
        noDuplicates.className = "list-group-item text-center bg-transparent border-0";
        noDuplicates.textContent = "Nessun album trovato.";
        sameArtistList.appendChild(noDuplicates);

    }

}

