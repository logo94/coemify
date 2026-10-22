// Stato del brano in lavorazione
export const state = {
    file: null,   // File MP3 originale scelto dall'utente
    cover: null,  // Uint8Array della copertina da incorporare (originale o nuova)
};

export function setCover(bytes, previewSrc) {
    state.cover = bytes;
    const img = document.getElementById("coverImg");
    if (previewSrc) {
        img.src = previewSrc;
    } else if (bytes) {
        img.src = URL.createObjectURL(new Blob([bytes]));
    } else {
        img.src = "static/img/default.png";
    }
}
