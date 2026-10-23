// Chiamate dirette dal browser all'API Subsonic di Navidrome.
// Sostituisce app/script/apis.py: Navidrome accetta richieste da qualsiasi origine (CORS "*").
import { CONFIG } from "./config.js";
import { getSession, AuthError } from "./session.js";

const API_VERSION = "1.16.1";
const CLIENT = "coemify";

function toHex(text) {
    return Array.from(new TextEncoder().encode(text))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function authParams() {
    const session = getSession();
    if (!session) throw new AuthError("Sessione scaduta");
    return {
        u: session.navidrome.user,
        p: `enc:${toHex(session.navidrome.password)}`,
        v: API_VERSION,
        c: CLIENT,
    };
}

function buildUrl(endpoint, params = {}) {
    const url = new URL(`${CONFIG.NAVIDROME_URL}/rest/${endpoint}`);
    for (const [k, v] of Object.entries({ ...authParams(), ...params })) {
        url.searchParams.set(k, v);
    }
    return url;
}

async function call(endpoint, params = {}) {
    const response = await fetch(buildUrl(endpoint, { ...params, f: "json" }));
    if (!response.ok) throw new Error(`Navidrome ha risposto ${response.status}`);

    const data = (await response.json())["subsonic-response"];
    if (data?.status === "failed") {
        // 40 = credenziali errate, 41 = token non supportato, 50 = non autorizzato
        if ([40, 41, 50].includes(data.error?.code)) throw new AuthError(data.error.message);
        throw new Error(`Navidrome: ${data.error?.message || "errore sconosciuto"}`);
    }
    return data;
}

// ---------- Tendine ----------
export async function getArtists() {
    const data = await call("getArtists");
    return (data.artists?.index ?? [])
        .flatMap(index => index.artist ?? [])
        .map(a => ({ id: a.id, name: a.name }));
}

export async function getAlbumNames() {
    // getAlbumList2 restituisce al massimo 500 album per volta: si pagina finché servono
    const pageSize = 500;
    const names = [];
    for (let offset = 0; offset < 50 * pageSize; offset += pageSize) {
        const data = await call("getAlbumList2", { type: "alphabeticalByName", size: pageSize, offset });
        const page = data.albumList2?.album ?? [];
        names.push(...page.map(a => a.name));
        if (page.length < pageSize) break;
    }
    return [...new Set(names.filter(Boolean))];
}

export async function getGenres() {
    const data = await call("getGenres");
    return (data.genres?.genre ?? []).map(g => g.value).filter(Boolean);
}

// ---------- Duplicati ----------
// Tutti i titoli già presenti in Navidrome per questo artista (minuscoli)
export async function getArtistSongTitles(artist) {
    const name = artist.trim().toLowerCase();
    if (!name) return new Set();

    const pageSize = 500;
    const titles = new Set();
    for (let offset = 0; offset < 10 * pageSize; offset += pageSize) {
        const data = await call("search3", {
            query: artist.trim(), songCount: pageSize, songOffset: offset, albumCount: 0, artistCount: 0,
        });
        const page = data.searchResult3?.song ?? [];
        for (const s of page) {
            if ((s.artist || "").toLowerCase() === name) titles.add((s.title || "").trim().toLowerCase());
        }
        if (page.length < pageSize) break;
    }
    return titles;
}

// ---------- Album di un artista ----------
export async function getArtistAlbums(artistId) {
    const data = await call("getArtist", { id: artistId });
    return (data.artist?.album ?? []).map(a => ({
        id: a.id,
        name: a.name,
        year: a.year,
        genre: a.genre,
        cover: a.coverArt,
    }));
}

// ---------- Copertine ----------
export function coverUrl(coverId, size = 150) {
    if (!coverId) return "static/img/default.png";
    return buildUrl("getCoverArt", { id: coverId, size }).toString();
}

export async function fetchCoverBytes(coverId, size = 600) {
    const response = await fetch(coverUrl(coverId, size));
    if (!response.ok) throw new Error("Copertina non disponibile");
    return new Uint8Array(await response.arrayBuffer());
}
