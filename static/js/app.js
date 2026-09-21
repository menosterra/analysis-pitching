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

  // 1. Trigger Pitch Analysis
  async function runAnalysis(fileObj = null, sampleId = 'sample_1') {
    loadingOverlay.classList.add('active');
    
    const formData = new FormData();
    if (fileObj) {
      formData.append('video', fileObj);
    } else {
      formData.append('sample_id', sampleId);
    }
    formData.append('pitcher_height_cm', inputHeight?.value || '178');
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

      // Load Video into Player
      videoEl.src = result.video_info.video_url;
      videoEl.load();

      videoEl.onloadedmetadata = () => {
        canvasEl.width = videoEl.videoWidth || 1280;
        canvasEl.height = videoEl.videoHeight || 720;
        scrubber.max = videoEl.duration;
        scrubber.value = 0;
        renderer.resize(canvasEl.width, canvasEl.height);
        
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

  // Analyze Trigger (Runs ONLY when "투구 모션 분석 실행" button is clicked)
  btnAnalyze.addEventListener('click', () => {
    const file = fileUpload.files[0];
    if (file) {
      runAnalysis(file, null);
    } else {
      runAnalysis(null, 'sample_1');
    }
  });

  // Initialize with initial analysis on page load
  runAnalysis(null, 'sample_1');
});
