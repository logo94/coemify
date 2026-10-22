import { AuthError, logout } from "./session.js";
import { showAlert } from "./utils.js";

let onSessionExpired = () => {};

export function setSessionExpiredHandler(fn) {
    onSessionExpired = fn;
}

// Gestione errori unica: se la sessione non è più valida si torna al login
export function reportError(error, prefix = "Errore") {
    console.error(error);
    if (error instanceof AuthError) {
        logout();
        showAlert("Sessione scaduta: inserisci di nuovo la password.", "warning");
        onSessionExpired();
        return;
    }
    showAlert(`${prefix}: ${error.message || error}`, "danger");
}
