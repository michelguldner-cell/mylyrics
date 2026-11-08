// Métronome : tempo d'une chanson (champ « tempo », « 120bpm » dans le titre, ou ligne « Tempo: 120 » / {tempo:120} / « BPM: 120 » dans le texte),
// pulsation visuelle et clic sonore (Web Audio).

// Tempo en BPM d'une chanson, ou null.
export function songTempo(song) {
  if (!song) return null;
  const t = Number(song.tempo);
  if (t >= 20 && t <= 300) return Math.round(t);
  const tm = String(song.title || '').match(/(\d{2,3})\s*bpm/i); // « Wonderwall 175bpm »
  if (tm && +tm[1] >= 20 && +tm[1] <= 300) return +tm[1];
  const m = String(song.body || '').match(/^\s*(?:\{\s*)?(?:tempo|bpm)\s*:\s*(\d{2,3})(?:\s*(?:bpm)?\s*\}?)\s*$/im);
  if (m) { const v = +m[1]; if (v >= 20 && v <= 300) return v; }
  return null;
}

let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Clic court : temps fort plus aigu.
function click(ctx, when, strong) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = strong ? 1500 : 1000;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(strong ? 0.6 : 0.35, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(when); osc.stop(when + 0.06);
}

// Crée un métronome. onBeat(beatIndex) est appelé à chaque temps (pour la pulsation visuelle).
export function createMetronome({ onBeat, beatsPerBar = 4 } = {}) {
  let bpm = 0, sound = false, timer = null, beat = 0, nextAt = 0;
  const period = () => 60000 / bpm;

  function schedule() {
    if (!bpm) return;
    const now = performance.now();
    if (nextAt <= now) {
      // Rattrape le retard sans accumuler
      const late = now - nextAt;
      beat = (beat + 1) % beatsPerBar;
      if (sound) { const ctx = ensureAudio(); if (ctx) click(ctx, ctx.currentTime, beat === 0); }
      if (onBeat) onBeat(beat);
      nextAt = now + period() - (late < period() ? late : 0);
    }
    timer = setTimeout(schedule, Math.max(5, Math.min(nextAt - performance.now(), 50)));
  }

  function start() {
    stop();
    if (!bpm) return;
    beat = beatsPerBar - 1; nextAt = performance.now();
    schedule();
  }
  function stop() { clearTimeout(timer); timer = null; }

  return {
    get bpm() { return bpm; },
    get sound() { return sound; },
    get running() { return !!timer; },
    setTempo(v) { bpm = v || 0; if (bpm) start(); else stop(); },
    setSound(on) { sound = !!on; if (sound) ensureAudio(); },
    start, stop,
    destroy() { stop(); },
  };
}
