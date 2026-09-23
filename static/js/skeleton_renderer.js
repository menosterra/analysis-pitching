/**
 * Skeleton & Arc Overlay Renderer for App_pitching
 * Renders user 2D skeleton, arm swing rotation trajectory arc, and joint markers.
 */

class PitchSkeletonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Display options
    this.showUserSkeleton = true;
    this.showTrajectory = true;
    this.showJointAngles = true;

    // Cache datasets
    this.userFrames = [];
    this.events = null;
    this.wristTrajectory = [];

    // MediaPipe 2D Pose Connections for User
    this.userConnections = [
      [11, 12], [11, 23], [12, 24], [23, 24], // Torso
      [11, 13], [13, 15],                      // Left Arm
      [12, 14], [14, 16],                      // Right Arm
      [23, 25], [25, 27],                      // Left Leg
      [24, 26], [26, 28]                       // Right Leg
    ];

    // Colors
    this.colors = {
      userJoint: '#00f2fe',
      userBone: 'rgba(0, 242, 254, 0.85)',
      userThrowArm: '#ff4d6d',
      arcLine: 'rgba(255, 77, 109, 0.75)',
      angleText: '#ffffff'
    };
  }

  setData(userFrames, events) {
    this.userFrames = userFrames || [];
    this.events = events || null;

    // Pre-calculate user wrist 2D trajectory
    this.wristTrajectory = [];
    for (const f of this.userFrames) {
      const wr = f.joints_px[16] || f.joints_px[15];
      if (wr) {
        this.wristTrajectory.push({ x: wr.x, y: wr.y, t: f.t });
      }
    }
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  findFrameAtTime(currentTime) {
    if (!this.userFrames || this.userFrames.length === 0) return null;
    let closest = this.userFrames[0];
    let minDiff = Math.abs(closest.t - currentTime);

    for (let i = 1; i < this.userFrames.length; i++) {
      const diff = Math.abs(this.userFrames[i].t - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = this.userFrames[i];
      }
    }
    return closest;
  }

  render(currentTime) {
    this.clear();
    this.renderToContext(this.ctx, currentTime);
  }

  renderToContext(targetCtx, currentTime) {
    if (!targetCtx) return;
    const currentFrame = this.findFrameAtTime(currentTime);
    if (!currentFrame) return;

    // 1. Draw Arm Swing Trajectory Arc
    if (this.showTrajectory && this.wristTrajectory.length > 2) {
      this.drawTrajectoryArc(currentTime, targetCtx);
    }

    // 2. Draw User 2D Skeleton
    if (this.showUserSkeleton) {
      this.drawUserSkeleton(currentFrame, targetCtx);
    }

    // 3. Draw Joint Metrics HUD
    if (this.showJointAngles) {
      this.drawJointMetricsHUD(currentFrame, targetCtx);
    }
  }

  drawTrajectoryArc(currentTime, ctx = this.ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([6, 5]);
    ctx.shadowColor = 'rgba(255, 51, 102, 0.9)';
    ctx.shadowBlur = 10;

    let started = false;
    for (const pt of this.wristTrajectory) {
      if (pt.t <= currentTime + 0.05) {
        if (!started) {
          ctx.moveTo(pt.x, pt.y);
          started = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawUserSkeleton(frame, ctx = this.ctx) {
    const j = frame.joints_px;
    if (!j) return;

    ctx.save();

    // Draw Bones
    for (const [idx1, idx2] of this.userConnections) {
      const p1 = j[idx1];
      const p2 = j[idx2];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);

        // Highlight throwing arm
        if ((idx1 === 12 && idx2 === 14) || (idx1 === 14 && idx2 === 16)) {
          ctx.strokeStyle = this.colors.userThrowArm;
          ctx.lineWidth = 4.5;
          ctx.shadowColor = 'rgba(255, 77, 109, 0.8)';
          ctx.shadowBlur = 8;
        } else {
          ctx.strokeStyle = this.colors.userBone;
          ctx.lineWidth = 3;
          ctx.shadowColor = 'rgba(0, 242, 254, 0.5)';
          ctx.shadowBlur = 6;
        }
        ctx.stroke();
      }
    }

    // Draw Joint Points
    for (const [idxStr, pt] of Object.entries(j)) {
      const idx = parseInt(idxStr);
      if (idx > 28 && idx < 33) continue;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, idx === 16 || idx === 14 ? 6 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = idx === 16 ? '#ff4d6d' : this.colors.userJoint;
      ctx.shadowColor = this.colors.userJoint;
      ctx.shadowBlur = 8;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawJointMetricsHUD(frame, ctx = this.ctx) {
    const j = frame.joints_px;
    if (!j) return;

    ctx.save();
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.fillStyle = this.colors.angleText;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    if (j[25]) {
      ctx.fillText('디딤발 무릎', j[25].x + 10, j[25].y - 5);
    }

    if (j[16]) {
      ctx.fillStyle = '#ff4d6d';
      ctx.fillText('손목 / 릴리즈', j[16].x + 10, j[16].y - 8);
    }

    ctx.restore();
  }
}

window.PitchSkeletonRenderer = PitchSkeletonRenderer;
