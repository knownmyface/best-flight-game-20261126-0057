// Canyon Thread v2 — the HUD.
// Every instrument a pilot needs, lit and readable at a glance: altitude,
// speed and heading across the bottom, fuel and hull bars, a top-down radar,
// an attitude ball, and markers that point at the next ring and every drone
// — even the ones behind you. If it matters in the air, it is on the glass.

import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Hud {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.radar = this.$('radar');
    this.rctx = this.radar.getContext('2d');
    this.att = this.$('attitude');
    this.actx = this.att.getContext('2d');
    this.markers = this.$('markers');
    this.msgEl = this.$('msg');
    this.msgT = 0;
    this.pool = [];
    this.lastBuffHtml = '';
  }

  message(text, secs = 2.2, sub = '') {
    this.msgEl.innerHTML = sub ? `${text}<div class="sub">${sub}</div>` : text;
    this.msgEl.style.opacity = '1';
    this.msgT = secs;
  }

  // s: snapshot { flight, sortie, rings, drones, wind, camera, target }
  update(dt, s) {
    const f = s.flight;
    const fwd = f.forward();
    const hdg = (Math.atan2(fwd.x, -fwd.z) * 57.2958 + 360) % 360;
    const vs = Math.round(fwd.y * f.speed);

    this.$('alt').textContent = Math.round(f.pos.y);
    this.$('spd').textContent = Math.round(f.speed * 1.94); // knots
    this.$('hdg').textContent = String(Math.round(hdg)).padStart(3, '0');
    this.$('vs').textContent = (vs >= 0 ? '+' : '') + vs;
    this.$('thr').style.width = `${Math.round((f.speed / (f.jet.top * 1.32)) * 100)}%`;
    this.$('fuel').style.width = `${Math.max(0, (f.fuel / f.maxFuel) * 100)}%`;
    this.$('fuelTxt').textContent = `${Math.ceil(f.fuel)}`;
    this.$('hull').style.width = `${Math.max(0, (f.hp / f.maxHp) * 100)}%`;
    this.$('hullTxt').textContent = `${Math.ceil(f.hp)}`;
    this.$('score').textContent = s.sortie.score;
    this.$('rings').textContent = `${s.sortie.rings}/${s.rings.total}`;
    this.$('drones').textContent = `${s.sortie.drones}/${s.drones.total}`;
    this.$('clock').textContent = s.sortie.mission.timeLimit
      ? `${Math.ceil(s.sortie.timeLeft)}s`
      : `${String(Math.floor(s.sortie.time / 60)).padStart(2, '0')}:${String(Math.floor(s.sortie.time % 60)).padStart(2, '0')}`;
    this.$('wind').textContent = `${s.wind.knots()} kt`;
    this.$('jetName').textContent = f.jet.name;
    this.$('missionName').textContent = s.sortie.mission.name;
    this.$('bank').textContent = `BANK ${Math.round(-f.roll * 57.2958)}°`;

    const next = s.rings.current();
    if (next) {
      const d = Math.round(Math.hypot(next.x - f.pos.x, next.y - f.pos.y, next.z - f.pos.z));
      this.$('nextDist').textContent = `NEXT RING ${d} m`;
    } else {
      this.$('nextDist').textContent = s.sortie.mission.landing ? 'LAND ON THE STRIP' : 'COURSE CLEAR';
    }

    // Stall + pull-up warnings, flashing at two beats a second.
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    this.$('stall').style.display = f.stalled && f.alive ? 'block' : 'none';
    const clearance = f.pos.y - s.heightAt(f.pos.x, f.pos.z);
    const pullUp = f.alive && clearance < 42;
    const pullEl = this.$('pullup');
    pullEl.style.display = pullUp ? 'block' : 'none';
    if (pullUp) pullEl.style.opacity = blink ? '1' : '0.3';
    this.$('fuelWarn').style.display = f.fuel < 22 && f.alive ? 'block' : 'none';

    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) this.msgEl.style.opacity = '0';
    }

    this.drawAttitude(f);
    this.drawRadar(f, s);
    this.drawMarkers(f, s);
  }

  // Attitude ball: a horizon line that rolls with the bank and slides with pitch.
  drawAttitude(f) {
    const c = this.actx;
    const W = this.att.width;
    const H = this.att.height;
    const cx = W / 2;
    const cy = H / 2;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.arc(cx, cy, 44, 0, 6.283);
    c.clip();
    const fwd = f.forward();
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    c.translate(cx, cy);
    c.rotate(f.roll);
    c.translate(0, pitch * 57.2958 * 1.1);
    c.fillStyle = '#2e5f9e';
    c.fillRect(-60, -60, 120, 60);
    c.fillStyle = '#c98a4b';
    c.fillRect(-60, 0, 120, 60);
    c.strokeStyle = '#f2f0e4';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-60, 0);
    c.lineTo(60, 0);
    c.stroke();
    c.restore();
    // Fixed wings: the aircraft symbol never moves, the world does.
    c.strokeStyle = '#ffd75e';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx - 26, cy);
    c.lineTo(cx - 8, cy);
    c.moveTo(cx + 8, cy);
    c.lineTo(cx + 26, cy);
    c.moveTo(cx, cy - 4);
    c.lineTo(cx, cy + 4);
    c.stroke();
    c.strokeStyle = 'rgba(242,240,228,.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, 44, 0, 6.283);
    c.stroke();
  }

  // Top-down radar: nose up, rings teal, drones red, runway white.
  drawRadar(f, s) {
    const c = this.rctx;
    const W = this.radar.width;
    const R = W / 2;
    const range = 2400;
    c.clearRect(0, 0, W, W);
    c.strokeStyle = 'rgba(120,230,190,.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(R, R, R - 2, 0, 6.283);
    c.stroke();
    c.beginPath();
    c.arc(R, R, (R - 2) / 2, 0, 6.283);
    c.stroke();
    const fwd = f.forward();
    const yaw = Math.atan2(fwd.x, -fwd.z);
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);
    const toRadar = (p) => {
      const dx = p.x - f.pos.x;
      const dz = p.z - f.pos.z;
      let px = ((dx * cos - dz * sin) / range) * (R - 5);
      let py = ((dx * sin + dz * cos) / range) * (R - 5);
      const d = Math.hypot(px, py);
      if (d > R - 5) {
        px = (px / d) * (R - 5);
        py = (py / d) * (R - 5);
      }
      return [R + px, R + py];
    };
    // Runway strip.
    const rw = s.runway;
    const [rx, ry] = toRadar({ x: rw.x, z: rw.z });
    c.fillStyle = '#f2f0e4';
    c.fillRect(rx - 3, ry - 8, 6, 16);
    // Rings: filled for the next one, hollow for the rest.
    s.rings.rings.forEach((r, i) => {
      if (r.done) return;
      const [x, y] = toRadar(r.station);
      c.fillStyle = i === s.rings.next ? '#2affd5' : 'rgba(42,255,213,.45)';
      c.beginPath();
      c.arc(x, y, i === s.rings.next ? 4 : 2.5, 0, 6.283);
      c.fill();
    });
    // Drones: red dots.
    for (const d of s.drones.drones) {
      if (!d.alive) continue;
      const [x, y] = toRadar(d.body.position);
      c.fillStyle = '#ff3b3b';
      c.beginPath();
      c.arc(x, y, 3, 0, 6.283);
      c.fill();
    }
    // Self: a cyan triangle, nose up.
    c.fillStyle = '#9fe8ff';
    c.beginPath();
    c.moveTo(R, R - 7);
    c.lineTo(R - 5, R + 6);
    c.lineTo(R + 5, R + 6);
    c.closePath();
    c.fill();
  }

  // Project a world point to screen pixels; null when behind the camera.
  project(p, camera) {
    _v.copy(p).project(camera);
    if (_v.z > 1) return null;
    return {
      x: (_v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  // On-screen diamond for the next ring, edge arrows for everything off-screen.
  drawMarkers(f, s) {
    const targets = [];
    const next = s.rings.current();
    if (next) targets.push({ p: new THREE.Vector3(next.x, next.y, next.z), kind: 'ring', main: true });
    for (const d of s.drones.drones) {
      if (d.alive) targets.push({ p: d.body.position.clone(), kind: 'drone', main: false });
    }
    while (this.pool.length < targets.length) {
      const el = document.createElement('div');
      el.className = 'marker';
      this.markers.appendChild(el);
      this.pool.push(el);
    }
    for (let i = targets.length; i < this.pool.length; i++) this.pool[i].style.display = 'none';
    const W = window.innerWidth;
    const H = window.innerHeight;
    const pad = 44;
    targets.forEach((t, i) => {
      const el = this.pool[i];
      const scr = this.project(t.p, s.camera);
      el.style.display = 'block';
      el.className = `marker ${t.kind}${t.main ? ' main' : ''}`;
      if (!scr) {
        // Behind the camera: point at the screen edge in its direction.
        el.classList.add('edge');
        el.style.left = `${W / 2}px`;
        el.style.top = `${pad}px`;
        el.style.transform = 'translate(-50%,-50%) rotate(180deg)';
        return;
      }
      const off = scr.x < pad || scr.x > W - pad || scr.y < pad || scr.y > H - pad;
      if (off) {
        const cx = W / 2;
        const cy = H / 2;
        let dx = scr.x - cx;
        let dy = scr.y - cy;
        const m = Math.max(Math.abs(dx) / (W / 2 - pad), Math.abs(dy) / (H / 2 - pad)) || 1;
        dx /= m;
        dy /= m;
        el.classList.add('edge');
        el.style.left = `${cx + dx}px`;
        el.style.top = `${cy + dy}px`;
        el.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(dy, dx)}rad)`;
      } else {
        el.classList.remove('edge');
        el.style.left = `${scr.x}px`;
        el.style.top = `${scr.y}px`;
        el.style.transform = 'translate(-50%,-50%)';
      }
    });
  }
}
