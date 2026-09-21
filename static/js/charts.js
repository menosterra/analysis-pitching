/**
 * Pitching Charts & Visualization for App_pitching
 * Renders Radar Comparison and Foot Plant (FP, t=0.00s) Aligned Kinetic Charts
 * with Leg Lift (PKH), Foot Plant (FP), and Ball Release (BR) Event Markers.
 * Aligned with OBP High Slot Benchmark Standards.
 */

// Helper to find index in labels array closest to target value
function findClosestLabelIndex(labels, targetVal) {
  if (!labels || labels.length === 0) return -1;
  let minDiff = 999;
  let bestIdx = -1;
  for (let i = 0; i < labels.length; i++) {
    const val = parseFloat(String(labels[i]).replace('s', '').replace('+', ''));
    if (!isNaN(val) && Math.abs(val - targetVal) < minDiff) {
      minDiff = Math.abs(val - targetVal);
      bestIdx = i;
    }
  }
  return bestIdx;
}

// 1. Custom Plugin: Draw vertical reference lines for Leg Lift (LL), Foot Plant (FP), and Ball Release (BR)
const pitchEventsReferenceLinesPlugin = {
  id: 'pitchEventsReferenceLines',
  afterDatasetsDraw: (chart) => {
    const { ctx, chartArea: { top, bottom, left, right }, scales: { x } } = chart;
    const labels = chart.data.labels || [];
    if (labels.length === 0) return;

    const eventsRel = chart.config.options?._eventsRelTimes || { pkh: -0.69, fp: 0.00, br: 0.162 };

    // 1. Elite Reference Lines (Dashed, No Text Badges) - Elite Setup (-0.69s) & Elite Release (+0.162s)
    const eliteDashedLines = [
      {
        targetT: -0.69,
        lineColor: 'rgba(0, 242, 254, 0.45)',
        lineWidth: 1.5,
        lineDash: [4, 4]
      },
      {
        targetT: 0.162,
        lineColor: 'rgba(255, 77, 109, 0.45)',
        lineWidth: 1.5,
        lineDash: [4, 4]
      }
    ];

    eliteDashedLines.forEach(ev => {
      const idx = findClosestLabelIndex(labels, ev.targetT);
      if (idx !== -1) {
        const lineX = x.getPixelForValue(idx);
        if (lineX >= left - 5 && lineX <= right + 5) {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = ev.lineColor;
          ctx.lineWidth = ev.lineWidth;
          ctx.setLineDash(ev.lineDash);
          ctx.moveTo(lineX, top);
          ctx.lineTo(lineX, bottom);
          ctx.stroke();
          ctx.restore();
        }
      }
    });

    // 2. User Event Reference Lines (Solid lines with clean LL, FP, BR Badges - Thin & Sleek)
    const userEvents = [
      {
        targetT: eventsRel.pkh ?? -0.69,
        label: 'LL',
        lineColor: 'rgba(0, 242, 254, 0.9)',
        badgeBg: 'rgba(10, 20, 32, 0.94)',
        badgeBorder: '#00f2fe',
        badgeText: '#00f2fe',
        lineWidth: 1.0,
        lineDash: [],
        badgeW: 32,
        badgeH: 17
      },
      {
        targetT: 0.00,
        label: 'FP',
        lineColor: 'rgba(255, 209, 102, 0.9)',
        badgeBg: 'rgba(18, 15, 8, 0.94)',
        badgeBorder: '#ffd166',
        badgeText: '#ffd166',
        lineWidth: 1.0,
        lineDash: [],
        badgeW: 32,
        badgeH: 17
      },
      {
        targetT: eventsRel.br ?? 0.162,
        label: 'BR',
        lineColor: 'rgba(255, 77, 109, 0.9)',
        badgeBg: 'rgba(24, 10, 18, 0.94)',
        badgeBorder: '#ff4d6d',
        badgeText: '#ff4d6d',
        lineWidth: 1.0,
        lineDash: [],
        badgeW: 32,
        badgeH: 17
      }
    ];

    userEvents.forEach(ev => {
      const idx = findClosestLabelIndex(labels, ev.targetT);
      if (idx !== -1) {
        const lineX = x.getPixelForValue(idx);
        if (lineX >= left - 5 && lineX <= right + 5) {
          ctx.save();

          // Draw Thin Solid Line
          ctx.beginPath();
          ctx.strokeStyle = ev.lineColor;
          ctx.lineWidth = ev.lineWidth;
          ctx.setLineDash(ev.lineDash);
          ctx.moveTo(lineX, top);
          ctx.lineTo(lineX, bottom);
          ctx.stroke();

          // Draw Top Event Badge
          ctx.shadowBlur = 0;
          const badgeX = Math.max(left + 2, Math.min(right - ev.badgeW - 2, lineX - ev.badgeW / 2));
          const badgeY = top + 3;

          ctx.fillStyle = ev.badgeBg;
          ctx.strokeStyle = ev.badgeBorder;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, ev.badgeW, ev.badgeH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = ev.badgeText;
          ctx.font = 'bold 10px Outfit, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ev.label, badgeX + ev.badgeW / 2, badgeY + ev.badgeH / 2);

          ctx.restore();
        }
      }
    });
  }
};

// 2. Custom Plugin: Draw horizontal 0-degree baseline with explicit label (3B closed / Leg lift setup reference)
const zeroDegreeHorizontalLinePlugin = {
  id: 'zeroDegreeHorizontalLine',
  afterDatasetsDraw: (chart) => {
    const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
    if (!y) return;

    const yZeroPx = y.getPixelForValue(0);
    if (yZeroPx >= top && yZeroPx <= bottom) {
      ctx.save();

      // Horizontal reference line at 0°
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(left, yZeroPx);
      ctx.lineTo(right, yZeroPx);
      ctx.stroke();

      // Right tag: 0° (3루 닫힘/Leg Lift 기준)
      ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
      ctx.font = '600 8.5px Outfit, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('0° (3루 닫힘 / Leg Lift 셋업 기준)', right - 4, yZeroPx - 2);

      ctx.restore();
    }
  }
};

class PitchChartsManager {
  constructor() {
    this.radarChart = null;
    this.rotationChart = null;
    this.wristSpeedChart = null;
  }

  initRadarChart(canvasId, radarScores) {
    const existing = Chart.getChart(canvasId);
    if (existing) {
      existing.destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');

    const dataLabels = [
      '팔 회전 레버',
      '디딤발 블로킹',
      '방향성 효율',
      '스트라이드',
      '체간 틸트'
    ];

    const userValues = [
      radarScores.arm_lever_radius || 70,
      radarScores.lead_knee_block || 65,
      radarScores.directional_efficiency || 75,
      radarScores.stride_momentum || 80,
      radarScores.trunk_extension || 70
    ];

    const eliteValues = [95, 96, 94, 90, 92];

    this.radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: dataLabels,
        datasets: [
          {
            label: '사용자',
            data: userValues,
            backgroundColor: 'rgba(0, 242, 254, 0.25)',
            borderColor: '#00f2fe',
            borderWidth: 2.5,
            pointBackgroundColor: '#00f2fe',
            pointBorderColor: '#ffffff',
            pointRadius: 4
          },
          {
            label: '엘리트 (N=105)',
            data: eliteValues,
            backgroundColor: 'rgba(255, 209, 102, 0.15)',
            borderColor: '#ffd166',
            borderWidth: 2,
            borderDash: [4, 4],
            pointBackgroundColor: '#ffd166',
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            pointLabels: {
              color: '#94a3b8',
              font: { family: 'Outfit, sans-serif', size: 10.5, weight: '600' }
            },
            ticks: {
              display: false,
              min: 0,
              max: 100,
              stepSize: 20
            }
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true,
              pointStyle: 'line',
              pointStyleWidth: 18,
              boxWidth: 18,
              color: '#e2e8f0',
              font: { family: 'Inter', size: 11, weight: '600' }
            }
          }
        }
      }
    });
  }

  // Unified 2D Kinetic Chain & Knee Block Chart (Dual-Y Axis: Wrist Velocity & Lead Knee Angle)
  initUnifiedKineticChart(canvasId, fpComparison) {
    const existing = Chart.getChart(canvasId);
    if (existing) {
      existing.destroy();
    }

    const canvasElem = document.getElementById(canvasId);
    if (!canvasElem) return;
    const ctx = canvasElem.getContext('2d');

    const relTimes = fpComparison.rel_times || [];
    const labels = relTimes.map(t => (t > 0 ? `+${t.toFixed(2)}s` : `${t.toFixed(2)}s`));

    const userSpd = fpComparison.user_wrist_speed || [];
    const eliteSpd = fpComparison.elite_wrist_speed || [];
    const userKnee = fpComparison.user_lead_knee || [];
    const eliteKnee = fpComparison.elite_lead_knee || [];

    // Left Y-axis (Wrist Speed, km/h) max bound
    const allSpeeds = [...userSpd, ...eliteSpd].filter(v => v !== null && !isNaN(v));
    let yMaxSpeed = 90;
    if (allSpeeds.length > 0) {
      const maxDataSpeed = Math.max(...allSpeeds);
      yMaxSpeed = Math.max(90, Math.ceil((maxDataSpeed + 10) / 10) * 10);
    }

    // Right Y-axis (Lead Knee Angle, deg) bounds
    const allKnees = [...userKnee, ...eliteKnee].filter(v => v !== null && !isNaN(v));
    let yMinKnee = 60;
    let yMaxKnee = 180;
    if (allKnees.length > 0) {
      const minK = Math.min(...allKnees);
      const maxK = Math.max(...allKnees);
      if (minK < 60) yMinKnee = Math.max(0, Math.floor((minK - 10) / 20) * 20);
      if (maxK > 175) yMaxKnee = Math.max(180, Math.ceil((maxK + 10) / 20) * 20);
    }

    this.unifiedChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          // 1. User Wrist Velocity (Left Axis)
          {
            label: '손목 속도',
            data: userSpd,
            yAxisID: 'yWrist',
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.12)',
            borderWidth: 2.8,
            fill: true,
            tension: 0.3,
            pointRadius: 0
          },
          // 2. Elite Wrist Velocity (Left Axis)
          {
            label: '엘리트 손목 속도',
            data: eliteSpd,
            yAxisID: 'yWrist',
            borderColor: '#c084fc',
            borderWidth: 2.2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0
          },
          // 3. User Lead Knee Angle (Right Axis)
          {
            label: '디딤발 무릎 각도',
            data: userKnee,
            yAxisID: 'yKnee',
            borderColor: '#00f2fe',
            borderWidth: 2.8,
            fill: false,
            tension: 0.3,
            pointRadius: 0
          },
          // 4. Elite Lead Knee Angle (Right Axis)
          {
            label: '엘리트 디딤발 무릎',
            data: eliteKnee,
            yAxisID: 'yKnee',
            borderColor: '#00f2fe',
            borderWidth: 2.2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 0
          }
        ]
      },
      plugins: [pitchEventsReferenceLinesPlugin],
      options: {
        _eventsRelTimes: fpComparison.events_rel_times || { pkh: -0.69, fp: 0.00, br: 0.162 },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { family: 'JetBrains Mono', size: 10 },
              maxTicksLimit: 11,
              callback: function(val, index) {
                return labels[index];
              }
            },
            title: { display: true, text: '디딤발 착지(FP) 기준 상대 시간 (s)', color: '#94a3b8', font: { size: 10.5, weight: '600' } }
          },
          yWrist: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: yMaxSpeed,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#c084fc',
              font: { family: 'JetBrains Mono', size: 10 },
              stepSize: 20,
              callback: (val) => `${val}`
            },
            title: { display: true, text: '손목 선속도 (km/h)', color: '#c084fc', font: { size: 10.5, weight: '700' } }
          },
          yKnee: {
            type: 'linear',
            position: 'right',
            min: yMinKnee,
            max: yMaxKnee,
            grid: { display: false },
            ticks: {
              color: '#00f2fe',
              font: { family: 'JetBrains Mono', size: 10 },
              stepSize: 20,
              callback: (val) => `${val}`
            },
            title: { display: true, text: '디딤발 무릎 각도 (°)', color: '#00f2fe', font: { size: 10.5, weight: '700' } }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'line',
              pointStyleWidth: 20,
              boxWidth: 20,
              color: '#e2e8f0',
              font: { family: 'Inter', size: 11, weight: '600' },
              padding: 14,
              filter: (legendItem) => {
                return legendItem.datasetIndex === 0 || legendItem.datasetIndex === 2;
              }
            }
          },
          tooltip: {
            callbacks: {
              title: (items) => `시간: ${items[0].label} (착지 FP = 0.00s)`
            }
          }
        }
      }
    });
  }
}

window.PitchChartsManager = PitchChartsManager;

