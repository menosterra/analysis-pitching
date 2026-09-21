# -*- coding: utf-8 -*-
"""
Pose Analyzer for App_pitching
Extracts 2D MediaPipe Pose landmarks from 3B (Third-Base) Side-View pitching videos,
performs scale calibration using pitcher height and camera distance,
applies monotonic PCHIP spline interpolation, and automatically detects pitching key events.
"""

import os
import math
import json
import cv2
import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.signal import savgol_filter
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# MediaPipe Pose Landmark Indices
NOSE = 0
L_EYE = 2
R_EYE = 5
L_EAR = 7
R_EAR = 8
L_SHOULDER = 11
R_SHOULDER = 12
L_ELBOW = 13
R_ELBOW = 14
L_WRIST = 15
R_WRIST = 16
L_PINKY = 17
R_PINKY = 18
L_INDEX = 19
R_INDEX = 20
L_HIP = 23
R_HIP = 24
L_KNEE = 25
R_KNEE = 26
L_ANKLE = 27
R_ANKLE = 28
L_HEEL = 29
R_HEEL = 30
L_FOOT_INDEX = 31
R_FOOT_INDEX = 32

class PitchPoseAnalyzer:
    def __init__(self, model_path=None):
        if model_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            model_path = os.path.join(base_dir, "data", "models", "pose_landmarker_full.task")
            if not os.path.exists(model_path):
                # Fallback check Science_pitching directory
                science_model = r"C:\Project\Science_pitching\pose_landmarker_full.task"
                if os.path.exists(science_model):
                    model_path = science_model
        
        self.model_path = model_path
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Pose Landmarker model not found at {self.model_path}")
            
        base_options = python.BaseOptions(model_asset_path=self.model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            output_segmentation_masks=False
        )
        self.detector = vision.PoseLandmarker.create_from_options(options)

    def extract_video_landmarks(self, video_path, max_frames=450):
        """
        Reads video and runs MediaPipe Pose Landmarker on each frame.
        Automatically downscales large 4K/1440p videos to 720p for fast processing and low RAM usage.
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0 or math.isnan(fps):
            fps = 30.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Memory & CPU protection: downscale 4K/1440p frames before passing to MediaPipe
        max_dim = 1280
        scale_factor = 1.0
        if max(width, height) > max_dim:
            scale_factor = max_dim / float(max(width, height))
            target_w = int(width * scale_factor)
            target_h = int(height * scale_factor)
        else:
            target_w, target_h = width, height

        raw_frames = []
        frame_idx = 0

        while cap.isOpened() and frame_idx < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            if scale_factor < 1.0:
                frame_for_mp = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
            else:
                frame_for_mp = frame

            time_sec = frame_idx / fps
            frame_rgb = cv2.cvtColor(frame_for_mp, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

            detection_result = self.detector.detect(mp_image)

            frame_entry = {
                "frame_idx": frame_idx,
                "time": time_sec,
                "detected": False,
                "landmarks": []
            }

            if detection_result.pose_landmarks and len(detection_result.pose_landmarks) > 0:
                frame_entry["detected"] = True
                lms2d = detection_result.pose_landmarks[0]
                for idx, lm in enumerate(lms2d):
                    frame_entry["landmarks"].append({
                        "id": idx,
                        "x_norm": float(lm.x),
                        "y_norm": float(lm.y),
                        "z_norm": float(lm.z) if hasattr(lm, 'z') else 0.0,
                        "x_px": float(lm.x * width),
                        "y_px": float(lm.y * height),
                        "visibility": float(lm.visibility) if hasattr(lm, 'visibility') else 1.0
                    })
            elif len(raw_frames) > 0 and raw_frames[-1]["detected"]:
                # Carry forward previous frame if brief occlusion
                frame_entry["detected"] = True
                frame_entry["landmarks"] = raw_frames[-1]["landmarks"]

            raw_frames.append(frame_entry)
            frame_idx += 1

        cap.release()
        return raw_frames, fps, width, height, min(total_frames, frame_idx)

    def calibrate_and_interpolate(self, raw_frames, fps, pitcher_height_m=1.80, camera_dist_m=6.5, throws='R', target_fps=120.0):
        """
        Calibrates 2D coordinates into meters using pitcher height and camera distance,
        applies PCHIP interpolation to achieve smooth 120 FPS trajectory.
        """
        valid_frames = [f for f in raw_frames if f["detected"] and len(f["landmarks"]) >= 33]
        if len(valid_frames) < 10:
            raise ValueError("Insufficient pose detection in video (less than 10 valid frames).")

        orig_times = np.array([f["time"] for f in valid_frames])
        
        # 1. Determine scale factor (meters / pixel)
        early_subset = valid_frames[:max(5, len(valid_frames) // 3)]
        pixel_heights = []
        for f in early_subset:
            lms = f["landmarks"]
            top_y = min(lms[NOSE]["y_px"], lms[L_EYE]["y_px"], lms[R_EYE]["y_px"])
            bot_y = max(lms[L_ANKLE]["y_px"], lms[R_ANKLE]["y_px"], lms[L_HEEL]["y_px"], lms[R_HEEL]["y_px"])
            px_h = bot_y - top_y
            if px_h > 40:
                pixel_heights.append(px_h)

        if len(pixel_heights) > 0:
            median_px_height = float(np.median(pixel_heights))
            effective_person_height_px = median_px_height / 0.92
            base_m_per_px = pitcher_height_m / effective_person_height_px
        else:
            base_m_per_px = pitcher_height_m / 600.0

        # 2. Monotonic PCHIP Spline Interpolation for each landmark joint
        t_start = orig_times[0]
        t_end = orig_times[-1]
        dense_times = np.arange(t_start, t_end, 1.0 / target_fps)

        num_lms = 33
        interpolated_joints_px = {i: {"x": [], "y": []} for i in range(num_lms)}

        for lm_idx in range(num_lms):
            x_vals = np.array([f["landmarks"][lm_idx]["x_px"] for f in valid_frames])
            y_vals = np.array([f["landmarks"][lm_idx]["y_px"] for f in valid_frames])

            window = min(7, len(x_vals) if len(x_vals) % 2 == 1 else len(x_vals) - 1)
            if window >= 5:
                x_vals_smooth = savgol_filter(x_vals, window_length=window, polyorder=2)
                y_vals_smooth = savgol_filter(y_vals, window_length=window, polyorder=2)
            else:
                x_vals_smooth = x_vals
                y_vals_smooth = y_vals

            pchip_x = PchipInterpolator(orig_times, x_vals_smooth)
            pchip_y = PchipInterpolator(orig_times, y_vals_smooth)

            dense_x_px = pchip_x(dense_times)
            dense_y_px = pchip_y(dense_times)

            interpolated_joints_px[lm_idx]["x"] = dense_x_px
            interpolated_joints_px[lm_idx]["y"] = dense_y_px

        # Reference origin: Initial midpoint of hips at t_start
        initial_hip_x = (interpolated_joints_px[L_HIP]["x"][0] + interpolated_joints_px[R_HIP]["x"][0]) / 2.0
        ground_y_px = max(interpolated_joints_px[L_ANKLE]["y"][0], interpolated_joints_px[R_ANKLE]["y"][0])

        interpolated_frames = []
        for k, t in enumerate(dense_times):
            scale_k = base_m_per_px

            frame_dict = {
                "frame_idx": k,
                "time": round(float(t), 4),
                "scale_m_per_px": scale_k,
                "joints_px": {},
                "joints_m": {}
            }

            for lm_idx in range(num_lms):
                px_x = float(interpolated_joints_px[lm_idx]["x"][k])
                px_y = float(interpolated_joints_px[lm_idx]["y"][k])
                
                m_x = (px_x - initial_hip_x) * scale_k
                m_y = (ground_y_px - px_y) * scale_k

                frame_dict["joints_px"][lm_idx] = {"x": round(px_x, 2), "y": round(px_y, 2)}
                frame_dict["joints_m"][lm_idx] = {"x": round(m_x, 4), "y": round(m_y, 4)}

            interpolated_frames.append(frame_dict)

        return interpolated_frames, dense_times, base_m_per_px

    def detect_pitch_events(self, frames, dense_times, throws='R'):
        """
        Detects key pitching timeline events in 3B 2D side-view:
        PKH, FP, MER, BR, FT
        """
        lead_ankle = L_ANKLE if throws == 'R' else R_ANKLE
        lead_knee = L_KNEE if throws == 'R' else R_KNEE
        throw_wrist = R_WRIST if throws == 'R' else L_WRIST
        throw_shoulder = R_SHOULDER if throws == 'R' else L_SHOULDER

        times = np.array(dense_times)
        n = len(frames)
        dt = 1.0 / 120.0

        lead_knee_heights = np.array([f["joints_m"][lead_knee]["y"] for f in frames])
        
        wrist_x = np.array([f["joints_m"][throw_wrist]["x"] for f in frames])
        wrist_y = np.array([f["joints_m"][throw_wrist]["y"] for f in frames])
        
        vx = np.gradient(wrist_x, dt)
        vy = np.gradient(wrist_y, dt)
        wrist_speed = np.sqrt(vx**2 + vy**2) * 3.6 # km/h

        ankle_x = np.array([f["joints_m"][lead_ankle]["x"] for f in frames])
        ankle_y = np.array([f["joints_m"][lead_ankle]["y"] for f in frames])
        ankle_vx = np.gradient(ankle_x, dt)
        ankle_vy = np.gradient(ankle_y, dt)
        ankle_speed = np.sqrt(ankle_vx**2 + ankle_vy**2)

        # 1. BR: Global Peak Wrist Acceleration/Speed detection
        # Regardless of video length or extra pre-roll/post-roll footage,
        # locate the definitive ball release acceleration peak.
        valid_start = min(5, max(1, n // 20))
        valid_end = max(valid_start + 1, n - 3)
        br_idx = valid_start + int(np.argmax(wrist_speed[valid_start:valid_end]))
        br_time = times[br_idx]

        # 2. PKH (Leg Lift / Setup): Physiologically occurs ~0.35s to ~1.40s BEFORE Ball Release
        # Search for maximum knee height strictly within the realistic pitching windup window
        pkh_window_start = max(0, br_idx - int(1.40 * 120))
        pkh_window_end = max(1, br_idx - int(0.20 * 120))
        
        if pkh_window_end > pkh_window_start:
            pkh_idx = pkh_window_start + int(np.argmax(lead_knee_heights[pkh_window_start:pkh_window_end]))
        else:
            pkh_idx = max(0, br_idx - int(0.65 * 120))
        pkh_time = times[pkh_idx]

        # 3. FP (Foot Plant): Lead foot landing impact (deceleration) between PKH and BR (~0.08s to ~0.25s before BR)
        fp_window_start = max(pkh_idx + 2, br_idx - int(0.26 * 120))
        fp_window_end = max(fp_window_start + 1, br_idx - int(0.06 * 120))
        
        if fp_window_end > fp_window_start:
            window_ankle_speed = ankle_speed[fp_window_start:fp_window_end]
            fp_idx = fp_window_start + int(np.argmin(window_ankle_speed))
        else:
            fp_idx = max(0, br_idx - int(0.14 * 120))
        fp_time = times[fp_idx]

        # 4. MER (Max External Rotation / Arm Layback): Between FP and BR
        mer_window_start = fp_idx
        mer_window_end = br_idx
        if mer_window_end > mer_window_start + 2:
            trailing_distances = []
            for i in range(mer_window_start, mer_window_end):
                sh_x = frames[i]["joints_m"][throw_shoulder]["x"]
                wr_x = frames[i]["joints_m"][throw_wrist]["x"]
                trailing_distances.append(sh_x - wr_x)
            mer_rel_idx = int(np.argmax(trailing_distances))
            mer_idx = mer_window_start + mer_rel_idx
        else:
            mer_idx = (fp_idx + br_idx) // 2
        mer_time = times[mer_idx]

        # 5. FT (Follow-Through): ~0.20s to ~0.35s after Ball Release
        ft_idx = min(n - 1, br_idx + int(0.25 * 120))
        ft_time = times[ft_idx]

        events = {
            "pkh": {"frame_idx": int(pkh_idx), "time": round(float(pkh_time), 4), "name": "Peak Knee Height (PKH)"},
            "fp": {"frame_idx": int(fp_idx), "time": round(float(fp_time), 4), "name": "Foot Plant (FP)"},
            "mer": {"frame_idx": int(mer_idx), "time": round(float(mer_time), 4), "name": "Max External Rotation (MER)"},
            "br": {"frame_idx": int(br_idx), "time": round(float(br_time), 4), "name": "Ball Release (BR)"},
            "ft": {"frame_idx": int(ft_idx), "time": round(float(ft_time), 4), "name": "Follow-Through (FT)"}
        }

        return events, wrist_speed
