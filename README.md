# App_pitching (3루 측면 2D 투구 메카닉스 & 엘리트 스리쿼터 비교 코칭 앱)

`C:\Project\Science_pitching`에서 연구된 생체역학 수학 모델과 Driveline OBP 엘리트 투구 데이터셋을 기반으로 개발된 **3루 측면(3B Side View) 스마트폰 2D 영상 전용 투구 분석 및 코칭 웹 애플리케이션**입니다.

---

## 🌟 주요 기능

1. **3루 측면(3B Side View) 2D 영상 분석**:
   - 일반 스마트폰으로 촬영된 2D 측면 투구 영상 처리
   - 투수 신장(Height)과 카메라 거리(Distance)를 반영한 픽셀 $\leftrightarrow$ 실제 미터($m$) 스케일 캘리브레이션
   - PCHIP 스플라인 보간으로 120 FPS급 부드러운 관절 궤적 및 속도 미분 구현

2. **OBP 엘리트 스리쿼터(Three-Quarter) 1:1 비교 분석**:
   - Driveline OBP 성인 엘리트 스리쿼터(45°~65° Arm Slot, 93.1 mph) 표준 데이터 탑재
   - Foot Plant(착지) $\rightarrow$ Max External Rotation(최대 외회전) $\rightarrow$ Ball Release(릴리즈) 타임라인 자동 정렬
   - 2D Canvas 실시간 골격 렌더링 및 **엘리트 고스트(Ghost) 오버레이 & 팔 회전 반경(Arm Arc) 시각화**

3. **생체역학 레버 원운동 탈출 모델 기반 예상 구속(Pitch Speed) 산출**:
   - 손목 선속도 + 3D/2D 전신 유효 레버 각속도 + 핑거스냅 + 하지 지지력 반력 계수를 결합한 인과적 구속 추정

4. **구속 향상을 위한 맞춤형 처방 & 훈련 드릴(Drills)**:
   - 디딤발 무릎 블로킹(Lead Knee Brace), 릴리즈 익스텐션, 홈플레이트 방향성 에너지 집중도(X축 성분 효율) 진단
   - 항목별 잠재적 증속 여력(예: $+3.8\text{ km/h}$) 및 3단계 처방 훈련 드릴 제공

---

## 📹 동영상 권장 조건 및 촬영 가이드

- **동영상 조건**: 셋업(Leg Lift) $\rightarrow$ 디딤발 착지(Foot Plant) $\rightarrow$ 릴리즈(Ball Release) $\rightarrow$ 팔로스루(Follow-Through) 동작이 순차적으로 포함된 동영상
- **촬영 시점**: **3루에서 바라본 골반 높이 수평 시점** (투구 축과 90° 직각 측면, 우투 기준)
- **권장 프레임 레이트**: **120fps 이상 (스마트폰 슬로우모션 촬영 권장)**
  > 💡 **참고**: 30fps 일반 영상의 경우 초고속 팔 스윙(30~50ms) 및 킥업 다리 회전 시 셔터 스피드 부족으로 모션 블러 및 관절 추적 오차가 발생할 수 있습니다. 정밀한 손목 릴리스 타점 및 회전 각속도 추정을 위해 스마트폰의 **'슬로 모션(120/240fps)'** 촬영을 권장합니다.

---

## 🚀 실행 방법

### 방법 1: 원클릭 실행 (Windows)
`run_app.bat` 더블 클릭

### 방법 2: 명령줄 실행
```bash
cd C:\Project\App_pitching
python server.py
```
브라우저에서 `http://localhost:8000` 접속

---

## 📁 디렉토리 구조

```
C:\Project\App_pitching\
├── server.py                        # FastAPI 웹 및 분석 API 서버
├── run_app.bat                      # 원클릭 실행 스크립트
├── requirements.txt                 # 의존 패키지 목록
├── README.md
├── engine/
│   ├── pose_analyzer.py             # 2D MediaPipe 추출, 캘리브레이션, PCHIP 스플라인 보간
│   ├── mechanics_calculator.py      # 팔 회전 반경, 각속도, 디딤발 각도, 구속 추정
│   └── comparison_engine.py         # 스리쿼터 엘리트 비교 & 코칭 드릴 생성
├── data/
│   ├── elite_three_quarter.json     # OBP 엘리트 스리쿼터 표준 데이터셋
│   ├── models/                      # MediaPipe Pose Landmarker 모델
│   ├── sample_videos/               # 샘플 투구 영상
│   └── cache/                       # 분석 캐시
└── static/
    ├── index.html                   # 다크 글래스모피즘 웹 대시보드
    ├── css/style.css                # 스포츠 사이언스 UI 스타일
    └── js/
        ├── app.js                   # 메인 컨트롤러 및 비디오 동기화
        ├── skeleton_renderer.js     # Canvas 2D 스켈레톤 & 고스트 렌더러
        └── charts.js                # 레이더 및 시계열 차트
```
