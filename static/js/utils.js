// Evita che titoli/artisti con caratteri HTML rompano la pagina
export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function showAlert(message, type) {
    const container = document.getElementById("alertContainer");
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = "alert";
    alertDiv.innerHTML = `
        ${escapeHtml(message)}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Chiudi" style="font-size: 0.75em; margin-top: 0.25em;"></button>
    `;
    container.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.classList.remove("show");
        setTimeout(() => alertDiv.remove(), 600);
    }, 10000);
}

export function getReleaseYear(releaseDate) {
    const match = String(releaseDate || "").match(/\d{4}/);
    return match ? match[0] : "";
}

export function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Nome file sicuro per SFTP: niente "/" (es. AC/DC) o caratteri vietati su Windows
export function safeFileName(text) {
    return String(text)
        .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/^[.\s]+/, "")
        .trim()
        .slice(0, 200);
}

export function setLoading(isLoading) {
    document.getElementById("uploadSpinner").style.display = isLoading ? "inline-block" : "none";
    const btn = document.getElementById("finalUpload");
    if (btn) btn.disabled = isLoading;
}
