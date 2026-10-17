import Phaser from 'phaser';
import { ROADSTER_PNG, ROCKET_PNG } from './sprites';

const WIDTH = 420, HEIGHT = 720, ROADSTER_X = 100;

const STORAGE_KEY = 'flappy-roadster-best';

// Display sizes for the sprites
const ROADSTER_W = 78;   // roadster.png is 420x280
const ROCKET_W = 74;     // rocket.png is 130x425
const ROCKET_H = ROCKET_W * (425 / 130);

// Approximate hitbox half-heights around the roadster sprite center
const CAR_HALF_TOP = 22;
const CAR_HALF_BOTTOM = 24;

class Game extends Phaser.Scene {

  private car!: Phaser.GameObjects.Image;

  private velocity = 0;

  private pipes: { top: Phaser.GameObjects.Image; bottom: Phaser.GameObjects.Image; x: number; scored: boolean }[] = [];

  private score = 0;

  private best = 0;

  private scoreText!: Phaser.GameObjects.Text;

  private infoText!: Phaser.GameObjects.Text;

  private started = false;

  private over = false;

  private spawnElapsed = 0;

  constructor() { super('game'); }

  preload() {
    // Sprites are embedded as base64 data URLs (see sprites.ts)
    this.load.image('roadster', ROADSTER_PNG);
    this.load.image('rocket', ROCKET_PNG);
  }

  create() {

    this.cameras.main.setBackgroundColor('#101727');

    this.add.rectangle(WIDTH / 2, HEIGHT - 45, WIDTH, 90, 0x202f46);

    for (let i = 0; i < 16; i++) {

      const x = (i * 73) % WIDTH, y = (i * 107 + 41) % (HEIGHT - 110);

      this.add.circle(x, y, 1.5, 0xc4d8ff, 0.65);

    }

    // The Tesla Roadster, scaled to gameplay size
    this.car = this.add.image(ROADSTER_X, HEIGHT / 2, 'roadster')
      .setDisplaySize(ROADSTER_W, ROADSTER_W * (280 / 420))
      .setDepth(5);

    this.scoreText = this.add.text(16, 18, 'Score: 0', { fontFamily: 'Arial', fontSize: '26px', color: '#ffffff' }).setDepth(10);

    try { this.best = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { this.best = 0; }

    this.infoText = this.add.text(WIDTH / 2, HEIGHT / 2 - 120, 'FLAPPY ROADSTER\n\nTap / Space to thrust\nDodge the rockets!', { fontFamily: 'Arial',
    fontSize: '28px', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(10);

    this.input.on('pointerdown', () => this.flap());

    this.input.keyboard?.on('keydown-SPACE', () => this.flap());

  }

  private flap() {

    if (this.over) { this.scene.restart(); return; }

    this.started = true; this.infoText.setVisible(false); this.velocity = -310;

  }

  private spawn() {

    const gap = 202, center = Phaser.Math.Between(195, HEIGHT - 225);

    const topHeight = center - gap / 2, bottomY = center + gap / 2;

    // Top rocket: flipped so its nose points down toward the gap
    const top = this.add.image(WIDTH + ROCKET_W / 2, topHeight - ROCKET_H / 2, 'rocket')
      .setDisplaySize(ROCKET_W, ROCKET_H)
      .setFlipY(true);

    // Bottom rocket: nose pointing up toward the gap
    const bottom = this.add.image(WIDTH + ROCKET_W / 2, bottomY + ROCKET_H / 2, 'rocket')
      .setDisplaySize(ROCKET_W, ROCKET_H);

    this.pipes.push({ top, bottom, x: WIDTH + ROCKET_W / 2, scored: false });

  }

  private end() {

    this.over = true; this.started = false;

    this.best = Math.max(this.best, this.score);

    try { localStorage.setItem(STORAGE_KEY, String(this.best)); } catch { /* storage optional */ }

    this.infoText.setText('GAME OVER\nScore: ' + this.score + '  •  Best: ' + this.best + '\n\nTap / Space to retry').setVisible(true);

  }

  update(_time: number, delta: number) {

    if (!this.started || this.over) return;

    const dt = Math.min(delta / 1000, 0.05);

    this.velocity += 790 * dt;

    this.car.y += this.velocity * dt;

    this.car.angle = Phaser.Math.Clamp(this.velocity * 0.07, -24, 65);

    this.spawnElapsed += delta;

    if (this.spawnElapsed >= 1550) { this.spawnElapsed = 0; this.spawn(); }

    if (this.car.y < 18 || this.car.y > HEIGHT - 75) { this.end(); return; }

    for (const p of this.pipes) {

      p.x -= 180 * dt; p.top.x = p.x; p.bottom.x = p.x;

      if (!p.scored && p.x + ROCKET_W / 2 < ROADSTER_X - ROADSTER_W / 2) { p.scored = true; this.score++; this.scoreText.setText('Score: ' + this.score); }

      if (Math.abs(p.x - ROADSTER_X) < (ROCKET_W / 2 + ROADSTER_W / 2) * 0.75) {

        const carTop = this.car.y - CAR_HALF_TOP, carBottom = this.car.y + CAR_HALF_BOTTOM;

        if (carTop < p.top.y + ROCKET_H / 2 || carBottom > p.bottom.y - ROCKET_H / 2) { this.end(); return; }

      }

    }

    this.pipes = this.pipes.filter(p => { if (p.x < -40) { p.top.destroy(); p.bottom.destroy(); return false; } return true; });

  }

}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
scene: [Game], render: { antialias: true } });
