# Default
from typing import Literal

# FastAPI
from fastapi import HTTPException

# Requirements
import requests

# .env
from app.script.settings import settings

# ------------------------
# Navidrome API
# ------------------------

# Helper
API_PARAMS = {
    "u": settings.NAVIDROME_USER,
    "p": settings.NAVIDROME_PASS,
    "v": "1.16.1",
    "c": "autocomplete",
    "f": "json",
}

def navidrome_request(scope: Literal["getArtists", "getAlbumList2", "getGenres", "search3"], params: dict) -> dict:
    r = requests.get(
        f"{settings.NAVIDROME_URL}/rest/{scope}",
        params=params,
        timeout=5
    )
    r.raise_for_status()
    data = r.json()
    
    if "subsonic-response" in data and data["subsonic-response"].get("status") == "failed":
        return HTTPException(status_code=404, detail=f"Navidrome error: {data['subsonic-response']['error']['message']}")
    
    return data

### TENDINE
def get_navidrome_artist():
    params = API_PARAMS.copy()
    params['type'] = "alphabeticalByName"
    params['size'] = "500"
    data = navidrome_request(scope="getArtists", params=params)
    
    
    index = [artist for artist in data['subsonic-response']['artists']['index']]
    artist_objs = [artista['artist'] for artista in index]
    
    artist_list = []
    
    for array in artist_objs:
        for element in array:
            obj = {}
            obj['id'] = element['id']
            obj['name'] = element['name']
            artist_list.append(obj)
        
    return artist_list


def get_navidrome_albums():
    params = API_PARAMS.copy()
    params['type'] = "alphabeticalByName"
    params['size'] = "500"
    data = navidrome_request(scope="getAlbumList2", params=params)
    albums = [album['name'] for album in data['subsonic-response']['albumList2']['album']]
    return albums

def get_navidrome_genres():
    params = API_PARAMS.copy()
    data = navidrome_request(scope="getGenres", params=params)
    genres = [genre['value'] for genre in data['subsonic-response']['genres']['genre']]
    return genres


### DUPLICATI
def check_duplicates_navidrome(artist: str):
    
    params = API_PARAMS.copy()
    params.update({
        "c": "dup-check",
        "query": artist,
    })
    
    data = navidrome_request(scope="search3", params=params)
    search_result = data.get("subsonic-response", {}).get("searchResult3", {})
    
    tracks = []

    for s in search_result.get("song", []):
        if s.get("artist", "").lower() == artist.lower():
            tracks.append(s.get("title"))

    return tracks

### INFORMAZIONI ALBUM
def get_albums_by_artist(artist_id: str):
    params = API_PARAMS.copy()
    params.update({
        "id": artist_id
    })
    data = navidrome_request(scope="getArtist", params=params)

    albums = data["subsonic-response"]["artist"]["album"]

    return [
        {
            "id": a["id"],            
            "name": a["name"],
            "year": a.get("year"),
            "genre": a.get("genre"),
            "cover": a.get("coverArt"),
        }
        for a in albums
    ]

def get_navidrome_image(cover_id: str, size: int = 250) -> bytes:
    try:
        r = requests.get(
            f"{settings.NAVIDROME_URL}/rest/getCoverArt",
            params={
                "u": settings.NAVIDROME_USER,
                "p": settings.NAVIDROME_PASS,
                "v": "1.16.1",
                "c": "cover-proxy",
                "id": cover_id,
                "size": size
            },
            timeout=5
        )
        r.raise_for_status()
        return r
    except Exception:
        return b""