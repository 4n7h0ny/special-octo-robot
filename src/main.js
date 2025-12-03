/*
# Design Doc – Boppy Breakout (Phaser 3, browser-based)

## Loop & Scenes
- **SplashScene**: Preloads/caches music from the provided URL, shows logo + author, and fades to the main menu after playback or key press.
- **MenuScene**: Shows start instructions, allows toggling to the game, and primes controls.
- **GameScene**: Core gameplay with physics, parallax backgrounds, procedural platforms, collectibles, enemies, HUD, pause handling, and respawn/checkpoint logic.

## Input Handling
- Keyboard: Arrow keys or WASD for movement, Space for jump/double-jump, Shift for dash, P/ESC for pause, Enter/Space to skip splash/start game.
- Input handled per frame in `update` using Phaser's cursor keys + custom key objects.

## Physics & Movement
- Arcade Physics, gravity on Y.
- Player: walking, air control, double-jump (max 2 jumps until grounded), wall slide (reduced fall when pressing toward wall), dash (short burst with cooldown), temporary speed boost from batteries.
- Collisions with ground/platforms; falling below world or losing all hearts triggers respawn/reset.

## Assets & Aesthetics
- Phaser 3 bundled locally (no CDN). No external art; backgrounds built with procedural gradients/tile sprites, UI text with outlined style. Particle emitters for jump/collect sparkles.
- Splash music fetched from given URL and cached in `localStorage` as a data URI after first load.

## Data Structures
- `playerState`: tracks jumps used, isDashing, dashTimer, speedBoostTimer, lives, batteryCount, checkpoint position.
- `entities`: arrays/groups for platforms, collectibles, enemies; patrol metadata stored on enemy sprites.
- HUD text objects updated per frame.

## Game Flow
1. Splash loads and plays music; fade-out to Menu.
2. Menu waits for start input; transitions to GameScene.
3. GameScene runs main loop: update physics, parallax scrolling, AI patrol, HUD, mission text timer.
4. Pause toggles physics pause + overlay; resume returns to loop.
5. On fall or hearts depleted, respawn to last checkpoint; reset enemies/collectibles state for simplicity.

## Performance/Debug
- Target 60 FPS; Arcade Physics suited for lightweight 2D. FPS/scene info overlay in GameScene update.
- Minimal allocations inside update; timers handled via counters.

## TODOs (beyond scope)
- Replace procedural art with sprite sheets, add SFX, refine difficulty curve, add multiple levels + save data.
*/

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const LEVEL_WIDTH = 2000;
const MUSIC_URL = 'https://drive.google.com/uc?export=download&id=1nEIJq-tblzlZ7X1o9BXWZdBL_ILm26aY';

// Utility: convert array buffer to base64 data URI for caching.
async function arrayBufferToDataURL(buffer, mimeType = 'audio/mpeg') {
  const blob = new Blob([buffer], { type: mimeType });
  const data = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(data);
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return `data:${mimeType};base64,${btoa(binary)}`;
}

class SplashScene extends Phaser.Scene {
  constructor() {
    super('Splash');
    this.cachedAudioDataUrl = null;
    this.musicSound = null;
  }

  init() {
    // Attempt to hydrate cached audio if it exists.
    this.cachedAudioDataUrl = localStorage.getItem('boppy_splash_audio');
  }

  preload() {
    this.cameras.main.setBackgroundColor('#101020');
    if (this.cachedAudioDataUrl) {
      this.load.audio('splashTrack', this.cachedAudioDataUrl);
    } else {
      this.load.audio('splashTrack', MUSIC_URL);
      this.prepareCache();
    }
    const loadingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, 'Loading music...', {
      fontSize: '18px',
      color: '#aaa',
    }).setOrigin(0.5);
    this.load.on('progress', (p) => {
      loadingText.setText(`Loading music... ${(p * 100).toFixed(0)}%`);
    });
  }

  async prepareCache() {
    try {
      const res = await fetch(MUSIC_URL);
      const buf = await res.arrayBuffer();
      const dataUrl = await arrayBufferToDataURL(buf);
      localStorage.setItem('boppy_splash_audio', dataUrl);
      this.cachedAudioDataUrl = dataUrl;
    } catch (err) {
      // Fallback: cache silently fails; we still play streamed track.
      console.warn('Failed to cache splash track', err);
    }
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    this.add.rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x181830);
    this.add.rectangle(centerX, centerY, 500, 240, 0x24264b, 0.8).setStrokeStyle(4, 0xff66cc);

    this.add.text(centerX, centerY - 40, 'Boppy Breakout', {
      fontSize: '48px',
      color: '#ffe478',
      fontStyle: 'bold',
      stroke: '#1b1b3a',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + 10, 'Designed by Kai Nava', {
      fontSize: '20px',
      color: '#c4d7f2',
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + 60, 'Press Enter/Space to skip', {
      fontSize: '16px',
      color: '#9ad5ff',
    }).setOrigin(0.5);

    this.musicSound = this.sound.add('splashTrack', { loop: false, volume: 0.8 });
    this.musicSound.once('complete', () => this.fadeToMenu());
    this.musicSound.play();

    this.input.keyboard.once('keydown-ENTER', () => this.fadeToMenu());
    this.input.keyboard.once('keydown-SPACE', () => this.fadeToMenu());

    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  fadeToMenu() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    if (this.musicSound?.isPlaying) {
      this.musicSound.stop();
    }
    this.time.delayedCall(520, () => {
      this.scene.start('Menu');
    });
  }
}

class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1117');
    this.add.text(GAME_WIDTH / 2, 160, 'Boppy Breakout', {
      fontSize: '52px',
      color: '#f1c40f',
      fontStyle: 'bold',
      stroke: '#2c2c54',
      strokeThickness: 6,
    }).setOrigin(0.5);

    const instructions = [
      'Teen-friendly challenge: master tight jumps and dashes!',
      'Controls: Arrow/WASD to move, Space to jump/double-jump,',
      'Shift to dash, Esc/P to pause.',
      'Collect 10 Boost Batteries to power the portal.',
      'Avoid Gear Gremlins and don\'t fall!'
    ];
    instructions.forEach((text, idx) => {
      this.add.text(GAME_WIDTH / 2, 240 + idx * 28, text, {
        fontSize: '18px',
        color: '#ecf0f1',
      }).setOrigin(0.5);
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 100, 'Press Enter/Space to begin', {
      fontSize: '20px',
      color: '#7bed9f',
    }).setOrigin(0.5);

    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('Game'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('Game'));
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.player = null;
    this.platforms = null;
    this.collectibles = null;
    this.enemies = null;
    this.hud = {};
    this.playerState = {
      jumps: 0,
      lives: 3,
      batteries: 0,
      speedBoostTimer: 0,
      dashTimer: 0,
      canDash: true,
      lastCheckpoint: new Phaser.Math.Vector2(100, 380),
    };
    this.controls = null;
    this.backgrounds = [];
    this.missionText = null;
    this.particles = null;
    this.pausedOverlay = null;
  }

  create() {
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, GAME_HEIGHT);

    // Parallax backgrounds using tile sprites.
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1f2838, 1).fillRect(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    graphics.generateTexture('bg-layer', LEVEL_WIDTH, GAME_HEIGHT);
    graphics.clear();
    graphics.fillStyle(0x22344d, 1).fillRect(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    graphics.generateTexture('bg-layer-2', LEVEL_WIDTH, GAME_HEIGHT);
    graphics.clear();
    graphics.fillStyle(0x3a3f58, 1).fillRoundedRect(0, 0, 100, 20, 4);
    graphics.generateTexture('platform', 100, 20);
    graphics.clear();
    graphics.fillStyle(0x2b2f44, 1).fillRect(0, 0, 160, 80);
    graphics.generateTexture('ground', 160, 80);
    graphics.destroy();

    const bg1 = this.add.tileSprite(0, 0, LEVEL_WIDTH, GAME_HEIGHT, 'bg-layer')
      .setOrigin(0, 0)
      .setTint(0x14192d);
    const bg2 = this.add.tileSprite(0, 0, LEVEL_WIDTH, GAME_HEIGHT, 'bg-layer-2')
      .setOrigin(0, 0)
      .setTint(0x1f2a44);
    this.backgrounds.push(bg1, bg2);

    this.platforms = this.physics.add.staticGroup();
    // Ground tiles across level.
    for (let x = 0; x < LEVEL_WIDTH; x += 160) {
      const ground = this.platforms.create(x, GAME_HEIGHT - 40, 'ground');
      ground.displayWidth = 160;
      ground.displayHeight = 80;
      ground.refreshBody();
      ground.setOrigin(0, 0);
      ground.setData('isGround', true);
    }

    // Procedural elevated platforms.
    const platformHeights = [380, 320, 260, 320, 360, 300, 340];
    for (let i = 0; i < 12; i += 1) {
      const xPos = 180 + i * 150 + Phaser.Math.Between(-20, 20);
      const height = platformHeights[i % platformHeights.length];
      const plat = this.platforms.create(xPos, height, 'platform');
      plat.displayWidth = 100;
      plat.displayHeight = 20;
      plat.refreshBody();
      plat.setOrigin(0, 0);
    }

    // Player setup.
    this.player = this.physics.add.sprite(100, 320, null);
    this.player.setDisplaySize(32, 48);
    this.player.setTint(0xffd166);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(24, 46);

    // Particle manager for spark effects.
    this.particles = this.add.particles(0xffffff);

    // Collectibles: Boost Batteries
    this.collectibles = this.physics.add.staticGroup();
    const batterySpacing = LEVEL_WIDTH / 10;
    for (let i = 0; i < 10; i += 1) {
      const xPos = 200 + i * batterySpacing + Phaser.Math.Between(-30, 30);
      const yPos = Phaser.Math.Between(180, 360);
      const battery = this.collectibles.create(xPos, yPos, null);
      battery.setDisplaySize(20, 32);
      battery.setTint(0x66ffcc);
      battery.setData('battery', true);
    }

    // Enemies with patrol behavior.
    this.enemies = this.physics.add.group();
    for (let i = 0; i < 3; i += 1) {
      const xPos = 400 + i * 450;
      const enemy = this.enemies.create(xPos, 320, null);
      enemy.setDisplaySize(32, 32);
      enemy.setTint(0xff6b6b);
      enemy.body.setCollideWorldBounds(true);
      enemy.body.setAllowGravity(true);
      enemy.setData('patrol', { min: xPos - 80, max: xPos + 80, speed: 80 });
      enemy.setVelocityX(80);
    }

    // Colliders and overlaps.
    this.physics.add.collider(this.player, this.platforms, () => {
      if (this.player.body.touching.down) {
        this.playerState.jumps = 0;
      }
    });
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.collectibles, this.handleCollectible, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.handleEnemyHit, null, this);

    // Camera follows player.
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Controls.
    this.controls = this.input.keyboard.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      p: Phaser.Input.Keyboard.KeyCodes.P,
      esc: Phaser.Input.Keyboard.KeyCodes.ESC,
    });

    // HUD setup.
    this.hud.hearts = this.add.text(16, 16, '❤❤❤', {
      fontSize: '24px',
      color: '#ff6b6b',
      stroke: '#1b1b3a',
      strokeThickness: 3,
    }).setScrollFactor(0);
    this.hud.batteries = this.add.text(16, 48, 'Batteries: 0/10', {
      fontSize: '18px',
      color: '#9ad5ff',
      stroke: '#1b1b3a',
      strokeThickness: 2,
    }).setScrollFactor(0);
    this.hud.timer = this.add.text(GAME_WIDTH - 120, 16, '00:00', {
      fontSize: '18px',
      color: '#f1f2f6',
      stroke: '#1b1b3a',
      strokeThickness: 2,
    }).setScrollFactor(0);
    this.hud.fps = this.add.text(GAME_WIDTH - 120, 40, 'FPS: 0', {
      fontSize: '14px',
      color: '#ccc',
    }).setScrollFactor(0);

    this.levelStartTime = this.time.now;

    this.missionText = this.add.text(GAME_WIDTH / 2, 60, 'Find all Boost Batteries to power the portal!', {
      fontSize: '20px',
      color: '#ffe478',
      stroke: '#1b1b3a',
      strokeThickness: 3,
    }).setScrollFactor(0).setOrigin(0.5);
    this.tweens.add({
      targets: this.missionText,
      alpha: 0,
      ease: 'Sine.easeOut',
      duration: 1000,
      delay: 5000,
    });

    // Pause overlay (hidden initially).
    this.pausedOverlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5)
      .setScrollFactor(0)
      .setVisible(false);
    this.pausedText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Paused', {
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setVisible(false);
  }

  handleCollectible(player, battery) {
    battery.destroy();
    this.playerState.batteries += 1;
    this.playerState.speedBoostTimer = 3000; // milliseconds
    this.spawnSparks(battery.x, battery.y, 0x66ffcc);
    this.updateHUD();
  }

  handleEnemyHit(player, enemy) {
    if (this.playerState.invulnerable) return;
    this.playerState.lives -= 1;
    this.playerState.invulnerable = true;
    this.time.delayedCall(1200, () => (this.playerState.invulnerable = false));
    this.spawnSparks(player.x, player.y, 0xff6b6b);
    this.updateHUD();
    if (this.playerState.lives <= 0) {
      this.resetLevel();
    } else {
      this.respawnPlayer();
    }
  }

  spawnSparks(x, y, color) {
    this.particles.createEmitter({
      x,
      y,
      lifespan: 400,
      speed: { min: 80, max: 160 },
      angle: { min: 0, max: 360 },
      gravityY: 300,
      quantity: 12,
      scale: { start: 0.4, end: 0 },
      tint: color,
    }).explode(20, x, y);
  }

  update(time, delta) {
    // Update parallax backgrounds.
    this.backgrounds[0].tilePositionX = this.cameras.main.scrollX * 0.3;
    this.backgrounds[1].tilePositionX = this.cameras.main.scrollX * 0.5;

    // Pause/resume handling.
    if (Phaser.Input.Keyboard.JustDown(this.controls.p) || Phaser.Input.Keyboard.JustDown(this.controls.esc)) {
      this.togglePauseMenu();
    }

    if (this.physics.world.isPaused) {
      return;
    }

    // Player movement.
    const left = this.controls.left.isDown || this.controls.a.isDown;
    const right = this.controls.right.isDown || this.controls.d.isDown;
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.controls.space) || Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.controls.w);
    const dashPressed = Phaser.Input.Keyboard.JustDown(this.controls.shift);

    const baseSpeed = 210;
    const boostedSpeed = this.playerState.speedBoostTimer > 0 ? 320 : baseSpeed;
    const speed = this.playerState.isDashing ? boostedSpeed * 1.5 : boostedSpeed;

    if (left) {
      this.player.setVelocityX(-speed);
    } else if (right) {
      this.player.setVelocityX(speed);
    } else {
      this.player.setVelocityX(0);
    }

    // Jump and double-jump handling.
    if (jumpPressed && (this.player.body.onFloor() || this.playerState.jumps < 2)) {
      this.player.setVelocityY(-430);
      this.playerState.jumps += 1;
      this.spawnSparks(this.player.x, this.player.y + 20, 0xffe066);
    }

    // Wall slide: reduce fall speed when pressed into wall.
    const touchingWall = (this.player.body.blocked.left && left) || (this.player.body.blocked.right && right);
    if (!this.player.body.onFloor() && touchingWall && this.player.body.velocity.y > 80) {
      this.player.body.velocity.y = 80;
    }

    // Dash burst.
    if (dashPressed && this.playerState.canDash) {
      const dir = right ? 1 : left ? -1 : 1;
      this.player.setVelocityX(dir * boostedSpeed * 1.8);
      this.playerState.isDashing = true;
      this.playerState.canDash = false;
      this.playerState.dashTimer = 250;
      this.time.delayedCall(600, () => (this.playerState.canDash = true));
    }
    if (this.playerState.dashTimer > 0) {
      this.playerState.dashTimer -= delta;
      if (this.playerState.dashTimer <= 0) {
        this.playerState.isDashing = false;
      }
    }

    // Speed boost timer decrement.
    if (this.playerState.speedBoostTimer > 0) {
      this.playerState.speedBoostTimer -= delta;
      if (this.playerState.speedBoostTimer < 0) this.playerState.speedBoostTimer = 0;
    }

    // Timer and HUD updates.
    const elapsedMs = this.time.now - this.levelStartTime;
    const seconds = Math.floor(elapsedMs / 1000);
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    this.hud.timer.setText(`${mins}:${secs}`);
    this.hud.fps.setText(`FPS: ${Math.floor(this.game.loop.actualFps)}`);

    // Patrol AI.
    this.enemies.children.iterate((enemy) => {
      const patrol = enemy.getData('patrol');
      if (!patrol) return;
      if (enemy.x <= patrol.min) {
        enemy.setVelocityX(patrol.speed);
      } else if (enemy.x >= patrol.max) {
        enemy.setVelocityX(-patrol.speed);
      }
    });

    // Checkpoints every 600 px.
    const checkpointX = Math.floor(this.player.x / 600) * 600 + 100;
    if (checkpointX > this.playerState.lastCheckpoint.x) {
      this.playerState.lastCheckpoint.set(checkpointX, 360);
    }

    // Falling out of world.
    if (this.player.y > GAME_HEIGHT + 100) {
      this.playerState.lives -= 1;
      this.updateHUD();
      if (this.playerState.lives <= 0) {
        this.resetLevel();
      } else {
        this.respawnPlayer();
      }
    }
  }

  togglePauseMenu() {
    const paused = this.physics.world.isPaused;
    this.physics.world.isPaused = !paused;
    this.pausedOverlay.setVisible(!paused);
    this.pausedText.setVisible(!paused);
  }

  respawnPlayer() {
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.playerState.lastCheckpoint.x, this.playerState.lastCheckpoint.y);
    this.playerState.jumps = 0;
  }

  resetLevel() {
    // Reset everything for a clean restart.
    this.playerState.lives = 3;
    this.playerState.batteries = 0;
    this.playerState.lastCheckpoint.set(100, 380);
    this.playerState.speedBoostTimer = 0;
    this.playerState.canDash = true;
    this.playerState.jumps = 0;
    this.levelStartTime = this.time.now;
    this.collectibles.clear(true, true);
    // Recreate collectibles.
    const batterySpacing = LEVEL_WIDTH / 10;
    for (let i = 0; i < 10; i += 1) {
      const xPos = 200 + i * batterySpacing + Phaser.Math.Between(-30, 30);
      const yPos = Phaser.Math.Between(180, 360);
      const battery = this.collectibles.create(xPos, yPos, null);
      battery.setDisplaySize(20, 32);
      battery.setTint(0x66ffcc);
      battery.setData('battery', true);
    }
    this.enemies.clear(true, true);
    for (let i = 0; i < 3; i += 1) {
      const xPos = 400 + i * 450;
      const enemy = this.enemies.create(xPos, 320, null);
      enemy.setDisplaySize(32, 32);
      enemy.setTint(0xff6b6b);
      enemy.body.setCollideWorldBounds(true);
      enemy.setData('patrol', { min: xPos - 80, max: xPos + 80, speed: 80 });
      enemy.setVelocityX(80);
    }
    this.player.setPosition(100, 320);
    this.updateHUD();
  }

  updateHUD() {
    const heartSymbols = ['❤', '❤', '❤'].slice(0, this.playerState.lives).join('');
    this.hud.hearts.setText(heartSymbols.padEnd(3, '♡'));
    this.hud.batteries.setText(`Batteries: ${this.playerState.batteries}/10`);
  }
}

const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0f1021',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 900 },
      debug: false,
    },
  },
  scene: [SplashScene, MenuScene, GameScene],
};

window.addEventListener('load', () => {
  /* Entry point creating Phaser.Game instance. */
  // eslint-disable-next-line no-new
  new Phaser.Game(config);
});
