import paramiko

from app.script.settings import settings

def upload_sftp(files: list, errors:list):
    """
    files: lista di tuple (local_file, artist, title)
    """
    try:
        # Connessione al server SFTP
        transport = paramiko.Transport((settings.SFTP_HOST, int(settings.SFTP_PORT)))
        transport.connect(username=settings.SFTP_USER, password=settings.SFTP_PASS)
        sftp = paramiko.SFTPClient.from_transport(transport)

        for local_file, artist, title in files:
            remote_path = f"/music/{artist} - {title}.mp3"
            try:
                sftp.put(local_file, remote_path)
            except Exception as e:
                errors.append(f"Errore durante l'upload del file {local_file}: {str(e)}")

        sftp.close()
        transport.close()

    except Exception as e:
        errors.append(f"Errore durante l'upload SFTP: {str(e)}")
        
    return errors
