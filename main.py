# main.py

# Default
import os
from pathlib import Path
import uuid
import time
import json
from typing import List

# FastAPI
from fastapi import FastAPI, Response, Request, File, UploadFile, HTTPException, Form
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool

# Slowapi
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Utils
from app.script.settings import settings
from app.script.ssh_utils import upload_sftp
from app.script.metadata import extract_metadata, update_metadata
from app.script.apis import check_duplicates_navidrome, get_navidrome_artist, get_navidrome_albums, get_albums_by_artist, get_navidrome_image, get_navidrome_genres

# ------------------------------
# FastAPI + Middleware
# ------------------------------
app = FastAPI(title=settings.APP_NAME)

# Session cookie
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    session_cookie=settings.SESSION_COOKIE_NAME,
    max_age=settings.SESSION_MAX_AGE,
    same_site=settings.SESSION_SAMESITE,
    https_only=settings.SESSION_HTTPS_ONLY,
)

# Trusted host
if hasattr(settings, "HOST"):
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[settings.HOST],
    )

# Middleware per protezione dashboard
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        protected_paths = ["/dashboard", "/search-duplicates", "/upload-temp", "/upload-final", "/api/upload-temp-batch", "/api/upload-final-batch"]
        if any(request.url.path.startswith(p) for p in protected_paths):
            cookie = request.cookies.get(settings.SESSION_COOKIE_NAME)
            if cookie != "logged_in":
                return RedirectResponse(url='/login', status_code=303)
        response = await call_next(request)
        return response

app.add_middleware(AuthMiddleware)

# ------------------------------
# Rate Limiting
# ------------------------------
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return PlainTextResponse("Too many requests", status_code=429)

# ------------------------------
# Templates e static
# ------------------------------
templates = Jinja2Templates(directory="app/templates")
app_dir = os.path.dirname(__file__)
static_dir = os.path.join(app_dir, "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# ------------------------------
# Upload config
# ------------------------------
UPLOAD_DIR = Path(settings.UPLOAD_DIR).resolve()
MAX_SIZE = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

# ------------------------------
# Login endpoints
# ------------------------------
@app.get("/login")
def login_get(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "app_name": settings.APP_NAME})

@app.post("/login")
@limiter.limit(settings.LOGIN_RATE_LIMIT or "5/minute")
def login_post(request: Request, response: Response, username: str = Form(...), password: str = Form(...)):
    if username != settings.APP_USER or password != settings.APP_PASS:
        raise HTTPException(status_code=401, detail="Credenziali errate")

    response = RedirectResponse(url='/dashboard', status_code=303)
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value="logged_in",
        httponly=True,
        samesite=settings.SESSION_SAMESITE,
        secure=settings.SESSION_HTTPS_ONLY,
        max_age=settings.SESSION_MAX_AGE,
    )
    return response

# ------------------------------
# Dashboard
# ------------------------------
@app.get("/")
async def root():
    return RedirectResponse(url="/dashboard")

@app.get("/dashboard")
def dashboard(request: Request):
    # Il middleware garantisce che il cookie sia valido
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "app_name": settings.APP_NAME}
    )

# ------------------------------
# API Navidrome
# ------------------------------

# Ricerca duplicati
@app.get("/api/search-duplicates")
async def search_duplicates(artist: str):
    """Ricerca duplicati per titolo e artista"""
    duplicates = check_duplicates_navidrome(artist)
    return duplicates

# Artisti
@app.get("/api/artists")
async def get_all_artists():
    """Ottiene tutti gli artisti caricati su Navidrome"""
    artists = get_navidrome_artist()
    return artists

# Albums
@app.get("/api/albums")
async def get_albums():
    """Ottiene gli album per un artista specifico"""
    albums = get_navidrome_albums()
    return albums

# Generi
@app.get("/api/genres")
async def get_albums():
    """Ottiene tutti i generi"""
    albums = get_navidrome_genres()
    return albums

# Meta albums per autocompilazione
@app.get("/api/albums/artist/{artist_id}")
async def get_albums(artist_id: str):
    """Ottiene gli album per un artista specifico"""
    albums = get_albums_by_artist(artist_id)
    print(albums)
    return albums

# Immagine cover album
@app.get("/api/albums/cover/{cover_id}")
def navidrome_cover(cover_id: str, size: int = 250):
    r = get_navidrome_image(cover_id, size)
    return Response(
        content=r.content,
        media_type=r.headers.get("Content-Type", "image/jpeg")
    )


# ------------------------------
# Batch Upload (Multi-file Album)
# ------------------------------
@app.post("/api/upload-temp")
async def upload_temp_batch(files: List[UploadFile] = File(...)):
    """
    Upload multiple MP3 files temporarily and extract metadata from each.
    Returns shared metadata (from first file) and individual track info.
    """
    if not files:
        raise HTTPException(400, "Nessun file caricato")

    tracks = []
    shared_metadata = None
    errors = []

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    for i, file in enumerate(files):
        
        try:
            # Check MIME type (solo MP3)
            if file.content_type != "audio/mpeg":
                errors.append(file.filename + ": tipologia di file non valida")
                continue

            # Check estensione (solo .mp3)
            ext = Path(file.filename).suffix.lower()
            if ext != ".mp3":
                errors.append(file.filename + ": estensione non valida")
                continue

            filename = f"{uuid.uuid4()}_{Path(file.filename).name}"
            temp_path = UPLOAD_DIR / filename

            contents = await file.read()
            if len(contents) > MAX_SIZE:
                errors.append(file.filename + ": file troppo grande")
                continue

            try:
                temp_path.write_bytes(contents)
            except Exception as e:
                errors.append(file.filename + ": errore durante il salvataggio - " + str(e))
                continue
                
            if not temp_path.is_file():
                errors.append(file.filename + ": file non salvato correttamente")
                continue

            metadata = extract_metadata(temp_path)

            # Use first file's metadata as shared defaults
            if i == 0:
                shared_metadata = {
                    "album": metadata.get("album", ""),
                    "artist": metadata.get("artist", ""),
                    "genre": metadata.get("genre", ""),
                    "release_date": metadata.get("release_date", ""),
                    "cover": metadata.get("cover", None)
                }

            # Track-specific data
            tracks.append({
                "temp_file": filename,
                "title": metadata.get("title", Path(file.filename).stem),
                "duration": metadata.get("duration", ""),
                "track_number": metadata.get("track_number"),
                "original_filename": file.filename
            })
            
        except Exception as e:
            errors.append(file.filename + ": errore sconosciuto - " + str(e))
            continue

    return {
        "album": shared_metadata,
        "tracks": tracks,
        "errors": errors
    }


@app.post("/api/upload-final")
async def upload_final_batch(
    artist: str = Form(...),
    album: str = Form(...),
    genre: str = Form(...),
    release_date: str = Form(...),
    tracks: str = Form(...),  # JSON: [{temp_file, title, duration}, ...]
    cover: UploadFile = File(None)
):
    """
    Upload multiple tracks with shared album metadata.
    Each track keeps its own title and duration.
    """
    # Parse tracks JSON
    try:
        tracks_data = json.loads(tracks)
    except json.JSONDecodeError:
        raise HTTPException(400, "Formato tracce non valido")

    if not tracks_data:
        raise HTTPException(400, "Nessuna traccia da caricare")

    # Read cover data once if provided
    try:
        cover_data = await cover.read() if cover else None
    except Exception:
        raise HTTPException(400, "Errore durante la lettura della copertina")

    errors = []
    ready_files = []

    for track in tracks_data:
        
        try:
        
            temp_file = track.get("temp_file")
            title = track.get("title")
            duration = track.get("duration", "")
            track_number = track.get("track_number")

            if not temp_file or not title:
                errors.append(f"Traccia con dati mancanti: {track}")
                continue

            # Verify temp file exists and is valid
            filepath = (UPLOAD_DIR / temp_file).resolve()

            if not str(filepath).startswith(str(UPLOAD_DIR.resolve())):
                errors.append(f"Percorso file non valido: {temp_file}")
                continue

            if not filepath.is_file():
                errors.append(f"File non trovato: {temp_file}")
                continue

            # Update metadata with shared + individual data
            await run_in_threadpool(
                update_metadata,
                filepath,
                {
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "genre": genre,
                    "duration": duration,
                    "release_date": release_date,
                    "track_number": track_number
                },
                cover_data
            )

            # Upload to SFTP
            ready_files.append((filepath, artist, title))

        except Exception as e:
            errors.append(f"Errore upload '{title}': {str(e)}")
            
    # Upload files to SFTP in threadpool
    errors = upload_sftp(ready_files, errors)

    # Cleanup old temp files
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and time.time() - f.stat().st_mtime > 600:
            try:
                f.unlink()
            except Exception as e:
                print(f"Errore cancellando {f}: {e}")

    if errors:
        return JSONResponse({
            "message": f"Upload completato con {len(errors)} errori",
            "errors": errors
        }, status_code=207)

    return JSONResponse({"message": f"Album '{album}' caricato con successo! ({len(tracks_data)} tracce)"})