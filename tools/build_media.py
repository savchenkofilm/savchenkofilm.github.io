#!/usr/bin/env python3
"""Делает обложки, лупы и сжатые полные видео из works.json и пишет works.js.

Запуск: python3 tools/build_media.py [--force]
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media"
LOOP_SEC = 4
FORCE = "--force" in sys.argv


def probe(src):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
         "-of", "json", str(src)],
        capture_output=True, text=True, check=True).stdout
    info = json.loads(out)
    st = info["streams"][0]
    w, h = st["width"], st["height"]
    rot = next((abs(int(d.get("rotation", 0))) for d in st.get("side_data_list", [])), 0)
    if rot in (90, 270):
        w, h = h, w
    return w, h, float(info["format"]["duration"])


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def even_scale(w, h, long_side):
    """Фильтр scale, вписывающий кадр в long_side по длинной стороне."""
    if max(w, h) <= long_side:
        return "scale=trunc(iw/2)*2:trunc(ih/2)*2"
    return f"scale='if(gt(iw,ih),{long_side},-2)':'if(gt(iw,ih),-2,{long_side})'"


def build(work):
    wid = work["id"]
    src = (ROOT / work["src"]).resolve()
    w, h, dur = probe(src)
    full, poster, loop = MEDIA / f"{wid}.mp4", MEDIA / f"{wid}.jpg", MEDIA / f"{wid}_loop.mp4"
    # Ручные настройки в works.json: poster_file, poster_at, loop_at, loop_len (секунды).
    loop_len = work.get("loop_len", LOOP_SEC)
    start = max(0.0, min(dur * 0.3, dur - loop_len))
    loop_at = work.get("loop_at", start)
    poster_at = work.get("poster_at", start)

    # Работа с внешней ссылкой (Vimeo и т.п.) играет там, свой mp4 не нужен.
    if "url" not in work and (FORCE or not full.exists()):
        print(f"  {wid}: полное видео")
        ffmpeg("-i", str(src), "-vf", even_scale(w, h, 1920) + ",format=yuv420p",
               "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-maxrate", "4M", "-bufsize", "8M",
               "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(full))
    if FORCE or not poster.exists():
        print(f"  {wid}: обложка")
        if "poster_file" in work:
            ffmpeg("-i", str((ROOT / work["poster_file"]).resolve()), "-frames:v", "1",
                   "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
                   + even_scale(w, h, 1280), "-q:v", "4", str(poster))
        else:
            ffmpeg("-ss", f"{poster_at:.2f}", "-i", str(src), "-frames:v", "1",
                   "-vf", even_scale(w, h, 1280), "-q:v", "4", str(poster))
    if FORCE or not loop.exists():
        print(f"  {wid}: луп")
        ffmpeg("-ss", f"{loop_at:.2f}", "-t", str(loop_len), "-i", str(src), "-an",
               "-vf", even_scale(w, h, 960) + ",format=yuv420p",
               "-c:v", "libx264", "-preset", "slow", "-crf", "28",
               "-movflags", "+faststart", str(loop))

    build_only = ("src", "poster_file", "poster_at", "loop_at", "loop_len")
    out = {**{k: v for k, v in work.items() if k not in build_only},
           "w": w, "h": h, "poster": f"media/{wid}.jpg", "loop": f"media/{wid}_loop.mp4"}
    if "url" not in work:
        out["video"] = f"media/{wid}.mp4"
    return out


def main():
    MEDIA.mkdir(exist_ok=True)
    works = json.loads((ROOT / "works.json").read_text())
    out = []
    for work in works:
        if "src" in work:
            if not (ROOT / work["src"]).exists():
                print(f"  пропуск {work['id']}: нет файла {work['src']}")
                continue
            out.append(build(work))
        else:
            # Работа только по ссылке: размеры и обложка задаются вручную.
            out.append({"w": 16, "h": 9, **work})
    (ROOT / "works.js").write_text(
        "window.WORKS = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    print(f"works.js: {len(out)} работ")
    bust_cache()


def bust_cache():
    """Ставит ?v=<хэш> на works.js, app.js, style.css в index.html, чтобы браузер не держал старые."""
    index = ROOT / "index.html"
    html = index.read_text()
    for name in ("works.js", "app.js", "style.css"):
        digest = hashlib.md5((ROOT / name).read_bytes()).hexdigest()[:8]
        html = re.sub(rf'{re.escape(name)}(\?v=\w+)?"', f'{name}?v={digest}"', html)
    index.write_text(html)


if __name__ == "__main__":
    main()
