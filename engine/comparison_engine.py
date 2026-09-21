# -*- coding: utf-8 -*-
"""
Comparison & Coaching Engine for App_pitching
Compares user 2D pitching motion against OBP Elite Three-Quarter benchmark,
analyzes arm rotation radius arc, and generates personalized coaching feedback
and targeted drills for pitch velocity enhancement.
"""

import os
import json
import math
import numpy as np

class PitchComparisonEngine:
    def __init__(self, elite_data_path=None):
        if elite_data_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            elite_data_path = os.path.join(base_dir, "data", "elite_three_quarter.json")
        
        self.elite_data_path = elite_data_path
        self.elite_data = self._load_elite_data()

    def _load_elite_data(self):
        """Loads elite three-quarter JSON dataset."""
        if not os.path.exists(self.elite_data_path):
            return None
        with open(self.elite_data_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def compare_mechanics(self, user_analysis, user_events, user_frames):
        """
        Compares user mechanics metrics with elite three-quarter benchmark.
        Returns:
            comparison_scores: Radar chart scores (0-100)
            metric_diffs: Table of user vs elite key metrics
            coaching_feedback: Velocity enhancement advice and drills
            potential_velocity_gain: Estimated gain if mechanics are optimized
        """
        # Elite Three-Quarter (OBP 1688_1) Standard Benchmarks
        elite_benchmarks = {
            "pitch_speed_kmh": 149.8,
            "pitch_speed_mph": 93.1,
            "wrist_speed_kmh": 78.2,
            "directional_efficiency_pct": 92.5,
            "lead_knee_extension_deg": 18.5, # FP to BR knee extension
            "stride_ratio_pct": 84.5,        # Stride length % of height
            "trunk_tilt_br_deg": 38.0,       # Forward trunk tilt at release
            "elbow_flexion_mer_deg": 92.0,   # Elbow flexion at MER
            "elbow_flexion_br_deg": 28.0,    # Elbow extension towards release
            "peak_arm_angular_velo_deg_s": 1450.0
        }

        user_kc = user_analysis["kinetic_chain_metrics"]
        user_arm = user_analysis["arm_lever_mechanics"]
        user_spd = user_analysis["pitch_speed"]

        # 1. Calculate Score Components (0 ~ 100)
        # (A) Arm Lever & Radius Score
        # Good expansion ratio and high release angular velocity
        arm_score = min(100.0, max(40.0, (user_arm["release_arm_angular_velo_deg_s"] / 1300.0) * 85.0 + 15.0))

        # (B) Lead Leg Blocking Score (FP to BR Knee extension)
        knee_ext = user_kc["lead_knee_extension_deg"]
        if knee_ext >= 15.0:
            knee_score = 95.0 + min(5.0, (knee_ext - 15.0) * 1.0)
        elif knee_ext >= 0.0:
            knee_score = 75.0 + (knee_ext / 15.0) * 20.0
        else:
            knee_score = max(30.0, 75.0 + knee_ext * 2.5) # Knee collapsing penalty

        # (C) Directional Energy Focus Score
        dir_score = min(100.0, max(30.0, (user_spd["directional_efficiency_pct"] / 92.0) * 90.0))

        # (D) Forward Stride & Translation Score
        stride_pct = user_kc["stride_ratio_pct"]
        stride_score = min(100.0, max(40.0, 100.0 - abs(stride_pct - 82.0) * 2.5))

        # (E) Trunk Forward Acceleration & Extension Score
        trunk_br = user_kc["trunk_tilt_br_deg"]
        trunk_score = min(100.0, max(40.0, 100.0 - abs(trunk_br - 36.0) * 2.2))

        # Overall Mechanics Synergy Score
        overall_score = round(float(np.mean([arm_score, knee_score, dir_score, stride_score, trunk_score])), 1)

        radar_scores = {
            "overall_score": overall_score,
            "arm_lever_radius": round(arm_score, 1),
            "lead_knee_block": round(knee_score, 1),
            "directional_efficiency": round(dir_score, 1),
            "stride_momentum": round(stride_score, 1),
            "trunk_extension": round(trunk_score, 1)
        }

        # 2. Side-by-Side Metrics Comparison Table
        metric_comparison = [
            {
                "category": "예상 구속 (Pitch Speed)",
                "metric_name": "최종 투구 구속",
                "user_val": f"{user_spd['estimated_kmh']} km/h ({user_spd['estimated_mph']} mph)",
                "elite_val": f"{elite_benchmarks['pitch_speed_kmh']} km/h ({elite_benchmarks['pitch_speed_mph']} mph)",
                "status": "Target"
            },
            {
                "category": "상지 회전 & 레버",
                "metric_name": "손목 피크 선속도",
                "user_val": f"{user_spd['wrist_speed_kmh']} km/h",
                "elite_val": f"{elite_benchmarks['wrist_speed_kmh']} km/h",
                "status": "Good" if user_spd['wrist_speed_kmh'] >= 65.0 else "Needs Work"
            },
            {
                "category": "상지 회전 & 레버",
                "metric_name": "팔 회전 각속도 (Release)",
                "user_val": f"{user_arm['release_arm_angular_velo_deg_s']} °/s",
                "elite_val": f"{elite_benchmarks['peak_arm_angular_velo_deg_s']} °/s",
                "status": "Good" if user_arm['release_arm_angular_velo_deg_s'] >= 1000.0 else "Needs Work"
            },
            {
                "category": "에너지 전달 효율",
                "metric_name": "홈플레이트 방향성 집중도",
                "user_val": f"{user_spd['directional_efficiency_pct']}%",
                "elite_val": f"{elite_benchmarks['directional_efficiency_pct']}%",
                "status": "Good" if user_spd['directional_efficiency_pct'] >= 85.0 else "Warning"
            },
            {
                "category": "하지 지지 & 브레이싱",
                "metric_name": "디딤발 무릎 신전각 변화 (FP→BR)",
                "user_val": f"{user_kc['lead_knee_extension_deg']:+.1f}° ({user_kc['knee_block_rating']})",
                "elite_val": f"+{elite_benchmarks['lead_knee_extension_deg']}° (Active Extension)",
                "status": "Good" if user_kc['lead_knee_extension_deg'] >= 5.0 else ("Warning" if user_kc['lead_knee_extension_deg'] < 0 else "Moderate")
            },
            {
                "category": "체간 전진 & 익스텐션",
                "metric_name": "스트라이드 비율 (키 대비)",
                "user_val": f"{user_kc['stride_ratio_pct']}% ({user_kc['stride_length_m']}m)",
                "elite_val": f"{elite_benchmarks['stride_ratio_pct']}%",
                "status": "Good" if abs(user_kc['stride_ratio_pct'] - 82.0) <= 8.0 else "Moderate"
            },
            {
                "category": "체간 전진 & 익스텐션",
                "metric_name": "릴리즈 체간 전방 기울기",
                "user_val": f"{user_kc['trunk_tilt_br_deg']}°",
                "elite_val": f"{elite_benchmarks['trunk_tilt_br_deg']}°",
                "status": "Good" if abs(user_kc['trunk_tilt_br_deg'] - 38.0) <= 8.0 else "Needs Work"
            }
        ]

        # 3. Generate Personalized Feedback & Potential Velocity Gain
        coaching_items = []
        potential_gain_kmh = 0.0

        # Diagnosis 1: Lead Knee Blocking
        if user_kc["lead_knee_extension_deg"] < 0:
            gain = 3.5 + abs(user_kc["lead_knee_extension_deg"]) * 0.15
            potential_gain_kmh += gain
            coaching_items.append({
                "title": "디딤발 무릎 버팀(Lead Knee Brace) 보완 시급",
                "type": "critical",
                "badge": "하지 반력(GRF) 누수",
                "gain_est": f"+{gain:.1f} km/h",
                "problem": f"착지(FP) 이후 릴리즈(BR)까지 앞무릎이 {abs(user_kc['lead_knee_extension_deg']):.1f}° 더 굽혀지며 하체 전진 에너지를 상체로 전달하지 못하고 바닥으로 분산 누수되고 있습니다.",
                "solution": "착지 순간 디딤발 발바닥 전체로 지면을 강하게 밀어내며 무릎을 단단히 펴는 블로킹 동작을 만들어야 골반이 멈추고 체간이 채찍처럼 튕겨나갑니다.",
                "drill": {
                    "name": "리드 레그 브레이스 & 월 푸시 드릴 (Lead Leg Brace Drill)",
                    "guide": "디딤발을 단단히 디딘 상태에서 뒷발을 떼고 앞무릎을 신전시키며 체간만 앞으로 뻗는 쉐도우 피칭 20회 x 3세트"
                }
            })
        elif user_kc["lead_knee_extension_deg"] < 10.0:
            gain = 2.0
            potential_gain_kmh += gain
            coaching_items.append({
                "title": "디딤발 적극적 신전(Active Extension) 강화",
                "type": "warning",
                "badge": "하지 지지력 개선",
                "gain_est": f"+{gain:.1f} km/h",
                "problem": "디딤발 착지 각도를 유지하고 있으나, 엘리트 투수처럼 착지 후 무릎을 능동적으로 펴며 상체를 가속하는 지면 반력 반발력이 다소 부족합니다.",
                "solution": "릴리즈 순간 앞쪽 무릎을 단단한 기둥처럼 고정하여 상체 회전축을 명확히 형성하세요.",
                "drill": {
                    "name": "스텝 다운 지면 반력 점프 드릴",
                    "guide": "낮은 스텝박스에서 착지하며 디딤발로 순간 제동하는 훈련 15회 x 3세트"
                }
            })

        # Diagnosis 2: Directional Efficiency & Arm Arc
        if user_spd["directional_efficiency_pct"] < 82.0:
            gain = 4.0
            potential_gain_kmh += gain
            coaching_items.append({
                "title": "홈플레이트 방향성 에너지 집중도 향상 (X축 집중)",
                "type": "critical",
                "badge": "회전 에너지 누수",
                "gain_est": f"+{gain:.1f} km/h",
                "problem": f"손목 속도의 약 {100.0 - user_spd['directional_efficiency_pct']:.1f}%가 횡방향(3루-1루) 또는 불필요한 하향으로 분산되어 직진 구속으로 100% 전환되지 못하고 있습니다.",
                "solution": "글러브 손(좌측 어깨)을 가슴 쪽에 단단히 잠그고(Glove Tuck), 릴리즈 순간 공을 포수 미트 쪽으로 더 길게 끌고 나와 릴리즈 포인트를 앞으로 확장하세요.",
                "drill": {
                    "name": "타월 익스텐션 & 튜빙 릴리즈 드릴",
                    "guide": "타월을 쥐고 릴리즈 지점 앞 30cm에 놓인 타깃을 정확히 때리는 익스텐션 연습 25회 x 3세트"
                }
            })

        # Diagnosis 3: Arm Lever & Angular Velocity
        if user_arm["release_arm_angular_velo_deg_s"] < 1000.0:
            gain = 2.5
            potential_gain_kmh += gain
            coaching_items.append({
                "title": "상지 레버 회전 반경 및 채찍(Whip) 스냅 가속",
                "type": "warning",
                "badge": "레버 가속도 향상",
                "gain_est": f"+{gain:.1f} km/h",
                "problem": "릴리즈 직전 팔꿈치가 조기에 펴지거나 팔이 몸통과 멀어져 회전 각속도(Whip Snap)가 충분히 극대화되지 못하고 있습니다.",
                "solution": "코킹(MER) 단계에서 팔꿈치 굴곡 90°를 유지하다가 릴리즈 0.05초 전에 순간적으로 채찍을 휘두르듯 전완을 튕겨내야 합니다.",
                "drill": {
                    "name": "플라이오케어 볼 워밍업 스피네이션 드릴",
                    "guide": "가벼운 웨이티드 볼(100g~150g)을 활용한 닐링(무릎 꿇은 자세) 암스윙 20회"
                }
            })

        # Diagnosis 4: Trunk Forward Tilt
        if abs(user_kc["trunk_tilt_br_deg"] - 38.0) > 10.0:
            gain = 1.8
            potential_gain_kmh += gain
            coaching_items.append({
                "title": "릴리즈 체간 전방 기울기(Trunk Tilt) 최적화",
                "type": "info",
                "badge": "투구 밸런스",
                "gain_est": f"+{gain:.1f} km/h",
                "problem": f"릴리즈 순간 체간 기울기가 {user_kc['trunk_tilt_br_deg']}°로, 스리쿼터 최적치(35°~40°)에 비해 {'너무 서 있거나' if user_kc['trunk_tilt_br_deg'] < 28 else '과도하게 숙여져'} 있습니다.",
                "solution": "디딤발 지지축 위로 상체 흉곽을 부드럽게 전방으로 넘겨주며 자연스러운 릴리즈 높이를 확보하세요.",
                "drill": {
                    "name": "메디신볼 슬램 체간 가속 드릴",
                    "guide": "2kg 메디신볼을 이용한 체간 굴곡 및 전방 투척 훈련 10회 x 3세트"
                }
            })

        # Base feedback if already very good
        if len(coaching_items) == 0:
            potential_gain_kmh = 1.5
            coaching_items.append({
                "title": "엘리트급 스리쿼터 메카닉스 폼 유지",
                "type": "good",
                "badge": "최적 밸런스",
                "gain_est": "+1.5 km/h",
                "problem": "디딤발 지지, 팔 회전 반경, 체간 가속 타이밍이 엘리트 스리쿼터 기준과 매우 흡사하게 최적화되어 있습니다.",
                "solution": "현재의 투구 메카닉스를 유지하면서 하체 순발력 훈련과 회전 근력 트레이닝을 통해 베이스 구속을 점진적으로 끌어올리세요.",
                "drill": {
                    "name": "고중량/저중량 볼 콤플렉스 스피드 훈련",
                    "guide": "정규구 및 가벼운 언더로드 볼을 이용한 최대 출력 투구 루틴"
                }
            })

        potential_gain_kmh = round(min(12.0, potential_gain_kmh), 1)
        potential_gain_mph = round(potential_gain_kmh * 0.621371, 1)

        return {
            "radar_scores": radar_scores,
            "metric_comparison": metric_comparison,
            "coaching_items": coaching_items,
            "potential_gain": {
                "gain_kmh": potential_gain_kmh,
                "gain_mph": potential_gain_mph,
                "target_speed_kmh": round(user_spd["estimated_kmh"] + potential_gain_kmh, 1),
                "target_speed_mph": round(user_spd["estimated_mph"] + potential_gain_mph, 1)
            }
        }
