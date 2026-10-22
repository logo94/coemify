// ------------------------------------------------------------
// Configurazione di Coemify
// Questi valori NON sono segreti: sono solo indirizzi.
// Le password stanno tutte dentro n8n.
// ------------------------------------------------------------
export const CONFIG = {
    // Indirizzo del webhook n8n (Production URL del nodo "Webhook")
    N8N_WEBHOOK_URL: "https://coemify-uploader.pikapod.net/webhook/coemify",

    // Indirizzo del pod Navidrome (senza / finale)
    NAVIDROME_URL: "https://coemify.pikapod.net",

    // Dimensione massima del file da caricare.
    // n8n accetta di default richieste fino a 16 MB (N8N_PAYLOAD_SIZE_MAX).
    MAX_UPLOAD_MB: 16,
};
