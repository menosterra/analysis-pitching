# -*- coding: utf-8 -*-
"""
FastAPI Server for App_pitching
Provides 2D Side-View Pitching Analysis API, Elite Comparison, and Static Web Dashboard.
"""

import os
import sys
import shutil
import json
import uuid
import time
import asyncio
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from engine.pose_analyzer import PitchPoseAnalyzer
from engine.mechanics_calculator import PitchMechanicsCalculator
from engine.comparison_engine import PitchComparisonEngine

UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
CACHE_DIR = os.path.join(BASE_DIR, "data", "cache")
SAMPLE_DIR = os.path.join(BASE_DIR, "static", "sample_videos")
STATIC_UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(SAMPLE_DIR, exist_ok=True)
os.makedirs(STATIC_UPLOAD_DIR, exist_ok=True)

def cleanup_expired_files(max_age_seconds: int = 1800):
    """
    Deletes temporary upload and cache files older than max_age_seconds (default 30 mins).
    Ensures zero disk accumulation on free cloud hosting instances.
    """
    now = time.time()
    target_dirs = [UPLOAD_DIR, STATIC_UPLOAD_DIR, CACHE_DIR]
    deleted_count = 0

    for d in target_dirs:
        if not os.path.exists(d):
            continue
        for fname in os.listdir(d):
            if fname.startswith(".") or fname == ".gitkeep":
                continue
            fpath = os.path.join(d, fname)
            try:
                if os.path.isfile(fpath):
                    if (now - os.path.getmtime(fpath)) > max_age_seconds:
                        os.remove(fpath)
                        deleted_count += 1
            except Exception as e:
                print(f"[Cleanup Warning] Could not remove {fpath}: {e}")

    if deleted_count > 0:
        print(f"[Auto-Cleanup] Removed {deleted_count} expired temporary files.")

async def periodic_cleanup_task():
    """Background loop that runs cleanup every 10 minutes."""
    while True:
        try:
            cleanup_expired_files(max_age_seconds=1800)
        except Exception as e:
            print(f"[Cleanup Loop Error] {e}")
        await asyncio.sleep(600)  # Check every 10 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initial cleanup and start background task
    cleanup_expired_files(max_age_seconds=1800)
    task = asyncio.create_task(periodic_cleanup_task())
    yield
    # Shutdown
    task.cancel()

app = FastAPI(
    title="App_pitching - 2D Side View Pitching Mechanics & Coaching Engine",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize engines
pose_analyzer = PitchPoseAnalyzer()
comparison_engine = PitchComparisonEngine()

# Mount static files
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(BASE_DIR, "static", "index.html")
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return HTMLResponse(
            content=content,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    return "<h1>App_pitching</h1><p>index.html not found</p>"

@app.get("/api/sample-videos")
async def list_sample_videos():
    """Lists available sample pitching videos."""
    samples = [
        {
            "id": "sample_1",
            "name": "성인 스리쿼터 투구 (Side-View Trial 1)",
            "filename": "sample_pitch_1.mp4",
            "video_url": "/static/sample_videos/sample_pitch_1.mp4",
            "default_height_cm": 178.0,
            "default_distance_m": 6.5,
            "throws": "R",
            "desc": "3루측 6.5m 거리에서 촬영된 우완 스리쿼터 투구 영상"
        },
        {
            "id": "sample_2",
            "name": "성인 스리쿼터 투구 (Side-View Trial 2)",
            "filename": "sample_pitch_2.mp4",
            "video_url": "/static/sample_videos/sample_pitch_2.mp4",
            "default_height_cm": 178.0,
            "default_distance_m": 6.5,
            "throws": "R",
            "desc": "3루측 측면 클립 (높은 릴리즈 익스텐션)"
        },
        {
            "id": "sample_3",
            "name": "야외 마운드 투구 (Side-View Field Clip)",
            "filename": "sample_pitch_3.mp4",
            "video_url": "/static/sample_videos/sample_pitch_3.mp4",
            "default_height_cm": 182.0,
            "default_distance_m": 7.0,
            "throws": "R",
            "desc": "야외 구장에서 측정된 실전 3루 측면 투구 영상"
        }
    ]
    return JSONResponse(content={"samples": samples})

@app.post("/api/analyze")
async def analyze_pitch(
    video: Optional[UploadFile] = File(None),
    sample_id: Optional[str] = Form(None),
    pitcher_height_cm: float = Form(178.0),
    camera_distance_m: float = Form(6.5),
    throws: str = Form("R")
):
    """
    Analyzes pitching video, performs 2D scale calibration,
    computes mechanics and speed, and generates elite comparison.
    """
    if not video or not video.filename:
        raise HTTPException(status_code=400, detail="분석할 투구 동영상 파일을 업로드해주세요.")

    # Save uploaded file
    ext = os.path.splitext(video.filename)[1] or ".mp4"
    unique_name = f"upload_{uuid.uuid4().hex[:8]}{ext}"
    target_video_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(target_video_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
    
    # Also copy to static uploads for web player
    static_upload_dir = os.path.join(BASE_DIR, "static", "uploads")
    os.makedirs(static_upload_dir, exist_ok=True)
    shutil.copy2(target_video_path, os.path.join(static_upload_dir, unique_name))
    target_video_url = f"/static/uploads/{unique_name}"

    if not os.path.exists(target_video_path):
        raise HTTPException(status_code=404, detail="업로드된 동영상 파일을 찾을 수 없습니다.")

    # Check cache based on video file modified time & parameters
    cache_key = f"{os.path.basename(target_video_path)}_{pitcher_height_cm}_{camera_distance_m}_{throws}"
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")

    if os.path.exists(cache_file):
        with open(cache_file, 'r', encoding='utf-8') as cf:
            cached_res = json.load(cf)
            cached_res["video_url"] = target_video_url
            return JSONResponse(content=cached_res)

    try:
        height_m = float(pitcher_height_cm) / 100.0
        
        # 1. Pose Extraction
        raw_frames, fps, width, height, total_frames = pose_analyzer.extract_video_landmarks(target_video_path)
        
        # 2. Scale Calibration & PCHIP Interpolation (120 fps)
        interpolated_frames, dense_times, scale_m_per_px = pose_analyzer.calibrate_and_interpolate(
            raw_frames=raw_frames,
            fps=fps,
            pitcher_height_m=height_m,
            camera_dist_m=camera_distance_m,
            throws=throws,
            target_fps=120.0
        )

        # 3. Detect Pitching Events (PKH, FP, MER, BR, FT)
        events, wrist_speed_profile = pose_analyzer.detect_pitch_events(interpolated_frames, dense_times, throws=throws)

        # 4. Compute Full Pitch Mechanics & Biomechanical Speed
        mechanics_calc = PitchMechanicsCalculator(pitcher_height_m=height_m, throws=throws)
        pitch_analysis = mechanics_calc.analyze_full_pitch(interpolated_frames, events, fps=120.0)

        # 5. Compare with OBP Elite Three-Quarter Dataset & Generate Feedback
        comparison_res = comparison_engine.compare_mechanics(pitch_analysis, events, interpolated_frames)

        # Format compact response
        response_payload = {
            "success": True,
            "video_info": {
                "video_url": target_video_url,
                "fps": round(float(fps), 2),
                "width": width,
                "height": height,
                "total_frames": total_frames,
                "duration_sec": round(float(total_frames / fps), 3)
            },
            "parameters": {
                "pitcher_height_cm": pitcher_height_cm,
                "camera_distance_m": camera_distance_m,
                "throws": throws,
                "scale_m_per_px": round(scale_m_per_px, 6)
            },
            "events": events,
            "pitch_analysis": pitch_analysis,
            "comparison": comparison_res,
            "frames_2d": [
                {
                    "t": f["time"],
                    "frame_idx": f["frame_idx"],
                    "joints_px": f["joints_px"],
                    "joints_m": f["joints_m"]
                }
                for f in interpolated_frames[::2] # Downsample by 2 for lightweight web transmission (60fps stream)
            ]
        }

        # Cache result
        with open(cache_file, 'w', encoding='utf-8') as cf:
            json.dump(response_payload, cf, indent=2)

        return JSONResponse(content=response_payload)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    print(f"Starting App_pitching Server on port {port} ...")
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)

