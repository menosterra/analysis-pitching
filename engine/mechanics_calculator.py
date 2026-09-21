# -*- coding: utf-8 -*-
"""
Pitch Mechanics Calculator for App_pitching
Calculates 2D Side-View (3B) Biomechanical Metrics:
- Throwing Arm Rotation Radius (R_arm, R_wrist, R_ball)
- Arm Swing Angular Velocity (omega_arm)
- 2D Pelvis & Shoulder Rotation Sequence (Time-aligned at Foot Plant t=0.00s)
- Wrist Linear Velocity (User vs Elite Three-Quarter benchmark)
- Lead Knee Angle & Ground Reaction Blocking
- Biomechanical Pitch Speed Estimation Model (km/h & mph)
"""

import math
import numpy as np
from engine.pose_analyzer import (
    NOSE, L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW,
    L_WRIST, R_WRIST, L_HIP, R_HIP, L_KNEE, R_KNEE,
    L_ANKLE, R_ANKLE
)

def calc_angle_2d(p1, p2, p3):
    """Calculates angle in degrees between p1-p2 and p3-p2 (vertex at p2)."""
    v1 = np.array([p1['x'] - p2['x'], p1['y'] - p2['y']])
    v2 = np.array([p3['x'] - p2['x'], p3['y'] - p2['y']])
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 < 1e-6 or norm2 < 1e-6:
        return 0.0
    cosine = np.dot(v1, v2) / (norm1 * norm2)
    cosine = np.clip(cosine, -1.0, 1.0)
    return math.degrees(math.acos(cosine))

def calc_dist_2d(p1, p2):
    """Calculates Euclidean distance between two 2D points."""
    return math.hypot(p1['x'] - p2['x'], p1['y'] - p2['y'])

def calc_rotation_2d(p_lead, p_rear, nominal_width, dir_sign=1.0):
    """
    Calculates apparent body segment rotation angle in 2D Side-View (3B).
    0° = fully closed (facing 3B at Leg Lift setup, parallel to rubber)
    90° = square to home plate (hips/shoulders aligned with pitch axis)
    >90° = follow-through over-rotation
    """
    # dx: horizontal displacement from rear joint to lead joint along forward throw axis
    dx = (p_lead['x'] - p_rear['x']) * dir_sign
    ratio = np.clip(abs(dx) / (nominal_width + 1e-6), 0.0, 1.0)
    if dx >= 0:
        # Closed (dx=width -> 0°) to Square (dx=0 -> 90°)
        return math.degrees(math.acos(ratio))
    else:
        # Square (dx=0 -> 90°) to Follow-through over-rotation (>90°)
        return 90.0 + math.degrees(math.asin(ratio))

class PitchMechanicsCalculator:
    def __init__(self, pitcher_height_m=1.80, throws='R'):
        self.height_m = pitcher_height_m
        self.throws = throws

        self.sh_idx = R_SHOULDER if throws == 'R' else L_SHOULDER
        self.glove_sh_idx = L_SHOULDER if throws == 'R' else R_SHOULDER
        self.el_idx = R_ELBOW if throws == 'R' else L_ELBOW
        self.wr_idx = R_WRIST if throws == 'R' else L_WRIST
        self.hip_idx = R_HIP if throws == 'R' else L_HIP
        self.glove_hip_idx = L_HIP if throws == 'R' else R_HIP
        
        self.lead_knee_idx = L_KNEE if throws == 'R' else R_KNEE
        self.lead_hip_idx = L_HIP if throws == 'R' else R_HIP
        self.lead_ankle_idx = L_ANKLE if throws == 'R' else R_ANKLE

        self.rear_knee_idx = R_KNEE if throws == 'R' else L_KNEE
        self.rear_hip_idx = R_HIP if throws == 'R' else L_HIP
        self.rear_ankle_idx = R_ANKLE if throws == 'R' else L_ANKLE

    def compute_frame_metrics(self, frame, dir_sign=1.0, w_hip_base=None, w_sh_base=None):
        """Computes instant metrics for a single frame (using joints_m)."""
        jm = frame["joints_m"]

        sh = jm[self.sh_idx]
        glove_sh = jm[self.glove_sh_idx]
        el = jm[self.el_idx]
        wr = jm[self.wr_idx]
        
        hip = jm[self.hip_idx]
        glove_hip = jm[self.glove_hip_idx]
        mid_hip = {"x": (hip["x"] + glove_hip["x"]) / 2.0, "y": (hip["y"] + glove_hip["y"]) / 2.0}
        mid_sh = {"x": (sh["x"] + glove_sh["x"]) / 2.0, "y": (sh["y"] + glove_sh["y"]) / 2.0}

        lead_hip = jm[self.lead_hip_idx]
        rear_hip = jm[self.rear_hip_idx]
        lead_knee = jm[self.lead_knee_idx]
        lead_ankle = jm[self.lead_ankle_idx]
        rear_ankle = jm[self.rear_ankle_idx]

        # 1. Elbow Flexion (deg)
        elbow_flexion = calc_angle_2d(sh, el, wr)

        # 2. Lead Knee Angle (deg)
        lead_knee_angle = calc_angle_2d(lead_hip, lead_knee, lead_ankle)

        # 3. Trunk Forward Tilt (deg)
        spine_dx = (mid_sh["x"] - mid_hip["x"]) * dir_sign
        spine_dy = mid_sh["y"] - mid_hip["y"]
        trunk_forward_tilt = math.degrees(math.atan2(spine_dx, spine_dy))

        # 4. 2D Pelvis & Shoulder Rotation Angles (True Kinematics calibrated at Leg Lift 0°)
        hip_w = w_hip_base if w_hip_base is not None else (0.22 * self.height_m)
        pelvis_rot_deg = calc_rotation_2d(lead_hip, rear_hip, hip_w, dir_sign)

        sh_w = w_sh_base if w_sh_base is not None else (0.28 * self.height_m)
        shoulder_rot_deg = calc_rotation_2d(glove_sh, sh, sh_w, dir_sign)

        # 5. Throwing Arm Effective Radius
        r_wrist_pivot = calc_dist_2d(glove_sh, wr)
        l_upper = calc_dist_2d(sh, el)
        l_fore = calc_dist_2d(el, wr)
        l_arm_segments = l_upper + l_fore

        # 6. Stride Length
        stride_dist_m = abs(lead_ankle["x"] - rear_ankle["x"])
        stride_ratio = (stride_dist_m / self.height_m) * 100.0

        return {
            "elbow_flexion": round(elbow_flexion, 1),
            "lead_knee_angle": round(lead_knee_angle, 1),
            "trunk_forward_tilt": round(trunk_forward_tilt, 1),
            "pelvis_rot_deg": round(pelvis_rot_deg, 1),
            "shoulder_rot_deg": round(shoulder_rot_deg, 1),
            "r_wrist_pivot_m": round(r_wrist_pivot, 3),
            "arm_segments_len_m": round(l_arm_segments, 3),
            "stride_dist_m": round(stride_dist_m, 2),
            "stride_ratio_pct": round(stride_ratio, 1),
            "wrist_x_m": round(wr["x"], 3),
            "wrist_y_m": round(wr["y"], 3)
        }

    def analyze_full_pitch(self, frames, events, fps=120.0, original_video_fps=30.0):
        """
        Performs comprehensive pitching mechanics calculation and speed estimation.
        Dynamically adapts to any source video framerate (24fps, 30fps, 60fps, 120fps, 240fps).
        """
        dt = 1.0 / fps
        pkh_idx = events["pkh"]["frame_idx"]
        fp_idx = events["fp"]["frame_idx"]
        mer_idx = events["mer"]["frame_idx"]
        br_idx = events["br"]["frame_idx"]
        ft_idx = events["ft"]["frame_idx"]

        # Determine throwing forward direction (+1 if lead ankle at FP is to the right of rear ankle)
        rear_ankle_x_fp = frames[fp_idx]["joints_m"][self.rear_ankle_idx]["x"]
        lead_ankle_x_fp = frames[fp_idx]["joints_m"][self.lead_ankle_idx]["x"]
        dir_sign = 1.0 if lead_ankle_x_fp >= rear_ankle_x_fp else -1.0

        # Calibrate baseline width at PKH (Leg Lift) for 0° zero-baseline
        f_pkh = frames[pkh_idx]["joints_m"]
        w_hip_base = max(0.12, abs(f_pkh[self.lead_hip_idx]["x"] - f_pkh[self.rear_hip_idx]["x"]))
        w_sh_base = max(0.20, abs(f_pkh[self.glove_sh_idx]["x"] - f_pkh[self.sh_idx]["x"]))

        frame_metrics = []
        for f in frames:
            frame_metrics.append(self.compute_frame_metrics(
                f, dir_sign=dir_sign, w_hip_base=w_hip_base, w_sh_base=w_sh_base
            ))

        # Times and Wrist Velocities
        times = np.array([f["time"] for f in frames])
        wrist_x = np.array([m["wrist_x_m"] for m in frame_metrics])
        wrist_y = np.array([m["wrist_y_m"] for m in frame_metrics])
        
        # 1. Wrist Linear Velocity Components (Forward X positive towards Home)
        vx_m_s = np.gradient(wrist_x, dt)
        vy_m_s = np.gradient(wrist_y, dt)
        
        wrist_vx_kmh = np.maximum(0.0, vx_m_s * dir_sign * 3.6)
        wrist_speed_kmh = np.sqrt(vx_m_s**2 + vy_m_s**2) * 3.6

        # 2. Pelvis Forward Translation Velocity
        hip_x = np.array([(f["joints_m"][self.hip_idx]["x"] + f["joints_m"][self.glove_hip_idx]["x"]) / 2.0 for f in frames])
        v_trans_x_kmh = np.maximum(0.0, np.gradient(hip_x, dt) * dir_sign * 3.6)

        # 3. Throwing Arm Angular Velocity
        arm_angles_rad = []
        for f in frames:
            sh = f["joints_m"][self.sh_idx]
            wr = f["joints_m"][self.wr_idx]
            angle = math.atan2(wr["y"] - sh["y"], (wr["x"] - sh["x"]) * dir_sign)
            arm_angles_rad.append(angle)
        
        arm_angles_rad = np.unwrap(arm_angles_rad)
        omega_arm_rad_s = np.abs(np.gradient(arm_angles_rad, dt))
        omega_arm_deg_s = np.degrees(omega_arm_rad_s)

        # 4. Biomechanical Parameters at Release (BR)
        br_metrics = frame_metrics[br_idx]
        fp_metrics = frame_metrics[fp_idx]
        mer_metrics = frame_metrics[mer_idx]

        r_wrist_br = br_metrics["r_wrist_pivot_m"]
        if r_wrist_br < 0.60:
            r_wrist_br = 0.52 * self.height_m
        
        l_hand = 0.08 * self.height_m
        r_ball_br = r_wrist_br + l_hand

        v_trans_br = float(max(4.0, v_trans_x_kmh[br_idx]))
        v_wrist_br = float(wrist_speed_kmh[br_idx])
        v_wrist_x_br = float(wrist_vx_kmh[br_idx])

        # Dynamic sampling loss compensation based on original source video framerate
        # 30fps: c_sampling ~ 1.22
        # 60fps: c_sampling ~ 1.10
        # 120fps+: c_sampling ~ 1.00
        src_fps = float(original_video_fps) if (original_video_fps and original_video_fps > 0) else 30.0
        if src_fps <= 30.0:
            c_sampling = 1.22
        elif src_fps < 120.0:
            c_sampling = 1.00 + ((120.0 - src_fps) / 90.0) * 0.22
        else:
            c_sampling = 1.00

        v_wrist_x_effective = v_wrist_x_br * c_sampling

        eta_dir = float(np.clip(v_wrist_x_br / (v_wrist_br + 1e-6), 0.60, 1.0))

        # 5. Lead Knee Block Mechanics (Ground Reaction Force transfer)
        knee_fp = fp_metrics["lead_knee_angle"]
        knee_br = br_metrics["lead_knee_angle"]
        knee_diff = knee_br - knee_fp
        
        if knee_diff >= 25.0:
            eta_knee = 1.08  # Exceptional active knee extension block
        elif knee_diff >= 10.0:
            eta_knee = 1.04
        elif knee_diff >= 0.0:
            eta_knee = 1.00
        else:
            eta_knee = max(0.88, 1.00 + (knee_diff / 60.0))  # Energy leak penalty

        # 6. Rotational Kinetic Whip Acceleration (Shoulder IR + Forearm Whip)
        peak_omega_rad = float(np.max(omega_arm_rad_s[max(0, br_idx - 15):br_idx + 2]))
        v_whip_base = (peak_omega_rad / 157.0) * 78.0 * (self.height_m / 1.82)
        v_whip = float(np.clip(v_whip_base, 38.0, 84.0))

        # 7. Biomechanical Kinetic Summation Model
        rot_escape_velo = (v_wrist_x_effective - v_trans_br) * (r_ball_br / r_wrist_br) * eta_knee
        v_pitch_estimated_kmh = v_trans_br + rot_escape_velo + (v_whip * eta_dir)
        v_pitch_estimated_mph = v_pitch_estimated_kmh * 0.621371

        sh_br = frames[br_idx]["joints_m"][self.sh_idx]
        wr_br = frames[br_idx]["joints_m"][self.wr_idx]
        arm_slot_side_deg = math.degrees(math.atan2(wr_br["y"] - sh_br["y"], (wr_br["x"] - sh_br["x"]) * dir_sign))

        # 8. Foot Plant (FP, t=0.00s) Normalized Time Series Alignment covering Leg Lift (~-0.70s) to BR (~+0.16s)
        fp_time = events["fp"]["time"]
        
        # High-precision uniform relative time grid centered at FP=0.00s (from -0.80s to +0.25s, 106 points)
        grid_rel_times = np.linspace(-0.80, 0.25, 106)
        grid_abs_times = fp_time + grid_rel_times

        # Interpolate user metrics onto this uniform relative time grid
        u_wrist_speed_raw = np.interp(grid_abs_times, times, wrist_speed_kmh)
        u_lead_knee_raw = np.interp(grid_abs_times, times, np.array([m["lead_knee_angle"] for m in frame_metrics]))
        u_pelvis_rot_raw = np.interp(grid_abs_times, times, np.array([m["pelvis_rot_deg"] for m in frame_metrics]))
        u_shoulder_rot_raw = np.interp(grid_abs_times, times, np.array([m["shoulder_rot_deg"] for m in frame_metrics]))

        # High Slot Elite Benchmark (OBP Session 1688_1 & Cohort N=105, 93.1 mph)
        # Leg Lift (~ -0.69s): Wrist ~2 km/h, Knee ~155°
        # Foot Plant (FP = 0.00s): Wrist ~18 km/h, Knee ~136.3° (Landing Plant)
        # Ball Release (BR ~ +0.162s): Wrist Peak ~73.2 km/h, Knee Extends to ~162.6° (+26.3° Active Block)
        elite_wrist_speed = []
        elite_lead_knee = []
        elite_pelvis_rot = []
        elite_shoulder_rot = []

        for rel_t in grid_rel_times:
            # 1. Elite Wrist Speed Curve (km/h) [Leg Lift ~2 km/h -> FP ~18 km/h -> BR ~73.2 km/h]
            if rel_t <= -0.69:
                e_spd = 2.0
            elif rel_t < 0.0:
                prog = (rel_t + 0.69) / 0.69
                e_spd = 2.0 + 16.0 * (prog ** 1.5)
            elif rel_t <= 0.162:
                prog = rel_t / 0.162
                e_spd = 18.0 + 55.2 * (prog ** 2.2)
            else:
                decay = rel_t - 0.162
                e_spd = 73.2 * math.exp(-decay * 12.0)
            elite_wrist_speed.append(round(max(0.0, e_spd), 1))

            # 2. Elite Lead Knee Angle Curve (deg) [Stride Landing 136.3° -> Active Brace Extension 162.6° at BR]
            if rel_t <= -0.40:
                e_k = 150.0 - 15.0 * ((rel_t + 0.80) / 0.40)
            elif rel_t < 0.0:
                prog = (rel_t + 0.40) / 0.40
                e_k = 135.0 + 1.3 * math.sin(prog * math.pi)
            elif rel_t <= 0.162:
                prog = rel_t / 0.162
                e_k = 136.3 + 26.3 * (prog ** 1.2)
            else:
                e_k = 162.6 + 3.0 * min(1.0, (rel_t - 0.162) / 0.09)
            elite_lead_knee.append(round(min(175.0, max(120.0, e_k)), 1))

            # 3. Elite Pelvis Rotation Curve (deg) [Leg Lift ~0° -> FP ~59.7° -> Peak ~88°]
            if rel_t <= -0.69:
                e_pel = 0.0 + 2.0 * ((rel_t + 0.80) / 0.11)
            elif rel_t < 0.0:
                prog = (rel_t + 0.69) / 0.69
                e_pel = 2.0 + 57.7 * (prog ** 1.3)
            elif rel_t <= 0.08:
                prog = rel_t / 0.08
                e_pel = 59.7 + 25.3 * math.sin(prog * math.pi / 2.0)
            else:
                e_pel = 85.0 + 3.0 * min(1.0, (rel_t - 0.08) / 0.15)
            elite_pelvis_rot.append(round(min(92.0, max(0.0, e_pel)), 1))

            # 4. Elite Shoulder Rotation Curve (deg) [Leg Lift ~0° -> FP ~5.0° -> BR ~150.0°]
            if rel_t <= -0.69:
                e_sh = 0.0
            elif rel_t < 0.0:
                prog = (rel_t + 0.69) / 0.69
                e_sh = 0.0 + 5.0 * (prog ** 1.8)
            elif rel_t <= 0.06:
                prog = rel_t / 0.06
                e_sh = 5.0 + 25.0 * (prog ** 1.8)
            elif rel_t <= 0.162:
                prog = (rel_t - 0.06) / (0.162 - 0.06)
                e_sh = 30.0 + 120.0 * math.sin(prog * math.pi / 2.0)
            else:
                e_sh = 150.0 + 8.0 * (1.0 - math.exp(-(rel_t - 0.162) * 6.0))
            elite_shoulder_rot.append(round(min(160.0, max(0.0, e_sh)), 1))

        pitch_analysis = {
            "pitch_speed": {
                "estimated_kmh": round(v_pitch_estimated_kmh, 1),
                "estimated_mph": round(v_pitch_estimated_mph, 1),
                "wrist_speed_kmh": round(v_wrist_br, 1),
                "wrist_vx_kmh": round(v_wrist_x_br, 1),
                "translation_speed_kmh": round(v_trans_br, 1),
                "directional_efficiency_pct": round(eta_dir * 100.0, 1),
                "finger_snap_contribution_kmh": round(v_whip * eta_dir, 1)
            },
            "arm_lever_mechanics": {
                "r_wrist_m": round(r_wrist_br, 3),
                "r_ball_m": round(r_ball_br, 3),
                "lever_expansion_ratio": round(r_ball_br / r_wrist_br, 3),
                "peak_arm_angular_velo_deg_s": round(float(np.max(omega_arm_deg_s)), 1),
                "release_arm_angular_velo_deg_s": round(float(omega_arm_deg_s[br_idx]), 1),
                "arm_slot_side_deg": round(arm_slot_side_deg, 1)
            },
            "kinetic_chain_metrics": {
                "stride_length_m": br_metrics["stride_dist_m"],
                "stride_ratio_pct": br_metrics["stride_ratio_pct"],
                "lead_knee_fp_deg": knee_fp,
                "lead_knee_br_deg": knee_br,
                "lead_knee_extension_deg": round(knee_diff, 1),
                "knee_block_rating": "Excellent (Active Brace)" if knee_diff >= 12 else ("Moderate" if knee_diff >= 0 else "Flexion (Energy Leak)"),
                "trunk_tilt_fp_deg": fp_metrics["trunk_forward_tilt"],
                "trunk_tilt_mer_deg": mer_metrics["trunk_forward_tilt"],
                "trunk_tilt_br_deg": br_metrics["trunk_forward_tilt"],
                "elbow_flexion_mer_deg": mer_metrics["elbow_flexion"],
                "elbow_flexion_br_deg": br_metrics["elbow_flexion"]
            },
            "fp_aligned_comparison": {
                "rel_times": [round(float(t), 2) for t in grid_rel_times],
                "user_wrist_speed": [round(float(s), 1) for s in u_wrist_speed_raw],
                "elite_wrist_speed": elite_wrist_speed,
                "user_lead_knee": [round(float(k), 1) for k in u_lead_knee_raw],
                "elite_lead_knee": elite_lead_knee,
                "user_pelvis_rot": [round(float(p), 1) for p in u_pelvis_rot_raw],
                "elite_pelvis_rot": elite_pelvis_rot,
                "user_shoulder_rot": [round(float(s), 1) for s in u_shoulder_rot_raw],
                "elite_shoulder_rot": elite_shoulder_rot,
                "events_rel_times": {
                    "fp": 0.00,
                    "mer": round(float(events["mer"]["time"] - fp_time), 3),
                    "br": round(float(events["br"]["time"] - fp_time), 3),
                    "pkh": round(float(events["pkh"]["time"] - fp_time), 3)
                }
            },
            "time_series": {
                "times": [round(float(t), 4) for t in times],
                "wrist_speed_kmh": [round(float(s), 2) for s in wrist_speed_kmh],
                "wrist_vx_kmh": [round(float(vx), 2) for vx in wrist_vx_kmh],
                "arm_angular_velo_deg_s": [round(float(w), 1) for w in omega_arm_deg_s],
                "lead_knee_angle": [round(float(m["lead_knee_angle"]), 1) for m in frame_metrics],
                "trunk_tilt": [round(float(m["trunk_forward_tilt"]), 1) for m in frame_metrics]
            }
        }

        return pitch_analysis
