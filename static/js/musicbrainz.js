// Ricerca metadati su MusicBrainz + copertina da Cover Art Archive (invariata nella logica)
import { escapeHtml, getReleaseYear, showAlert } from "./utils.js";
import { setCover } from "./state.js";

function quote(text) {
    return `"${text.replaceAll('"', '\\"')}"`;
}

export async function searchMetadata() {
    const title = document.getElementById("title").value.trim();
    const artist = document.getElementById("artist").value.trim();
    if (!title || !artist) return showAlert("Titolo e artista obbligatori", "warning");

    const query = `recording:${quote(title)} AND artist:${quote(artist)}`;
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=25`;

    let data;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(response.status);
        data = await response.json();
    } catch (error) {
        console.error(error);
        return showAlert("Ricerca non riuscita, riprovare finché non va", "warning");
    }

    if (!data.recordings?.length) return showAlert("Nessun metadato trovato", "warning");

    const candidatesDiv = document.getElementById("metadataCandidates");
    candidatesDiv.innerHTML = "";
    const modal = new bootstrap.Modal(document.getElementById("metadataModal"));

    data.recordings.forEach(rec => {
        const release = rec.releases?.[0];
        const thumb = release?.id
            ? `https://coverartarchive.org/release/${release.id}/front-250`
            : "static/img/default.png";

        const card = document.createElement("div");
        card.className = "candidate-card d-flex align-items-center p-2 mb-2";
        card.innerHTML = `
            <img src="${thumb}" class="cover-img" onerror="this.src='static/img/default.png'" />
            <div class="candidate-info ms-3">
                <h6 class="mb-1">${escapeHtml(rec.title)}</h6>
                <p class="mb-0"><strong>Artista:</strong> ${escapeHtml(rec["artist-credit"]?.[0]?.name || "-")}</p>
                <p class="mb-0"><strong>Album:</strong> ${escapeHtml(release?.title || "-")}</p>
                <p class="mb-0"><strong>Genere:</strong> ${escapeHtml(rec.tags?.[0]?.name || "-")}</p>
                <p class="mb-0"><strong>Anno:</strong> ${escapeHtml(getReleaseYear(release?.date) || "-")}</p>
            </div>
            <button type="button" class="btn btn-sm btn-primary ms-auto">Seleziona</button>
        `;

        card.querySelector("button").addEventListener("click", async () => {
            document.getElementById("album").value = release?.title || "";
            document.getElementById("genre").value = rec.tags?.[0]?.name || "";
            document.getElementById("release_date").value = getReleaseYear(release?.date);

            if (release?.id) {
                try {
                    const res = await fetch(`https://coverartarchive.org/release/${release.id}/front-500`);
                    if (!res.ok) throw new Error(res.status);
                    setCover(new Uint8Array(await res.arrayBuffer()));
                } catch {
                    showAlert("Copertina non disponibile su Cover Art Archive", "warning");
                }
            }
            modal.hide();
        });

        candidatesDiv.appendChild(card);
    });

    modal.show();
}
