import Phaser from 'phaser';
import { inject } from '@vercel/analytics';
import { ROADSTER_PNG, ROCKET_PNG, ELON_PNG, BOT_PNG } from './sprites';
import { SKYLINE_PNG, SAT_PNG } from './sprites2';

inject();

const WIDTH = 420, HEIGHT = 720, ROADSTER_X = 100;

const STORAGE_KEY = 'flappy-roadster-best';

// Display sizes for the sprites
const ROADSTER_W = 78;   // roadster sprite is 167x51 (tightly cropped)
const ROADSTER_H = ROADSTER_W * (51 / 167);
const ROCKET_W = 74;     // rocket.png is 130x425
const ROCKET_H = ROCKET_W * (425 / 130);

const BOT_W = 70;        // bot sprite is 80x218
const BOT_H = BOT_W * (218 / 80);

const SAT_W = 60;        // satellite sprite is 90x336 (bus at the gap side)
const SAT_H = SAT_W * (336 / 90);

type ObstacleKind = 'rocket' | 'bot' | 'sat';

// Hitboxes are deliberately smaller than the visuals. The rockets taper to a
// point at the gap, so their collision box stays narrow to avoid phantom hits.
const CAR_HALF_TOP = 10;
const CAR_HALF_BOTTOM = 11;
const CAR_HIT_HALF_W = 28;

// Half-width of the obstacle at a given distance from its gap-side tip.
const NOSE_LEN = 60;
function obstacleHalfWidth(kind: ObstacleKind, distFromTip: number): number {
  if (distFromTip <= 0) return 0;
  if (kind === 'bot') {
    // Bot head near the gap, wider torso/body behind it
    return distFromTip < 34 ? 14 : 26;
  }
  if (kind === 'sat') {
    // Boxy satellite bus guards the gap, narrower solar panel behind it
    return distFromTip < 55 ? 21 : 17;
  }
  // Rocket nose tapers to a point
  if (distFromTip >= NOSE_LEN) return 30;
  return 5 + (30 - 5) * (distFromTip / NOSE_LEN);
}

const INTRO_TEXT = 'FLAPPY ROADSTER\n\nTap / Space to thrust\nDodge the rockets!';

class Game extends Phaser.Scene {

  private car!: Phaser.GameObjects.Image;

  private velocity = 0;

  private pipes: { top: Phaser.GameObjects.Image; bottom: Phaser.GameObjects.Image; x: number; scored: boolean; kind: ObstacleKind; w: number; h: number }[] = [];

  private score = 0;

  private best = 0;

  private scoreText!: Phaser.GameObjects.Text;

  private infoText!: Phaser.GameObjects.Text;

  private dashes!: Phaser.GameObjects.TileSprite;

  private bannerText!: Phaser.GameObjects.Text;

  private elon!: Phaser.GameObjects.Image;

  private started = false;

  private over = false;

  private spawnElapsed = 0;

  private thrusters!: Phaser.GameObjects.Particles.ParticleEmitter;

  private thrustAccum = 0;

  constructor() { super('game'); }

  preload() {
    // Sprites are embedded as base64 data URLs (see sprites.ts)
    this.load.image('roadster', ROADSTER_PNG);
    this.load.image('rocket', ROCKET_PNG);
    this.load.image('elon', ELON_PNG);
    this.load.image('bot', BOT_PNG);
    this.load.image('sat', SAT_PNG);
    this.load.image('skyline', SKYLINE_PNG);
  }

  create() {

    this.cameras.main.setBackgroundColor('#101727');

    // Moon with a soft glow
    const moonGfx = this.add.graphics();
    moonGfx.fillStyle(0xe8ecf5, 0.10);
    moonGfx.fillCircle(344, 116, 46);
    moonGfx.fillStyle(0xe8ecf5, 0.22);
    moonGfx.fillCircle(344, 116, 33);
    moonGfx.fillStyle(0xf2f5fb, 1);
    moonGfx.fillCircle(344, 116, 24);

    // A few stars high in the sky
    for (let i = 0; i < 12; i++) {
      const x = (i * 89 + 31) % WIDTH, y = (i * 53 + 17) % 200;
      this.add.circle(x, y, 1.5, 0xc4d8ff, 0.6);
    }

    // Distant launch-facility skyline on the horizon
    // (sits slightly low so the road overlaps its bottom edge)
    this.add.image(WIDTH / 2, HEIGHT - 90 - 90 + 8, 'skyline').setDisplaySize(420, 180);

    // Road
    this.add.rectangle(WIDTH / 2, HEIGHT - 45, WIDTH, 90, 0x161b28);
    this.add.rectangle(WIDTH / 2, HEIGHT - 90, WIDTH, 3, 0x2e3648);

    // Scrolling lane dashes
    const dashGfx = this.add.graphics();
    dashGfx.fillStyle(0xd8dee9, 1);
    dashGfx.fillRoundedRect(5, 41, 60, 8, 4);
    dashGfx.generateTexture('dash', 70, 90);
    dashGfx.destroy();
    this.dashes = this.add.tileSprite(WIDTH / 2, HEIGHT - 45, WIDTH, 90, 'dash');

    // The Tesla Roadster, scaled to gameplay size
    this.car = this.add.image(ROADSTER_X, HEIGHT / 2, 'roadster')
      .setDisplaySize(ROADSTER_W, ROADSTER_H)
      .setDepth(5);

    // Cold-gas thruster particles: soft white puffs blasting downward
    const puffGfx = this.add.graphics();
    puffGfx.fillStyle(0xffffff, 0.35);
    puffGfx.fillCircle(8, 8, 8);
    puffGfx.fillStyle(0xffffff, 1);
    puffGfx.fillCircle(8, 8, 6);
    puffGfx.generateTexture('puff', 16, 16);
    puffGfx.destroy();

    this.thrusters = this.add.particles(0, 0, 'puff', {
      speed: { min: 140, max: 280 },
      angle: { min: 75, max: 105 },
      lifespan: { min: 250, max: 550 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.85, end: 0 },
      emitting: false
    });
    this.thrusters.setDepth(4);

    this.scoreText = this.add.text(16, 18, 'Score: 0', { fontFamily: 'Arial', fontSize: '26px', color: '#ffffff' }).setDepth(10);

    try { this.best = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { this.best = 0; }

    this.infoText = this.add.text(WIDTH / 2, HEIGHT / 2 - 120, INTRO_TEXT, { fontFamily: 'Arial',
    fontSize: '28px', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(10);

    // Disappointed Elon, judging you from the game-over screen
    this.elon = this.add.image(WIDTH / 2, 95, 'elon')
      .setDisplaySize(115, 115)
      .setDepth(10)
      .setVisible(false);

    // Warning banner shown once when the Tesla Bots take over
    this.bannerText = this.add.text(WIDTH / 2, HEIGHT / 2 - 210, 'TESLA BOTS\nINCOMING', { fontFamily: 'Arial',
    fontSize: '34px', color: '#ff6b6b', align: 'center', fontStyle: 'bold' }).setOrigin(0.5).setDepth(11).setVisible(false).setAlpha(0);

    this.input.on('pointerdown', () => this.flap());

    this.input.keyboard?.on('keydown-SPACE', () => this.flap());

  }

  private flap() {

    if (this.over) { this.reset(); return; }

    this.started = true; this.infoText.setVisible(false); this.velocity = -310;

    // Cold-gas thruster burst under the car, like the Roadster's SpaceX package
    for (const side of [-1, 1]) {
      const p = this.thrusterPos(side * 18);
      this.thrusters.explode(10, p.x, p.y);
    }

  }

  // Thruster nozzle position under the car, rotated with the car's tilt
  private thrusterPos(offsetX: number): { x: number; y: number } {
    const rad = Phaser.Math.DegToRad(this.car.angle);
    const oy = 14;
    return {
      x: this.car.x + offsetX * Math.cos(rad) - oy * Math.sin(rad),
      y: this.car.y + offsetX * Math.sin(rad) + oy * Math.cos(rad)
    };
  }

  // Manual reset instead of scene.restart(): reuses the already-loaded
  // textures and avoids re-running the scene loader, which was unreliable.
  private reset() {

    this.over = false;
    this.started = false;
    this.velocity = 0;
    this.score = 0;
    this.spawnElapsed = 0;
    this.thrustAccum = 0;

    for (const p of this.pipes) { p.top.destroy(); p.bottom.destroy(); }
    this.pipes = [];

    this.car.setPosition(ROADSTER_X, HEIGHT / 2).setAngle(0);
    this.scoreText.setText('Score: 0');
    this.infoText.setText(INTRO_TEXT).setVisible(true);
    this.infoText.setY(HEIGHT / 2 - 120);
    this.elon.setVisible(false);
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setVisible(false);

  }

  private spawn() {

    const gap = 202, center = Phaser.Math.Between(195, HEIGHT - 225);

    const topHeight = center - gap / 2, bottomY = center + gap / 2;

    // Obstacle phases: rockets, then Tesla Bots at 15, then Starlink at 30
    const kind: ObstacleKind = this.score >= 30 ? 'sat' : this.score >= 15 ? 'bot' : 'rocket';
    const tex = kind === 'sat' ? 'sat' : kind === 'bot' ? 'bot' : 'rocket';
    const w = kind === 'sat' ? SAT_W : kind === 'bot' ? BOT_W : ROCKET_W;
    const h = kind === 'sat' ? SAT_H : kind === 'bot' ? BOT_H : ROCKET_H;

    // Top obstacle: flipped so its head/nose points down toward the gap
    const top = this.add.image(WIDTH + w / 2, topHeight - h / 2, tex)
      .setDisplaySize(w, h)
      .setFlipY(true);

    // Bottom obstacle: head/nose pointing up toward the gap
    const bottom = this.add.image(WIDTH + w / 2, bottomY + h / 2, tex)
      .setDisplaySize(w, h);

    this.pipes.push({ top, bottom, x: WIDTH + w / 2, scored: false, kind, w, h });

  }

  private showBanner(text: string) {
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setText(text).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.bannerText, alpha: 0, duration: 1500, delay: 900,
      onComplete: () => this.bannerText.setVisible(false) });
  }

  private end() {

    this.over = true; this.started = false;

    this.best = Math.max(this.best, this.score);

    try { localStorage.setItem(STORAGE_KEY, String(this.best)); } catch { /* storage optional */ }

    this.infoText.setText('GAME OVER\nScore: ' + this.score + '  •  Best: ' + this.best + '\nElon is disappointed.\n\nTap / Space to retry').setVisible(true);
    this.infoText.setY(280);
    this.elon.setVisible(true);

  }

  update(_time: number, delta: number) {

    if (!this.started || this.over) return;

    const dt = Math.min(delta / 1000, 0.05);

    // Road dashes scroll with the world
    this.dashes.tilePositionX -= 180 * dt;

    this.velocity += 790 * dt;

    this.car.y += this.velocity * dt;

    this.car.angle = Phaser.Math.Clamp(this.velocity * 0.07, -24, 65);

    // Light thruster trail while the car is climbing
    if (this.velocity < -80) {
      this.thrustAccum += delta;
      while (this.thrustAccum >= 60) {
        this.thrustAccum -= 60;
        for (const side of [-1, 1]) {
          const p = this.thrusterPos(side * 18);
          this.thrusters.explode(1, p.x, p.y);
        }
      }
    } else {
      this.thrustAccum = 0;
    }

    this.spawnElapsed += delta;

    if (this.spawnElapsed >= 1550) { this.spawnElapsed = 0; this.spawn(); }

    if (this.car.y < 18 || this.car.y > HEIGHT - 75) { this.end(); return; }

    for (const p of this.pipes) {

      p.x -= 180 * dt; p.top.x = p.x; p.bottom.x = p.x;

      if (!p.scored && p.x + p.w / 2 < ROADSTER_X - ROADSTER_W / 2) {
        p.scored = true; this.score++; this.scoreText.setText('Score: ' + this.score);
        if (this.score === 15) this.showBanner('TESLA BOTS\nINCOMING');
        if (this.score === 30) this.showBanner('STARLINK\nINCOMING');
      }

      const topTip = p.top.y + p.h / 2;
      const botTip = p.bottom.y - p.h / 2;
      const carTop = this.car.y - CAR_HALF_TOP, carBottom = this.car.y + CAR_HALF_BOTTOM;

      // Top obstacle: collides only if the car's top is above the gap-side tip,
      // using the shape-aware width at the penetration depth.
      if (carTop < topTip && Math.abs(p.x - ROADSTER_X) < obstacleHalfWidth(p.kind, topTip - carTop) + CAR_HIT_HALF_W) { this.end(); return; }
      if (carBottom > botTip && Math.abs(p.x - ROADSTER_X) < obstacleHalfWidth(p.kind, carBottom - botTip) + CAR_HIT_HALF_W) { this.end(); return; }

    }

    this.pipes = this.pipes.filter(p => { if (p.x < -40) { p.top.destroy(); p.bottom.destroy(); return false; } return true; });

  }

}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
scene: [Game], render: { antialias: true } });
