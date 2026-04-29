const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const dampenerDisplay = document.getElementById('dampener-status');
const minimapDisplay = document.getElementById('minimap-status');
const scoreDisplay = document.getElementById('score');
const gearStatusDisplay = document.getElementById('gear-status');
const shipStatusDisplay = document.getElementById('ship-status');
const questText = document.getElementById('questText');
const dialogHint = document.getElementById('dialogHint');
const dialogBox = document.getElementById('dialogBox');
const dialogSpeaker = document.getElementById('dialogSpeaker');
const dialogText = document.getElementById('dialogText');
const dialogChoices = document.getElementById('dialogChoices');
const choiceConfirm = document.getElementById('choiceConfirm');
const choiceCancel = document.getElementById('choiceCancel');

const world = {
  width: 7000,
  height: 7000
};

const camera = {
  x: 0,
  y: 0
};

const recycleStation = {
  x: world.width / 2,
  y: 520,
  width: 280,
  height: 180
};

const gearPart = {
  x: recycleStation.x,
  y: recycleStation.y - 160,
  radius: 22,
  collected: false,
  visible: true
};

const ship = {
  x: 5450,
  y: 4980,
  width: 220,
  height: 120,
  angle: -0.22,
  broken: true,
  repaired: false,
  boarded: false,
  interactRadius: 130,
  speed: 0,
  maxSpeed: 7,
  accel: 0.18,
  friction: 0.985
};

const shipRobot = {
  x: ship.x - 120,
  y: ship.y + 38,
  radius: 20,
  interactRadius: 120,
  name: '維修機器人'
};

const recycleRobot = {
  x: recycleStation.x + 155,
  y: recycleStation.y + 24,
  radius: 20,
  interactRadius: 120,
  name: '回收站機器人'
};

let stars = [];
let debrisList = [];
let score = 0;
let keys = {};
let showMinimap = true;
let dialogVisible = false;
let activeNpc = null;
let shipPromptAvailable = false;
let deliveryPending = false;
let hasGearPart = false;
let repairQuestUnlocked = false;
let repairQuestCompleted = false;

const player = {
  x: world.width / 2,
  y: world.height / 2,
  vx: 0,
  vy: 0,
  accel: 0.18,
  friction: 0.95,
  isDampenerOn: true,
  radius: 18,
  facing: 0,
  vacuumRange: 220,
  vacuumForce: 0.25,
  collectRadius: 28,
  hidden: false
};

const sounds = {
  collect: new Audio('assets/sfx/collect.wav'),
  dialog: new Audio('assets/sfx/dialog.wav'),
  gear: new Audio('assets/sfx/gear.wav'),
  repair: new Audio('assets/sfx/repair.wav'),
  board: new Audio('assets/sfx/board.wav')
};

Object.values(sounds).forEach(sound => {
  sound.preload = 'auto';
  sound.volume = 0.4;
});

function playSound(name) {
  const sound = sounds[name];
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

function isVacuumActive() {
  return !ship.boarded && !!(keys[' '] || keys['Space'] || keys['Spacebar']);
}

function createStars() {
  stars = [];
  for (let i = 0; i < 1200; i++) {
    stars.push({
      x: Math.random() * world.width,
      y: Math.random() * world.height,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      parallax: Math.random() * 0.5 + 0.1
    });
  }
}

function spawnDebris() {
  let x = Math.random() * world.width;
  let y = Math.random() * world.height;
  if (Math.abs(x - recycleStation.x) < 160 && Math.abs(y - recycleStation.y) < 160) {
    x += 240;
    y += 180;
  }
  debrisList.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    size: Math.random() * 8 + 6,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.05,
    hue: Math.random() * 360
  });
}

function initWorld() {
  debrisList = [];
  for (let i = 0; i < 100; i++) spawnDebris();
  createStars();
}

function showDialog(speaker, message, options = {}) {
  dialogSpeaker.textContent = speaker;
  dialogText.textContent = message;
  dialogBox.style.display = 'block';
  dialogVisible = true;
  playSound('dialog');

  if (options.showDeliveryChoices) {
    dialogChoices.style.display = 'flex';
    deliveryPending = true;
  } else {
    dialogChoices.style.display = 'none';
    deliveryPending = false;
  }
}

function hideDialog() {
  dialogBox.style.display = 'none';
  dialogChoices.style.display = 'none';
  dialogVisible = false;
  deliveryPending = false;
}

function getDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getNearbyNpc() {
  if (getDistance(player, recycleRobot) < recycleRobot.interactRadius) return recycleRobot;
  if (getDistance(player, shipRobot) < shipRobot.interactRadius) return shipRobot;
  return null;
}

function handleNpcInteraction(npc) {
  if (!npc) return;
  activeNpc = npc;

  if (npc === recycleRobot) {
    repairQuestUnlocked = true;
    if (hasGearPart) {
      showDialog(npc.name, '你已經拿到修理零件了，快把齒輪送去太空船那邊吧。');
      return;
    }

    if (score >= 25) {
      showDialog(npc.name, '你收集到 25 個垃圾了！上方那個小齒輪零件已經解鎖，可以去拿來修太空船。');
    } else {
      showDialog(npc.name, `想修太空船嗎？先幫我清掉 25 個垃圾吧。\n目前進度：${score} / 25`);
    }
    return;
  }

  if (npc === shipRobot) {
    if (!ship.repaired && hasGearPart) {
      showDialog(npc.name, '你找到修理零件了！要現在交付齒輪來修好太空船嗎？', { showDeliveryChoices: true });
      return;
    }

    if (!ship.repaired) {
      showDialog(npc.name, '太空船目前壞掉無法使用。去上方的資源回收站看看，也許能找到修理零件。');
      return;
    }

    showDialog(npc.name, '太空船已經修好了！靠近太空船按 F 就可以搭乘或離開。');
  }
}

function handleDeliveryConfirm() {
  if (!hasGearPart) return;
  hasGearPart = false;
  ship.broken = false;
  ship.repaired = true;
  repairQuestCompleted = true;
  playSound('repair');
  showDialog('維修機器人', '太好了，齒輪裝上去了！太空船修復完成，現在你可以靠近太空船按 F 搭乘。');
}

choiceConfirm.addEventListener('click', handleDeliveryConfirm);
choiceCancel.addEventListener('click', () => hideDialog());

function tryCollectGearPart() {
  if (gearPart.collected || score < 25) return;
  const dist = Math.hypot(player.x - gearPart.x, player.y - gearPart.y);
  if (dist < player.collectRadius + gearPart.radius + 8) {
    gearPart.collected = true;
    gearPart.visible = false;
    hasGearPart = true;
    playSound('gear');
    showDialog('回收站機器人', '你拿到修理用的齒輪零件了！快送去太空船那邊給維修機器人。');
  }
}

function tryBoardOrLeaveShip() {
  if (!ship.repaired) return;

  if (ship.boarded) {
    ship.boarded = false;
    player.hidden = false;
    player.x = ship.x - Math.cos(ship.angle) * 80;
    player.y = ship.y - Math.sin(ship.angle) * 80 + 20;
    player.vx = ship.speed * Math.cos(ship.angle);
    player.vy = ship.speed * Math.sin(ship.angle);
    playSound('board');
    showDialog('太空船', '已離開太空船。');
    return;
  }

  const dist = Math.hypot(player.x - ship.x, player.y - ship.y);
  if (dist < ship.interactRadius) {
    ship.boarded = true;
    player.hidden = true;
    ship.speed = 0;
    playSound('board');
    showDialog('太空船', '已搭乘太空船。用方向鍵駕駛，按 F 離開。');
  }
}

window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.code === 'Space') e.preventDefault();

  if (e.key.toLowerCase() === 't' && !e.repeat) {
    player.isDampenerOn = !player.isDampenerOn;
  }

  if (e.key.toLowerCase() === 'm' && !e.repeat) {
    showMinimap = !showMinimap;
  }

  if (e.key.toLowerCase() === 'e' && !e.repeat) {
    const npc = getNearbyNpc();
    if (npc) handleNpcInteraction(npc);
  }

  if (e.key.toLowerCase() === 'f' && !e.repeat) {
    tryBoardOrLeaveShip();
  }

  if (e.key === 'Escape' && dialogVisible) {
    hideDialog();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function updatePlayerMovement() {
  if (keys['ArrowUp']) player.vy -= player.accel;
  if (keys['ArrowDown']) player.vy += player.accel;
  if (keys['ArrowLeft']) player.vx -= player.accel;
  if (keys['ArrowRight']) player.vx += player.accel;

  if (player.isDampenerOn) {
    if (!keys['ArrowUp'] && !keys['ArrowDown']) player.vy *= player.friction;
    if (!keys['ArrowLeft'] && !keys['ArrowRight']) player.vx *= player.friction;
  }

  player.x += player.vx;
  player.y += player.vy;

  if (player.x < player.radius) { player.x = player.radius; player.vx *= -0.5; }
  if (player.x > world.width - player.radius) { player.x = world.width - player.radius; player.vx *= -0.5; }
  if (player.y < player.radius) { player.y = player.radius; player.vy *= -0.5; }
  if (player.y > world.height - player.radius) { player.y = world.height - player.radius; player.vy *= -0.5; }

  if (Math.abs(player.vx) > 0.1 || Math.abs(player.vy) > 0.1) {
    player.facing = Math.atan2(player.vy, player.vx);
  }
}

function updateShipMovement() {
  if (keys['ArrowLeft']) ship.angle -= 0.045;
  if (keys['ArrowRight']) ship.angle += 0.045;
  if (keys['ArrowUp']) ship.speed += ship.accel;
  if (keys['ArrowDown']) ship.speed -= ship.accel * 0.7;

  ship.speed = Math.max(-2.5, Math.min(ship.maxSpeed, ship.speed));
  ship.speed *= ship.friction;

  ship.x += Math.cos(ship.angle) * ship.speed;
  ship.y += Math.sin(ship.angle) * ship.speed;

  ship.x = Math.max(60, Math.min(world.width - 60, ship.x));
  ship.y = Math.max(60, Math.min(world.height - 60, ship.y));

  shipRobot.x = ship.x - Math.cos(ship.angle) * 125 - Math.sin(ship.angle) * 30;
  shipRobot.y = ship.y + Math.sin(ship.angle) * 125 + Math.cos(ship.angle) * 30;
}

function updateDebris() {
  const vacuumActive = isVacuumActive();
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i];
    const dx = player.x - d.x;
    const dy = player.y - d.y;
    const dist = Math.hypot(dx, dy);

    if (vacuumActive && dist < player.vacuumRange && dist > 0.001) {
      const pull = (1 - dist / player.vacuumRange) * player.vacuumForce;
      d.vx += (dx / dist) * pull;
      d.vy += (dy / dist) * pull;
    }

    d.x += d.vx;
    d.y += d.vy;
    d.rotation += d.spin;
    d.vx *= 0.995;
    d.vy *= 0.995;

    if (d.x < 0) d.x += world.width;
    if (d.x > world.width) d.x -= world.width;
    if (d.y < 0) d.y += world.height;
    if (d.y > world.height) d.y -= world.height;

    if (!ship.boarded && dist < player.collectRadius) {
      debrisList.splice(i, 1);
      score++;
      playSound('collect');
      spawnDebris();
    }
  }
}

function updateCamera() {
  const focusX = ship.boarded ? ship.x : player.x;
  const focusY = ship.boarded ? ship.y : player.y;
  camera.x = focusX - canvas.width / 2;
  camera.y = focusY - canvas.height / 2;
  camera.x = Math.max(0, Math.min(camera.x, world.width - canvas.width));
  camera.y = Math.max(0, Math.min(camera.y, world.height - canvas.height));
}

function updateInteractionHint() {
  const nearbyNpc = ship.boarded ? null : getNearbyNpc();
  const nearShip = ship.repaired && !ship.boarded && Math.hypot(player.x - ship.x, player.y - ship.y) < ship.interactRadius;
  shipPromptAvailable = nearShip;

  if (nearbyNpc) {
    dialogHint.style.display = 'block';
    dialogHint.innerHTML = '可互動：按 <kbd>E</kbd>';
  } else if (nearShip) {
    dialogHint.style.display = 'block';
    dialogHint.innerHTML = '可互動：按 <kbd>F</kbd> 搭乘太空船';
  } else if (ship.boarded) {
    dialogHint.style.display = 'block';
    dialogHint.innerHTML = '按 <kbd>F</kbd> 離開太空船';
  } else {
    dialogHint.style.display = 'none';
  }

  if (dialogVisible && !nearbyNpc && !deliveryPending && activeNpc) {
    const stillNear = getDistance(player, activeNpc) < activeNpc.interactRadius + 20;
    if (!stillNear && activeNpc !== 'ship') {
      hideDialog();
    }
  }
}

function updateQuestText() {
  if (!repairQuestUnlocked) {
    questText.textContent = '任務：前往上方資源回收站，收集 25 個垃圾後拿取齒輪零件。';
  } else if (!hasGearPart && score < 25) {
    questText.textContent = `任務：清理垃圾 ${score} / 25，讓回收站交出修理齒輪。`;
  } else if (!hasGearPart && score >= 25 && !gearPart.collected) {
    questText.textContent = '任務：垃圾已達標，前往資源回收站上方拿取齒輪零件。';
  } else if (hasGearPart && !repairQuestCompleted) {
    questText.textContent = '任務：把齒輪零件帶去右下方太空船旁，交給維修機器人。';
  } else if (repairQuestCompleted && !ship.boarded) {
    questText.textContent = '任務：太空船已修好，靠近後按 F 搭乘，開始探索地圖。';
  } else if (ship.boarded) {
    questText.textContent = '任務：駕駛太空船探索世界，按 F 可離開。';
  }
}

function updateStatusUI() {
  dampenerDisplay.innerText = player.isDampenerOn ? 'ON' : 'OFF';
  dampenerDisplay.className = 'status ' + (player.isDampenerOn ? 'on' : 'off');
  minimapDisplay.innerText = showMinimap ? 'ON' : 'OFF';
  minimapDisplay.className = 'status ' + (showMinimap ? 'on' : 'off');
  scoreDisplay.innerText = score;
  gearStatusDisplay.innerText = hasGearPart ? '已取得' : '未取得';
  gearStatusDisplay.className = 'status ' + (hasGearPart ? 'on' : 'off');
  shipStatusDisplay.innerText = ship.repaired ? (ship.boarded ? '航行中' : '可搭乘') : '故障中';
  shipStatusDisplay.className = 'status ' + (ship.repaired ? 'on' : 'off');
}

function update() {
  if (ship.boarded) {
    updateShipMovement();
  } else {
    updatePlayerMovement();
    tryCollectGearPart();
  }

  updateDebris();
  updateCamera();
  updateInteractionHint();
  updateQuestText();
  updateStatusUI();
}

function drawMinimap() {
  const size = 180;
  const pad = 20;
  const scaleX = size / world.width;
  const scaleY = size / world.height;

  ctx.save();
  ctx.translate(canvas.width - size - pad, canvas.height - size - pad);

  ctx.fillStyle = 'rgba(0, 10, 30, 0.8)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(127, 216, 255, 0.3)';
  ctx.strokeRect(0, 0, size, size);

  ctx.fillStyle = '#7fd8ff';
  debrisList.forEach(d => ctx.fillRect(d.x * scaleX, d.y * scaleY, 1.5, 1.5));

  ctx.fillStyle = '#8affb5';
  ctx.fillRect(recycleStation.x * scaleX - 4, recycleStation.y * scaleY - 4, 8, 8);

  ctx.fillStyle = '#b08cff';
  ctx.fillRect(ship.x * scaleX - 4, ship.y * scaleY - 4, 8, 8);

  ctx.fillStyle = '#9dff9d';
  ctx.beginPath();
  ctx.arc(recycleRobot.x * scaleX, recycleRobot.y * scaleY, 2.4, 0, Math.PI * 2);
  ctx.arc(shipRobot.x * scaleX, shipRobot.y * scaleY, 2.4, 0, Math.PI * 2);
  ctx.fill();

  if (gearPart.visible) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(gearPart.x * scaleX, gearPart.y * scaleY, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  const focusX = ship.boarded ? ship.x : player.x;
  const focusY = ship.boarded ? ship.y : player.y;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(focusX * scaleX, focusY * scaleY, ship.boarded ? 4 : 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStars() {
  stars.forEach(s => {
    const sx = (s.x - camera.x * s.parallax + world.width) % world.width;
    const sy = (s.y - camera.y * s.parallax + world.height) % world.height;
    ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
    ctx.fillRect(sx, sy, s.size, s.size);
  });
}

function drawDebris() {
  debrisList.forEach(d => {
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rotation);
    ctx.fillStyle = `hsl(${d.hue}, 60%, 70%)`;
    ctx.beginPath();
    ctx.moveTo(-d.size, -d.size / 2);
    ctx.lineTo(d.size, -d.size);
    ctx.lineTo(d.size / 2, d.size);
    ctx.lineTo(-d.size, d.size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
}

function drawVacuumBeam() {
  if (!isVacuumActive()) return;

  const beamLength = player.vacuumRange;
  const beamWidth = 70;
  const nozzleX = player.x + Math.cos(player.facing) * 22;
  const nozzleY = player.y + Math.sin(player.facing) * 22;

  ctx.save();
  ctx.translate(nozzleX, nozzleY);
  ctx.rotate(player.facing);

  const gradient = ctx.createLinearGradient(0, 0, beamLength, 0);
  gradient.addColorStop(0, 'rgba(140, 220, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(140, 220, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(beamLength, -beamWidth / 2);
  ctx.lineTo(beamLength, beamWidth / 2);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(180, 235, 255, ${0.35 - i * 0.08})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(beamLength * (0.75 + i * 0.08), (-beamWidth / 3) + i * 22);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer() {
  if (player.hidden) return;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.facing);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-8, 14);
  ctx.lineTo(-18, 26);
  ctx.moveTo(8, 14);
  ctx.lineTo(18, 26);
  ctx.moveTo(-18, -2);
  ctx.lineTo(-32, 8);
  ctx.moveTo(12, -4);
  ctx.lineTo(28, -8);
  ctx.stroke();

  ctx.fillStyle = '#e9eef7';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#b8c7d9';
  ctx.fillRect(-10, 12, 20, 18);

  ctx.fillStyle = '#7fd8ff';
  ctx.beginPath();
  ctx.ellipse(6, -4, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a8f98';
  ctx.fillRect(10, 4, 20, 6);
  ctx.fillRect(24, 2, 8, 10);

  if (isVacuumActive()) {
    ctx.fillStyle = '#b8ecff';
    ctx.beginPath();
    ctx.arc(36, 7, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawShip() {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  const bodyColor = ship.repaired ? '#6a7a92' : '#596273';
  const coreGlow = ship.repaired ? 'rgba(120, 255, 190, 0.28)' : 'rgba(255, 120, 120, 0.22)';
  const windowColor = ship.repaired ? '#9efae0' : '#7fd8ff';

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(-95, 0);
  ctx.quadraticCurveTo(-20, -70, 90, -18);
  ctx.quadraticCurveTo(110, 0, 88, 18);
  ctx.quadraticCurveTo(-20, 68, -95, 0);
  ctx.fill();

  ctx.fillStyle = '#394252';
  ctx.beginPath();
  ctx.moveTo(-70, -8);
  ctx.lineTo(-18, -42);
  ctx.lineTo(54, -18);
  ctx.lineTo(36, 8);
  ctx.lineTo(-38, 20);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = windowColor;
  ctx.beginPath();
  ctx.ellipse(18, -8, 28, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2e3440';
  ctx.fillRect(-110, -18, 28, 36);
  ctx.fillRect(60, -12, 34, 24);

  ctx.strokeStyle = '#9aa4b5';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-8, 10);
  ctx.lineTo(22, 34);
  ctx.moveTo(40, -28);
  ctx.lineTo(78, -58);
  ctx.stroke();

  if (!ship.repaired) {
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-10, 6, 18, -0.8, 1.5);
    ctx.stroke();
  }

  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(86, -56, 16, 0, Math.PI * 2);
  ctx.fill();

  if (ship.repaired) {
    ctx.fillStyle = 'rgba(122, 255, 196, 0.22)';
    ctx.beginPath();
    ctx.ellipse(-114, 0, 24 + Math.abs(ship.speed) * 2, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRobot(npc, isNear) {
  const pulse = 0.5 + Math.sin(Date.now() * 0.006) * 0.5;

  ctx.save();
  ctx.translate(npc.x, npc.y);

  ctx.fillStyle = npc === recycleRobot ? '#ffd166' : '#94f0b4';
  ctx.beginPath();
  ctx.arc(0, -18, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d9e4f2';
  ctx.fillRect(-14, -6, 28, 28);
  ctx.fillStyle = '#5c6f86';
  ctx.fillRect(-8, 0, 16, 14);

  ctx.strokeStyle = '#cfd9e6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-10, 22);
  ctx.lineTo(-18, 36);
  ctx.moveTo(10, 22);
  ctx.lineTo(18, 36);
  ctx.moveTo(-14, 2);
  ctx.lineTo(-28, 12);
  ctx.moveTo(14, 2);
  ctx.lineTo(28, 12);
  ctx.stroke();

  ctx.fillStyle = '#0c2238';
  ctx.beginPath();
  ctx.arc(-4, -20, 2.2, 0, Math.PI * 2);
  ctx.arc(4, -20, 2.2, 0, Math.PI * 2);
  ctx.fill();

  if (isNear) {
    ctx.strokeStyle = `rgba(148, 240, 180, ${0.35 + pulse * 0.35})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 8, npc.interactRadius * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawInteractionMarker(targetX, targetY, label = 'E') {
  ctx.save();
  ctx.translate(targetX, targetY - 64);
  ctx.fillStyle = 'rgba(255, 224, 138, 0.95)';
  ctx.beginPath();
  ctx.roundRect(-22, -14, 44, 28, 10);
  ctx.fill();
  ctx.fillStyle = '#1a1d24';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

function drawRecycleStation() {
  ctx.save();
  ctx.translate(recycleStation.x, recycleStation.y);

  ctx.fillStyle = '#305160';
  ctx.fillRect(-140, -90, 280, 180);
  ctx.fillStyle = '#223946';
  ctx.fillRect(-120, -62, 240, 124);
  ctx.fillStyle = '#8affb5';
  ctx.fillRect(-92, -108, 184, 24);
  ctx.fillStyle = '#10212c';
  ctx.fillRect(-55, -42, 110, 76);
  ctx.fillStyle = '#d9fbe7';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('回收站', 0, -92);

  ctx.fillStyle = '#4d798b';
  for (let i = -100; i <= 100; i += 50) {
    ctx.fillRect(i - 15, 46, 30, 26);
  }

  ctx.restore();
}

function drawGearPart() {
  if (!gearPart.visible || score < 25) return;
  const time = Date.now() * 0.004;
  ctx.save();
  ctx.translate(gearPart.x, gearPart.y + Math.sin(time) * 6);
  ctx.rotate(time);

  ctx.fillStyle = '#ffd166';
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 8);
    ctx.fillRect(-4, -gearPart.radius - 6, 8, 14);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, gearPart.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8a6730';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.width, world.height);

  drawDebris();
  drawRecycleStation();
  drawGearPart();
  drawShip();
  drawRobot(recycleRobot, !ship.boarded && getDistance(player, recycleRobot) < recycleRobot.interactRadius);
  drawRobot(shipRobot, !ship.boarded && getDistance(player, shipRobot) < shipRobot.interactRadius);
  drawVacuumBeam();
  drawPlayer();

  const nearbyNpc = !ship.boarded ? getNearbyNpc() : null;
  if (nearbyNpc) {
    drawInteractionMarker(nearbyNpc.x, nearbyNpc.y, 'E');
  } else if (shipPromptAvailable) {
    drawInteractionMarker(ship.x, ship.y, 'F');
  }

  ctx.restore();

  if (showMinimap) drawMinimap();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}

initWorld();
updateQuestText();
updateStatusUI();
loop();
