"use strict";

    // ============================================================
    // Constants and shared helpers
    // ============================================================
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const startScreen = document.getElementById("startScreen");
    const pauseScreen = document.getElementById("pauseScreen");
    const gameOverScreen = document.getElementById("gameOverScreen");
    const gameOverText = document.getElementById("gameOverText");
    const restartButton = document.getElementById("restartButton");
    const interactionBox = document.getElementById("interaction");

    const VIEW_W = 1280;
    const VIEW_H = 720;
    const WORLD_W = 4800;
    const WORLD_H = 4200;
    const TAU = Math.PI * 2;

    const colors = {
      dust: "#987346",
      sand: "#c09a5c",
      scrub: "#52643d",
      darkScrub: "#35472f",
      leather: "#462411",
      coat: "#2c2018",
      brass: "#d8ae5a",
      red: "#a23a29",
      lawBlue: "#34465f",
      smoke: "rgba(215, 191, 151, 0.55)"
    };

    const keys = new Set();
    const mouse = {
      x: VIEW_W / 2,
      y: VIEW_H / 2,
      down: false,
      justDown: false
    };

    const camera = {
      x: 0,
      y: 0
    };

    const rng = mulberry32(382941);

    function mulberry32(seed) {
      return function random() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function rand(min, max) {
      return min + (max - min) * rng();
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }

    function distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function angleTo(a, b) {
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function normalize(x, y) {
      const len = Math.hypot(x, y);
      if (len < 0.0001) return { x: 0, y: 0 };
      return { x: x / len, y: y / len };
    }

    function screenToWorld(x, y) {
      return { x: x + camera.x, y: y + camera.y };
    }

    function rectContains(rect, x, y) {
      return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    function circleRectOverlap(cx, cy, radius, rect) {
      const nearestX = clamp(cx, rect.x, rect.x + rect.w);
      const nearestY = clamp(cy, rect.y, rect.y + rect.h);
      return Math.hypot(cx - nearestX, cy - nearestY) < radius;
    }

    function resolveCircleRect(entity, rect) {
      if (!circleRectOverlap(entity.x, entity.y, entity.radius, rect)) return;
      const nearestX = clamp(entity.x, rect.x, rect.x + rect.w);
      const nearestY = clamp(entity.y, rect.y, rect.y + rect.h);
      let dx = entity.x - nearestX;
      let dy = entity.y - nearestY;
      let len = Math.hypot(dx, dy);

      if (len < 0.001) {
        const left = Math.abs(entity.x - rect.x);
        const right = Math.abs(entity.x - (rect.x + rect.w));
        const top = Math.abs(entity.y - rect.y);
        const bottom = Math.abs(entity.y - (rect.y + rect.h));
        const minSide = Math.min(left, right, top, bottom);
        if (minSide === left) { dx = -1; dy = 0; len = 1; }
        else if (minSide === right) { dx = 1; dy = 0; len = 1; }
        else if (minSide === top) { dx = 0; dy = -1; len = 1; }
        else { dx = 0; dy = 1; len = 1; }
      }

      const push = entity.radius - len + 0.5;
      entity.x += (dx / len) * push;
      entity.y += (dy / len) * push;
      entity.vx *= 0.35;
      entity.vy *= 0.35;
    }

    function drawText(text, x, y, size, color, align = "left", weight = "700") {
      ctx.save();
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 8;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    // ============================================================
    // World generation
    // ============================================================
    const state = {
      mode: "start",
      time: 0,
      money: 0,
      score: 0,
      wanted: 0,
      wantedHeat: 0,
      nextLawSpawn: 0,
      gangWavesSpawned: 0,
      nextGangWaveCheck: 0,
      frameCount: 0,
      boundaryWarningCooldown: 0,
      wasInTown: true,
      cluesFound: 0,
      screenShake: 0,
      hitStop: 0,
      dayPhase: 0,
      message: "",
      messageTimer: 0,
      interaction: null,
      missionStep: 0,
      missionAmbushSpawned: false,
      missionComplete: false
    };

    const staticObjects = [];
    const buildings = [];
    const doors = [];
    const decor = [];
    const fences = [];
    const boundaryMarkers = [];
    const landmarks = [];
    const campProps = [];
    const lockedObjects = [];
    const dynamites = [];
    const lassos = [];
    const bullets = [];
    const particles = [];
    const pickups = [];
    const enemies = [];
    const townsfolk = [];
    const horses = [];
    const missionArgument = {
      x: 2660,
      y: 2140
    };

    const town = {
      name: "Mercy Ridge",
      nickname: "Hicksville",
      x: 2200,
      y: 1800,
      w: 950,
      h: 720
    };

    const camp = {
      name: "Darryl's Camp",
      x: 980,
      y: 3360,
      radius: 300
    };

    const darryl = {
      x: camp.x - 58,
      y: camp.y - 34,
      radius: 18,
      name: "Darryl"
    };

    function addRectObstacle(x, y, w, h, kind, name = "") {
      const obj = { x, y, w, h, kind, name };
      staticObjects.push(obj);
      return obj;
    }

    function addBuilding(name, x, y, w, h, color, doorSide, action) {
      const building = addRectObstacle(x, y, w, h, "building", name);
      building.color = color;
      building.action = action;
      buildings.push(building);

      let door = { x: x + w / 2, y: y + h + 12, w: 74, h: 42, building, prompt: "" };
      if (doorSide === "north") door = { x: x + w / 2, y: y - 12, w: 74, h: 42, building, prompt: "" };
      if (doorSide === "west") door = { x: x - 12, y: y + h / 2, w: 42, h: 74, building, prompt: "" };
      if (doorSide === "east") door = { x: x + w + 12, y: y + h / 2, w: 42, h: 74, building, prompt: "" };
      doors.push(door);
      return building;
    }

    function createWorld() {
      staticObjects.length = 0;
      buildings.length = 0;
      doors.length = 0;
      decor.length = 0;
      fences.length = 0;
      boundaryMarkers.length = 0;
      landmarks.length = 0;
      campProps.length = 0;
      lockedObjects.length = 0;
      dynamites.length = 0;
      lassos.length = 0;
      bullets.length = 0;
      particles.length = 0;
      pickups.length = 0;
      enemies.length = 0;
      townsfolk.length = 0;
      horses.length = 0;

      addBuilding("Gilded Spur Saloon", 2320, 1780, 240, 160, "#6b3319", "south", "saloon");
      addBuilding("Mercy Ridge Jail", 2640, 1815, 210, 140, "#5c4630", "south", "sheriff");
      addBuilding("Prosperity General", 2065, 1830, 210, 135, "#7a5228", "south", "store");
      addBuilding("Kingfisher Blacksmith", 2380, 2105, 230, 145, "#3d3427", "north", "blacksmith");
      addBuilding("Voss Boarding House", 2720, 2110, 220, 160, "#70502f", "north", "house");
      addBuilding("Old Mercy Chapel", 2050, 2130, 190, 160, "#4c493b", "north", "chapel");

      for (let i = 0; i < 12; i++) {
        const horizontal = i % 2 === 0;
        const x = 1960 + (i % 6) * 190;
        const y = i < 6 ? 1715 : 2365;
        const fence = addRectObstacle(x, y, horizontal ? 135 : 22, horizontal ? 22 : 130, "fence");
        fences.push(fence);
      }

      addTownBoundaryMarkers();

      for (let i = 0; i < 110; i++) {
        const nearTown = rng() < 0.2;
        const x = nearTown ? rand(town.x - 600, town.x + town.w + 600) : rand(150, WORLD_W - 150);
        const y = nearTown ? rand(town.y - 500, town.y + town.h + 500) : rand(150, WORLD_H - 150);
        if (x > town.x - 120 && x < town.x + town.w + 120 && y > town.y - 100 && y < town.y + town.h + 100) continue;
        const type = rng() < 0.48 ? "cactus" : (rng() < 0.72 ? "tree" : "rock");
        const radius = type === "rock" ? rand(18, 34) : rand(24, 42);
        decor.push({ x, y, radius, type, rot: rand(0, TAU) });
        staticObjects.push({ x: x - radius * 0.55, y: y - radius * 0.55, w: radius * 1.1, h: radius * 1.1, kind: type });
      }

      addHauntedFlatsLandmarks();
      addOutlawCamp();
      addLockedObjects();

      const enemySpawns = [
        [1220, 980], [1510, 1050], [3300, 1120], [3650, 1600],
        [1500, 3020], [3480, 3160], [3900, 2550], [900, 2300]
      ];
      enemySpawns.forEach((p, i) => {
        const type = (i === 2 || i === 6) ? "rusher" : (i % 5 === 0 ? "enforcer" : "bandit");
        enemies.push(new Enemy(p[0], p[1], type));
      });

      for (let i = 0; i < 6; i++) {
        townsfolk.push(new Townsfolk(2140 + i * 140 + rand(-40, 40), 2020 + rand(-230, 230)));
      }

      horses.push(new Horse(2260, 2460));
      horses.push(new Horse(2980, 1690));
      horses.push(new Horse(camp.x - 220, camp.y - 178));
    }

    function addTownBoundaryMarkers() {
      const margin = 170;
      const left = town.x - margin;
      const right = town.x + town.w + margin;
      const top = town.y - margin;
      const bottom = town.y + town.h + margin;
      const points = [
        [left, top, -0.45], [town.x + town.w * 0.33, top - 18, 0], [town.x + town.w * 0.66, top - 18, 0], [right, top, 0.45],
        [right + 18, town.y + town.h * 0.33, Math.PI / 2], [right + 18, town.y + town.h * 0.66, Math.PI / 2],
        [right, bottom, 2.7], [town.x + town.w * 0.66, bottom + 18, Math.PI], [town.x + town.w * 0.33, bottom + 18, Math.PI], [left, bottom, -2.7],
        [left - 18, town.y + town.h * 0.66, -Math.PI / 2], [left - 18, town.y + town.h * 0.33, -Math.PI / 2]
      ];
      for (const [x, y, rot] of points) {
        boundaryMarkers.push({ x, y, rot, radius: 34 });
      }
    }

    function addSecretClue(x, y, label, message) {
      pickups.push({ x, y, type: "clue", value: label, message, radius: 16, secret: true });
    }

    function addHauntedFlatsLandmarks() {
      landmarks.push(
        { type: "dryRiverbed", x: 820, y: 1360, name: "Deadman's Wash" },
        { type: "boneArch", x: 1260, y: 1120, name: "Bone Arch" },
        { type: "wagonCircle", x: 3720, y: 2780, name: "Black Wheel Camp" },
        { type: "desertShrine", x: 760, y: 2520, name: "Bell-Saint Shrine" },
        { type: "chapelRoute", x: 1880, y: 2740, name: "Old Chapel Road" },
        { type: "collapsedMine", x: 1660, y: 3340, name: "Ash Hollow Mouth" }
      );

      staticObjects.push({ x: 1605, y: 3300, w: 110, h: 72, kind: "mine", name: "Ash Hollow Mouth" });
      staticObjects.push({ x: 1210, y: 1090, w: 100, h: 44, kind: "boneArch", name: "Bone Arch" });

      addSecretClue(1315, 1195, "Bone tally", "A bone tally lists seven names, each scratched backward.");
      addSecretClue(3825, 2860, "Burnt wanted poster", "The poster is half Silas Voss, half prayer.");
      addSecretClue(735, 2590, "Bell charm", "A little bell charm rings without moving.");
      addSecretClue(1718, 3388, "Ash Hollow note", "Someone wrote: Chris promised he'd come back.");
    }

    function addOutlawCamp() {
      darryl.x = camp.x - 58;
      darryl.y = camp.y - 34;
      campProps.push(
        { type: "campfire", x: camp.x, y: camp.y, radius: 74 },
        { type: "bedroll", x: camp.x + 86, y: camp.y + 58, rot: -0.35, radius: 58 },
        { type: "bedroll", x: camp.x - 126, y: camp.y + 74, rot: 0.42, radius: 58 },
        { type: "supplyWagon", x: camp.x + 188, y: camp.y - 66, rot: 0.18, radius: 88 },
        { type: "hitch", x: camp.x - 192, y: camp.y - 112, rot: -0.25, radius: 56 },
        { type: "coffee", x: camp.x + 38, y: camp.y - 76, radius: 42 }
      );
      staticObjects.push({ x: camp.x + 132, y: camp.y - 114, w: 116, h: 88, kind: "campWagon", name: "Supply Wagon" });
    }

    function addLockedObjects() {
      lockedObjects.push(
        { x: 2865, y: 2250, radius: 34, type: "chest", name: "Voss strongbox", opened: false, crime: true, money: 14, ammo: 8 },
        { x: 2135, y: 2248, radius: 34, type: "chest", name: "Chapel reliquary", opened: false, crime: true, money: 5, ammo: 0 },
        { x: 3745, y: 2855, radius: 34, type: "chest", name: "Burnt wagon lockbox", opened: false, crime: false, money: 8, ammo: 10 }
      );
    }

    // ============================================================
    // Audio, particles, and feedback
    // ============================================================
    let audioCtx = null;

    function tone(freq, duration, type, gain, slide = 0) {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const amp = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + duration);
      amp.gain.setValueAtTime(gain, audioCtx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(amp);
      amp.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    function playGunshot(strong = true) {
      tone(strong ? 145 : 105, 0.09, "sawtooth", strong ? 0.065 : 0.04, -70);
      tone(660, 0.035, "square", strong ? 0.035 : 0.018, -280);
    }

    function playReload() {
      tone(300, 0.05, "triangle", 0.025, -90);
      setTimeout(() => tone(210, 0.05, "triangle", 0.025, 80), 120);
    }

    function playHit() {
      tone(90, 0.08, "triangle", 0.035, -35);
    }

    function addParticle(x, y, vx, vy, life, size, color, kind = "dust") {
      particles.push({ x, y, vx, vy, life, maxLife: life, size, color, kind, rot: rand(0, TAU) });
    }

    function burstDust(x, y, count, color = colors.smoke) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const s = rand(30, 180);
        addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.7), rand(3, 12), color);
      }
    }

    function impactBurst(x, y, angle, strong = false) {
      const base = angle + Math.PI;
      const count = strong ? 14 : 9;
      for (let i = 0; i < count; i++) {
        const a = base + rand(-0.85, 0.85);
        const s = rand(strong ? 120 : 70, strong ? 340 : 210);
        const spark = i < count * 0.45;
        addParticle(
          x,
          y,
          Math.cos(a) * s,
          Math.sin(a) * s,
          rand(0.08, spark ? 0.18 : 0.34),
          rand(spark ? 2 : 4, spark ? 5 : 10),
          spark ? "rgba(255, 216, 111, 0.92)" : "rgba(214, 183, 137, 0.58)",
          spark ? "spark" : "dust"
        );
      }
    }

    function floatingText(x, y, text, color) {
      particles.push({ x, y, vx: rand(-12, 12), vy: -55, life: 0.85, maxLife: 0.85, size: 16, color, kind: "text", text });
    }

    // ============================================================
    // Entity classes
    // ============================================================
    class Player {
      constructor() {
        this.x = 2430;
        this.y = 2250;
        this.vx = 0;
        this.vy = 0;
        this.radius = 18;
        this.hp = 100;
        this.maxHp = 100;
        this.ammo = 6;
        this.reserveAmmo = 30;
        this.reloadTimer = 0;
        this.fireCooldown = 0;
        this.recoil = 0;
        this.hitFlash = 0;
        this.mounted = null;
        this.lastAim = 0;
        this.dashCooldown = 0;
        this.dashTimer = 0;
        this.dashInvuln = 0;
        this.dashTrailTimer = 0;
        this.dashRequested = false;
        this.dashDirX = 1;
        this.dashDirY = 0;
        this.deadEyeMeter = 100;
        this.deadEyeActive = false;
        this.deadEyeCooldown = 0;
        this.deadEyePulse = 0;
        this.dynamiteCount = 3;
        this.dynamiteCooldown = 0;
        this.lassoCooldown = 0;
        this.lockpicks = 3;
      }

      update(dt) {
        let mx = 0;
        let my = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) my -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) my += 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
        const dir = normalize(mx, my);
        const mounted = !!this.mounted;
        const accel = mounted ? 1360 : 1040;
        const maxSpeed = mounted ? 395 : 275;
        const friction = mounted ? 4.05 : 6.35;

        const aim = screenToWorld(mouse.x, mouse.y);
        this.lastAim = angleTo(this, aim);

        if (this.dashCooldown > 0) this.dashCooldown -= dt;
        if (this.dashTimer > 0) this.dashTimer -= dt;
        if (this.dashInvuln > 0) this.dashInvuln -= dt;
        if (this.dashTrailTimer > 0) this.dashTrailTimer -= dt;
        if (this.deadEyeCooldown > 0) this.deadEyeCooldown -= dt;
        if (this.dynamiteCooldown > 0) this.dynamiteCooldown -= dt;
        if (this.lassoCooldown > 0) this.lassoCooldown -= dt;
        if (this.deadEyeActive) {
          this.deadEyeMeter = Math.max(0, this.deadEyeMeter - dt * 27);
          this.deadEyePulse += dt * 8;
          if (this.deadEyeMeter <= 0) this.stopDeadEye();
        } else {
          this.deadEyeMeter = Math.min(100, this.deadEyeMeter + dt * 7.5);
        }

        if (this.dashRequested) {
          this.tryDash(dir);
          this.dashRequested = false;
        }

        if (this.dashTimer > 0) {
          const dashSpeed = mounted ? 660 : 560;
          this.vx = this.dashDirX * dashSpeed;
          this.vy = this.dashDirY * dashSpeed;
          if (this.dashTrailTimer <= 0) {
            this.dashTrailTimer = 0.035;
            for (let i = 0; i < 5; i++) {
              addParticle(
                this.x - this.dashDirX * rand(8, 24),
                this.y - this.dashDirY * rand(8, 24),
                -this.dashDirX * rand(45, 150) + rand(-30, 30),
                -this.dashDirY * rand(45, 150) + rand(-30, 30),
                rand(0.18, 0.36),
                rand(4, 11),
                "rgba(231, 203, 155, 0.55)"
              );
            }
          }
        } else {
          this.vx += dir.x * accel * dt;
          this.vy += dir.y * accel * dt;
          this.vx -= this.vx * friction * dt;
          this.vy -= this.vy * friction * dt;
        }

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > maxSpeed) {
          const speedCap = this.dashTimer > 0 ? speed : maxSpeed;
          this.vx = (this.vx / speed) * speedCap;
          this.vy = (this.vy / speed) * speedCap;
        }

        const moveSteps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy) * dt / 16));
        for (let i = 0; i < moveSteps; i++) {
          this.x += this.vx * dt / moveSteps;
          this.y += this.vy * dt / moveSteps;
          this.x = clamp(this.x, 40, WORLD_W - 40);
          this.y = clamp(this.y, 40, WORLD_H - 40);

          const collisionBody = { x: this.x, y: this.y, vx: this.vx, vy: this.vy, radius: mounted ? 28 : this.radius };
          for (const obj of staticObjects) resolveCircleRect(collisionBody, obj);
          this.x = collisionBody.x;
          this.y = collisionBody.y;
          this.vx = collisionBody.vx;
          this.vy = collisionBody.vy;
        }

        if (this.mounted) {
          this.mounted.x = this.x;
          this.mounted.y = this.y + 8;
        }

        if (this.fireCooldown > 0) this.fireCooldown -= dt;
        if (this.recoil > 0) this.recoil -= dt * 7;
        if (this.hitFlash > 0) this.hitFlash -= dt * 3;
        if (this.reloadTimer > 0) {
          this.reloadTimer -= dt;
          if (this.reloadTimer <= 0) {
            const needed = 6 - this.ammo;
            const loaded = Math.min(needed, this.reserveAmmo);
            this.ammo += loaded;
            this.reserveAmmo -= loaded;
            showMessage(loaded > 0 ? "Cylinder loaded." : "No spare rounds.");
          }
        }

        if ((mouse.down || keys.has("Space")) && this.fireCooldown <= 0) this.shoot();
      }

      requestDash() {
        this.dashRequested = true;
      }

      toggleDeadEye() {
        if (this.deadEyeActive) {
          this.stopDeadEye();
          return;
        }
        if (this.deadEyeCooldown > 0 || this.deadEyeMeter < 20) {
          showMessage("Dead Eye needs a breath.");
          return;
        }
        this.deadEyeActive = true;
        this.deadEyeCooldown = 0.35;
        this.deadEyePulse = 0;
        state.screenShake = Math.max(state.screenShake, 3);
        showMessage("Dead Eye.", 1.1);
        tone(240, 0.12, "sine", 0.028, -120);
      }

      stopDeadEye() {
        if (!this.deadEyeActive) return;
        this.deadEyeActive = false;
        this.deadEyeCooldown = 0.45;
      }

      tryDash(inputDir) {
        if (this.dashCooldown > 0 || this.dashTimer > 0) return;
        let dx = inputDir.x;
        let dy = inputDir.y;
        if (Math.hypot(dx, dy) < 0.1) {
          dx = Math.cos(this.lastAim);
          dy = Math.sin(this.lastAim);
        }
        const dashDir = normalize(dx, dy);
        this.dashDirX = dashDir.x;
        this.dashDirY = dashDir.y;
        this.dashTimer = this.mounted ? 0.18 : 0.15;
        this.dashInvuln = this.mounted ? 0.2 : 0.18;
        this.dashCooldown = this.mounted ? 0.78 : 0.62;
        this.dashTrailTimer = 0;
        state.screenShake = Math.max(state.screenShake, 3);
        burstDust(this.x - dashDir.x * 8, this.y - dashDir.y * 8, this.mounted ? 12 : 8, "rgba(219, 190, 139, 0.48)");
        tone(190, 0.045, "triangle", 0.018, -60);
      }

      shoot() {
        if (state.mode !== "playing") return;
        if (this.reloadTimer > 0) return;
        if (this.ammo <= 0) {
          showMessage("Empty cylinder. Press R to reload.");
          this.fireCooldown = 0.18;
          tone(260, 0.04, "square", 0.018, -80);
          return;
        }

        this.ammo -= 1;
        this.fireCooldown = this.deadEyeActive ? 0.23 : 0.32;
        this.recoil = 1.25;
        state.screenShake = Math.max(state.screenShake, this.deadEyeActive ? 11 : 9);
        playGunshot(true);

        const a = this.lastAim + rand(-0.018, 0.018);
        const burst = this.deadEyeActive ? 3 : 1;
        const damage = this.deadEyeActive ? 42 : 35;
        for (let i = 0; i < burst; i++) {
          const spread = burst === 1 ? 0 : (i - 1) * 0.025;
          const ba = a + spread;
          const sx = this.x + Math.cos(ba) * 30;
          const sy = this.y + Math.sin(ba) * 30;
          bullets.push(new Bullet(sx, sy, Math.cos(ba) * (this.deadEyeActive ? 930 : 850), Math.sin(ba) * (this.deadEyeActive ? 930 : 850), "player", damage, 1.05));
        }
        if (this.deadEyeActive) this.deadEyeMeter = Math.max(0, this.deadEyeMeter - 6);
        const sx = this.x + Math.cos(a) * 30;
        const sy = this.y + Math.sin(a) * 30;
        addParticle(sx, sy, Math.cos(a) * 110, Math.sin(a) * 110, 0.075, 28, "rgba(255, 211, 92, 0.95)", "flash");
        addParticle(sx - Math.cos(a) * 8, sy - Math.sin(a) * 8, -Math.sin(a) * rand(60, 120), Math.cos(a) * rand(60, 120), 0.22, 4, "rgba(231, 181, 89, 0.85)", "spark");
        for (let i = 0; i < 7; i++) addParticle(sx, sy, rand(-45, 45) + Math.cos(a) * rand(20, 80), rand(-45, 45) + Math.sin(a) * rand(20, 80), 0.26, rand(3, 8), "rgba(230, 211, 180, 0.52)");

        if (isInTown(this.x, this.y)) addWanted(0.25);
      }

      reload() {
        if (this.reloadTimer > 0 || this.ammo >= 6 || this.reserveAmmo <= 0) return;
        this.reloadTimer = 1.2;
        playReload();
        showMessage("Reloading...");
      }

      throwDynamite() {
        if (state.mode !== "playing") return;
        if (this.dynamiteCooldown > 0) return;
        if (this.dynamiteCount <= 0) {
          showMessage("No dynamite left.");
          return;
        }
        this.dynamiteCount--;
        this.dynamiteCooldown = 0.72;
        const a = this.lastAim;
        const sx = this.x + Math.cos(a) * 22;
        const sy = this.y + Math.sin(a) * 22;
        const speed = this.mounted ? 560 : 490;
        dynamites.push(new Dynamite(sx, sy, Math.cos(a) * speed + this.vx * 0.2, Math.sin(a) * speed + this.vy * 0.2));
        showMessage("Dynamite out!", 0.9);
        tone(160, 0.06, "triangle", 0.026, -70);
        if (isInTown(this.x, this.y)) addWanted(0.55);
      }

      throwLasso() {
        if (state.mode !== "playing") return;
        if (this.lassoCooldown > 0) return;
        this.lassoCooldown = 0.62;
        const a = this.lastAim;
        lassos.push(new Lasso(this.x, this.y, a));
        tone(360, 0.05, "triangle", 0.02, -90);
      }

      damage(amount, source) {
        if (this.dashInvuln > 0) {
          floatingText(this.x, this.y - 30, "DODGED", "#d8f5ff");
          burstDust(this.x, this.y, 6, "rgba(210, 236, 255, 0.36)");
          state.screenShake = Math.max(state.screenShake, 2);
          return;
        }
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 1;
        state.screenShake = Math.max(state.screenShake, 10);
        playHit();
        floatingText(this.x, this.y - 30, `-${amount}`, "#ff776e");
        if (source === "law") addWanted(0.1);
        if (this.hp <= 0) endGame();
      }

      render() {
        const x = this.x;
        const y = this.y;
        const a = this.lastAim;
        ctx.save();

        if (this.dashTimer > 0) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#f4d49d";
          ctx.translate(x - this.dashDirX * 24, y - this.dashDirY * 24);
          ctx.rotate(Math.atan2(this.dashDirY, this.dashDirX));
          ctx.beginPath();
          ctx.ellipse(0, 0, 23, 11, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }

        if (this.mounted) {
          ctx.translate(x, y + 10);
          ctx.rotate(Math.atan2(this.vy, this.vx || 1) * 0.15);
          ctx.fillStyle = "#5a351e";
          ctx.beginPath();
          ctx.ellipse(0, 0, 34, 18, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#2b180e";
          ctx.beginPath();
          ctx.ellipse(22, -2, 12, 10, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "#1d1009";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-22, -10);
          ctx.lineTo(-34, -23);
          ctx.moveTo(-22, 10);
          ctx.lineTo(-34, 23);
          ctx.moveTo(16, -10);
          ctx.lineTo(28, -23);
          ctx.moveTo(16, 10);
          ctx.lineTo(28, 23);
          ctx.stroke();
          ctx.restore();
          ctx.save();
        }

        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.strokeStyle = "#1a100b";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(6, 3);
        ctx.lineTo(31 + this.recoil * 5, 3);
        ctx.stroke();
        ctx.strokeStyle = colors.brass;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(23, 3);
        ctx.lineTo(39 + this.recoil * 5, 3);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = this.hitFlash > 0 ? "#d99a70" : colors.coat;
        ctx.beginPath();
        ctx.ellipse(0, 5, 14, 18, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#d0a36d";
        ctx.beginPath();
        ctx.arc(0, -10, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#29160c";
        ctx.beginPath();
        ctx.ellipse(0, -17, 20, 7, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#3c2111";
        ctx.fillRect(-10, -28, 20, 14);
        ctx.strokeStyle = colors.brass;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, -16);
        ctx.lineTo(11, -16);
        ctx.stroke();
        ctx.restore();
      }
    }

    class Enemy {
      constructor(x, y, type = "bandit", law = false) {
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = type === "enforcer" ? 19 : (type === "rusher" ? 16 : 17);
        this.type = type;
        this.law = law;
        this.hp = type === "enforcer" ? 90 : (type === "rusher" ? 55 : (law ? 75 : 60));
        this.maxHp = this.hp;
        this.state = "idle";
        this.cooldown = rand(0.2, 1.4);
        this.patrolAngle = rand(0, TAU);
        this.patrolTimer = rand(1, 3);
        this.hitFlash = 0;
        this.aimWindup = 0;
        this.aimWindupMax = 0;
        this.tellAngle = 0;
        this.chargeWindup = 0;
        this.chargeWindupMax = 0.48;
        this.chargeTimer = 0;
        this.chargeCooldown = rand(0.5, 1.6);
        this.chargeDirX = 0;
        this.chargeDirY = 0;
        this.hasChargedHit = false;
        this.stunTimer = 0;
        this.dead = false;
      }

      update(dt) {
        if (this.dead) return;
        if (this.hitFlash > 0) this.hitFlash -= dt * 5.5;
        if (this.stunTimer > 0) {
          this.stunTimer -= dt;
          this.vx *= Math.pow(0.03, dt);
          this.vy *= Math.pow(0.03, dt);
          return;
        }
        if (this.chargeCooldown > 0) this.chargeCooldown -= dt;
        const d = distance(this, player);
        const detect = this.law ? 760 : 620;
        const attackRange = this.law ? 560 : 470;

        if (!this.law && isInCamp(player.x, player.y)) {
          this.state = "patrol";
          this.aimWindup = 0;
          this.chargeWindup = 0;
          this.chargeTimer = 0;
        } else if (d < detect) this.state = d < attackRange ? "attack" : "chase";
        else if (this.state !== "patrol") this.state = "patrol";
        if (this.state !== "attack") this.aimWindup = 0;
        if (this.state === "patrol") {
          this.chargeWindup = 0;
          this.chargeTimer = 0;
        }

        let ax = 0;
        let ay = 0;

        // AI state machine: patrol until the player enters detection range, then
        // chase into revolver range and strafe while firing with imperfect aim.
        if (this.state === "patrol") {
          this.patrolTimer -= dt;
          if (this.patrolTimer <= 0) {
            this.patrolAngle = rand(0, TAU);
            this.patrolTimer = rand(1.2, 3.4);
          }
          ax = Math.cos(this.patrolAngle) * 0.55;
          ay = Math.sin(this.patrolAngle) * 0.55;
          if (Math.hypot(this.x - this.spawnX, this.y - this.spawnY) > 240) {
            const back = normalize(this.spawnX - this.x, this.spawnY - this.y);
            ax = back.x;
            ay = back.y;
          }
        }

        if (this.state === "chase") {
          const toward = normalize(player.x - this.x, player.y - this.y);
          ax = toward.x;
          ay = toward.y;
        }

        if (this.state === "attack") {
          const toward = normalize(player.x - this.x, player.y - this.y);
          if (this.type === "rusher") {
            if (this.chargeTimer > 0) {
              ax = this.chargeDirX * 4.2;
              ay = this.chargeDirY * 4.2;
              this.chargeTimer -= dt;
              if (!this.hasChargedHit && d < player.radius + this.radius + 18) {
                this.hasChargedHit = true;
                player.damage(18, "enemy");
                state.screenShake = Math.max(state.screenShake, 11);
                impactBurst(player.x, player.y, angleTo(this, player), true);
              }
              if (this.chargeTimer <= 0) this.chargeCooldown = rand(1.15, 1.9);
            } else if (this.chargeWindup > 0) {
              this.tellAngle = angleTo(this, player);
              this.chargeWindup -= dt;
              ax = -toward.x * 0.25;
              ay = -toward.y * 0.25;
              if (this.chargeWindup <= 0) this.startCharge();
            } else if (d < 360 && this.chargeCooldown <= 0) {
              this.beginChargeTell();
              ax = -toward.x * 0.15;
              ay = -toward.y * 0.15;
            } else {
              ax = toward.x;
              ay = toward.y;
            }
          } else {
            const strafe = Math.sin(state.time * 2.4 + this.x * 0.01) > 0 ? 1 : -1;
            ax = -toward.x * (d < 260 ? 0.75 : -0.25) + -toward.y * 0.45 * strafe;
            ay = -toward.y * (d < 260 ? 0.75 : -0.25) + toward.x * 0.45 * strafe;
            if (this.aimWindup > 0) {
              this.tellAngle = angleTo(this, player);
              this.aimWindup -= dt;
              if (this.aimWindup <= 0) this.shoot();
            } else {
              this.cooldown -= dt;
              if (this.cooldown <= 0) {
                if (canEnemyStartShot(this)) this.beginShotTell();
                else this.cooldown = rand(0.18, 0.38);
              }
            }
          }
        } else {
          this.cooldown = Math.max(0.25, this.cooldown - dt * 0.4);
        }

        if (!(this.type === "rusher" && this.chargeTimer > 0)) {
          const spacing = enemySpacingVector(this);
          ax += spacing.x;
          ay += spacing.y;
        }

        const dir = normalize(ax, ay);
        const charging = this.type === "rusher" && this.chargeTimer > 0;
        const maxSpeed = charging ? 320 : (this.law ? 145 : (this.type === "enforcer" ? 118 : (this.type === "rusher" ? 135 : 105)));
        const accel = charging ? 1450 : 420;
        const drag = charging ? 2.0 : 5.5;
        this.vx += dir.x * accel * dt;
        this.vy += dir.y * accel * dt;
        this.vx -= this.vx * drag * dt;
        this.vy -= this.vy * drag * dt;
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > maxSpeed) {
          this.vx = (this.vx / speed) * maxSpeed;
          this.vy = (this.vy / speed) * maxSpeed;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.x = clamp(this.x, 30, WORLD_W - 30);
        this.y = clamp(this.y, 30, WORLD_H - 30);
        for (const obj of staticObjects) resolveCircleRect(this, obj);
      }

      beginShotTell() {
        this.tellAngle = angleTo(this, player);
        this.aimWindupMax = this.type === "enforcer" ? 0.52 : (this.law ? 0.34 : 0.42);
        this.aimWindup = this.aimWindupMax;
      }

      beginChargeTell() {
        this.tellAngle = angleTo(this, player);
        this.chargeWindupMax = 0.48;
        this.chargeWindup = this.chargeWindupMax;
        this.chargeCooldown = rand(0.55, 0.9);
        this.hasChargedHit = false;
        this.vx *= 0.25;
        this.vy *= 0.25;
      }

      startCharge() {
        const dir = normalize(player.x - this.x, player.y - this.y);
        this.tellAngle = Math.atan2(dir.y, dir.x);
        this.chargeDirX = dir.x;
        this.chargeDirY = dir.y;
        this.chargeTimer = 0.42;
        this.hasChargedHit = false;
        this.vx = dir.x * 110;
        this.vy = dir.y * 110;
        state.screenShake = Math.max(state.screenShake, 3);
      }

      shoot() {
        this.cooldown = this.type === "enforcer" ? rand(1.35, 2.05) : (this.law ? rand(0.8, 1.35) : rand(1.0, 1.65));
        const inaccuracy = this.law ? 0.12 : 0.18;
        const baseAngle = Number.isFinite(this.tellAngle) ? this.tellAngle : angleTo(this, player);
        const pelletCount = this.type === "enforcer" ? 3 : 1;
        for (let i = 0; i < pelletCount; i++) {
          const spread = pelletCount > 1 ? (i - 1) * 0.16 : 0;
          const a = baseAngle + spread + rand(-inaccuracy, inaccuracy);
          const sx = this.x + Math.cos(a) * 25;
          const sy = this.y + Math.sin(a) * 25;
          const speed = this.type === "enforcer" ? rand(590, 650) : 650;
          const damage = this.type === "enforcer" ? 13 : (this.law ? 18 : 15);
          const lifetime = this.type === "enforcer" ? 0.9 : 1.2;
          bullets.push(new Bullet(sx, sy, Math.cos(a) * speed, Math.sin(a) * speed, this.law ? "law" : "enemy", damage, lifetime));
        }
        const sx = this.x + Math.cos(baseAngle) * 25;
        const sy = this.y + Math.sin(baseAngle) * 25;
        addParticle(sx, sy, 0, 0, 0.07, this.type === "enforcer" ? 24 : 19, "rgba(255, 184, 71, 0.78)", "flash");
        addParticle(sx, sy, -Math.sin(baseAngle) * rand(35, 90), Math.cos(baseAngle) * rand(35, 90), 0.18, 3, "rgba(231, 181, 89, 0.72)", "spark");
        playGunshot(false);
      }

      damage(amount) {
        this.hp -= amount;
        this.hitFlash = 1;
        state.screenShake = Math.max(state.screenShake, this.type === "enforcer" ? 7 : 5);
        state.hitStop = Math.max(state.hitStop, this.type === "enforcer" ? 0.055 : 0.038);
        playHit();
        burstDust(this.x, this.y, 9, "rgba(156, 57, 35, 0.55)");
        floatingText(this.x, this.y - 28, `-${amount}`, "#fff0a8");
        if (this.hp <= 0) {
          this.dead = true;
          state.score += this.law ? 25 : 40;
          if (this.law) addWanted(0.2);
          dropLoot(this.x, this.y, this.law ? 0.35 : 0.8);
          burstDust(this.x, this.y, 18, "rgba(91, 47, 31, 0.5)");
        }
      }

      renderTell() {
        const aiming = this.aimWindup > 0 && this.aimWindupMax > 0;
        const charging = this.chargeWindup > 0 && this.chargeWindupMax > 0;
        if (!aiming && !charging) return;

        const angle = Number.isFinite(this.tellAngle) ? this.tellAngle : angleTo(this, player);
        const remaining = aiming ? this.aimWindup / this.aimWindupMax : this.chargeWindup / this.chargeWindupMax;
        const urgency = clamp(1 - remaining, 0, 1);

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        ctx.lineCap = "round";

        if (charging) {
          ctx.globalAlpha = 0.3 + urgency * 0.45;
          ctx.strokeStyle = "#ff4d35";
          ctx.lineWidth = 7 + urgency * 5;
          ctx.setLineDash([18, 12]);
          ctx.beginPath();
          ctx.moveTo(24, 0);
          ctx.lineTo(250, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255, 77, 53, 0.22)";
          ctx.beginPath();
          ctx.moveTo(42, -13);
          ctx.lineTo(88, 0);
          ctx.lineTo(42, 13);
          ctx.closePath();
          ctx.fill();
        } else if (this.type === "enforcer") {
          ctx.globalAlpha = 0.22 + urgency * 0.34;
          ctx.fillStyle = "#ff563f";
          ctx.beginPath();
          ctx.moveTo(22, 0);
          ctx.lineTo(235, -44);
          ctx.lineTo(235, 44);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.42 + urgency * 0.35;
          ctx.strokeStyle = "#ffd08a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(24, 0);
          ctx.lineTo(235, -44);
          ctx.moveTo(24, 0);
          ctx.lineTo(235, 44);
          ctx.stroke();
        } else {
          ctx.globalAlpha = 0.42 + urgency * 0.42;
          ctx.strokeStyle = this.law ? "#9fc6ff" : "#ff674d";
          ctx.lineWidth = 4 + urgency * 2;
          ctx.setLineDash([14, 10]);
          ctx.beginPath();
          ctx.moveTo(24, 0);
          ctx.lineTo(250, 0);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = this.law ? "#cfe2ff" : "#ffd08a";
          ctx.beginPath();
          ctx.arc(38, 0, 3 + urgency * 2.5, 0, TAU);
          ctx.fill();
        }

        ctx.restore();
      }

      render() {
        if (this.dead) return;
        this.renderTell();
        const a = angleTo(this, player);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(a);
        ctx.strokeStyle = "#1b120c";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(4, 2);
        ctx.lineTo(27, 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.hitFlash > 0 ? "#ffd0a2" : (this.law ? colors.lawBlue : (this.type === "enforcer" ? "#563021" : "#4b2d1d"));
        ctx.beginPath();
        ctx.ellipse(0, 5, 13, 17, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#c28b5d";
        ctx.beginPath();
        ctx.arc(0, -10, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = this.law ? "#1a2537" : "#24160d";
        ctx.beginPath();
        ctx.ellipse(0, -17, 18, 6, 0, 0, TAU);
        ctx.fill();
        if (this.type === "enforcer") {
          ctx.fillStyle = colors.brass;
          ctx.fillRect(-4, -1, 8, 4);
        }
        if (this.stunTimer > 0) {
          ctx.strokeStyle = "#f3d978";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, -28, 18 + Math.sin(state.time * 12) * 3, 7, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();

        const hpw = 34;
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(this.x - hpw / 2, this.y - 36, hpw, 5);
        ctx.fillStyle = this.law ? "#8eb1e1" : "#c04d35";
        ctx.fillRect(this.x - hpw / 2, this.y - 36, hpw * Math.max(0, this.hp / this.maxHp), 5);
      }
    }

    class Townsfolk {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 14;
        this.hp = 35;
        this.dead = false;
        this.pathAngle = rand(0, TAU);
        this.timer = rand(1, 4);
      }

      update(dt) {
        if (this.dead) return;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.pathAngle = rand(0, TAU);
          this.timer = rand(1.5, 4.5);
        }
        const fear = state.wanted > 0 || distance(this, player) < 170 && (mouse.down || keys.has("Space"));
        const dir = fear ? normalize(this.x - player.x, this.y - player.y) : { x: Math.cos(this.pathAngle), y: Math.sin(this.pathAngle) };
        const speed = fear ? 130 : 48;
        this.vx = lerp(this.vx, dir.x * speed, dt * 2);
        this.vy = lerp(this.vy, dir.y * speed, dt * 2);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.x = clamp(this.x, town.x + 20, town.x + town.w - 20);
        this.y = clamp(this.y, town.y + 30, town.y + town.h - 30);
        for (const obj of staticObjects) resolveCircleRect(this, obj);
      }

      damage(amount) {
        this.hp -= amount;
        if (this.hp <= 0 && !this.dead) {
          this.dead = true;
          addWanted(1.6);
          state.score -= 100;
          showMessage("A townsperson fell. The law will answer.");
          burstDust(this.x, this.y, 16, "rgba(147, 51, 33, 0.52)");
        }
      }

      render() {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = "#756042";
        ctx.beginPath();
        ctx.ellipse(0, 4, 11, 15, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#d1a474";
        ctx.beginPath();
        ctx.arc(0, -9, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#5b442b";
        ctx.beginPath();
        ctx.ellipse(0, -14, 15, 5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    class Bullet {
      constructor(x, y, vx, vy, owner, damage, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.owner = owner;
        this.damage = damage;
        this.life = life;
        this.dead = false;
        this.radius = 4;
      }

      update(dt) {
        const steps = Math.ceil(Math.hypot(this.vx, this.vy) * dt / 28);
        for (let i = 0; i < steps; i++) {
          if (this.dead) return;
          this.x += this.vx * dt / steps;
          this.y += this.vy * dt / steps;

          if (this.x < 0 || this.x > WORLD_W || this.y < 0 || this.y > WORLD_H) {
            this.dead = true;
            return;
          }

          for (const obj of staticObjects) {
            if (rectContains(obj, this.x, this.y)) {
              this.dead = true;
              impactBurst(this.x, this.y, Math.atan2(this.vy, this.vx), false);
              burstDust(this.x, this.y, 8, "rgba(205, 176, 126, 0.52)");
              return;
            }
          }

          if (this.owner === "player") {
            for (const enemy of enemies) {
              if (!enemy.dead && Math.hypot(enemy.x - this.x, enemy.y - this.y) < enemy.radius + this.radius) {
                impactBurst(this.x, this.y, Math.atan2(this.vy, this.vx), true);
                enemy.damage(this.damage);
                this.dead = true;
                return;
              }
            }
            for (const folk of townsfolk) {
              if (!folk.dead && Math.hypot(folk.x - this.x, folk.y - this.y) < folk.radius + this.radius) {
                impactBurst(this.x, this.y, Math.atan2(this.vy, this.vx), true);
                folk.damage(this.damage);
                this.dead = true;
                return;
              }
            }
          } else if (Math.hypot(player.x - this.x, player.y - this.y) < player.radius + this.radius + (player.mounted ? 8 : 0)) {
            impactBurst(this.x, this.y, Math.atan2(this.vy, this.vx), false);
            player.damage(this.damage, this.owner);
            this.dead = true;
            return;
          }
        }
        this.life -= dt;
        if (this.life <= 0) this.dead = true;
      }

      render() {
        ctx.save();
        ctx.strokeStyle = this.owner === "player" ? "#ffe08a" : "#ff9f7b";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.025, this.y - this.vy * 0.025);
        ctx.stroke();
        ctx.restore();
      }
    }

    class Dynamite {
      constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = 10;
        this.fuse = 1.35;
        this.dead = false;
        this.sparkTimer = 0;
      }

      update(dt) {
        if (this.dead) return;
        this.fuse -= dt;
        this.sparkTimer -= dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= Math.pow(0.08, dt);
        this.vy *= Math.pow(0.08, dt);
        this.x = clamp(this.x, 30, WORLD_W - 30);
        this.y = clamp(this.y, 30, WORLD_H - 30);
        for (const obj of staticObjects) resolveCircleRect(this, obj);

        if (this.sparkTimer <= 0) {
          this.sparkTimer = this.fuse < 0.45 ? 0.035 : 0.08;
          addParticle(this.x + rand(-5, 5), this.y - 8 + rand(-5, 5), rand(-40, 40), rand(-75, -20), 0.18, rand(2, 5), "rgba(255, 215, 103, 0.9)", "spark");
          addParticle(this.x, this.y, rand(-25, 25), rand(-40, 10), 0.4, rand(4, 9), "rgba(95, 86, 74, 0.42)");
        }

        if (this.fuse <= 0) this.explode();
      }

      explode() {
        if (this.dead) return;
        this.dead = true;
        const radius = 178;
        state.screenShake = Math.max(state.screenShake, 20);
        state.hitStop = Math.max(state.hitStop, 0.08);
        tone(72, 0.18, "sawtooth", 0.08, -35);
        tone(190, 0.06, "square", 0.04, -120);
        addParticle(this.x, this.y, 0, 0, 0.14, 96, "rgba(255, 138, 54, 0.86)", "flash");
        burstDust(this.x, this.y, 46, "rgba(92, 59, 38, 0.62)");
        for (let i = 0; i < 30; i++) {
          const a = rand(0, TAU);
          const s = rand(90, 420);
          addParticle(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.12, 0.32), rand(2, 6), "rgba(255, 214, 112, 0.9)", "spark");
        }

        for (const enemy of enemies) {
          if (enemy.dead) continue;
          const d = distance(this, enemy);
          if (d < radius) enemy.damage(Math.round(125 * (1 - d / radius) + 35));
        }
        for (const folk of townsfolk) {
          if (folk.dead) continue;
          const d = distance(this, folk);
          if (d < radius * 0.75) folk.damage(120);
        }
        if (Math.hypot(player.x - this.x, player.y - this.y) < radius * 0.55) player.damage(24, "dynamite");
        if (isInTown(this.x, this.y)) addWanted(1.6);
      }

      render() {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx || 1));
        ctx.fillStyle = "#9d2d23";
        ctx.fillRect(-13, -6, 26, 12);
        ctx.fillStyle = "#5b1712";
        ctx.fillRect(-4, -7, 8, 14);
        ctx.strokeStyle = "#2b120d";
        ctx.lineWidth = 3;
        ctx.strokeRect(-13, -6, 26, 12);
        ctx.fillStyle = this.fuse < 0.45 ? "#ffe08a" : "#f4b95f";
        ctx.beginPath();
        ctx.arc(16, -8, this.fuse < 0.45 ? 5 : 3, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    class Lasso {
      constructor(x, y, angle) {
        this.startX = x;
        this.startY = y;
        this.x = x + Math.cos(angle) * 26;
        this.y = y + Math.sin(angle) * 26;
        this.vx = Math.cos(angle) * 760;
        this.vy = Math.sin(angle) * 760;
        this.radius = 13;
        this.life = 0.48;
        this.dead = false;
      }

      update(dt) {
        if (this.dead) return;
        this.life -= dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= Math.pow(0.55, dt);
        this.vy *= Math.pow(0.55, dt);

        for (const pickup of pickups) {
          if (!pickup.dead && Math.hypot(pickup.x - this.x, pickup.y - this.y) < pickup.radius + this.radius + 8) {
            pickup.pulled = true;
            this.dead = true;
            showMessage("Lasso snagged something useful.", 1);
            return;
          }
        }

        for (const enemy of enemies) {
          if (enemy.dead || Math.hypot(enemy.x - this.x, enemy.y - this.y) > enemy.radius + this.radius + 8) continue;
          if (enemy.type === "enforcer") {
            enemy.stunTimer = Math.max(enemy.stunTimer, 0.38);
            floatingText(enemy.x, enemy.y - 30, "TOUGH", "#ffd08a");
          } else {
            enemy.stunTimer = Math.max(enemy.stunTimer, 1.45);
            floatingText(enemy.x, enemy.y - 30, "LASSO", "#ffe08a");
          }
          burstDust(enemy.x, enemy.y, 8, "rgba(222, 196, 143, 0.5)");
          this.dead = true;
          return;
        }

        for (const marker of boundaryMarkers) {
          if (Math.hypot(marker.x - this.x, marker.y - this.y) < marker.radius + this.radius) {
            showMessage("The boundary bell gives one nervous clank.", 1.8);
            state.screenShake = Math.max(state.screenShake, 2);
            this.dead = true;
            return;
          }
        }

        if (this.life <= 0 || Math.hypot(this.x - this.startX, this.y - this.startY) > 430) this.dead = true;
      }

      render() {
        if (this.dead) return;
        ctx.save();
        ctx.strokeStyle = "rgba(226, 196, 139, 0.86)";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(player.x, player.y - 5);
        ctx.quadraticCurveTo((player.x + this.x) / 2, (player.y + this.y) / 2 - 42, this.x, this.y);
        ctx.stroke();
        ctx.strokeStyle = "#f2d89b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, 16, 10, Math.atan2(this.vy, this.vx || 1), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    class Horse {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 30;
        this.mounted = false;
      }

      render() {
        if (this.mounted) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = "#674028";
        ctx.beginPath();
        ctx.ellipse(0, 0, 31, 17, 0.1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#352016";
        ctx.beginPath();
        ctx.ellipse(25, -2, 12, 9, 0.3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#21140d";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-16, -11);
        ctx.lineTo(-25, -26);
        ctx.moveTo(-16, 11);
        ctx.lineTo(-25, 26);
        ctx.moveTo(14, -11);
        ctx.lineTo(24, -24);
        ctx.moveTo(14, 11);
        ctx.lineTo(24, 24);
        ctx.stroke();
        ctx.restore();
      }
    }

    const player = new Player();

    const localDebugEnabled = location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.protocol === "file:";

    function getLocalDebugScenario() {
      if (!localDebugEnabled) return "";
      return new URLSearchParams(location.search).get("debugScenario") || "";
    }

    function localDebugSnapshot() {
      return {
        mode: state.mode,
        gangWavesSpawned: state.gangWavesSpawned,
        frameCount: state.frameCount,
        boundaryMarkers: boundaryMarkers.length,
        landmarks: landmarks.length,
        campProps: campProps.length,
        inCamp: isInCamp(player.x, player.y),
        cluesFound: state.cluesFound,
        deadEye: Math.round(player.deadEyeMeter),
        deadEyeActive: player.deadEyeActive,
        dynamiteCount: player.dynamiteCount,
        dynamites: dynamites.length,
        lassos: lassos.length,
        lockpicks: player.lockpicks,
        lockedObjects: lockedObjects.map((obj) => ({ name: obj.name, opened: obj.opened, type: obj.type })),
        missionStep: state.missionStep,
        missionAmbushSpawned: state.missionAmbushSpawned,
        missionComplete: state.missionComplete,
        objectiveTarget: missionObjectiveTarget(),
        activeShooters: enemies.filter((enemy) => !enemy.dead && enemy.aimWindup > 0 && distance(enemy, player) < 720).length,
        player: { x: player.x, y: player.y, hp: player.hp },
        pickups: pickups.map((pickup) => ({ type: pickup.type, value: pickup.value, dead: pickup.dead })),
        enemies: enemies.map((enemy) => ({
          type: enemy.type,
          law: enemy.law,
          x: enemy.x,
          y: enemy.y,
          dead: enemy.dead,
          aimWindup: enemy.aimWindup,
          aimWindupMax: enemy.aimWindupMax,
          chargeWindup: enemy.chargeWindup,
          chargeWindupMax: enemy.chargeWindupMax,
          chargeTimer: enemy.chargeTimer
        }))
      };
    }

    function publishLocalDebugState() {
      if (!localDebugEnabled) return;
      let node = document.getElementById("localDebugState");
      if (!node) {
        node = document.createElement("pre");
        node.id = "localDebugState";
        node.hidden = true;
        document.body.appendChild(node);
      }
      node.textContent = JSON.stringify(localDebugSnapshot());
    }

    function applyLocalDebugScenario() {
      const scenario = getLocalDebugScenario();
      if (!scenario) return;
      if (scenario === "gangWave") {
        spawnGangWave(true);
        return;
      }
      if (scenario === "shooterLimit") {
        player.x = 900;
        player.y = 900;
        spawnGangWave(true);
        spawnGangWave(true);
        enemies.filter((enemy) => !enemy.law).slice(0, 14).forEach((enemy, index) => {
          const column = index % 5;
          const row = Math.floor(index / 5);
          enemy.x = player.x + 360 + column * 48;
          enemy.y = player.y - 92 + row * 76;
          enemy.spawnX = enemy.x;
          enemy.spawnY = enemy.y;
          enemy.vx = 0;
          enemy.vy = 0;
          enemy.state = "attack";
          enemy.cooldown = 0;
          enemy.aimWindup = 0;
          enemy.chargeWindup = 0;
          enemy.chargeTimer = 0;
        });
        return;
      }
      if (scenario === "lockpick") {
        const target = lockedObjects[0];
        if (target) {
          player.x = target.x - 38;
          player.y = target.y;
          player.vx = 0;
          player.vy = 0;
        }
        return;
      }
      if (scenario === "missionTown") {
        state.missionStep = 1;
        player.x = town.x + 420;
        player.y = town.y + 345;
        player.vx = 0;
        player.vy = 0;
        return;
      }
      const type = scenario === "shotgunTell" ? "enforcer" : (scenario === "chargeTell" ? "rusher" : "bandit");
      const enemy = enemies.find((candidate) => !candidate.dead && candidate.type === type) || enemies.find((candidate) => !candidate.dead);
      if (!enemy) return;
      player.x = enemy.x - 280;
      player.y = enemy.y;
      player.vx = 0;
      player.vy = 0;
      enemy.state = "attack";
      enemy.cooldown = 0;
      if (enemy.type === "rusher") enemy.beginChargeTell();
      else enemy.beginShotTell();
    }

    // ============================================================
    // Game systems
    // ============================================================
    function resetGame() {
      createWorld();
      player.x = camp.x - 20;
      player.y = camp.y - 22;
      player.vx = 0;
      player.vy = 0;
      player.hp = 100;
      player.ammo = 6;
      player.reserveAmmo = 30;
      player.reloadTimer = 0;
      player.fireCooldown = 0;
      player.mounted = null;
      player.deadEyeMeter = 100;
      player.deadEyeActive = false;
      player.deadEyeCooldown = 0;
      player.deadEyePulse = 0;
      player.dynamiteCount = 3;
      player.dynamiteCooldown = 0;
      player.lassoCooldown = 0;
      player.lockpicks = 3;
      state.time = 0;
      state.money = 8;
      state.score = 0;
      state.wanted = 0;
      state.wantedHeat = 0;
      state.nextLawSpawn = 0;
      state.gangWavesSpawned = 0;
      state.nextGangWaveCheck = 1.2;
      state.frameCount = 0;
      state.boundaryWarningCooldown = 0;
      state.wasInTown = isInTown(player.x, player.y);
      state.cluesFound = 0;
      state.screenShake = 0;
      state.hitStop = 0;
      state.message = "";
      state.messageTimer = 0;
      state.missionStep = 0;
      state.missionAmbushSpawned = false;
      state.missionComplete = false;
      applyLocalDebugScenario();
      camera.x = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      camera.y = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
      publishLocalDebugState();
    }

    function setMode(mode) {
      state.mode = mode;
      startScreen.classList.toggle("active", mode === "start");
      pauseScreen.classList.toggle("active", mode === "paused");
      gameOverScreen.classList.toggle("active", mode === "gameover");
      publishLocalDebugState();
    }

    function startGame() {
      if (!audioCtx && window.AudioContext) audioCtx = new AudioContext();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      resetGame();
      setMode("playing");
    }

    function endGame() {
      gameOverText.textContent = `You earned $${state.money}, dropped ${state.score} points of frontier trouble, and reached wanted level ${Math.floor(state.wanted)}.`;
      setMode("gameover");
    }

    function showMessage(text, seconds = 2.2) {
      state.message = text;
      state.messageTimer = seconds;
    }

    function isInTown(x, y) {
      return x > town.x - 120 && x < town.x + town.w + 120 && y > town.y - 120 && y < town.y + town.h + 120;
    }

    function isInsideTownBoundary(x, y) {
      return x > town.x - 190 && x < town.x + town.w + 190 && y > town.y - 190 && y < town.y + town.h + 190;
    }

    function isInCamp(x, y) {
      return Math.hypot(x - camp.x, y - camp.y) < camp.radius;
    }

    function updateBoundaryWarnings(dt) {
      if (state.boundaryWarningCooldown > 0) state.boundaryWarningCooldown -= dt;
      const inside = isInsideTownBoundary(player.x, player.y);
      const spookyLight = state.dayPhase > 0.62;
      if (state.wasInTown && !inside && spookyLight && state.boundaryWarningCooldown <= 0) {
        showMessage("The Mercy Ridge boundary bells twitch in the dusk.", 2.8);
        state.boundaryWarningCooldown = 9;
      }
      state.wasInTown = inside;
    }

    function addWanted(amount) {
      state.wanted = clamp(state.wanted + amount, 0, 5);
      state.wantedHeat = Math.max(state.wantedHeat, 9);
      if (state.wanted >= 1) showMessage(`Wanted level ${Math.floor(state.wanted)}. Lawmen are riding.`);
    }

    function dropLoot(x, y, chance) {
      if (rng() < chance) pickups.push({ x: x + rand(-12, 12), y: y + rand(-12, 12), type: "money", value: Math.floor(rand(2, 9)), radius: 14 });
      if (rng() < 0.74) pickups.push({ x: x + rand(-16, 16), y: y + rand(-16, 16), type: "ammo", value: Math.floor(rand(4, 10)), radius: 14 });
      if (rng() < chance * 0.26) pickups.push({ x: x + rand(-18, 18), y: y + rand(-18, 18), type: "health", value: Math.floor(rand(12, 22)), radius: 14 });
    }

    function livingOutlaws() {
      return enemies.filter((enemy) => !enemy.dead && !enemy.law).length;
    }

    function canEnemyStartShot(enemy) {
      const nearby = enemies.filter((candidate) => !candidate.dead && distance(candidate, player) < 680).length;
      const cap = nearby > 10 ? 3 : (nearby > 6 ? 4 : 5);
      const activeShooters = enemies.filter((candidate) => !candidate.dead && candidate.aimWindup > 0 && distance(candidate, player) < 720).length;
      return activeShooters < cap || enemy.law && activeShooters < cap + 1;
    }

    function enemySpacingVector(source) {
      let x = 0;
      let y = 0;
      const minDist = source.type === "enforcer" ? 62 : 54;
      for (const other of enemies) {
        if (other === source || other.dead) continue;
        const dx = source.x - other.x;
        const dy = source.y - other.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 0 || d2 > minDist * minDist) continue;
        const d = Math.sqrt(d2);
        const push = (minDist - d) / minDist;
        x += (dx / d) * push * 1.35;
        y += (dy / d) * push * 1.35;
      }
      return { x, y };
    }

    function gangSpawnPointBlocked(x, y) {
      return staticObjects.some((obj) => x > obj.x - 52 && x < obj.x + obj.w + 52 && y > obj.y - 52 && y < obj.y + obj.h + 52);
    }

    function chooseGangWaveAnchor() {
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU);
        const dist = rand(520, 760);
        const x = clamp(player.x + Math.cos(a) * dist, 120, WORLD_W - 120);
        const y = clamp(player.y + Math.sin(a) * dist, 120, WORLD_H - 120);
        if (!isInTown(x, y) && !isInCamp(x, y) && !gangSpawnPointBlocked(x, y)) return { x, y };
      }
      return { x: clamp(player.x + 620, 120, WORLD_W - 120), y: clamp(player.y + 160, 120, WORLD_H - 120) };
    }

    function spawnGangWave(force = false) {
      if (!force && state.gangWavesSpawned >= 2) return;
      const anchor = chooseGangWaveAnchor();
      const types = state.gangWavesSpawned === 0 ? ["bandit", "bandit", "rusher"] : ["bandit", "rusher", "bandit", "enforcer"];
      const approach = angleTo(anchor, player);
      const sideX = -Math.sin(approach);
      const sideY = Math.cos(approach);
      types.forEach((type, index) => {
        const spread = (index - (types.length - 1) / 2) * 76;
        const x = clamp(anchor.x + sideX * spread + rand(-18, 18), 80, WORLD_W - 80);
        const y = clamp(anchor.y + sideY * spread + rand(-18, 18), 80, WORLD_H - 80);
        const enemy = new Enemy(x, y, type);
        enemy.cooldown = rand(0.65, 1.65);
        enemies.push(enemy);
      });
      state.gangWavesSpawned++;
      showMessage(state.gangWavesSpawned === 1 ? "A gang rides in from the dust." : "More outlaws pour into the fight.", 2.6);
    }

    function updateGangWaves(dt) {
      if (state.gangWavesSpawned >= 2) return;
      if (isInCamp(player.x, player.y)) return;
      state.nextGangWaveCheck -= dt;
      if (state.nextGangWaveCheck > 0) return;
      state.nextGangWaveCheck = 0.85;
      if (livingOutlaws() <= 3) spawnGangWave();
    }

    function spawnWelcomeAmbush() {
      if (state.missionAmbushSpawned) return;
      state.missionAmbushSpawned = true;
      const spots = [
        [missionArgument.x - 210, missionArgument.y - 92, "bandit"],
        [missionArgument.x + 230, missionArgument.y - 72, "bandit"],
        [missionArgument.x + 60, missionArgument.y + 170, "rusher"]
      ];
      for (const [x, y, type] of spots) {
        const enemy = new Enemy(x, y, type);
        enemy.missionTag = "welcome";
        enemy.cooldown = rand(0.3, 0.9);
        enemies.push(enemy);
      }
      addWanted(0.35);
      showMessage("The argument snaps. Guns come out in Hicksville.", 3);
    }

    function updateMission(dt) {
      if (state.missionComplete) return;
      if (state.missionStep === 1 && isInTown(player.x, player.y)) {
        state.missionStep = 2;
        showMessage("Mercy Ridge is arguing in the street. Get close or keep riding.", 3.2);
      }
      if (state.missionStep === 2 && Math.hypot(player.x - missionArgument.x, player.y - missionArgument.y) < 170) {
        state.missionStep = 3;
        spawnWelcomeAmbush();
      }
      if (state.missionStep === 3) {
        const missionEnemies = enemies.filter((enemy) => !enemy.dead && enemy.missionTag === "welcome");
        const fled = Math.hypot(player.x - missionArgument.x, player.y - missionArgument.y) > 760 && state.missionAmbushSpawned;
        if (missionEnemies.length === 0 || fled) {
          state.missionStep = 4;
          state.missionComplete = true;
          showMessage(fled ? "You left Hicksville yelling behind you. Darryl will want to hear this." : "One bounty poster is fake. Missing travelers are the real job.", 4);
        }
      }
    }

    function spawnLawman() {
      const side = Math.floor(rand(0, 4));
      let x = player.x;
      let y = player.y;
      if (side === 0) { x = clamp(player.x + rand(-600, 600), 80, WORLD_W - 80); y = clamp(player.y - 650, 80, WORLD_H - 80); }
      if (side === 1) { x = clamp(player.x + 650, 80, WORLD_W - 80); y = clamp(player.y + rand(-600, 600), 80, WORLD_H - 80); }
      if (side === 2) { x = clamp(player.x + rand(-600, 600), 80, WORLD_W - 80); y = clamp(player.y + 650, 80, WORLD_H - 80); }
      if (side === 3) { x = clamp(player.x - 650, 80, WORLD_W - 80); y = clamp(player.y + rand(-600, 600), 80, WORLD_H - 80); }
      enemies.push(new Enemy(x, y, Math.floor(state.wanted) >= 4 && rng() < 0.35 ? "enforcer" : "bandit", true));
    }

    function updateInteraction() {
      state.interaction = null;
      interactionBox.classList.remove("visible");
      if (state.mode !== "playing") return;

      for (const door of doors) {
        if (Math.abs(player.x - door.x) < door.w && Math.abs(player.y - door.y) < door.h) {
          const b = door.building;
          if (b.action === "saloon") state.interaction = { type: "saloon", text: "Press E: Rest at the Gilded Spur ($4). The smiles are polished too hard." };
          if (b.action === "store") state.interaction = { type: "store", text: "Press E: Buy 12 rounds at Prosperity General ($6)." };
          if (b.action === "sheriff") state.interaction = { type: "sheriff", text: "Press E: Pay $12 at Mercy Ridge Jail. Every badge has a price." };
          if (b.action === "blacksmith") state.interaction = { type: "blacksmith", text: "Press E: Oil your revolver for a steadier next fight ($5)." };
          if (b.action === "house" || b.action === "chapel") state.interaction = { type: "quiet", text: "Press E: Knock. Mercy Ridge curtains move, then go still." };
        }
      }

      if (!state.interaction) {
        for (const obj of lockedObjects) {
          if (!obj.opened && distance(player, obj) < 62) {
            state.interaction = { type: "lockpick", obj, text: `Press E: Lockpick ${obj.name}.` };
            break;
          }
        }
      }

      if (!state.interaction) {
        if (distance(player, darryl) < 70) {
          const text = state.missionStep === 0 ? "Press E: Ask Darryl about Mercy Ridge." : "Press E: Talk to Darryl.";
          state.interaction = { type: "darryl", text };
        }
      }

      if (!state.interaction) {
        for (const prop of campProps) {
          if ((prop.type === "campfire" || prop.type === "bedroll") && distance(player, prop) < prop.radius) {
            state.interaction = { type: "campRest", text: "Press E: Rest at Darryl's campfire. Safe for now." };
            break;
          }
          if (prop.type === "supplyWagon" && distance(player, prop) < prop.radius) {
            state.interaction = { type: "campSupply", text: "Press E: Check the supply wagon." };
            break;
          }
        }
      }

      if (!state.interaction) {
        for (const marker of boundaryMarkers) {
          if (distance(player, marker) < 68) {
            state.interaction = { type: "boundary", text: "Mercy Ridge boundary marker: stay inside the bells after sundown." };
            break;
          }
        }
      }

      if (!state.interaction) {
        for (const horse of horses) {
          if (!horse.mounted && distance(player, horse) < 70) {
            state.interaction = { type: "horse", horse, text: "Press E: Mount horse." };
            break;
          }
        }
      }

      if (player.mounted && !state.interaction) state.interaction = { type: "dismount", text: "Press E: Dismount horse." };

      if (state.interaction) {
        interactionBox.textContent = state.interaction.text;
        interactionBox.classList.add("visible");
      }
    }

    function useInteraction() {
      const i = state.interaction;
      if (!i) return;
      if (i.type === "saloon") {
        if (state.money >= 4 || player.hp < 40) {
          if (state.money >= 4) state.money -= 4;
          player.hp = Math.min(player.maxHp, player.hp + 45);
          showMessage("Whiskey, stew, and a quiet corner at the Gilded Spur.");
        } else showMessage("Not enough money for a room.");
      }
      if (i.type === "store") {
        if (state.money >= 6) {
          state.money -= 6;
          player.reserveAmmo += 12;
          showMessage("Prosperity General sells mercy by the cartridge.");
        } else showMessage("The storekeeper wants cash.");
      }
      if (i.type === "sheriff") {
        if (state.money >= 12 && state.wanted > 0) {
          state.money -= 12;
          state.wanted = Math.max(0, state.wanted - 1.5);
          showMessage("A fine paid. The law squints, but lets it breathe.");
        } else showMessage(state.wanted > 0 ? "You need $12 to settle up." : "No bounty worth settling.");
      }
      if (i.type === "blacksmith") {
        if (state.money >= 5) {
          state.money -= 5;
          player.fireCooldown = 0;
          player.reserveAmmo += 4;
          showMessage("Action cleaned. A few spare rounds thrown in.");
        } else showMessage("The blacksmith does not work on promises.");
      }
      if (i.type === "quiet") showMessage("Hicksville hears everything. Nobody opens the door.");
      if (i.type === "boundary") showMessage("Old bell posts ring when something hungry crosses wrong.");
      if (i.type === "darryl") {
        if (state.missionStep === 0) {
          state.missionStep = 1;
          showMessage("Darryl: Ride into Mercy Ridge. Smile pretty. Listen for the lie.", 3.6);
        } else if (state.missionComplete) {
          showMessage("Darryl: False bounties and missing travelers. That is the real trail.", 3.6);
        } else {
          showMessage("Darryl: Mercy Ridge shines pretty. Hicksville is what leaks out after dark.", 3.6);
        }
      }
      if (i.type === "campRest") {
        player.hp = player.maxHp;
        player.ammo = 6;
        showMessage("Campfire beans, a dirty blanket, and ten minutes of peace.");
      }
      if (i.type === "campSupply") {
        player.reserveAmmo = Math.max(player.reserveAmmo, 24);
        player.lockpicks = Math.max(player.lockpicks, 3);
        showMessage("Darryl's wagon has beans, bullets, and exactly no receipts.");
      }
      if (i.type === "lockpick") {
        const obj = i.obj;
        if (obj.opened) {
          showMessage("Already picked clean.");
        } else if (player.lockpicks <= 0) {
          showMessage("No lockpicks left.");
        } else {
          player.lockpicks--;
          obj.opened = true;
          state.money += obj.money;
          player.reserveAmmo += obj.ammo;
          state.score += 90;
          floatingText(obj.x, obj.y - 24, "OPEN", "#ffe08a");
          showMessage(`${obj.name} opened: $${obj.money}${obj.ammo ? ` and ${obj.ammo} rounds` : ""}.`, 2.4);
          if (obj.crime && isInTown(obj.x, obj.y)) {
            state.wantedHeat = Math.max(state.wantedHeat, 8);
            addWanted(0.45);
          }
        }
      }
      if (i.type === "horse") {
        player.mounted = i.horse;
        i.horse.mounted = true;
        player.x = i.horse.x;
        player.y = i.horse.y - 8;
        showMessage("Mounted. The frontier opens up.");
      }
      if (i.type === "dismount") {
        const horse = player.mounted;
        horse.mounted = false;
        horse.x = player.x + 42;
        horse.y = player.y + 10;
        player.mounted = null;
        showMessage("Dismounted.");
      }
    }

    function update(dt) {
      if (state.mode !== "playing") return;
      state.time += dt;
      state.dayPhase = (Math.sin(state.time * 0.035) + 1) / 2;
      if (state.messageTimer > 0) state.messageTimer -= dt;
      if (state.screenShake > 0) state.screenShake -= dt * 18;
      if (state.wantedHeat > 0) {
        state.wantedHeat -= dt;
      } else if (state.wanted > 0) {
        state.wanted = Math.max(0, state.wanted - dt * 0.025);
      }

      player.update(dt);
      const worldDt = player.deadEyeActive ? dt * 0.36 : dt;
      updateMission(dt);
      updateBoundaryWarnings(dt);
      for (const enemy of enemies) enemy.update(worldDt);
      updateGangWaves(worldDt);
      for (const folk of townsfolk) folk.update(worldDt);
      for (const bullet of bullets) bullet.update(worldDt);
      for (const dynamite of dynamites) dynamite.update(worldDt);
      for (const lasso of lassos) lasso.update(dt);

      for (const p of particles) {
        const pDt = player.deadEyeActive && p.kind !== "text" ? worldDt : dt;
        p.life -= pDt;
        p.x += p.vx * pDt;
        p.y += p.vy * pDt;
        p.vx *= Math.pow(0.1, pDt);
        p.vy *= Math.pow(0.1, pDt);
        if (p.kind !== "text") p.size *= Math.pow(0.45, pDt);
      }

      for (const pickup of pickups) {
        if (pickup.pulled) {
          const dir = normalize(player.x - pickup.x, player.y - pickup.y);
          pickup.x += dir.x * 620 * dt;
          pickup.y += dir.y * 620 * dt;
        }
        if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < player.radius + pickup.radius + 8) {
          pickup.dead = true;
          if (pickup.type === "money") {
            state.money += pickup.value;
            state.score += pickup.value * 5;
            floatingText(pickup.x, pickup.y - 15, `+$${pickup.value}`, "#ffe08a");
          } else if (pickup.type === "ammo") {
            player.reserveAmmo += pickup.value;
            floatingText(pickup.x, pickup.y - 15, `+${pickup.value} ammo`, "#d3f0b1");
          } else if (pickup.type === "health") {
            player.hp = Math.min(player.maxHp, player.hp + pickup.value);
            floatingText(pickup.x, pickup.y - 15, `+${pickup.value} HP`, "#ffb0a0");
          } else if (pickup.type === "clue") {
            state.cluesFound++;
            state.score += 75;
            floatingText(pickup.x, pickup.y - 15, "CLUE", "#d8c2ff");
            showMessage(pickup.message, 3.2);
          }
        }
      }

      state.nextLawSpawn -= dt;
      const livingLaw = enemies.filter(e => !e.dead && e.law).length;
      if (state.wanted >= 1 && state.nextLawSpawn <= 0 && livingLaw < Math.ceil(state.wanted) + 2) {
        spawnLawman();
        state.nextLawSpawn = clamp(6 - state.wanted, 2.2, 6);
      }

      cleanupArrays();
      updateInteraction();

      const targetX = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
      const targetY = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
      camera.x = lerp(camera.x, targetX, 1 - Math.pow(0.001, dt));
      camera.y = lerp(camera.y, targetY, 1 - Math.pow(0.001, dt));
    }

    function cleanupArrays() {
      for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].dead) bullets.splice(i, 1);
      for (let i = dynamites.length - 1; i >= 0; i--) if (dynamites[i].dead) dynamites.splice(i, 1);
      for (let i = lassos.length - 1; i >= 0; i--) if (lassos[i].dead) lassos.splice(i, 1);
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      for (let i = pickups.length - 1; i >= 0; i--) if (pickups[i].dead) pickups.splice(i, 1);
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].dead) {
          const corpse = enemies.splice(i, 1)[0];
          decor.push({ x: corpse.x, y: corpse.y, radius: 16, type: "corpse", rot: rand(0, TAU), law: corpse.law });
        }
      }
    }

    // ============================================================
    // Rendering
    // ============================================================
    function render() {
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      const shake = state.screenShake > 0 ? state.screenShake : 0;
      ctx.translate(Math.sin(state.time * 83) * shake, Math.cos(state.time * 71) * shake);
      ctx.translate(-camera.x, -camera.y);

      drawGround();
      drawHauntedFlatsUnder();
      drawOutlawCampUnder();
      drawTownRoads();
      drawBoundaryMarkers();
      drawDecorUnder();
      drawHauntedFlatsOver();
      drawLockedObjects();
      for (const pickup of pickups) drawPickup(pickup);
      for (const horse of horses) horse.render();
      drawOutlawCampOver();
      drawMissionActors();
      drawObjectiveWorldMarker();
      for (const folk of townsfolk) folk.render();
      for (const enemy of enemies) enemy.render();
      player.render();
      for (const dynamite of dynamites) dynamite.render();
      for (const lasso of lassos) lasso.render();
      for (const bullet of bullets) bullet.render();
      drawBuildings();
      drawParticlesWorld();

      ctx.restore();
      drawLighting();
      drawDeadEyeOverlay();
      drawHUD();
      drawMinimap();
      drawObjectiveCompass();
      drawReticle();
    }

    function drawGround() {
      const grd = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
      grd.addColorStop(0, "#9a7443");
      grd.addColorStop(0.52, "#b28b51");
      grd.addColorStop(1, "#715738");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = "rgba(98, 68, 36, 0.22)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 90; i++) {
        const x = (i * 337) % WORLD_W;
        const y = (i * 641) % WORLD_H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 70, y + rand(-45, 45), x + 170, y + rand(-30, 30));
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(75, 95, 48, 0.28)";
      for (let i = 0; i < 180; i++) {
        const x = (i * 619) % WORLD_W;
        const y = (i * 383) % WORLD_H;
        ctx.beginPath();
        ctx.ellipse(x, y, 18 + (i % 7) * 3, 6 + (i % 5), (i % 9) * 0.5, 0, TAU);
        ctx.fill();
      }
    }

    function drawTownRoads() {
      ctx.save();
      ctx.fillStyle = "rgba(116, 85, 48, 0.74)";
      roundRect(town.x - 170, town.y + 265, town.w + 340, 145, 28);
      ctx.fill();
      roundRect(town.x + 395, town.y - 120, 145, town.h + 240, 28);
      ctx.fill();
      ctx.strokeStyle = "rgba(68, 45, 24, 0.24)";
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 22]);
      ctx.beginPath();
      ctx.moveTo(town.x - 130, town.y + 337);
      ctx.lineTo(town.x + town.w + 130, town.y + 337);
      ctx.moveTo(town.x + 468, town.y - 80);
      ctx.lineTo(town.x + 468, town.y + town.h + 80);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    function drawHauntedFlatsUnder() {
      for (const landmark of landmarks) {
        ctx.save();
        ctx.translate(landmark.x, landmark.y);
        if (landmark.type === "dryRiverbed") {
          ctx.strokeStyle = "rgba(88, 59, 37, 0.46)";
          ctx.lineWidth = 46;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-420, -210);
          ctx.bezierCurveTo(-260, -90, -180, 90, -20, 40);
          ctx.bezierCurveTo(160, -18, 260, 190, 440, 260);
          ctx.stroke();
          ctx.strokeStyle = "rgba(35, 23, 18, 0.3)";
          ctx.lineWidth = 4;
          for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            ctx.moveTo(-300 + i * 115, -50 + (i % 2) * 34);
            ctx.lineTo(-250 + i * 115, -32 + (i % 3) * 42);
            ctx.stroke();
          }
        }
        if (landmark.type === "chapelRoute") {
          ctx.strokeStyle = "rgba(68, 45, 31, 0.36)";
          ctx.lineWidth = 24;
          ctx.setLineDash([32, 26]);
          ctx.beginPath();
          ctx.moveTo(225, -520);
          ctx.quadraticCurveTo(60, -120, -220, 590);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (landmark.type === "wagonCircle") {
          ctx.strokeStyle = "rgba(56, 35, 22, 0.42)";
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.arc(0, 0, 115, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawHauntedFlatsOver() {
      for (const landmark of landmarks) {
        ctx.save();
        ctx.translate(landmark.x, landmark.y);
        if (landmark.type === "boneArch") {
          ctx.strokeStyle = "#d9c7a3";
          ctx.lineWidth = 13;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-48, 44);
          ctx.bezierCurveTo(-60, -64, 58, -64, 48, 44);
          ctx.stroke();
          ctx.fillStyle = "#f0dfb9";
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.ellipse(-30 + i * 15, -22 + Math.abs(i - 2) * 8, 7, 11, 0.2, 0, TAU);
            ctx.fill();
          }
          drawText("Bone Arch", 0, 72, 14, "#f5d99f", "center", "900");
        } else if (landmark.type === "wagonCircle") {
          ctx.strokeStyle = "#3b2417";
          ctx.lineWidth = 6;
          for (let i = 0; i < 5; i++) {
            const a = i * TAU / 5 + 0.28;
            const wx = Math.cos(a) * 104;
            const wy = Math.sin(a) * 84;
            ctx.save();
            ctx.translate(wx, wy);
            ctx.rotate(a + Math.PI / 2);
            ctx.fillStyle = "#5a321b";
            ctx.fillRect(-28, -12, 56, 24);
            ctx.strokeRect(-28, -12, 56, 24);
            ctx.restore();
          }
          drawText("Black Wheel Camp", 0, 138, 14, "#f5d99f", "center", "900");
        } else if (landmark.type === "desertShrine") {
          ctx.fillStyle = "#77634c";
          ctx.fillRect(-24, -34, 48, 68);
          ctx.fillStyle = "#aa8a55";
          ctx.fillRect(-34, 22, 68, 16);
          ctx.fillStyle = colors.brass;
          ctx.beginPath();
          ctx.arc(0, -46, 15, Math.PI, TAU);
          ctx.lineTo(15, -34);
          ctx.lineTo(-15, -34);
          ctx.closePath();
          ctx.fill();
          drawText("Shrine", 0, 62, 14, "#f5d99f", "center", "900");
        } else if (landmark.type === "collapsedMine") {
          ctx.fillStyle = "#2b2018";
          ctx.beginPath();
          ctx.ellipse(0, 8, 58, 34, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "#5c4936";
          ctx.fillRect(-66, 20, 132, 22);
          ctx.fillStyle = "#33251b";
          ctx.fillRect(-48, -8, 96, 28);
          ctx.strokeStyle = "#1d120c";
          ctx.lineWidth = 5;
          ctx.strokeRect(-48, -8, 96, 28);
          drawText("Ash Hollow", 0, 70, 14, "#f5d99f", "center", "900");
        }
        ctx.restore();
      }
    }

    function drawOutlawCampUnder() {
      ctx.save();
      ctx.translate(camp.x, camp.y);
      ctx.fillStyle = "rgba(47, 28, 18, 0.34)";
      ctx.beginPath();
      ctx.ellipse(0, 0, camp.radius * 0.82, camp.radius * 0.56, -0.08, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(95, 61, 33, 0.48)";
      ctx.lineWidth = 5;
      ctx.setLineDash([18, 16]);
      ctx.beginPath();
      ctx.ellipse(0, 0, camp.radius * 0.86, camp.radius * 0.6, -0.08, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      drawText(camp.name, 0, -205, 17, "#ffe0a3", "center", "900");
      drawText("Safe camp", 0, -182, 12, "#d2a969", "center", "800");
      ctx.restore();
    }

    function drawOutlawCampOver() {
      for (const prop of campProps) {
        ctx.save();
        ctx.translate(prop.x, prop.y);
        ctx.rotate(prop.rot || 0);
        if (prop.type === "campfire") {
          ctx.fillStyle = "#3d2819";
          ctx.beginPath();
          ctx.ellipse(0, 14, 62, 24, 0, 0, TAU);
          ctx.fill();
          for (let i = 0; i < 7; i++) {
            const a = i * TAU / 7;
            ctx.save();
            ctx.rotate(a);
            ctx.fillStyle = "#5b3921";
            ctx.fillRect(8, -5, 42, 10);
            ctx.restore();
          }
          ctx.fillStyle = "rgba(255, 116, 53, 0.75)";
          ctx.beginPath();
          ctx.ellipse(0, -6 + Math.sin(state.time * 8) * 3, 18, 34, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255, 211, 93, 0.82)";
          ctx.beginPath();
          ctx.ellipse(0, -9 + Math.sin(state.time * 10) * 2, 9, 22, 0, 0, TAU);
          ctx.fill();
        } else if (prop.type === "bedroll") {
          ctx.fillStyle = "#35472f";
          ctx.fillRect(-42, -16, 84, 32);
          ctx.fillStyle = "#6c4b2b";
          ctx.fillRect(-42, 6, 84, 12);
          ctx.strokeStyle = "#21140d";
          ctx.lineWidth = 3;
          ctx.strokeRect(-42, -16, 84, 32);
        } else if (prop.type === "supplyWagon") {
          ctx.fillStyle = "#5a321b";
          ctx.fillRect(-58, -28, 116, 56);
          ctx.fillStyle = "#7b5230";
          ctx.fillRect(-44, -42, 88, 24);
          ctx.strokeStyle = "#21140d";
          ctx.lineWidth = 4;
          ctx.strokeRect(-58, -28, 116, 56);
          ctx.beginPath();
          ctx.arc(-44, 34, 18, 0, TAU);
          ctx.arc(44, 34, 18, 0, TAU);
          ctx.stroke();
          drawText("SUPPLY", 0, 2, 11, "#ffe0a3", "center", "900");
        } else if (prop.type === "hitch") {
          ctx.fillStyle = "#4d2d18";
          ctx.fillRect(-54, -5, 108, 10);
          ctx.fillRect(-48, -30, 10, 62);
          ctx.fillRect(38, -30, 10, 62);
        } else if (prop.type === "coffee") {
          ctx.fillStyle = "#2b1b11";
          ctx.beginPath();
          ctx.ellipse(0, 0, 25, 15, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(225, 205, 171, 0.4)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-8, -18);
          ctx.quadraticCurveTo(0, -34, 8, -18);
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(darryl.x, darryl.y);
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.ellipse(0, 17, 22, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#3d2a1e";
      ctx.beginPath();
      ctx.ellipse(0, 6, 14, 18, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#c28b5d";
      ctx.beginPath();
      ctx.arc(0, -11, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.ellipse(0, -18, 18, 6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#7b4b28";
      ctx.beginPath();
      ctx.ellipse(0, 13, 19, 8, 0, 0, TAU);
      ctx.fill();
      drawText("Darryl", 0, -36, 13, "#ffe0a3", "center", "900");
      ctx.restore();
    }

    function drawLockedObjects() {
      for (const obj of lockedObjects) {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.fillStyle = obj.opened ? "rgba(74, 47, 28, 0.7)" : "#6a3b20";
        ctx.fillRect(-24, -16, 48, 32);
        ctx.fillStyle = obj.opened ? "#2e1a0f" : "#8a5b31";
        ctx.fillRect(-26, -22, 52, 14);
        ctx.strokeStyle = "#21140d";
        ctx.lineWidth = 4;
        ctx.strokeRect(-24, -16, 48, 32);
        if (!obj.opened) {
          ctx.fillStyle = colors.brass;
          ctx.fillRect(-5, -2, 10, 12);
          ctx.beginPath();
          ctx.arc(0, -4, 7, Math.PI, TAU);
          ctx.strokeStyle = colors.brass;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        drawText(obj.opened ? "OPEN" : "LOCKED", 0, 32, 10, "#ffe0a3", "center", "900");
        ctx.restore();
      }
    }

    function drawMissionActors() {
      if (state.missionStep < 2 || state.missionComplete) return;
      const actors = [
        { x: missionArgument.x - 30, y: missionArgument.y, color: "#70502f", hat: "#24160d" },
        { x: missionArgument.x + 34, y: missionArgument.y + 6, color: "#34465f", hat: "#1a2537" }
      ];
      for (const actor of actors) {
        ctx.save();
        ctx.translate(actor.x, actor.y);
        ctx.fillStyle = actor.color;
        ctx.beginPath();
        ctx.ellipse(0, 5, 12, 16, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#c28b5d";
        ctx.beginPath();
        ctx.arc(0, -10, 8, 0, TAU);
        ctx.fill();
        ctx.fillStyle = actor.hat;
        ctx.beginPath();
        ctx.ellipse(0, -16, 16, 5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      if (state.missionStep === 2) drawText("ARGUMENT", missionArgument.x + 2, missionArgument.y - 46, 13, "#ffe08a", "center", "900");
      if (state.missionStep === 3) drawText("FIGHT / FLEE / ROB", missionArgument.x + 2, missionArgument.y - 52, 13, "#ff9a6c", "center", "900");
    }

    function missionObjectiveText() {
      if (state.missionComplete) return "Mission: follow the missing travelers lead";
      if (state.missionStep === 0) return "Mission: talk to Darryl at camp";
      if (state.missionStep === 1) return "Mission: ride into Mercy Ridge";
      if (state.missionStep === 2) return "Mission: approach the street argument";
      if (state.missionStep === 3) return "Mission: fight, flee, or make trouble";
      return "";
    }

    function missionObjectiveTarget() {
      if (state.missionComplete) return { x: 1660, y: 3340, label: "Ash Hollow lead" };
      if (state.missionStep === 0) return { x: darryl.x, y: darryl.y, label: "Darryl" };
      if (state.missionStep === 1) return { x: missionArgument.x, y: missionArgument.y, label: "Mercy Ridge" };
      if (state.missionStep === 2) return { x: missionArgument.x, y: missionArgument.y, label: "Street argument" };
      if (state.missionStep === 3) {
        const target = enemies.find((enemy) => !enemy.dead && enemy.missionTag === "welcome");
        if (target) return { x: target.x, y: target.y, label: "Trouble" };
        return { x: missionArgument.x, y: missionArgument.y, label: "Hicksville" };
      }
      return null;
    }

    function drawObjectiveWorldMarker() {
      const target = missionObjectiveTarget();
      if (!target) return;
      const pulse = 0.5 + Math.sin(state.time * 5.2) * 0.5;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.strokeStyle = `rgba(255, 209, 88, ${0.55 + pulse * 0.3})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + pulse * 10, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 230, 150, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -54 - pulse * 6);
      ctx.lineTo(0, -18);
      ctx.stroke();
      ctx.fillStyle = "#ffd158";
      ctx.beginPath();
      star(0, -68 - pulse * 6, 12, 5, 5);
      ctx.fill();
      drawText(target.label, 0, -92 - pulse * 6, 13, "#ffe0a3", "center", "900");
      ctx.restore();
    }

    function drawObjectiveCompass() {
      const target = missionObjectiveTarget();
      if (!target) return;
      const sx = target.x - camera.x;
      const sy = target.y - camera.y;
      const onScreen = sx > 80 && sx < VIEW_W - 80 && sy > 80 && sy < VIEW_H - 80;
      const d = Math.hypot(target.x - player.x, target.y - player.y);
      if (onScreen) return;

      const cx = VIEW_W / 2;
      const cy = VIEW_H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const edgeX = clamp(cx + Math.cos(a) * 520, 80, VIEW_W - 80);
      const edgeY = clamp(cy + Math.sin(a) * 285, 92, VIEW_H - 92);
      const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;

      ctx.save();
      ctx.translate(edgeX, edgeY);
      ctx.rotate(a);
      ctx.fillStyle = `rgba(255, 209, 88, ${0.82 + pulse * 0.16})`;
      ctx.strokeStyle = "rgba(38, 19, 8, 0.82)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-12, -14);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 14);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();

      drawText(`${target.label} ${Math.round(d / 10) * 10}m`, edgeX, edgeY + 32, 13, "#ffe0a3", "center", "900");
    }

    function drawBoundaryMarkers() {
      ctx.save();
      ctx.strokeStyle = "rgba(120, 36, 30, 0.34)";
      ctx.lineWidth = 5;
      ctx.setLineDash([20, 18]);
      ctx.strokeRect(town.x - 170, town.y - 170, town.w + 340, town.h + 340);
      ctx.setLineDash([]);
      ctx.restore();

      for (const marker of boundaryMarkers) {
        ctx.save();
        ctx.translate(marker.x, marker.y);
        ctx.rotate(marker.rot);
        ctx.fillStyle = "rgba(35, 18, 12, 0.25)";
        ctx.beginPath();
        ctx.ellipse(0, 20, 28, 9, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#4a2615";
        ctx.fillRect(-6, -30, 12, 58);
        ctx.fillStyle = "#7b2f23";
        ctx.fillRect(-30, -22, 60, 18);
        ctx.strokeStyle = "#221009";
        ctx.lineWidth = 3;
        ctx.strokeRect(-30, -22, 60, 18);
        ctx.fillStyle = colors.brass;
        ctx.beginPath();
        ctx.arc(0, -36, 9, Math.PI, TAU);
        ctx.lineTo(9, -29);
        ctx.lineTo(-9, -29);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#f3cf88";
        ctx.fillRect(-3, -30, 6, 7);
        drawText("BELL", 0, -13, 9, "#ffe0a3", "center", "900");
        ctx.restore();
      }
    }

    function drawDecorUnder() {
      for (const item of decor) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rot);
        if (item.type === "rock") {
          ctx.fillStyle = "#6d5e4e";
          ctx.beginPath();
          ctx.ellipse(0, 0, item.radius, item.radius * 0.72, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.11)";
          ctx.beginPath();
          ctx.ellipse(-item.radius * 0.25, -item.radius * 0.22, item.radius * 0.35, item.radius * 0.16, 0, 0, TAU);
          ctx.fill();
        } else if (item.type === "tree") {
          ctx.fillStyle = "#49321f";
          ctx.fillRect(-5, -8, 10, 26);
          ctx.fillStyle = colors.darkScrub;
          ctx.beginPath();
          ctx.ellipse(0, -16, item.radius * 0.8, item.radius * 0.62, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = colors.scrub;
          ctx.beginPath();
          ctx.ellipse(-7, -22, item.radius * 0.45, item.radius * 0.28, 0, 0, TAU);
          ctx.fill();
        } else if (item.type === "cactus") {
          ctx.strokeStyle = colors.darkScrub;
          ctx.lineWidth = 10;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(0, item.radius * 0.5);
          ctx.lineTo(0, -item.radius * 0.75);
          ctx.moveTo(0, -item.radius * 0.15);
          ctx.lineTo(-item.radius * 0.45, -item.radius * 0.2);
          ctx.lineTo(-item.radius * 0.45, -item.radius * 0.45);
          ctx.moveTo(0, -item.radius * 0.35);
          ctx.lineTo(item.radius * 0.42, -item.radius * 0.38);
          ctx.lineTo(item.radius * 0.42, -item.radius * 0.62);
          ctx.stroke();
        } else if (item.type === "corpse") {
          ctx.fillStyle = item.law ? "rgba(40, 51, 71, 0.72)" : "rgba(61, 34, 21, 0.72)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 9, 0, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawBuildings() {
      for (const b of buildings) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = "rgba(40, 20, 10, 0.4)";
        ctx.fillRect(b.x, b.y, b.w, 22);
        ctx.strokeStyle = "#2b170c";
        ctx.lineWidth = 5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);

        ctx.fillStyle = "#2a170d";
        ctx.fillRect(b.x + b.w / 2 - 24, b.y + b.h - 42, 48, 42);
        ctx.fillStyle = "rgba(255, 210, 112, 0.22)";
        for (let wx = b.x + 25; wx < b.x + b.w - 35; wx += 72) {
          ctx.fillRect(wx, b.y + 42, 34, 28);
          ctx.strokeStyle = "rgba(42, 23, 13, 0.65)";
          ctx.lineWidth = 2;
          ctx.strokeRect(wx, b.y + 42, 34, 28);
        }

        drawText(b.name, b.x + b.w / 2, b.y - 16, 15, "#ffe0a3", "center", "700");
        ctx.restore();
      }

      for (const f of fences) {
        ctx.save();
        ctx.fillStyle = "#5a321b";
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        if (f.w > f.h) {
          ctx.fillRect(f.x, f.y + 3, f.w, 4);
          ctx.fillRect(f.x, f.y + f.h - 7, f.w, 4);
        } else {
          ctx.fillRect(f.x + 3, f.y, 4, f.h);
          ctx.fillRect(f.x + f.w - 7, f.y, 4, f.h);
        }
        ctx.restore();
      }
    }

    function drawPickup(p) {
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(state.time * 5 + p.x) * 2);
      ctx.fillStyle = p.type === "money" ? "#e5bd54" : (p.type === "health" ? "#d86b55" : (p.type === "clue" ? "#bca7ff" : "#b8d777"));
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.72, 0, TAU);
      ctx.fill();
      ctx.stroke();
      const label = p.type === "money" ? "$" : (p.type === "health" ? "HP" : (p.type === "clue" ? "?" : "+"));
      drawText(label, 0, 1, p.type === "health" ? 10 : 14, "#29170b", "center", "900");
      ctx.restore();
    }

    function drawParticlesWorld() {
      for (const p of particles) {
        const t = clamp(p.life / p.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = t;
        if (p.kind === "text") {
          drawText(p.text, p.x, p.y, p.size, p.color, "center", "900");
        } else if (p.kind === "flash") {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * t, 0, TAU);
          ctx.fill();
        } else if (p.kind === "spark") {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * t);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.65, p.rot, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    function drawLighting() {
      const dusk = 0.28 + state.dayPhase * 0.22;
      ctx.save();
      ctx.fillStyle = `rgba(40, 19, 18, ${dusk})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const glow = ctx.createRadialGradient(VIEW_W * 0.72, VIEW_H * 0.18, 30, VIEW_W * 0.72, VIEW_H * 0.18, 550);
      glow.addColorStop(0, "rgba(255, 181, 86, 0.15)");
      glow.addColorStop(1, "rgba(255, 181, 86, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      if (player.hitFlash > 0) {
        ctx.fillStyle = `rgba(161, 36, 29, ${0.24 * player.hitFlash})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      ctx.restore();
    }

    function drawDeadEyeOverlay() {
      if (!player.deadEyeActive) return;
      const pulse = 0.5 + Math.sin(player.deadEyePulse) * 0.5;
      ctx.save();
      ctx.fillStyle = `rgba(92, 38, 18, ${0.16 + pulse * 0.04})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 180, VIEW_W / 2, VIEW_H / 2, 620);
      vignette.addColorStop(0, "rgba(255, 226, 152, 0.05)");
      vignette.addColorStop(1, "rgba(26, 10, 8, 0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.strokeStyle = `rgba(255, 220, 132, ${0.34 + pulse * 0.2})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(18, 18, VIEW_W - 36, VIEW_H - 36);
      ctx.setLineDash([]);
      for (const enemy of enemies) {
        if (enemy.dead || enemy.law && distance(enemy, player) > 720) continue;
        const sx = enemy.x - camera.x;
        const sy = enemy.y - camera.y;
        if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;
        ctx.strokeStyle = `rgba(255, 74, 44, ${0.48 + pulse * 0.28})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy - 8, 20 + pulse * 4, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 231, 160, 0.82)";
        ctx.beginPath();
        ctx.arc(sx, sy - 8, 3.5, 0, TAU);
        ctx.fill();
      }
      drawText("DEAD EYE", VIEW_W / 2, 94, 24, "#ffe08a", "center", "900");
      ctx.restore();
    }

    function drawHUD() {
      ctx.save();
      ctx.fillStyle = "rgba(15, 9, 5, 0.72)";
      ctx.fillRect(22, 22, 310, 214);
      ctx.strokeStyle = "rgba(255, 218, 151, 0.28)";
      ctx.strokeRect(22.5, 22.5, 310, 214);
      drawText("HP", 42, 48, 14, "#f7d695", "left", "900");
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(78, 39, 214, 18);
      ctx.fillStyle = player.hp > 35 ? "#94b95d" : "#c74a35";
      ctx.fillRect(78, 39, 214 * (player.hp / player.maxHp), 18);
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.strokeRect(78, 39, 214, 18);
      const reload = player.reloadTimer > 0 ? "Reloading" : `${player.ammo}/6 + ${player.reserveAmmo}`;
      drawText(`Ammo: ${reload}`, 42, 78, 16, "#ffe0a3", "left", "800");
      drawText(`Money: $${state.money}   Score: ${state.score}`, 42, 104, 16, "#ffe0a3", "left", "800");
      const dashProgress = clamp(1 - player.dashCooldown / (player.mounted ? 0.78 : 0.62), 0, 1);
      drawText(player.dashCooldown <= 0 ? "Dash: Ready" : "Dash", 42, 128, 14, "#cfe8ff", "left", "800");
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(142, 121, 150, 10);
      ctx.fillStyle = player.dashCooldown <= 0 ? "#8fd6ff" : "#c58b4a";
      ctx.fillRect(142, 121, 150 * dashProgress, 10);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.strokeRect(142, 121, 150, 10);
      drawText(player.deadEyeActive ? "Dead Eye: ON" : "Dead Eye: Q", 42, 154, 14, "#ffe08a", "left", "800");
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(142, 147, 150, 10);
      ctx.fillStyle = player.deadEyeActive ? "#ffcb64" : "#9d7bf0";
      ctx.fillRect(142, 147, 150 * clamp(player.deadEyeMeter / 100, 0, 1), 10);
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.strokeRect(142, 147, 150, 10);
      drawText(`Tools: F Lasso   G Dynamite x${player.dynamiteCount}`, 42, 180, 14, "#ffb47a", "left", "800");
      drawText(`Lockpicks: ${player.lockpicks}`, 42, 204, 14, "#d8c2ff", "left", "800");

      ctx.fillStyle = "rgba(15, 9, 5, 0.72)";
      ctx.fillRect(352, 22, 220, 54);
      ctx.strokeStyle = "rgba(255, 218, 151, 0.28)";
      ctx.strokeRect(352.5, 22.5, 220, 54);
      drawText("Wanted", 370, 49, 15, "#ffd184", "left", "900");
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < Math.floor(state.wanted) ? "#ca4930" : "rgba(255,255,255,0.16)";
        ctx.beginPath();
        star(466 + i * 20, 48, 8, 4, 5);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(15, 9, 5, 0.68)";
      ctx.fillRect(592, 22, 254, 54);
      ctx.strokeStyle = "rgba(255, 218, 151, 0.24)";
      ctx.strokeRect(592.5, 22.5, 254, 54);
      drawText(town.name, 612, 43, 15, "#ffe0a3", "left", "900");
      drawText(`Outlaws call it ${town.nickname}`, 612, 63, 12, "#d2a969", "left", "700");

      if (isInCamp(player.x, player.y)) {
        ctx.fillStyle = "rgba(25, 55, 36, 0.72)";
        ctx.fillRect(866, 22, 158, 54);
        ctx.strokeStyle = "rgba(183, 225, 157, 0.28)";
        ctx.strokeRect(866.5, 22.5, 158, 54);
        drawText("Darryl's Camp", 886, 43, 14, "#d7f1b8", "left", "900");
        drawText("Safe", 886, 63, 12, "#a8d88c", "left", "800");
      }

      if (state.messageTimer > 0) {
        ctx.fillStyle = "rgba(15, 9, 5, 0.72)";
        ctx.fillRect(VIEW_W / 2 - 360, 20, 720, 62);
        ctx.strokeStyle = "rgba(255, 218, 151, 0.28)";
        ctx.strokeRect(VIEW_W / 2 - 359.5, 20.5, 720, 62);
        drawText(state.message, VIEW_W / 2, 51, 22, "#ffe6ac", "center", "900");
      }

      const objective = missionObjectiveText();
      if (objective) {
        const target = missionObjectiveTarget();
        const distanceText = target ? `  •  ${Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) * 10}m` : "";
        ctx.fillStyle = "rgba(15, 9, 5, 0.72)";
        ctx.fillRect(VIEW_W / 2 - 380, VIEW_H - 78, 760, 50);
        ctx.strokeStyle = "rgba(255, 218, 151, 0.24)";
        ctx.strokeRect(VIEW_W / 2 - 379.5, VIEW_H - 77.5, 760, 50);
        drawText(`${objective}${distanceText}`, VIEW_W / 2, VIEW_H - 52, 20, "#ffe0a3", "center", "900");
      }

      const livingEnemies = enemies.filter(e => !e.dead && !e.law).length;
      drawText(`Bandits left: ${livingEnemies}`, VIEW_W - 24, VIEW_H - 28, 16, "#ffe0a3", "right", "800");
      ctx.restore();
    }

    function drawMinimap() {
      const w = 190;
      const h = 154;
      const x = VIEW_W - w - 24;
      const y = 24;
      ctx.save();
      ctx.fillStyle = "rgba(13, 8, 4, 0.76)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255, 218, 151, 0.34)";
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      const sx = w / WORLD_W;
      const sy = h / WORLD_H;
      ctx.fillStyle = "rgba(161, 119, 62, 0.42)";
      ctx.fillRect(x + town.x * sx, y + town.y * sy, town.w * sx, town.h * sy);
      drawText("Mercy", x + town.x * sx + town.w * sx / 2, y + town.y * sy - 8, 10, "#ffe0a3", "center", "900");
      ctx.strokeStyle = "rgba(194, 73, 51, 0.66)";
      ctx.strokeRect(x + (town.x - 170) * sx, y + (town.y - 170) * sy, (town.w + 340) * sx, (town.h + 340) * sy);
      for (const marker of boundaryMarkers) {
        ctx.fillStyle = "#d34b35";
        ctx.fillRect(x + marker.x * sx - 1.5, y + marker.y * sy - 1.5, 3, 3);
      }
      for (const b of buildings) {
        ctx.fillStyle = "#d8ae5a";
        ctx.fillRect(x + b.x * sx, y + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
      }
      for (const landmark of landmarks) {
        ctx.fillStyle = landmark.type === "collapsedMine" ? "#2b2018" : "#e8c982";
        ctx.beginPath();
        ctx.arc(x + landmark.x * sx, y + landmark.y * sy, 2.8, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#9fd07c";
      ctx.beginPath();
      ctx.arc(x + camp.x * sx, y + camp.y * sy, 3.8, 0, TAU);
      ctx.fill();
      const objective = missionObjectiveTarget();
      if (objective) {
        const px = x + player.x * sx;
        const py = y + player.y * sy;
        const ox = x + objective.x * sx;
        const oy = y + objective.y * sy;
        const pulse = 0.5 + Math.sin(state.time * 6) * 0.5;
        ctx.strokeStyle = "rgba(255, 209, 88, 0.62)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ox, oy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffd158";
        ctx.strokeStyle = "rgba(42, 21, 8, 0.82)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        star(ox, oy, 6 + pulse * 2, 2.5 + pulse, 5);
        ctx.fill();
        ctx.stroke();
      }
      for (const enemy of enemies) {
        if (enemy.dead) continue;
        ctx.fillStyle = enemy.law ? "#8eb1e1" : "#d34b35";
        ctx.beginPath();
        ctx.arc(x + enemy.x * sx, y + enemy.y * sy, enemy.law ? 3 : 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = "#fff0a8";
      ctx.beginPath();
      ctx.arc(x + player.x * sx, y + player.y * sy, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.strokeRect(x + camera.x * sx, y + camera.y * sy, VIEW_W * sx, VIEW_H * sy);
      ctx.restore();
    }

    function drawReticle() {
      if (state.mode !== "playing") return;
      ctx.save();
      ctx.translate(mouse.x, mouse.y);
      ctx.strokeStyle = "rgba(255, 230, 174, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.moveTo(-18, 0);
      ctx.lineTo(-6, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(18, 0);
      ctx.moveTo(0, -18);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 18);
      ctx.stroke();
      ctx.restore();
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
    }

    function star(x, y, outer, inner, points) {
      let rot = -Math.PI / 2;
      ctx.moveTo(x, y - outer);
      for (let i = 0; i < points; i++) {
        ctx.lineTo(x + Math.cos(rot) * outer, y + Math.sin(rot) * outer);
        rot += Math.PI / points;
        ctx.lineTo(x + Math.cos(rot) * inner, y + Math.sin(rot) * inner);
        rot += Math.PI / points;
      }
      ctx.closePath();
    }

    // ============================================================
    // Input and main loop
    // ============================================================
    function updateMouse(e) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * VIEW_W;
      mouse.y = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    }

    window.addEventListener("keydown", (e) => {
      if (state.mode === "start") {
        startGame();
        return;
      }
      if (e.code === "Escape" || e.code === "KeyP") {
        if (state.mode === "playing") setMode("paused");
        else if (state.mode === "paused") setMode("playing");
        return;
      }
      if (state.mode !== "playing") return;
      keys.add(e.code);
      if (e.code === "KeyR") player.reload();
      if (e.code === "KeyQ") player.toggleDeadEye();
      if (e.code === "KeyF") player.throwLasso();
      if (e.code === "KeyG") player.throwDynamite();
      if (e.code === "KeyE") useInteraction();
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") player.requestDash();
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyQ", "KeyF", "KeyG"].includes(e.code)) e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      keys.delete(e.code);
    });

    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mousedown", (e) => {
      updateMouse(e);
      if (e.button === 2) {
        if (state.mode === "playing") player.requestDash();
        e.preventDefault();
        return;
      }
      mouse.down = true;
      if (state.mode === "start") startGame();
    });
    window.addEventListener("mouseup", () => {
      mouse.down = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    restartButton.addEventListener("click", () => {
      startGame();
    });

    let last = performance.now();
    function loop(now) {
      let dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (state.hitStop > 0) {
        state.hitStop -= dt;
        dt = 0;
      }
      update(dt);
      render();
      state.frameCount++;
      publishLocalDebugState();
      requestAnimationFrame(loop);
    }

    resetGame();
    requestAnimationFrame(loop);
