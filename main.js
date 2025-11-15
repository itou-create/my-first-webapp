const countDisplay = document.getElementById("count");
const targetDisplay = document.getElementById("target");
const turnDisplay = document.getElementById("turn");
const statusDisplay = document.getElementById("status");
const faceDisplay = document.getElementById("face");
const danceStage = document.getElementById("dance");
const incrementButton = document.getElementById("increment");
const passButton = document.getElementById("pass");
const resetButton = document.getElementById("reset");
const soundToggle = document.getElementById("sound-toggle");
const playerCountButton = document.getElementById("player-count-button");
const bulletStatusDisplay = document.getElementById("bullet-status");
const bulletTrack = document.getElementById("bullet-track");
const bulletHalo = document.querySelector(".bullet-halo");
const bulletVisual = document.getElementById("bullet-visual");

const faceStages = ["😶", "🙂", "😊", "😃", "😄", "🤗", "😆", "🤪", "🤩", "🤯"];
const generateTarget = () => Math.floor(Math.random() * 11) + 5; // 5〜15の目標

let count = 0;
let target = generateTarget();
let exploded = false;
let audioEnabled = true;
let audioContext = null;
let musicNodes = null;
let currentPlayer = 1;
let turnClicks = 0;
const maxClicksPerTurn = 3;
const minPlayers = 2;
const maxPlayers = 6;
let totalPlayers = 2;
let statusMessage = `プレイヤー1からスタート！${totalPlayers}人で順番に1〜${maxClicksPerTurn}回まで押そう。`;
const bulletSafeDurationRange = [2200, 4200];
const bulletDangerDurationRange = [900, 1700];
let bulletSafe = true;
let bulletTimerId = null;

const musicSettings = {
  bpm: 112,
  leadBase: 329.63, // E4
  bassBase: 130.81, // C3
  melodyPattern: [0, 2, 4, 7, 4, 2, 0, -5, 0, 2, 4, 11, 7, 4, 2, 0],
  bassPattern: [0, 0, -5, -5, -7, -7, -5, -5, -12, -12, -7, -7, -5, -5, -2, -2],
  kickPattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  hatPattern: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
};

const ensureAudioContext = () => {
  if (!audioEnabled) {
    return null;
  }
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      audioEnabled = false;
      soundToggle.checked = false;
      soundToggle.disabled = true;
      return null;
    }
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
};

const noteFromBase = (baseFreq, semitone) => baseFreq * 2 ** (semitone / 12);

const triggerLeadNote = (masterGain, semitone, time, duration) => {
  const ctx = masterGain.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(noteFromBase(musicSettings.leadBase, semitone), time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.16, time + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 1.6);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + duration * 1.6);
};

const triggerBassNote = (masterGain, semitone, time, duration) => {
  const ctx = masterGain.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(noteFromBase(musicSettings.bassBase, semitone), time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(0.2, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 1.8);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + duration * 1.8);
};

const triggerKick = (masterGain, time) => {
  const ctx = masterGain.context;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(35, time + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.3);
};

const triggerHat = (masterGain, time) => {
  const ctx = masterGain.context;
  const length = ctx.sampleRate * 0.04;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(7000, time);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(time);
  noise.stop(time + 0.1);
};

const scheduleMusicSteps = () => {
  if (!musicNodes) {
    return;
  }
  const ctx = musicNodes.masterGain.context;
  while (musicNodes.nextNoteTime < ctx.currentTime + musicNodes.scheduleAhead) {
    const step = musicNodes.currentStep;
    const melodyOffset = musicSettings.melodyPattern[step % musicSettings.melodyPattern.length];
    if (melodyOffset !== null && melodyOffset !== undefined) {
      triggerLeadNote(
        musicNodes.masterGain,
        melodyOffset,
        musicNodes.nextNoteTime,
        musicNodes.stepDuration
      );
    }

    const bassOffset = musicSettings.bassPattern[step % musicSettings.bassPattern.length];
    if (bassOffset !== null && bassOffset !== undefined) {
      triggerBassNote(
        musicNodes.masterGain,
        bassOffset,
        musicNodes.nextNoteTime,
        musicNodes.stepDuration * 2
      );
    }

    if (musicSettings.kickPattern[step % musicSettings.kickPattern.length]) {
      triggerKick(musicNodes.masterGain, musicNodes.nextNoteTime);
    }

    if (musicSettings.hatPattern[step % musicSettings.hatPattern.length]) {
      triggerHat(musicNodes.masterGain, musicNodes.nextNoteTime);
    }

    musicNodes.nextNoteTime += musicNodes.stepDuration;
    musicNodes.currentStep = (musicNodes.currentStep + 1) % musicNodes.loopLength;
  }
};

const startMusic = () => {
  if (!audioEnabled || musicNodes) {
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.22, now + 0.8);
  masterGain.connect(ctx.destination);

  const secondsPerBeat = 60 / musicSettings.bpm;
  const stepDuration = secondsPerBeat / 2; // 8th-note grid
  musicNodes = {
    masterGain,
    currentStep: 0,
    nextNoteTime: now + 0.1,
    stepDuration,
    loopLength: 64,
    scheduleAhead: 0.35,
    intervalId: null,
  };

  scheduleMusicSteps();
  musicNodes.intervalId = setInterval(scheduleMusicSteps, 80);
};

const stopMusic = () => {
  if (!musicNodes) {
    return;
  }
  clearInterval(musicNodes.intervalId);
  const {masterGain} = musicNodes;
  const ctx = masterGain.context;
  const now = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  setTimeout(() => {
    try {
      masterGain.disconnect();
    } catch {
      // already disconnected
    }
  }, 600);
  musicNodes = null;
};

const playTone = (frequency, duration = 0.2, delay = 0, type = "sine") => {
  if (!audioEnabled) {
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  const startTime = ctx.currentTime + delay;
  const endTime = startTime + duration;
  gainNode.gain.setValueAtTime(0.001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
};

const playIncrementSound = () => {
  const base = 420 + (count % 6) * 35;
  playTone(base, 0.14, 0, "triangle");
};

const playExplosionSound = () => {
  if (!audioEnabled) {
    return;
  }
  const ctx = ensureAudioContext();
  if (!ctx) {
    return;
  }
  const now = ctx.currentTime;
  const explosionBus = ctx.createGain();
  explosionBus.gain.setValueAtTime(1, now);
  explosionBus.connect(ctx.destination);

  const bufferSize = ctx.sampleRate * 0.9;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / bufferSize;
    const decay = Math.pow(1 - t, 3);
    const crackle = (Math.random() * 2 - 1) * (1 - Math.pow(t, 2));
    data[i] = crackle * decay;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(1100, now);
  bandpass.frequency.exponentialRampToValueAtTime(220, now + 0.5);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(4000, now);
  lowpass.frequency.exponentialRampToValueAtTime(800, now + 0.6);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.55, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  noise.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(noiseGain);
  noiseGain.connect(explosionBus);
  noise.start(now);
  noise.stop(now + 0.9);

  const boomOsc = ctx.createOscillator();
  boomOsc.type = "triangle";
  boomOsc.frequency.setValueAtTime(220, now);
  boomOsc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.7, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  boomOsc.connect(boomGain);
  boomGain.connect(explosionBus);
  boomOsc.start(now);
  boomOsc.stop(now + 0.9);

  const sparkOsc = ctx.createOscillator();
  sparkOsc.type = "sawtooth";
  sparkOsc.frequency.setValueAtTime(880, now);
  sparkOsc.frequency.linearRampToValueAtTime(120, now + 0.35);
  const sparkGain = ctx.createGain();
  sparkGain.gain.setValueAtTime(0.35, now);
  sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  sparkOsc.connect(sparkGain);
  sparkGain.connect(explosionBus);
  sparkOsc.start(now);
  sparkOsc.stop(now + 0.4);

  const debrisBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const debrisData = debrisBuffer.getChannelData(0);
  for (let i = 0; i < debrisData.length; i += 1) {
    const decay = Math.pow(1 - i / debrisData.length, 2.5);
    debrisData[i] = (Math.random() * 2 - 1) * decay;
  }
  const debris = ctx.createBufferSource();
  debris.buffer = debrisBuffer;
  const debrisFilter = ctx.createBiquadFilter();
  debrisFilter.type = "highpass";
  debrisFilter.frequency.setValueAtTime(2500, now);
  const debrisGain = ctx.createGain();
  debrisGain.gain.setValueAtTime(0.4, now + 0.05);
  debrisGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  debris.connect(debrisFilter);
  debrisFilter.connect(debrisGain);
  debrisGain.connect(explosionBus);
  debris.start(now + 0.05);
  debris.stop(now + 0.7);

  const aftershock = ctx.createOscillator();
  aftershock.type = "sine";
  aftershock.frequency.setValueAtTime(90, now + 0.15);
  aftershock.frequency.exponentialRampToValueAtTime(18, now + 1.7);
  const afterGain = ctx.createGain();
  afterGain.gain.setValueAtTime(0.5, now + 0.15);
  afterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
  aftershock.connect(afterGain);
  afterGain.connect(explosionBus);
  aftershock.start(now + 0.15);
  aftershock.stop(now + 1.9);

  const shockOsc = ctx.createOscillator();
  shockOsc.type = "square";
  shockOsc.frequency.setValueAtTime(2000, now);
  shockOsc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
  const shockGain = ctx.createGain();
  shockGain.gain.setValueAtTime(0.25, now);
  shockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  shockOsc.connect(shockGain);
  shockGain.connect(explosionBus);
  shockOsc.start(now);
  shockOsc.stop(now + 0.4);
};

const playResetSound = () => {
  playTone(260, 0.2, 0, "sawtooth");
};

const randomDuration = (min, max) => Math.random() * (max - min) + min;

const updateBulletIndicator = () => {
  if (!bulletStatusDisplay) {
    return;
  }
  bulletStatusDisplay.textContent = bulletSafe
    ? "ピストル: 安全タイミング"
    : "ピストル: 危険！弾が迫っている";
  bulletStatusDisplay.classList.toggle("bullet-safe", bulletSafe);
  bulletStatusDisplay.classList.toggle("bullet-danger", !bulletSafe);
  if (bulletTrack) {
    bulletTrack.classList.toggle("bullet-safe", bulletSafe);
    bulletTrack.classList.toggle("bullet-danger", !bulletSafe);
  }
  if (bulletHalo) {
    bulletHalo.classList.toggle("bullet-safe", bulletSafe);
    bulletHalo.classList.toggle("bullet-danger", !bulletSafe);
  }
};

const updateBulletVisual = (dangerDuration) => {
  if (!bulletVisual) {
    return;
  }
  bulletVisual.classList.toggle("bullet-safe", bulletSafe);
  bulletVisual.classList.toggle("bullet-danger", !bulletSafe);
  if (!bulletSafe && dangerDuration) {
    bulletVisual.style.animationDuration = `${dangerDuration}ms`;
    bulletVisual.classList.remove("bullet-shooting");
    // force reflow to restart animation
    void bulletVisual.offsetWidth;
    bulletVisual.classList.add("bullet-shooting");
  } else {
    bulletVisual.classList.remove("bullet-shooting");
    bulletVisual.style.animationDuration = "";
  }
};

const setBulletState = (safe, dangerDuration = null) => {
  bulletSafe = safe;
  updateBulletIndicator();
  updateBulletVisual(!safe ? dangerDuration : null);
};

const stopBulletSequence = () => {
  if (bulletTimerId !== null) {
    clearTimeout(bulletTimerId);
    bulletTimerId = null;
  }
};

const startBulletPhase = (safeState) => {
  if (exploded) {
    return;
  }
  const [min, max] = safeState ? bulletSafeDurationRange : bulletDangerDurationRange;
  const duration = randomDuration(min, max);
  setBulletState(safeState, safeState ? null : duration);
  bulletTimerId = setTimeout(() => startBulletPhase(!safeState), duration);
};

const startBulletSequence = () => {
  stopBulletSequence();
  startBulletPhase(true);
};

const getFaceForState = (value, goal, isExploded) => {
  if (isExploded) {
    return faceStages[faceStages.length - 1];
  }
  const progress = goal === 0 ? 0 : Math.min(1, value / goal);
  const stage = Math.min(faceStages.length - 2, Math.floor(progress * (faceStages.length - 1)));
  return faceStages[stage];
};

const updatePlayerCountLabel = () => {
  playerCountButton.textContent = `${totalPlayers}人で遊ぶ`;
};

const triggerExplosion = (message) => {
  if (exploded) {
    return;
  }
  exploded = true;
  statusMessage = message;
  playExplosionSound();
  stopBulletSequence();
  updateView();
};

const updateView = () => {
  countDisplay.textContent = `カウント: ${count}`;
  targetDisplay.textContent = `爆発ライン: ${target}`;
  const remaining = Math.max(0, maxClicksPerTurn - turnClicks);
  turnDisplay.textContent = exploded
    ? `ゲーム終了 - プレイヤー${currentPlayer}が爆発`
    : `プレイヤー${currentPlayer}の番 / 残り ${remaining} 回（全${totalPlayers}人）`;
  statusDisplay.textContent = statusMessage;
  faceDisplay.textContent = getFaceForState(count, target, exploded);
  incrementButton.disabled = exploded;
  passButton.disabled = exploded || turnClicks === 0;
  danceStage.classList.toggle("active", exploded);
  danceStage.setAttribute("aria-hidden", String(!exploded));
};

const advanceTurn = () => {
  currentPlayer += 1;
  if (currentPlayer > totalPlayers) {
    currentPlayer = 1;
  }
  turnClicks = 0;
  statusMessage = `プレイヤー${currentPlayer}に交代！1〜${maxClicksPerTurn}回押してからNキーで交代しよう。`;
};

const handleIncrement = () => {
  if (exploded) {
    return;
  }
  if (!bulletSafe) {
    triggerExplosion("弾を避け損ねてしまった！もっとタイミングを見極めよう。");
    return;
  }
  startMusic();
  count += 1;
  turnClicks += 1;
  if (count >= target) {
    triggerExplosion(`プレイヤー${currentPlayer}が爆発！Rキーまたは「リセット」で再挑戦しよう。`);
    return;
  } else {
    playIncrementSound();
    if (turnClicks >= maxClicksPerTurn) {
      advanceTurn();
    } else {
      const remaining = maxClicksPerTurn - turnClicks;
      statusMessage = `プレイヤー${currentPlayer}の番です。あと ${remaining} 回まで押せます（Nキーで交代）。`;
    }
  }
  updateView();
};

const handlePass = () => {
  if (exploded) {
    return;
  }
  if (!bulletSafe) {
    triggerExplosion("弾が飛んでいる最中に動いたため命中してしまった！");
    return;
  }
  if (turnClicks === 0) {
    statusMessage = "最低1回は押してから交代できます。";
    updateView();
    return;
  }
  advanceTurn();
  updateView();
};

const isInteractiveTarget = () => {
  const activeTag = document.activeElement?.tagName;
  const interactiveTags = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"];
  return activeTag && interactiveTags.includes(activeTag.toUpperCase());
};

const resetGame = ({playSound = true} = {}) => {
  if (audioEnabled) {
    startMusic();
    if (playSound) {
      playResetSound();
    }
  }
  count = 0;
  target = generateTarget();
  exploded = false;
  currentPlayer = 1;
  turnClicks = 0;
  statusMessage = `プレイヤー1からリスタート！${totalPlayers}人で順番に1〜${maxClicksPerTurn}回まで押そう。`;
  updatePlayerCountLabel();
  startBulletSequence();
  updateView();
};

const handleReset = () => {
  resetGame({playSound: true});
};

const handleKeyControls = (event) => {
  if (event.repeat || isInteractiveTarget()) {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    handleIncrement();
  } else if (event.code === "KeyR") {
    event.preventDefault();
    handleReset();
  } else if (event.code === "KeyN") {
    event.preventDefault();
    handlePass();
  }
};

soundToggle.addEventListener("change", (event) => {
  audioEnabled = event.target.checked;
  if (audioEnabled) {
    ensureAudioContext();
    startMusic();
  } else {
    stopMusic();
  }
});

incrementButton.addEventListener("click", handleIncrement);

document.addEventListener("keydown", handleKeyControls);

resetButton.addEventListener("click", handleReset);

const handlePlayerCountChange = () => {
  totalPlayers = totalPlayers >= maxPlayers ? minPlayers : totalPlayers + 1;
  resetGame({playSound: false});
};

playerCountButton.addEventListener("click", handlePlayerCountChange);
passButton.addEventListener("click", handlePass);

startBulletSequence();
updatePlayerCountLabel();

updateView();
