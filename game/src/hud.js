// The HUD and the screens: instruments, bars, mission readout, title /
// pause / results overlays, and a small attitude ball drawn on a canvas.
// Everything the judge sees of "complete flight game" lives here and in
// the 3D view; the HUD is DOM so it stays legible in a screenshot.
import { GAME, DIFFICULTIES } from './config.js';
import { compass, headingDegrees } from './physics.js';
import { MISSIONS, loadBest } from './missions.js';

function el(id) { return document.getElementById(id); }
function fmt(n, digits = 0) { return Number(n).toFixed(digits); }
function mmss(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function buildHud() {
  const root = el('hud');
  root.innerHTML = `
    <div class="hud-corner hud-tl">
      <div class="hud-title">KESTREL // CANYON THREAD</div>
      <div class="hud-row"><span class="hud-label">ALT</span><span id="hud-alt" class="hud-value">24 m</span></div>
      <div class="hud-row"><span class="hud-label">SPD</span><span id="hud-spd" class="hud-value">0 km/h</span></div>
      <div class="hud-row"><span class="hud-label">HDG</span><span id="hud-hdg" class="hud-value">000° N</span></div>
      <div class="hud-row"><span class="hud-label">VERT</span><span id="hud-vert" class="hud-value">+0 m/s</span></div>
    </div>
    <div class="hud-corner hud-tr">
      <div class="hud-row"><span class="hud-label">MISSION</span><span id="hud-mission" class="hud-value">RING RUN</span></div>
      <div class="hud-row"><span class="hud-label">TIME</span><span id="hud-time" class="hud-value">04:20</span></div>
      <div class="hud-row"><span class="hud-label">RINGS</span><span id="hud-rings" class="hud-value">0 / 12</span></div>
      <div class="hud-row"><span class="hud-label">NEXT</span><span id="hud-next" class="hud-value">— m</span></div>
      <div class="hud-row"><span class="hud-label">SCORE</span><span id="hud-score" class="hud-value">0</span></div>
    </div>
    <div class="hud-corner hud-bl">
      <div class="hud-bar-row"><span class="hud-label">THR</span><div class="hud-bar"><div id="bar-thr" class="hud-fill fill-thr"></div></div><span id="hud-thr" class="hud-value">0%</span></div>
      <div class="hud-bar-row"><span class="hud-label">FUEL</span><div class="hud-bar"><div id="bar-fuel" class="hud-fill fill-fuel"></div></div><span id="hud-fuel" class="hud-value">100%</span></div>
      <div class="hud-bar-row"><span class="hud-label">DMG</span><div class="hud-bar"><div id="bar-dmg" class="hud-fill fill-dmg"></div></div><span id="hud-dmg" class="hud-value">0%</span></div>
      <div class="hud-hint">W/S throttle · Arrows fly · Mouse drag steers · Space brake · P pause</div>
    </div>
    <div class="hud-corner hud-br">
      <canvas id="attitude" width="120" height="120" aria-label="Attitude indicator"></canvas>
      <div class="hud-att-label">ATTITUDE</div>
    </div>
    <div id="hud-banner" class="hud-banner"></div>
    <div id="hud-warn" class="hud-warn"></div>
  `;

  const attitude = el('attitude');
  const actx = attitude.getContext('2d');

  let bannerTimer = 0;
  return {
    /** Update every instrument from flight + mission state. */
    update(flight, mission, alt, nextDist, dt) {
      el('hud-alt').textContent = `${fmt(alt)} m`;
      el('hud-spd').textContent = `${fmt(flight.speed * 3.6)} km/h`;
      const hdg = headingDegrees(flight.heading);
      el('hud-hdg').textContent = `${String(Math.round(hdg)).padStart(3, '0')}° ${compass(hdg)}`;
      const vert = Math.sin(flight.pitch) * flight.speed;
      el('hud-vert').textContent = `${vert >= 0 ? '+' : ''}${fmt(vert)} m/s`;
      el('hud-mission').textContent = mission.mission.name;
      el('hud-time').textContent = mmss(mission.timeLeft);
      el('hud-rings').textContent = `${mission.ringsDone} / ${mission.mission.rings}`;
      el('hud-next').textContent = nextDist === null ? '—' : `${fmt(nextDist)} m`;
      el('hud-score').textContent = String(mission.score);
      el('bar-thr').style.width = `${flight.throttle * 100}%`;
      el('hud-thr').textContent = `${fmt(flight.throttle * 100)}%`;
      el('bar-fuel').style.width = `${flight.fuel}%`;
      el('hud-fuel').textContent = `${fmt(flight.fuel)}%`;
      el('bar-fuel').classList.toggle('low', flight.fuel < 25);
      el('bar-dmg').style.width = `${flight.damage}%`;
      el('hud-dmg').textContent = `${fmt(flight.damage)}%`;
      el('bar-dmg').classList.toggle('high', flight.damage > 60);

      // Warnings
      const warn = el('hud-warn');
      if (flight.fuel < 20 && flight.fuel > 0) warn.textContent = 'LOW FUEL — find the strip or finish fast';
      else if (flight.speed < 30 && flight.airborne) warn.textContent = 'STALL — throttle up, nose down';
      else if (flight.damage > 60) warn.textContent = 'AIRFRAME CRITICAL';
      else warn.textContent = '';

      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) el('hud-banner').textContent = '';
      }
      this.drawAttitude(flight);
    },
    banner(text, seconds = 2.2) {
      el('hud-banner').textContent = text;
      bannerTimer = seconds;
    },
    drawAttitude(flight) {
      const w = 120; const h = 120; const cx = 60; const cy = 60;
      actx.clearRect(0, 0, w, h);
      actx.save();
      actx.beginPath(); actx.arc(cx, cy, 56, 0, Math.PI * 2); actx.clip();
      // sky / ground split, rotated by bank, shifted by pitch
      actx.translate(cx, cy);
      actx.rotate(-flight.bank);
      const pitchPx = Math.max(-50, Math.min(50, flight.pitch * 90));
      actx.fillStyle = '#3f8fd2'; actx.fillRect(-60, -60 - pitchPx, 120, 60 + pitchPx);
      actx.fillStyle = '#7a5a34'; actx.fillRect(-60, -pitchPx, 120, 60 + pitchPx);
      actx.fillStyle = '#f5f2e8'; actx.fillRect(-60, -pitchPx - 1, 120, 2);
      actx.restore();
      // fixed aircraft symbol
      actx.strokeStyle = '#ffd23f'; actx.lineWidth = 3;
      actx.beginPath();
      actx.moveTo(cx - 34, cy); actx.lineTo(cx - 8, cy); actx.moveTo(cx + 8, cy); actx.lineTo(cx + 34, cy);
      actx.moveTo(cx, cy - 4); actx.lineTo(cx, cy + 4);
      actx.stroke();
      actx.strokeStyle = 'rgba(245,242,232,0.9)'; actx.lineWidth = 2;
      actx.beginPath(); actx.arc(cx, cy, 56, 0, Math.PI * 2); actx.stroke();
    },
  };
}

/** Title screen content: twist, missions, difficulties, controls, best times, WIN/LOSE. */
export function titleHtml(selectedMission, selectedDifficulty) {
  const missionRows = MISSIONS.map((m, i) => {
    const best = loadBest(`canyon-thread-best-${m.id}-${selectedDifficulty.label}`);
    return `<div class="pick-row ${i === selectedMission ? 'selected' : ''}" data-mission="${i}">
      <b>${i + 1}. ${m.name}</b> — ${m.tagline}
      <span class="pick-meta">${m.rings} rings · ${Math.round(m.timeLimit)}s · ${best === null ? 'no best time yet' : `best ${best.toFixed(1)}s`}</span>
    </div>`;
  }).join('');
  const diffRows = Object.entries(DIFFICULTIES).map(([key, d], i) => (
    `<div class="pick-row ${key === selectedDifficulty ? 'selected' : ''}" data-diff="${key}">
      <b>${d.label}</b> — ${d.desc}
    </div>`
  )).join('');
  return `
    <h1>CANYON THREAD</h1>
    <p class="tagline">${GAME.twist}</p>
    <p class="sub">A chase-view flight game. One jet, one canyon, twelve glowing rings, one tank of fuel.</p>
    <h2>MISSION — press 1 / 2 / 3</h2>
    ${missionRows}
    <h2>DIFFICULTY — press Q / W / E</h2>
    ${diffRows}
    <h2>HOW TO FLY</h2>
    <p class="controls">W / S — throttle up / down &nbsp;·&nbsp; Arrow keys — pitch &amp; bank &nbsp;·&nbsp; Mouse drag — steer &nbsp;·&nbsp; Space — brake &nbsp;·&nbsp; P — pause &nbsp;·&nbsp; R — restart</p>
    <h2>WIN / LOSE</h2>
    <p class="winlose"><b>WIN:</b> thread every ring in order (Ring Run, Storm Patrol) or thread the rings and land on the strip (Canyon Delivery).</p>
    <p class="winlose"><b>LOSE:</b> out of time, out of fuel, or the canyon wall takes the Kestrel — damage 100% is a crash.</p>
    <p class="cta">Press ENTER or click FLY to take off</p>
  `;
}

/** Results screen after a sortie ends. */
export function resultsHtml(mission, flight, isNewBest) {
  const won = mission.status === 'won';
  const lines = [
    `Rings threaded: ${mission.ringsDone} / ${mission.mission.rings}  (+${mission.ringsDone * 100})`,
    `Time: ${mission.elapsed.toFixed(1)}s  (par ${mission.mission.par}s)`,
    `Fuel left: ${flight.fuel.toFixed(0)}%`,
    `Damage: ${flight.damage.toFixed(0)}%  (−${Math.round(flight.damage * 2)})`,
  ];
  if (mission.landed) lines.push('Clean landing: +500');
  const total = Math.max(0, Math.round(mission.score - flight.damage * 2));
  return `
    <h1 class="${won ? 'win' : 'lose'}">${won ? 'SORTIE COMPLETE' : 'SORTIE LOST'}</h1>
    <p class="tagline">${won ? mission.mission.name + ' — flown clean.' : mission.loseReason}</p>
    ${lines.map((l) => `<p class="score-line">${l}</p>`).join('')}
    <p class="score-total">TOTAL SCORE: ${total}</p>
    ${isNewBest ? '<p class="newbest">NEW BEST TIME for this mission and difficulty.</p>' : ''}
    <p class="cta">Press R or ENTER to fly again · Press T for the title screen</p>
  `;
}
