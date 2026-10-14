#!/usr/bin/env python3
"""Resumable private sermon audio transcription with source provenance."""

import argparse
import datetime as dt
import hashlib
import json
import os
import time
import fcntl
import sys
from pathlib import Path




MODEL = "/Volumes/MPLUS-DATA/mplus-ai/models/whisper-large-v3-turbo"


def write_json(path, value):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def srt_time(seconds):
    total = max(0, round(float(seconds) * 1000))
    hours, total = divmod(total, 3600000)
    minutes, total = divmod(total, 60000)
    seconds, ms = divmod(total, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{ms:03}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("item_dir", type=Path)
    parser.add_argument("--lock-fd",type=int)
    args = parser.parse_args()
    os.umask(0o077)
    sys.path.insert(0,'/Volumes/MPLUS-DATA/mplus-ai/tools/sermon-preparation')
    
    lock_path=Path('/Volumes/MPLUS-DATA/mplus-private/sermon-workspace/transcriber.lock')
    guard=os.fdopen(os.dup(args.lock_fd),'a') if args.lock_fd is not None else lock_path.open('a')
    if args.lock_fd is not None and os.fstat(guard.fileno()).st_ino!=lock_path.stat().st_ino:raise RuntimeError('Invalid shared transcriber lease')
    fcntl.flock(guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
    os.environ['PATH']=str(Path.home()/'.local/bin')+os.pathsep+os.environ.get('PATH','')
    import mlx_whisper
    folder = args.item_dir.resolve()
    meta = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if meta["speaker_evidence_type"] not in ("official_episode_speaker_field", "explicit_episode_title_speaker"):
        raise ValueError("Speaker attribution needs episode-level evidence")
    audio = folder / meta["audio_file"]
    if sha256(audio) != meta["audio_sha256"]:
        raise ValueError("Audio fingerprint changed")
    duration = int(meta["duration_seconds"])
    if duration <= 0 or duration > 4 * 3600:
        raise ValueError("Unreasonable duration")
    parts = folder / "parts"
    parts.mkdir(mode=0o700, exist_ok=True)
    signature = {"video_id": meta["video_id"], "audio_sha256": meta["audio_sha256"],
                 "model": MODEL, "language": meta["language"], "duration_seconds": duration,
                 "chunk_seconds": 300, "word_timestamps": True}
    config = folder / "transcription-config.json"
    if config.exists() and json.loads(config.read_text(encoding="utf-8")) != signature:
        raise ValueError("Existing checkpoints belong to a different run")
    if not config.exists():
        write_json(config, signature)
    segments = []
    started = time.monotonic()
    for begin in range(0, duration, 300):
        end = min(begin + 300, duration)
        part = parts / f"part-{begin:04d}-{end:04d}.json"
        if part.exists():
            result = json.loads(part.read_text(encoding="utf-8"))
        else:
            result = mlx_whisper.transcribe(
                str(audio), path_or_hf_repo=MODEL, language=meta["language"],
                verbose=None, word_timestamps=True, temperature=0,
                condition_on_previous_text=False, clip_timestamps=f"{begin},{end}",
                initial_prompt=f"講員：{meta['speaker']}。講題：{meta['title']}。"
            )
            write_json(part, result)
        segments.extend(result["segments"])
        write_json(folder/'progress.json',{'message':f'本機轉錄至 {end//60} 分鐘；已完成段落保留','completed_through':end,'segments':len(segments)})
        print(json.dumps({"video_id": meta["video_id"], "completed_through": end,
                          "segments": len(segments), "elapsed_seconds": round(time.monotonic() - started, 1)}), flush=True)
    transcript = {"video_id": meta["video_id"], "speaker": meta["speaker"],
                  "title": meta["title"], "source_url": meta["source_url"],
                  "speaker_evidence_url": meta["speaker_evidence_url"],
                  "model": MODEL, "segments": segments, "human_reviewed": False,
                  "generated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    write_json(folder / "transcript.raw.json", transcript)
    rows = []
    text_rows = []
    for index, segment in enumerate(segments, 1):
        line = segment["text"].strip()
        if not line:
            continue
        rows.extend([str(index), f"{srt_time(segment['start'])} --> {srt_time(segment['end'])}", line, ""])
        text_rows.append(f"[{srt_time(segment['start']).split(',')[0]}] {line}")
    (folder / "transcript.raw.srt").write_text("\n".join(rows), encoding="utf-8")
    header = [f"講題：{meta['title']}", f"講員（來源頁標示）：{meta['speaker']}",
              f"影片：{meta['source_url']}", f"講員歸屬依據：{meta['speaker_evidence_url']}",
              "狀態：大型模型辨識草稿；尚未人工聽寫校對，不可作為逐字引文。", ""]
    (folder / "transcript.timestamped.txt").write_text("\n".join(header + text_rows) + "\n", encoding="utf-8")
    write_json(folder / "archive-status.json", {
        "video_id": meta["video_id"], "status": "transcribed_needs_human_review",
        "segment_count": len(segments), "source_audio_sha256": meta["audio_sha256"],
        "transcript_sha256": sha256(folder / "transcript.raw.json"),
        "audio_retention": "temporary_until_text_review_and_verified_backup"
    })

    guard.close()


if __name__ == "__main__":
    main()
