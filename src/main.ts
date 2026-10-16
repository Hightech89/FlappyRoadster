import Phaser from 'phaser';

const WIDTH = 420, HEIGHT = 720, ROADSTER_X = 100;
const STORAGE_KEY = 'flappy-roadster-best';
class Game extends Phaser.Scene {
  private car!: Phaser.GameObjects.Container;
  private velocity = 0;
  private pipes: { top: Phaser.GameObjects.Rectangle; bottom: Phaser.GameObjects.Rectangle; x: number; scored: boolean }[] = [];
  private score = 0;
  private best = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private started = false;
  private over = false;
  private spawnElapsed = 0;
  constructor() { super('game'); }
  create() {
    this.cameras.main.setBackgroundColor('#101727');
    this.add.rectangle(WIDTH / 2, HEIGHT - 45, WIDTH, 90, 0x202f46);
    for (let i = 0; i < 16; i++) {
      const x = (i * 73) % WIDTH, y = (i * 107 + 41) % (HEIGHT - 110);
      this.add.circle(x, y, 1.5, 0xc4d8ff, 0.65);
    }
    this.car = this.add.container(ROADSTER_X, HEIGHT / 2);
    this.car.add([
      this.add.rectangle(0, 0, 68, 24, 0xd92d39).setStrokeStyle(2, 0xff7c81),
      this.add.rectangle(6, -12, 35, 12, 0xb6e1f4),
      this.add.circle(-22, 13, 8, 0x0c1018).setStrokeStyle(3, 0x909bad),
      this.add.circle(23, 13, 8, 0x0c1018).setStrokeStyle(3, 0x909bad),
      this.add.triangle(-40, 3, 0, 0, -20, -9, -20, 9, 0xffa32b)
    ]);
    this.scoreText = this.add.text(16, 18, 'Score: 0', { fontFamily: 'Arial', fontSize: '26px', color: '#ffffff' }).setDepth(10);
    try { this.best = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch { this.best = 0; }
    this.infoText = this.add.text(WIDTH / 2, HEIGHT / 2 - 120, 'FLAPPY ROADSTER\n\nTap / Space to thrust\nDodge the obstacles!', { fontFamily: 'Arial', fontSize: '28px', color: '#ffffff', align: 'center' }).setOrigin(0.5).setDepth(10);
    this.input.on('pointerdown', () => this.flap());
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
  }
  private flap() {
    if (this.over) { this.scene.restart(); return; }
    this.started = true; this.infoText.setVisible(false); this.velocity = -310;
  }
  private spawn() {
    const gap = 202, center = Phaser.Math.Between(195, HEIGHT - 225), w = 64;
    const topHeight = center - gap / 2, bottomY = center + gap / 2;
    const top = this.add.rectangle(WIDTH + w / 2, topHeight / 2, w, topHeight, 0x6ad6d1).setStrokeStyle(3, 0x2e8f9a);
    const bottom = this.add.rectangle(WIDTH + w / 2, (bottomY + HEIGHT - 45) / 2, w, HEIGHT - 45 - bottomY, 0x6ad6d1).setStrokeStyle(3, 0x2e8f9a);
    this.pipes.push({ top, bottom, x: WIDTH + w / 2, scored: false });
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
      if (!p.scored && p.x + 32 < ROADSTER_X - 35) { p.scored = true; this.score++; this.scoreText.setText('Score: ' + this.score); }
      if (Math.abs(p.x - ROADSTER_X) < 60) {
        const carTop = this.car.y - 20, carBottom = this.car.y + 22;
        if (carTop < p.top.y + p.top.height / 2 || carBottom > p.bottom.y - p.bottom.height / 2) { this.end(); return; }
      }
    }
    this.pipes = this.pipes.filter(p => { if (p.x < -40) { p.top.destroy(); p.bottom.destroy(); return false; } return true; });
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: WIDTH, height: HEIGHT, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [Game], render: { antialias: true } });
