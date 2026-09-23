/**
 * Main Application Logic for App_pitching
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const videoEl = document.getElementById('pitchVideo');
  const canvasEl = document.getElementById('skeletonCanvas');
  const scrubber = document.getElementById('timelineScrubber');
  const btnResetToStart = document.getElementById('btnResetToStart');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnPrevFrame = document.getElementById('btnPrevFrame');
  const btnNextFrame = document.getElementById('btnNextFrame');
  const selectPlaybackRate = document.getElementById('selectPlaybackRate');
  const timeDisplay = document.getElementById('timeDisplay');
  const loadingOverlay = document.getElementById('loadingOverlay');

  // Event Jump Buttons & Tags
  const btnJumpPKH = document.getElementById('btnJumpPKH');
  const btnJumpFP = document.getElementById('btnJumpFP');
  const btnJumpBR = document.getElementById('btnJumpBR');
  const tagPKH = document.getElementById('tagPKH');
  const tagFP = document.getElementById('tagFP');
  const tagBR = document.getElementById('tagBR');

  // Layer Toggles
  const toggleUserSkeleton = document.getElementById('toggleUserSkeleton');
  const toggleArmArc = document.getElementById('toggleArmArc');

  // Form Controls
  const fileUpload = document.getElementById('fileUpload');
  const inputHeight = document.getElementById('inputHeight');
  const inputDistance = document.getElementById('inputDistance');
  const selectThrows = document.getElementById('selectThrows');
  const btnAnalyze = document.getElementById('btnAnalyze');

  // KPI Elements
  const valPitchSpeedKmh = document.getElementById('valPitchSpeedKmh');
  const valPitchSpeedMph = document.getElementById('valPitchSpeedMph');
  const badgePotentialGain = document.getElementById('badgePotentialGain');
  const valWristSpeed = document.getElementById('valWristSpeed');
  const valArmAngularVelo = document.getElementById('valArmAngularVelo');
  const valDirEfficiency = document.getElementById('valDirEfficiency');
  const valLeadKneeExt = document.getElementById('valLeadKneeExt');
  const valOverallScore = document.getElementById('valOverallScore');

  // Table & Cards
  const comparisonTableBody = document.getElementById('comparisonTableBody');
  const coachingCardsContainer = document.getElementById('coachingCardsContainer');

  // Init Modules
  const renderer = new PitchSkeletonRenderer(canvasEl);
  const charts = new PitchChartsManager();

  let currentAnalysisData = null;
  let isPlaying = false;
  let animationFrameId = null;

  const videoPlaceholder = document.getElementById('videoPlaceholder');
  const viewportHud = document.getElementById('viewportHud');
  const btnLoadSample = document.getElementById('btnLoadSample');

  // 1. Trigger Pitch Analysis
  async function runAnalysis(fileObj = null, sampleId = null) {
    if (!fileObj && !sampleId) {
      alert('분석할 투구 동영상 파일을 선택해주세요.');
      return;
    }

    loadingOverlay.classList.add('active');
    
    const formData = new FormData();
    if (fileObj) {
      formData.append('video', fileObj);
    } else if (sampleId) {
      formData.append('sample_id', sampleId);
    }
    formData.append('pitcher_height_cm', inputHeight?.value || '182');
    formData.append('camera_distance_m', inputDistance?.value || '6.5');
    formData.append('throws', selectThrows?.value || 'R');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Analysis failed');
      }

      const result = await res.json();
      currentAnalysisData = result;
      populateDashboard(result);

      // Hide placeholder and show HUD
      if (videoPlaceholder) videoPlaceholder.classList.add('hidden');
      if (viewportHud) viewportHud.style.display = 'flex';

      // Load Video into Player
      videoEl.src = result.video_info.video_url;
      videoEl.load();

      videoEl.onloadedmetadata = () => {
        canvasEl.width = videoEl.videoWidth || 1280;
        canvasEl.height = videoEl.videoHeight || 720;
        scrubber.max = videoEl.duration;
        scrubber.value = 0;
        renderer.resize(canvasEl.width, canvasEl.height);
        
        // Ensure playback rate (0.5x) is explicitly set on video load
        const targetRate = parseFloat(selectPlaybackRate?.value || '0.5');
        videoEl.playbackRate = targetRate;
        videoEl.defaultPlaybackRate = targetRate;

        // Jump to Ball Release initially for instant overview
        if (result.events && result.events.br) {
          seekToTime(result.events.br.time);
        } else {
          seekToTime(0);
        }
      };

    } catch (error) {
      alert(`분석 중 오류 발생: ${error.message}`);
      console.error(error);
    } finally {
      loadingOverlay.classList.remove('active');
    }
  }

  // 2. Populate UI with Results
  function populateDashboard(data) {
    const spd = data.pitch_analysis.pitch_speed;
    const arm = data.pitch_analysis.arm_lever_mechanics;
    const kc = data.pitch_analysis.kinetic_chain_metrics;
    const comp = data.comparison;
    const fpComp = data.pitch_analysis.fp_aligned_comparison;

    // Speeds & KPIs
    if (valPitchSpeedKmh) valPitchSpeedKmh.textContent = `${spd.estimated_kmh}`;
    if (valPitchSpeedMph) valPitchSpeedMph.textContent = `${spd.estimated_mph} mph`;
    if (badgePotentialGain) badgePotentialGain.textContent = `잠재 상승: +${comp.potential_gain.gain_kmh} km/h (목표 ${comp.potential_gain.target_speed_kmh} km/h)`;

    if (valWristSpeed) valWristSpeed.textContent = `${spd.wrist_speed_kmh} km/h`;
    if (valArmAngularVelo) valArmAngularVelo.textContent = `${arm.release_arm_angular_velo_deg_s} °/s`;
    if (valDirEfficiency) valDirEfficiency.textContent = `${spd.directional_efficiency_pct}%`;
    if (valLeadKneeExt) valLeadKneeExt.textContent = `${kc.lead_knee_extension_deg > 0 ? '+' : ''}${kc.lead_knee_extension_deg}°`;
    if (valOverallScore) valOverallScore.textContent = `${comp.radar_scores.overall_score}`;

    // Update Event Jump Button Labels (PKH, FP, BR)
    if (data.events) {
      if (tagPKH && data.events.pkh) tagPKH.textContent = `${data.events.pkh.time.toFixed(2)}s`;
      if (tagFP && data.events.fp) tagFP.textContent = `${data.events.fp.time.toFixed(2)}s (기준 0.0s)`;
      if (tagBR && data.events.br) tagBR.textContent = `${data.events.br.time.toFixed(2)}s (+${(data.events.br.time - data.events.fp.time).toFixed(2)}s)`;
    }

    // Update Renderer Data
    renderer.setData(data.frames_2d, data.events);

    // Update Charts (Radar, Unified 2D Kinetic Chain & Knee Block Chart)
    charts.initRadarChart('radarChartCanvas', comp.radar_scores);
    if (fpComp) {
      charts.initUnifiedKineticChart('unifiedKineticChartCanvas', fpComp);
    }

    // Populate Comparison Table
    comparisonTableBody.innerHTML = '';
    comp.metric_comparison.forEach(m => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong style="color:#ffffff;">${m.metric_name}</strong><br><span style="font-size:0.7rem; color:#94a3b8;">${m.category}</span></td>
        <td style="color:#00f2fe; font-weight:700;">${m.user_val}</td>
        <td style="color:#ffd166; font-weight:600;">${m.elite_val}</td>
        <td><span class="status-pill ${m.status}">${m.status}</span></td>
      `;
      comparisonTableBody.appendChild(row);
    });

    // Populate Coaching Feedback & Drills
    coachingCardsContainer.innerHTML = '';
    comp.coaching_items.forEach(c => {
      const card = document.createElement('div');
      card.className = `coaching-card ${c.type}`;
      card.innerHTML = `
        <div class="card-header-flex">
          <div class="card-title">${c.title}</div>
          <div class="gain-tag">${c.gain_est}</div>
        </div>
        <div class="card-desc"><strong>원인:</strong> ${c.problem}</div>
        <div class="card-desc"><strong>처방:</strong> ${c.solution}</div>
        <div class="drill-box">
          <div class="drill-title">추천 훈련: ${c.drill.name}</div>
          <div class="drill-guide">${c.drill.guide}</div>
        </div>
      `;
      coachingCardsContainer.appendChild(card);
    });

    // Show PDF Summary Report Section at bottom of page
    const pdfExportSection = document.getElementById('pdfExportSection');
    if (pdfExportSection) {
      pdfExportSection.style.display = 'block';
    }
  }

  // 3. Video Playback & Synchronization Loop
  function updateFrameLoop() {
    if (videoEl.paused || videoEl.ended) {
      isPlaying = false;
      btnPlayPause.textContent = '▶';
    } else {
      scrubber.value = videoEl.currentTime;
      timeDisplay.textContent = `${videoEl.currentTime.toFixed(2)}s / ${(videoEl.duration || 0).toFixed(2)}s`;
      renderer.render(videoEl.currentTime);
      animationFrameId = requestAnimationFrame(updateFrameLoop);
    }
  }

  function seekToTime(timeSec) {
    videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 10, timeSec));
    scrubber.value = videoEl.currentTime;
    timeDisplay.textContent = `${videoEl.currentTime.toFixed(2)}s / ${(videoEl.duration || 0).toFixed(2)}s`;
    renderer.render(videoEl.currentTime);
  }

  // Event Listeners
  btnResetToStart.addEventListener('click', () => {
    videoEl.pause();
    seekToTime(0);
  });

  btnPlayPause.addEventListener('click', () => {
    if (videoEl.paused) {
      videoEl.playbackRate = parseFloat(selectPlaybackRate?.value || '0.5');
      videoEl.play();
      isPlaying = true;
      btnPlayPause.textContent = '⏸';
      updateFrameLoop();
    } else {
      videoEl.pause();
      isPlaying = false;
      btnPlayPause.textContent = '▶';
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    }
  });

  btnPrevFrame.addEventListener('click', () => {
    videoEl.pause();
    seekToTime(videoEl.currentTime - (1.0 / 30.0));
  });

  btnNextFrame.addEventListener('click', () => {
    videoEl.pause();
    seekToTime(videoEl.currentTime + (1.0 / 30.0));
  });

  scrubber.addEventListener('input', (e) => {
    videoEl.pause();
    seekToTime(parseFloat(e.target.value));
  });

  selectPlaybackRate.addEventListener('change', (e) => {
    videoEl.playbackRate = parseFloat(e.target.value);
  });

  // Dedicated Event Jump Buttons (1: PKH, 2: FP, 3: BR)
  btnJumpPKH.addEventListener('click', () => { if (currentAnalysisData?.events?.pkh) seekToTime(currentAnalysisData.events.pkh.time); });
  btnJumpFP.addEventListener('click', () => { if (currentAnalysisData?.events?.fp) seekToTime(currentAnalysisData.events.fp.time); });
  btnJumpBR.addEventListener('click', () => { if (currentAnalysisData?.events?.br) seekToTime(currentAnalysisData.events.br.time); });

  // Layer Toggles
  toggleUserSkeleton.addEventListener('click', () => {
    renderer.showUserSkeleton = !renderer.showUserSkeleton;
    toggleUserSkeleton.classList.toggle('active', renderer.showUserSkeleton);
    renderer.render(videoEl.currentTime);
  });

  toggleArmArc.addEventListener('click', () => {
    renderer.showTrajectory = !renderer.showTrajectory;
    toggleArmArc.classList.toggle('active', renderer.showTrajectory);
    renderer.render(videoEl.currentTime);
  });

  // File selection change event (Update placeholder info)
  fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && videoPlaceholder) {
      const desc = videoPlaceholder.querySelector('.placeholder-desc');
      if (desc) {
        desc.innerHTML = `선택된 동영상: <strong style="color:#00f2fe;">${file.name}</strong><br>하단의 <strong style="color:var(--primary);">[투구 모션 분석 실행]</strong> 버튼을 눌러주세요.`;
      }
    }
  });

  // Analyze Trigger (Runs ONLY when "투구 모션 분석 실행" button is clicked)
  btnAnalyze.addEventListener('click', () => {
    const file = fileUpload.files[0];
    if (file) {
      runAnalysis(file);
    } else {
      alert('분석할 투구 동영상 파일(.mp4, .mov 등)을 먼저 선택해주세요.');
      fileUpload.focus();
    }
  });

  // Sample Video Trigger (Quick test with built-in sample pitching video)
  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', () => {
      if (inputHeight) inputHeight.value = '182';
      if (selectThrows) selectThrows.value = 'R';
      runAnalysis(null, 'sample');
    });
  }

  // 4. PDF Summary Report Generation (Foot Plant Still Snapshot + Biomechanical KPIs)
  const btnExportPdf = document.getElementById('btnExportPdf');

  async function captureFootPlantSnapshot(fpTime) {
    const originalTime = videoEl.currentTime;
    videoEl.pause();

    await new Promise((resolve) => {
      const onSeeked = () => {
        videoEl.removeEventListener('seeked', onSeeked);
        resolve();
      };
      videoEl.addEventListener('seeked', onSeeked);
      videoEl.currentTime = Math.max(0, Math.min(videoEl.duration || 10, fpTime));
    });

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = videoEl.videoWidth || 1280;
    snapCanvas.height = videoEl.videoHeight || 720;
    const sCtx = snapCanvas.getContext('2d');

    // Draw video frame
    sCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);

    // Overlay skeleton & trajectory at FP
    renderer.renderToContext(sCtx, fpTime);

    // Overlay HUD badge on image
    sCtx.save();
    sCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    sCtx.strokeStyle = '#00f2fe';
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    if (sCtx.roundRect) {
      sCtx.roundRect(20, 20, 360, 52, 8);
    } else {
      sCtx.rect(20, 20, 360, 52);
    }
    sCtx.fill();
    sCtx.stroke();

    sCtx.font = 'bold 18px "Outfit", sans-serif';
    sCtx.fillStyle = '#00f2fe';
    sCtx.fillText('디딤발 착지 순간 (Foot Plant)', 35, 45);
    sCtx.font = '13px "Outfit", sans-serif';
    sCtx.fillStyle = '#ffffff';
    sCtx.fillText(`t = ${fpTime.toFixed(2)}s (기준 0.00s) | 스트라이드 정점`, 35, 62);
    sCtx.restore();

    const imgData = snapCanvas.toDataURL('image/jpeg', 0.95);
    videoEl.currentTime = originalTime;
    return imgData;
  }

  async function generatePdfSummaryReport() {
    if (!currentAnalysisData) {
      alert('먼저 투구 동영상을 분석해주세요.');
      return;
    }

    if (!window.jspdf || !window.html2canvas) {
      alert('PDF 생성 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const origBtnText = btnExportPdf.innerHTML;
    btnExportPdf.disabled = true;
    btnExportPdf.innerHTML = '<span style="font-size: 1.1rem;">⏳</span> <span>PDF 요약 보고서 생성 중...</span>';

    try {
      const data = currentAnalysisData;
      const spd = data.pitch_analysis.pitch_speed;
      const arm = data.pitch_analysis.arm_lever_mechanics;
      const kc = data.pitch_analysis.kinetic_chain_metrics;
      const comp = data.comparison;
      const fpTime = data.events?.fp?.time || 0;

      // 1. Capture Foot Plant snapshot
      const fpSnapshotImg = await captureFootPlantSnapshot(fpTime);

      // 2. Capture Radar chart
      const radarCanvas = document.getElementById('radarChartCanvas');
      const radarImg = radarCanvas ? radarCanvas.toDataURL('image/png') : '';

      // 3. Build offscreen PDF Report DOM Container
      const reportDiv = document.createElement('div');
      reportDiv.id = 'pdfReportContainer';
      reportDiv.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 1080px;
        background: #0b1120;
        color: #ffffff;
        font-family: 'Inter', -apple-system, sans-serif;
        padding: 32px;
        box-sizing: border-box;
      `;

      const nowStr = new Date().toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });

      const throwsText = data.parameters.throws === 'R' ? '우완 (Right)' : '좌완 (Left)';

      reportDiv.innerHTML = `
        <!-- Report Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid rgba(56, 189, 248, 0.4); padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
              <span style="font-size: 2rem;">⚾</span>
              <h1 style="font-family: 'Outfit', sans-serif; font-size: 1.85rem; font-weight: 800; color: #ffffff; margin: 0;">Pitching Analysis</h1>
              <span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); font-size: 0.75rem; font-weight: 700; padding: 3px 10px; border-radius: 12px;">3B 2D Biomechanics</span>
            </div>
            <div style="font-size: 0.85rem; color: #94a3b8;">생체역학 투구 메카닉스 종합 분석 & OBP 엘리트 스리쿼터 비교 요약 보고서</div>
          </div>
          <div style="text-align: right; font-size: 0.78rem; color: #94a3b8; line-height: 1.5;">
            <div><strong>분석 일시:</strong> ${nowStr}</div>
            <div><strong>투수 신장:</strong> ${data.parameters.pitcher_height_cm} cm | <strong>투구 손:</strong> ${throwsText}</div>
            <div><strong>영상 정보:</strong> ${data.video_info.duration_sec}s (${data.video_info.fps} fps)</div>
          </div>
        </div>

        <!-- 2-Column Main Section -->
        <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 20px; margin-bottom: 20px;">
          
          <!-- Left Column: Foot Plant Snapshot & KPI Cards -->
          <div>
            <div style="font-size: 0.95rem; font-weight: 700; color: #38bdf8; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>📸</span> 디딤발 착지(Foot Plant) 기준 분석 영상
            </div>
            
            <div style="width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.15); margin-bottom: 14px; background: #000; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
              <img src="${fpSnapshotImg}" style="width: 100%; height: auto; display: block; object-fit: contain;">
            </div>

            <!-- Core Biomechanical KPI Grid -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
              
              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">예상 투구 구속</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.45rem; font-weight: 800; color: #38bdf8;">${spd.estimated_kmh} <span style="font-size: 0.8rem;">km/h</span></div>
                <div style="font-size: 0.72rem; color: #cbd5e1;">${spd.estimated_mph} mph</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">스트라이드 (FP 착지)</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.45rem; font-weight: 800; color: #00f2fe;">${kc.stride_ratio_pct}%</div>
                <div style="font-size: 0.72rem; color: #cbd5e1;">${kc.stride_length_m} m</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">디딤발 무릎 신전각</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.45rem; font-weight: 800; color: #ffd166;">${kc.lead_knee_extension_deg > 0 ? '+' : ''}${kc.lead_knee_extension_deg}°</div>
                <div style="font-size: 0.72rem; color: #cbd5e1;">${kc.knee_block_rating}</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">손목 피크 선속도</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #ffffff;">${spd.wrist_speed_kmh} <span style="font-size: 0.75rem;">km/h</span></div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">릴리즈 Arm Slot 각도</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #ff4d6d;">${arm.arm_slot_side_deg}°</div>
              </div>

              <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 2px;">홈 방향성 효율</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 700; color: #4ade80;">${spd.directional_efficiency_pct}%</div>
              </div>

            </div>
          </div>

          <!-- Right Column: Radar Chart & Elite Comparison Table -->
          <div>
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px; margin-bottom: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="font-size: 0.9rem; font-weight: 700; color: #38bdf8;">📊 메카닉스 종합 점수</div>
                <div style="font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 800; color: #38bdf8;">${comp.radar_scores.overall_score} <span style="font-size: 0.8rem; color: #94a3b8;">/ 100</span></div>
              </div>
              <div style="text-align: center; height: 180px;">
                <img src="${radarImg}" style="height: 100%; width: auto; object-fit: contain;">
              </div>
            </div>

            <!-- Comparison Table -->
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px;">
              <div style="font-size: 0.85rem; font-weight: 700; color: #ffffff; margin-bottom: 8px;">⚔️ 엘리트(OBP 93.1mph) 1:1 비교</div>
              <table style="width: 100%; border-collapse: collapse; font-size: 0.72rem;">
                <thead>
                  <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.15); color: #94a3b8; text-align: left;">
                    <th style="padding: 4px 6px;">지표</th>
                    <th style="padding: 4px 6px;">사용자</th>
                    <th style="padding: 4px 6px;">엘리트</th>
                    <th style="padding: 4px 6px; text-align: center;">진단</th>
                  </tr>
                </thead>
                <tbody>
                  ${comp.metric_comparison.map(m => `
                    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                      <td style="padding: 5px 6px; color: #e2e8f0; font-weight: 600;">${m.metric_name}</td>
                      <td style="padding: 5px 6px; color: #38bdf8; font-weight: 700;">${m.user_val}</td>
                      <td style="padding: 5px 6px; color: #ffd166;">${m.elite_val}</td>
                      <td style="padding: 5px 6px; text-align: center;"><span style="font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 600;">${m.status}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Coaching Advice & Targeted Drills -->
        <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 0.95rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 6px;">
              <span>💡</span> 맞춤형 구속 향상 처방 & 추천 훈련 드릴
            </div>
            <div style="font-size: 0.8rem; font-weight: 700; color: #ffd166; background: rgba(255, 209, 102, 0.15); padding: 3px 10px; border-radius: 12px;">
              예상 잠재 상승: +${comp.potential_gain.gain_kmh} km/h (목표 ${comp.potential_gain.target_speed_kmh} km/h)
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(${Math.min(2, comp.coaching_items.length)}, 1fr); gap: 12px;">
            ${comp.coaching_items.slice(0, 2).map(c => `
              <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 10px; font-size: 0.75rem;">
                <div style="display: flex; justify-content: space-between; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">
                  <span>${c.title}</span>
                  <span style="color: #4ade80;">${c.gain_est}</span>
                </div>
                <div style="color: #cbd5e1; margin-bottom: 3px; line-height: 1.35;"><strong>원인:</strong> ${c.problem}</div>
                <div style="color: #e2e8f0; margin-bottom: 6px; line-height: 1.35;"><strong>처방:</strong> ${c.solution}</div>
                <div style="background: rgba(15, 23, 42, 0.8); border: 1px dashed rgba(56, 189, 248, 0.35); border-radius: 4px; padding: 6px;">
                  <div style="color: #ffd166; font-weight: 700; font-size: 0.72rem;">🎯 추천 드릴: ${c.drill.name}</div>
                  <div style="color: #94a3b8; font-size: 0.68rem;">${c.drill.guide}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Footer Notice -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 10px; font-size: 0.68rem; color: #64748b;">
          <div>* 본 보고서는 브라우저에서 직접 생성된 사용자 보관용 문서이며 서버에 저장되지 않습니다.</div>
          <div>Pitching Analysis 2.0 | Sports Biomechanics Engine</div>
        </div>
      `;

      document.body.appendChild(reportDiv);

      // Render with html2canvas
      const canvas = await window.html2canvas(reportDiv, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0b1120',
        logging: false
      });

      document.body.removeChild(reportDiv);

      // Create jsPDF instance
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, Math.min(pdfHeight, imgHeight));
      
      const fileNameDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const downloadFileName = `Pitching_Analysis_Report_${fileNameDate}.pdf`;
      pdf.save(downloadFileName);

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert(`PDF 보고서 생성 중 오류가 발생했습니다: ${err.message}`);
    } finally {
      btnExportPdf.disabled = false;
      btnExportPdf.innerHTML = origBtnText;
    }
  }

  if (btnExportPdf) {
    btnExportPdf.addEventListener('click', generatePdfSummaryReport);
  }

  // Ready state: Wait for user video upload
});


