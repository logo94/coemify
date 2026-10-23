// Lettura e scrittura dei tag ID3 direttamente nel browser.
// Sostituisce app/script/metadata.py (mutagen).
// vendor/tags-vendor.js = music-metadata 11 + browser-id3-writer 6 (vedi README).
import { parseBlob, ID3Writer } from "./vendor/tags-vendor.js";

export async function readTags(file) {
    const meta = await parseBlob(file, { duration: true });
    const c = meta.common;
    const picture = c.picture?.[0];

    // In ID3v2.3 "/" separa più artisti: "AC/DC" verrebbe letto come "AC" + "DC".
    // Lo ricomponiamo, così il campo mostra il valore scritto nel file.
    const artist = meta.native["ID3v2.3"] && c.artists?.length > 1
        ? c.artists.join("/")
        : c.artist;

    return {
        title: c.title || "",
        artist: artist || "",
        album: c.album || "",
        genre: c.genre?.[0] || "",
        release_date: c.year ? String(c.year) : "",
        duration: meta.format.duration ? Math.round(meta.format.duration) : "",
        track_number: c.track?.no || null,
        picture: picture ? { data: picture.data, format: picture.format } : null,
    };
}

function parseYear(value) {
    const match = String(value || "").match(/\d{4}/);
    return match ? Number(match[0]) : null;
}

/**
 * Restituisce un nuovo Blob MP3 con i tag aggiornati.
 * Come la vecchia update_metadata: artista anche come album artist e compositore.
 * La copertina esistente viene mantenuta se non ne è stata scelta una nuova.
 */
export async function writeTags(file, data, coverBytes) {
    const writer = new ID3Writer(await file.arrayBuffer()); // rimuove il vecchio tag ID3v2

    if (data.title) writer.setFrame("TIT2", data.title);
    if (data.artist) {
        writer.setFrame("TPE1", [data.artist])
              .setFrame("TPE2", data.artist)
              .setFrame("TCOM", [data.artist])
              .setFrame("TXXX", { description: "ALBUMARTIST", value: data.artist });
    }
    if (data.album) writer.setFrame("TALB", data.album);
    if (data.genre) writer.setFrame("TCON", [data.genre]);

    const year = parseYear(data.release_date);
    if (year) writer.setFrame("TYER", year);

    const track = parseInt(data.track_number, 10);
    if (track > 0) writer.setFrame("TRCK", String(track));

    if (coverBytes) {
        writer.setFrame("APIC", {
            type: 3,            // copertina frontale
            data: coverBytes,
            description: "Cover",
        });
    }

    writer.addTag();
    return writer.getBlob();
}
