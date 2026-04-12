const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  panel: document.getElementById("panel"),
  panelTitle: document.getElementById("panelTitle"),
  panelText: document.getElementById("panelText"),
  playButton: document.getElementById("playButton"),
  levelValue: document.getElementById("levelValue"),
  xpValue: document.getElementById("xpValue"),
  lengthValue: document.getElementById("lengthValue"),
  rankValue: document.getElementById("rankValue"),
  perkValue: document.getElementById("perkValue"),
  skinValue: document.getElementById("skinValue"),
  tipText: document.getElementById("tipText"),
  perkOptions: document.getElementById("perkOptions"),
  skinOptions: document.getElementById("skinOptions"),
  selectionSummary: document.getElementById("selectionSummary"),
};

const config = {
  worldFoodTarget: 520,
  ambientFoodRadius: 2600,
  botCount: 12,
  botRespawnRadius: 1700,
  collisionPadding: 0.88,
  baseSpeed: 144,
  boostSpeed: 230,
  turnSpeed: 3.25,
  segmentGap: 14,
  startLength: 12,
  startRadius: 12,
  levelBaseXp: 10,
  headCollisionRadius: 18,
  foodMagnetBase: 96,
};

const skins = [
  { id: "comet", name: "Comet", colors: ["#9dff70", "#62d346"] },
  { id: "frost", name: "Frostbyte", colors: ["#6cf6ff", "#24bccb"] },
  { id: "sunflare", name: "Sunflare", colors: ["#ffcf6a", "#ff9d42"] },
  { id: "ember", name: "Embercoil", colors: ["#ff8f7d", "#ec5555"] },
  { id: "nova", name: "Nova Pop", colors: ["#d59cff", "#905bff"] },
  { id: "reef", name: "Reefrunner", colors: ["#8cffc2", "#2bc98b"] },
];

const perks = [
  {
    id: "magnet",
    name: "Magnet Core",
    tag: "XP Flow",
    description: "Pulls nearby XP in from farther away so leveling feels smoother.",
    apply(stats) {
      stats.foodMagnet += 36;
    },
  },
  {
    id: "bulker",
    name: "Titan Growth",
    tag: "Body Gain",
    description: "Every level grants extra body growth so you scale harder into the late game.",
    apply(stats) {
      stats.growthPerLevel += 1;
    },
  },
  {
    id: "sprinter",
    name: "Quick Boost",
    tag: "Mobility",
    description: "Higher cruise speed and cheaper boosting for cleaner escapes.",
    apply(stats) {
      stats.baseSpeed += 10;
      stats.boostCostMultiplier = 0.7;
    },
  },
  {
    id: "scavenger",
    name: "Scavenger",
    tag: "Kill XP",
    description: "Bot eliminations spill more XP and award bonus score for cleanup runs.",
    apply(stats) {
      stats.killDropMultiplier = 1.45;
      stats.killXpBonus += 8;
    },
  },
];

const botNames = [
  "Drift", "Pebble", "Loopy", "Mellow", "Orbit", "Twig",
  "Pico", "Wobble", "Crumb", "Noodle", "Skid", "Snip",
];

const state = {
  running: false,
  gameOver: false,
  width: 0,
  height: 0,
  camera: { x: 0, y: 0 },
  pointer: { x: 0, y: 0, active: false },
  keyboard: { up: false, down: false, left: false, right: false, boost: false },
  foods: [],
  snakes: [],
  player: null,
  lastTime: 0,
  selections: {
    perkId: perks[0].id,
    skinId: skins[0].id,
  },
  session: null,
};

function resize() {
  const ratio = window.devicePixelRatio || 1;
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  canvas.width = Math.floor(state.width * ratio);
  canvas.height = Math.floor(state.height * ratio);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function angleWrap(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function choiceById(list, id) {
  return list.find((item) => item.id === id) || list[0];
}

function buildPlayerStats() {
  const stats = {
    baseSpeed: config.baseSpeed,
    boostSpeed: config.boostSpeed,
    boostCostMultiplier: 1,
    growthPerLevel: 2,
    foodMagnet: config.foodMagnetBase,
    killDropMultiplier: 1,
    killXpBonus: 0,
  };
  choiceById(perks, state.selections.perkId).apply(stats);
  return stats;
}

function createSnake({ x, y, heading, colors, isPlayer = false, name = "Bot", stats = null }) {
  const body = [];
  for (let i = 0; i < config.startLength; i += 1) {
    body.push({
      x: x - Math.cos(heading) * i * config.segmentGap,
      y: y - Math.sin(heading) * i * config.segmentGap,
    });
  }

  return {
    id: `${name}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    isPlayer,
    alive: true,
    x,
    y,
    vx: Math.cos(heading),
    vy: Math.sin(heading),
    heading,
    radius: config.startRadius,
    speed: config.baseSpeed,
    body,
    targetLength: config.startLength,
    displayedLength: config.startLength,
    xp: 0,
    level: 1,
    xpGoal: config.levelBaseXp,
    score: 0,
    boostGlow: 0,
    stats: stats || {
      baseSpeed: config.baseSpeed + rand(-6, 4),
      boostSpeed: config.boostSpeed - 10,
      boostCostMultiplier: 1,
      growthPerLevel: 2,
      foodMagnet: config.foodMagnetBase - 10,
      killDropMultiplier: 1,
      killXpBonus: 0,
    },
    ai: {
      wanderAngle: rand(-Math.PI, Math.PI),
      retargetCooldown: rand(0.2, 1.3),
      personality: rand(0.62, 0.9),
      hesitation: rand(0.4, 1.1),
    },
    colors,
  };
}

function createFood(x, y, value = 1, drift = 0) {
  return {
    id: Math.random().toString(36).slice(2, 9),
    x,
    y,
    value,
    radius: 4 + value * 1.85,
    pulse: rand(0, Math.PI * 2),
    hue: rand(0, 360),
    drift,
  };
}

function foodValue() {
  const roll = Math.random();
  if (roll > 0.985) return 6;
  if (roll > 0.93) return 4;
  if (roll > 0.72) return 3;
  if (roll > 0.36) return 2;
  return 1;
}

function scatterAmbientFood(anchorX, anchorY, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * config.ambientFoodRadius;
    state.foods.push(
      createFood(
        anchorX + Math.cos(angle) * radius,
        anchorY + Math.sin(angle) * radius,
        foodValue(),
      ),
    );
  }
}

function spawnXpBurst(anchor, amount, scatter = 220) {
  for (let i = 0; i < amount; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const radius = rand(10, scatter);
    state.foods.push(
      createFood(
        anchor.x + Math.cos(angle) * radius,
        anchor.y + Math.sin(angle) * radius,
        foodValue(),
        rand(10, 60),
      ),
    );
  }
}

function addXp(snake, value) {
  snake.xp += value;
  snake.score += value;

  while (snake.xp >= snake.xpGoal) {
    snake.xp -= snake.xpGoal;
    snake.level += 1;
    snake.targetLength += snake.stats.growthPerLevel;
    snake.radius = clamp(snake.radius + 0.35, config.startRadius, 24);
    snake.xpGoal = Math.floor(config.levelBaseXp + snake.level * 4.6);
  }
}

function selectedSkin() {
  return choiceById(skins, state.selections.skinId);
}

function selectedPerk() {
  return choiceById(perks, state.selections.perkId);
}

function resetGame() {
  state.foods = [];
  state.snakes = [];
  state.gameOver = false;
  state.session = { kills: 0 };

  const playerSkin = selectedSkin();
  state.player = createSnake({
    x: 0,
    y: 0,
    heading: 0,
    colors: playerSkin.colors,
    isPlayer: true,
    name: "You",
    stats: buildPlayerStats(),
  });
  state.snakes.push(state.player);

  for (let i = 0; i < config.botCount; i += 1) {
    const spawnAngle = (Math.PI * 2 * i) / config.botCount;
    const spawnRadius = rand(260, 760);
    state.snakes.push(
      createSnake({
        x: Math.cos(spawnAngle) * spawnRadius,
        y: Math.sin(spawnAngle) * spawnRadius,
        heading: rand(-Math.PI, Math.PI),
        colors: skins[(i + 1) % skins.length].colors,
        name: botNames[i % botNames.length],
      }),
    );
  }

  scatterAmbientFood(0, 0, config.worldFoodTarget);
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.lastTime = 0;
  updateHud();
}

function respawnBot(bot) {
  const angle = rand(0, Math.PI * 2);
  const radius = rand(380, 980);
  const respawn = createSnake({
    x: state.player.x + Math.cos(angle) * radius,
    y: state.player.y + Math.sin(angle) * radius,
    heading: rand(-Math.PI, Math.PI),
    colors: bot.colors,
    name: bot.name,
  });
  const index = state.snakes.findIndex((snake) => snake.id === bot.id);
  state.snakes[index] = respawn;
}

function killSnake(victim, killer) {
  if (!victim.alive) return;
  victim.alive = false;

  const dropCount = Math.max(10, Math.floor(victim.targetLength * (victim.isPlayer ? 1.4 : 1.1)));
  spawnXpBurst(victim, dropCount, 260);

  if (killer) {
    const directXp = Math.max(5, Math.floor(victim.targetLength * 0.35)) + killer.stats.killXpBonus;
    addXp(killer, directXp);
    spawnXpBurst(victim, Math.floor(dropCount * killer.stats.killDropMultiplier * 0.45), 180);
    if (killer.isPlayer) state.session.kills += 1;
  }

  if (victim.isPlayer) {
    state.running = false;
    state.gameOver = true;
    ui.panelTitle.textContent = "Run ended.";
    ui.panelText.textContent = `Level ${victim.level}, length ${victim.targetLength}, score ${victim.score}, kills ${state.session.kills}. Tweak your perk or costume and jump back in.`;
    ui.playButton.textContent = "Re-enter Arena";
    ui.panel.classList.remove("hidden");
  } else {
    respawnBot(victim);
  }
}

function controlPlayer(dt) {
  const snake = state.player;
  let targetAngle = snake.heading;

  if (state.pointer.active) {
    targetAngle = Math.atan2(state.pointer.y - state.height / 2, state.pointer.x - state.width / 2);
  } else {
    const x = (state.keyboard.right ? 1 : 0) - (state.keyboard.left ? 1 : 0);
    const y = (state.keyboard.down ? 1 : 0) - (state.keyboard.up ? 1 : 0);
    if (x !== 0 || y !== 0) {
      targetAngle = Math.atan2(y, x);
    }
  }

  const delta = angleWrap(targetAngle - snake.heading);
  snake.heading += clamp(delta, -config.turnSpeed * dt, config.turnSpeed * dt);
  const boosting = state.keyboard.boost && snake.targetLength > config.startLength + 2;
  snake.speed = boosting ? snake.stats.boostSpeed : snake.stats.baseSpeed + snake.level * 2.5;
  snake.boostGlow = boosting ? 1 : 0;

  if (boosting && Math.random() < 0.08 * snake.stats.boostCostMultiplier) {
    snake.targetLength = Math.max(config.startLength, snake.targetLength - 1);
  }
}

function updateBot(bot, dt) {
  const player = state.player;
  const toPlayer = { x: player.x - bot.x, y: player.y - bot.y };
  const distanceToPlayer = Math.hypot(toPlayer.x, toPlayer.y) || 1;

  let seek = { x: 0, y: 0 };
  let flee = { x: 0, y: 0 };
  let wanderWeight = 0.8 + bot.ai.hesitation * 0.25;

  let bestFood = null;
  let bestFoodScore = -Infinity;
  for (const food of state.foods) {
    const dx = food.x - bot.x;
    const dy = food.y - bot.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > 520000) continue;
    const score = food.value * 120 - Math.sqrt(distSq) + rand(-32, 22);
    if (score > bestFoodScore) {
      bestFoodScore = score;
      bestFood = food;
    }
  }

  for (const other of state.snakes) {
    if (!other.alive || other.id === bot.id) continue;
    const dx = other.x - bot.x;
    const dy = other.y - bot.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) continue;

    if (other.targetLength > bot.targetLength + 4 && dist < 190) {
      flee.x -= dx / dist;
      flee.y -= dy / dist;
    }

    for (let i = 6; i < other.body.length; i += 8) {
      const segment = other.body[i];
      const sx = segment.x - bot.x;
      const sy = segment.y - bot.y;
      const segDist = Math.hypot(sx, sy);
      if (segDist < 115) {
        flee.x -= (sx / Math.max(segDist, 1)) * 0.9;
        flee.y -= (sy / Math.max(segDist, 1)) * 0.9;
      }
    }
  }

  if (bestFood) {
    const dx = bestFood.x - bot.x;
    const dy = bestFood.y - bot.y;
    const dist = Math.hypot(dx, dy) || 1;
    seek.x = dx / dist;
    seek.y = dy / dist;
  }

  if (distanceToPlayer > config.botRespawnRadius * 0.72) {
    seek.x += toPlayer.x / distanceToPlayer;
    seek.y += toPlayer.y / distanceToPlayer;
  }

  bot.ai.wanderAngle += rand(-1.2, 1.2) * dt;
  const wander = {
    x: Math.cos(bot.ai.wanderAngle) * wanderWeight,
    y: Math.sin(bot.ai.wanderAngle) * wanderWeight,
  };

  const desire = {
    x: seek.x * 0.85 + flee.x * 1.65 + wander.x,
    y: seek.y * 0.85 + flee.y * 1.65 + wander.y,
  };

  if (Math.random() < 0.02) {
    bot.ai.wanderAngle += rand(-1.6, 1.6);
  }

  const targetAngle = Math.atan2(desire.y || Math.sin(bot.heading), desire.x || Math.cos(bot.heading));
  const delta = angleWrap(targetAngle - bot.heading);
  bot.heading += clamp(
    delta,
    -config.turnSpeed * dt * bot.ai.personality * 0.78,
    config.turnSpeed * dt * bot.ai.personality * 0.78,
  );
  bot.speed = bot.stats.baseSpeed + bot.level * 1.65 + rand(-3, 4);
  bot.boostGlow = clamp(Math.hypot(flee.x, flee.y) * 0.45, 0, 0.55);
}

function moveSnake(snake, dt) {
  snake.vx = Math.cos(snake.heading);
  snake.vy = Math.sin(snake.heading);
  snake.x += snake.vx * snake.speed * dt;
  snake.y += snake.vy * snake.speed * dt;

  snake.body[0].x = snake.x;
  snake.body[0].y = snake.y;

  for (let i = 1; i < snake.body.length; i += 1) {
    const prev = snake.body[i - 1];
    const segment = snake.body[i];
    const dx = prev.x - segment.x;
    const dy = prev.y - segment.y;
    const dist = Math.hypot(dx, dy) || 1;
    segment.x = prev.x - (dx / dist) * config.segmentGap;
    segment.y = prev.y - (dy / dist) * config.segmentGap;
  }

  while (snake.body.length < snake.targetLength) {
    const tail = snake.body[snake.body.length - 1];
    snake.body.push({ x: tail.x, y: tail.y });
  }

  while (snake.body.length > snake.targetLength) {
    snake.body.pop();
  }

  snake.displayedLength = lerp(snake.displayedLength, snake.targetLength, 0.1);
}

function updateFoodDrift(dt) {
  for (const food of state.foods) {
    if (food.drift > 0.1) {
      food.x += Math.cos(food.pulse) * food.drift * dt;
      food.y += Math.sin(food.pulse) * food.drift * dt;
      food.drift *= 0.985;
    }
  }
}

function handleFood(dt) {
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    for (let i = state.foods.length - 1; i >= 0; i -= 1) {
      const food = state.foods[i];
      const dx = food.x - snake.x;
      const dy = food.y - snake.y;
      const distSq = dx * dx + dy * dy;
      const attractRadius = snake.stats.foodMagnet + snake.radius * 2;

      if (distSq < attractRadius * attractRadius) {
        const dist = Math.sqrt(distSq) || 1;
        const pull = (230 + snake.level * 4) * dt;
        food.x -= (dx / dist) * pull;
        food.y -= (dy / dist) * pull;
      }

      if (distSq < (snake.radius + food.radius) * (snake.radius + food.radius)) {
        addXp(snake, food.value);
        state.foods.splice(i, 1);
      }
    }
  }

  while (state.foods.length < config.worldFoodTarget) {
    const angle = rand(0, Math.PI * 2);
    const radius = Math.sqrt(Math.random()) * config.ambientFoodRadius;
    state.foods.push(
      createFood(
        state.player.x + Math.cos(angle) * radius,
        state.player.y + Math.sin(angle) * radius,
        foodValue(),
      ),
    );
  }

  updateFoodDrift(dt);
}

function checkCollisions() {
  for (const snake of state.snakes) {
    if (!snake.alive) continue;

    for (const other of state.snakes) {
      if (!other.alive) continue;

      for (let i = other.id === snake.id ? 8 : 2; i < other.body.length; i += 2) {
        const segment = other.body[i];
        const dx = snake.x - segment.x;
        const dy = snake.y - segment.y;
        const hitRadius = (snake.radius + other.radius) * config.collisionPadding;
        if (dx * dx + dy * dy < hitRadius * hitRadius) {
          killSnake(snake, other.id === snake.id ? null : other);
          break;
        }
      }

      if (!snake.alive) break;
    }
  }

  for (let i = 0; i < state.snakes.length; i += 1) {
    const a = state.snakes[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < state.snakes.length; j += 1) {
      const b = state.snakes[j];
      if (!b.alive) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < config.headCollisionRadius) {
        if (a.targetLength === b.targetLength) {
          killSnake(a, b);
          killSnake(b, a);
        } else if (a.targetLength > b.targetLength) {
          killSnake(b, a);
        } else {
          killSnake(a, b);
        }
      }
    }
  }
}

function updateHud() {
  const sorted = [...state.snakes].sort((a, b) => b.score - a.score);
  const rank = Math.max(1, sorted.findIndex((snake) => snake.id === state.player.id) + 1);
  ui.levelValue.textContent = String(state.player.level);
  ui.xpValue.textContent = `${state.player.xp} / ${state.player.xpGoal}`;
  ui.lengthValue.textContent = String(state.player.targetLength);
  ui.rankValue.textContent = `${rank} / ${state.snakes.length}`;
  ui.perkValue.textContent = selectedPerk().name;
  ui.skinValue.textContent = selectedSkin().name;
  ui.selectionSummary.textContent = `Perk: ${selectedPerk().name}. Costume: ${selectedSkin().name}.`;
  ui.tipText.textContent = state.gameOver
    ? "Adjust your build in the lobby, then re-enter."
    : "Steer with mouse, touch, or WASD. Hold space to boost. Bot kills now drop XP showers.";
}

function drawGrid() {
  const spacing = 90;
  const offsetX = (-state.camera.x % spacing + spacing) % spacing;
  const offsetY = (-state.camera.y % spacing + spacing) % spacing;

  ctx.save();
  ctx.strokeStyle = "rgba(120, 218, 215, 0.12)";
  ctx.lineWidth = 1;

  for (let x = offsetX; x < state.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.height);
    ctx.stroke();
  }

  for (let y = offsetY; y < state.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function worldToScreen(x, y) {
  return {
    x: x - state.camera.x + state.width / 2,
    y: y - state.camera.y + state.height / 2,
  };
}

function drawFood(time) {
  for (const food of state.foods) {
    const screen = worldToScreen(food.x, food.y);
    if (screen.x < -40 || screen.x > state.width + 40 || screen.y < -40 || screen.y > state.height + 40) continue;
    const pulse = 1 + Math.sin(time * 0.003 + food.pulse) * 0.14;

    ctx.beginPath();
    ctx.fillStyle = `hsla(${food.hue}, 96%, 68%, 0.92)`;
    ctx.shadowBlur = 18;
    ctx.shadowColor = `hsla(${food.hue}, 96%, 68%, 0.5)`;
    ctx.arc(screen.x, screen.y, food.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawSnake(snake) {
  const [primary, secondary] = snake.colors;

  for (let i = snake.body.length - 1; i >= 0; i -= 1) {
    const segment = snake.body[i];
    const screen = worldToScreen(segment.x, segment.y);
    if (screen.x < -80 || screen.x > state.width + 80 || screen.y < -80 || screen.y > state.height + 80) continue;

    const t = i / Math.max(snake.body.length - 1, 1);
    const radius = lerp(snake.radius * 0.45, snake.radius, 1 - t);
    const gradient = ctx.createRadialGradient(
      screen.x - radius * 0.25,
      screen.y - radius * 0.25,
      radius * 0.2,
      screen.x,
      screen.y,
      radius,
    );
    gradient.addColorStop(0, primary);
    gradient.addColorStop(1, secondary);

    ctx.beginPath();
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 16 + snake.boostGlow * 15;
    ctx.shadowColor = primary;
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  const head = worldToScreen(snake.x, snake.y);
  const eyeOffset = snake.radius * 0.28;
  const eyeForward = snake.radius * 0.34;

  ctx.fillStyle = "#f5fff8";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      head.x + Math.cos(snake.heading + side * 0.8) * eyeOffset + Math.cos(snake.heading) * eyeForward,
      head.y + Math.sin(snake.heading + side * 0.8) * eyeOffset + Math.sin(snake.heading) * eyeForward,
      snake.radius * 0.18,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawLeaders() {
  const sorted = [...state.snakes].sort((a, b) => b.score - a.score).slice(0, 5);
  const boxWidth = 196;
  const startX = state.width - boxWidth - 18;
  const startY = state.height - 128;

  ctx.save();
  ctx.fillStyle = "rgba(5, 16, 24, 0.72)";
  ctx.strokeStyle = "rgba(132, 232, 228, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(startX, startY, boxWidth, 110, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ecfff8";
  ctx.font = '700 14px "Trebuchet MS"';
  ctx.fillText("Lobby Leaders", startX + 14, startY + 22);
  ctx.font = '12px "Trebuchet MS"';

  sorted.forEach((snake, index) => {
    ctx.fillStyle = snake.isPlayer ? "#9dff70" : "#cdeceb";
    ctx.fillText(`${index + 1}. ${snake.name}  Lv.${snake.level}`, startX + 14, startY + 44 + index * 14);
  });
  ctx.restore();
}

function render(time) {
  ctx.clearRect(0, 0, state.width, state.height);
  drawGrid();
  drawFood(time);

  const ordered = [...state.snakes].sort((a, b) => a.targetLength - b.targetLength);
  for (const snake of ordered) {
    if (snake.alive) drawSnake(snake);
  }

  drawLeaders();
}

function update(dt) {
  controlPlayer(dt);

  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    if (!snake.isPlayer) updateBot(snake, dt);
    moveSnake(snake, dt);
  }

  handleFood(dt);
  checkCollisions();

  state.camera.x = lerp(state.camera.x, state.player.x, 0.09);
  state.camera.y = lerp(state.camera.y, state.player.y, 0.09);
  updateHud();
}

function frame(time) {
  if (state.running) {
    const dt = clamp((time - state.lastTime) / 1000 || 0.016, 0.001, 0.03);
    update(dt);
    render(time);
    state.lastTime = time;
  } else {
    render(time);
  }

  requestAnimationFrame(frame);
}

function startGame() {
  resetGame();
  state.running = true;
  ui.panel.classList.add("hidden");
  ui.playButton.textContent = "Enter Arena";
}

function setSelection(type, id) {
  state.selections[type] = id;
  renderLobbyChoices();
  updateHud();
}

function renderChoiceCards(container, items, selectedId, type) {
  container.innerHTML = "";

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice-card${item.id === selectedId ? " selected" : ""}`;
    button.innerHTML = `
      <strong>${item.name}</strong>
      <span>${item.tag || "Skin"}</span>
      <p>${item.description || "Custom palette for your snake."}</p>
    `;

    if (item.colors) {
      const swatch = document.createElement("div");
      swatch.className = "skin-swatch";
      swatch.style.background = `linear-gradient(90deg, ${item.colors[0]}, ${item.colors[1]})`;
      button.appendChild(swatch);
    }

    button.addEventListener("click", () => setSelection(type, item.id));
    container.appendChild(button);
  });
}

function renderLobbyChoices() {
  renderChoiceCards(ui.perkOptions, perks, state.selections.perkId, "perkId");
  renderChoiceCards(ui.skinOptions, skins, state.selections.skinId, "skinId");
}

function onPointerMove(event) {
  state.pointer.x = event.clientX ?? event.touches?.[0]?.clientX ?? state.width / 2;
  state.pointer.y = event.clientY ?? event.touches?.[0]?.clientY ?? state.height / 2;
  state.pointer.active = true;
}

function onPointerLeave() {
  state.pointer.active = false;
}

window.addEventListener("resize", resize);
window.addEventListener("mousemove", onPointerMove);
window.addEventListener("touchstart", onPointerMove, { passive: true });
window.addEventListener("touchmove", onPointerMove, { passive: true });
window.addEventListener("touchend", onPointerLeave);
window.addEventListener("blur", () => {
  state.pointer.active = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.keyboard.up = true;
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") state.keyboard.down = true;
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keyboard.left = true;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keyboard.right = true;
  if (event.code === "Space") state.keyboard.boost = true;
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.keyboard.up = false;
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") state.keyboard.down = false;
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keyboard.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keyboard.right = false;
  if (event.code === "Space") state.keyboard.boost = false;
});

ui.playButton.addEventListener("click", startGame);

resize();
renderLobbyChoices();
resetGame();
updateHud();
render(0);
requestAnimationFrame(frame);
