// Stato dell'album in lavorazione
export const state = {
    tracks: [],   // [{ id, file, title, trackNumber, duration }]
    cover: null,  // Uint8Array della copertina da incorporare in tutti i brani
};

export function setCover(bytes) {
    state.cover = bytes;
    document.getElementById("coverImg").src = bytes
        ? URL.createObjectURL(new Blob([bytes]))
        : "static/img/default.png";
}
