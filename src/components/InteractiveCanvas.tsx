import { useEffect, useRef } from 'react';
import rough from 'roughjs';
import Matter from 'matter-js';

interface InteractiveCanvasProps {
  sketchSvg: SVGSVGElement;
  preset: string;
  exhaustSide: string;  // 'left'|'right'|'top'|'bottom'|'none'
  animationFrames?: SVGSVGElement[];
  onExit: () => void;
}

// ── World config ──────────────────────────────────────────────────────────────
type WorldType = 'ground' | 'sky' | 'space' | 'ocean' | 'underwater';

function getWorldType(preset: string): WorldType {
  if (['airplane', 'bird', 'helicopter', 'cloud', 'sun'].includes(preset)) return 'sky';
  if (['rocket', 'ufo', 'star'].includes(preset))                           return 'space';
  if (['boat'].includes(preset))                                             return 'ocean';
  if (['fish', 'shark', 'whale', 'dolphin'].includes(preset))               return 'underwater';
  return 'ground';
}

// ── Per-preset physics tuning ─────────────────────────────────────────────────
interface PresetConfig {
  maxSpeedH: number; accelH: number; gravity: number;
  jumpVy: number; airBrake: number; hasGround: boolean;
}
const DEFAULT_CONFIG: PresetConfig = {
  maxSpeedH: 8, accelH: 0.8, gravity: 1, jumpVy: -10, airBrake: 0.85, hasGround: true,
};
const PRESET_CONFIGS: Record<string, Partial<PresetConfig>> = {
  car:        { maxSpeedH: 10, accelH: 1.0, airBrake: 0.82 },
  ball:       { maxSpeedH: 7,  accelH: 0.6, gravity: 1.1, jumpVy: -12 },
  rocket:     { maxSpeedH: 6,  accelH: 0.5, gravity: 0.04, hasGround: false },
  airplane:   { maxSpeedH: 9,  accelH: 0.9, gravity: 0.05, hasGround: false },
  bird:       { maxSpeedH: 7,  accelH: 0.7, gravity: 0.03, hasGround: false },
  helicopter: { maxSpeedH: 6,  accelH: 0.6, gravity: 0.04, hasGround: false },
  ufo:        { maxSpeedH: 8,  accelH: 0.7, gravity: 0.02, hasGround: false },
  star:       { maxSpeedH: 5,  accelH: 0.4, gravity: 0.01, hasGround: false },
  boat:       { maxSpeedH: 5,  accelH: 0.5, gravity: 0.8, jumpVy: -6 },
  fish:       { maxSpeedH: 6,  accelH: 0.6, gravity: 0.0, hasGround: false },
  shark:      { maxSpeedH: 8,  accelH: 0.8, gravity: 0.0, hasGround: false },
  whale:      { maxSpeedH: 4,  accelH: 0.35, gravity: 0.0, hasGround: false },
  person:     { maxSpeedH: 6,  accelH: 0.7, jumpVy: -10 },
  cloud:      { maxSpeedH: 4,  accelH: 0.35, gravity: 0.03, hasGround: false },
  sun:        { maxSpeedH: 3,  accelH: 0.25, gravity: 0.01, hasGround: false },
};
const getPresetConfig = (p: string): PresetConfig => ({ ...DEFAULT_CONFIG, ...(PRESET_CONFIGS[p] ?? {}) });

// ── Constants ─────────────────────────────────────────────────────────────────
const GROUND_RATIO  = 0.75;
const MAX_SKETCH_DIM = 220;
const MIN_SKETCH_DIM = 120;
const LERP          = 0.08;
const LOOK_AHEAD    = 120;
const keys: Record<string, boolean> = {};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sv   = (s: number) => { const x = Math.sin(s + 1) * 10000; return x - Math.floor(x); };

// ── Particle ──────────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; r: number; color: string;
}

// ── SVG sizing helpers ────────────────────────────────────────────────────────
function getSvgDimensions(svgEl: SVGSVGElement): { w: number; h: number } {
  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { w: parts[2], h: parts[3] };
  }
  const w = parseFloat(svgEl.getAttribute('width') ?? '0');
  const h = parseFloat(svgEl.getAttribute('height') ?? '0');
  if (w > 0 && h > 0) return { w, h };
  return { w: 400, h: 300 };
}
function fitToBox(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(MAX_SKETCH_DIM / Math.max(w, 1), MAX_SKETCH_DIM / Math.max(h, 1), 1);
  const fw = Math.max(w * scale, MIN_SKETCH_DIM);
  const fh = Math.max(h * scale, MIN_SKETCH_DIM);
  const r  = Math.min(fw / w, fh / h);
  return { w: Math.round(w * r), h: Math.round(h * r) };
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
type RC = ReturnType<typeof rough.canvas>;

function drawTree(rc: RC, sx: number, groundY: number, seed: number) {
  const trunkH = 35 + sv(seed) * 30; const crownW = 48 + sv(seed + 1) * 22; const crownH = 42 + sv(seed + 2) * 18;
  rc.rectangle(sx - 5, groundY - trunkH, 10, trunkH, { roughness: 1.5, strokeWidth: 1.5, stroke: 'rgba(90,65,40,0.7)', fill: 'rgba(110,80,50,0.25)', seed: seed * 3 });
  rc.ellipse(sx, groundY - trunkH - crownH * 0.5, crownW, crownH, { roughness: 2.5, strokeWidth: 1.5, stroke: 'rgba(55,95,45,0.7)', fill: 'rgba(70,115,55,0.28)', seed: seed * 7 });
}
function drawCloud(rc: RC, sx: number, sy: number, size: number, seed: number, opacity: number) {
  const o = { roughness: 2, strokeWidth: 1, stroke: `rgba(110,145,170,${opacity * 0.5})`, fill: `rgba(255,255,255,${opacity * 0.55})` };
  rc.ellipse(sx, sy, size * 2.2, size * 0.9, { ...o, seed });
  rc.ellipse(sx + size * 0.55, sy - size * 0.3, size * 1.3, size * 0.85, { ...o, seed: seed + 1 });
  rc.ellipse(sx - size * 0.45, sy - size * 0.2, size * 1.1, size * 0.75, { ...o, seed: seed + 2 });
}
function drawBird(rc: RC, sx: number, sy: number, seed: number) {
  const sz = 6 + sv(seed) * 5;
  const style = { roughness: 1, strokeWidth: 1.2, stroke: 'rgba(50,55,65,0.55)', seed };
  rc.arc(sx - sz, sy, sz * 2, sz * 0.9, Math.PI, Math.PI * 2, false, style);
  rc.arc(sx + sz, sy, sz * 2, sz * 0.9, Math.PI, Math.PI * 2, false, { ...style, seed: seed + 1 });
}
function drawRock(rc: RC, sx: number, groundY: number, seed: number) {
  const w = 14 + sv(seed) * 18; const h = 7 + sv(seed + 1) * 10;
  rc.ellipse(sx, groundY - h / 2, w, h, { roughness: 1.5, strokeWidth: 1, stroke: 'rgba(100,90,80,0.4)', fill: 'rgba(140,130,120,0.18)', seed });
}
function drawStar(rc: RC, sx: number, sy: number, size: number, seed: number) {
  rc.circle(sx, sy, size * 2, { roughness: 0.8, strokeWidth: 0.8, stroke: `rgba(230,220,180,${0.4 + sv(seed) * 0.5})`, fill: `rgba(255,245,200,${0.3 + sv(seed + 1) * 0.4})`, seed });
}
function drawPlanet(rc: RC, sx: number, sy: number, size: number, seed: number) {
  const colors = [['rgba(180,130,100,0.7)', 'rgba(200,150,120,0.3)'], ['rgba(130,160,180,0.7)', 'rgba(150,180,200,0.3)'], ['rgba(180,150,110,0.7)', 'rgba(200,170,130,0.3)']];
  const [stroke, fill] = colors[seed % colors.length];
  rc.circle(sx, sy, size * 2, { roughness: 1.5, strokeWidth: 2, stroke, fill, seed });
  if (seed % 3 === 0) rc.ellipse(sx, sy, size * 3.2, size * 0.8, { roughness: 1, strokeWidth: 1, stroke: stroke.replace('0.7', '0.4'), seed: seed + 5 });
}
function drawWave(rc: RC, ctx: CanvasRenderingContext2D, W: number, waterY: number, cameraX: number, t: number) {
  ctx.beginPath();
  for (let px = 0; px <= W; px++) {
    const wx = px + cameraX * 0.9;
    const wy = waterY + 5 * Math.sin(wx * 0.018 + t * 0.04) + 3 * Math.sin(wx * 0.032 + t * 0.06);
    px === 0 ? ctx.moveTo(px, wy) : ctx.lineTo(px, wy);
  }
  ctx.lineTo(W, W * 2); ctx.lineTo(0, W * 2); ctx.closePath();
  ctx.fillStyle = 'rgba(80,165,210,0.18)'; ctx.fill();
  const wlx = cameraX * 0.6; const WSP = 220;
  const w0 = Math.floor((wlx - W * 0.6) / WSP) - 1; const w1 = Math.ceil((wlx + W * 1.2) / WSP) + 1;
  for (let i = w0; i <= w1; i++) {
    const wx2 = i * WSP - wlx + W / 2; const seed = Math.abs(i * 3571) % 997 + 1;
    rc.arc(wx2, waterY + 4 * Math.sin(i * 0.8 + t * 0.03), 35 + sv(seed) * 20, 12, Math.PI, Math.PI * 2, false, { roughness: 1.5, strokeWidth: 1.2, stroke: 'rgba(80,160,200,0.5)', seed });
  }
}
function drawBubble(rc: RC, sx: number, sy: number, size: number, seed: number) {
  rc.circle(sx, sy, size * 2, { roughness: 1.2, strokeWidth: 0.8, stroke: 'rgba(150,200,230,0.5)', fill: 'rgba(200,230,250,0.12)', seed });
}
function drawSeaweed(rc: RC, sx: number, groundY: number, seed: number) {
  const h = 30 + sv(seed) * 40;
  for (let seg = 0; seg < 3; seg++) {
    const segY = groundY - seg * (h / 3); const bend = (sv(seed + seg) - 0.5) * 18;
    rc.line(sx + bend * 0.3, segY, sx + bend, segY - h / 3, { roughness: 2, strokeWidth: 2 - seg * 0.4, stroke: `rgba(50,130,80,${0.5 - seg * 0.1})`, seed: seed + seg });
  }
}

// ── World renderers ───────────────────────────────────────────────────────────
function drawGroundWorld(rc: RC, ctx: CanvasRenderingContext2D, W: number, H: number, groundY: number, cameraX: number) {
  ctx.fillStyle = '#fdf9f0'; ctx.fillRect(0, 0, W, H);
  ctx.beginPath();
  for (let px = 0; px <= W; px++) {
    const wx = px + cameraX * 0.08;
    const hy = groundY - 28 - 32 * Math.sin(wx * 0.008) - 18 * Math.sin(wx * 0.013 + 1.2);
    px === 0 ? ctx.moveTo(px, hy) : ctx.lineTo(px, hy);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fillStyle = 'rgba(195,208,182,0.38)'; ctx.fill();
  const tlx = cameraX * 0.4; const TSP = 320;
  for (let i = Math.floor((tlx - W * 0.6) / TSP) - 1; i <= Math.ceil((tlx + W * 1.2) / TSP) + 1; i++)
    drawTree(rc, i * TSP - tlx + W / 2, groundY, Math.abs(i * 7919 + 1) % 997 + 1);
  const rlx = cameraX * 0.7; const RSP = 480;
  for (let i = Math.floor((rlx - W * 0.6) / RSP) - 1; i <= Math.ceil((rlx + W * 1.2) / RSP) + 1; i++)
    drawRock(rc, i * RSP - rlx + W / 2, groundY, Math.abs(i * 5381 + 2) % 997 + 1);
  rc.line(-500, groundY, W + 500, groundY, { roughness: 1.8, strokeWidth: 2, stroke: '#3a3a3a', seed: 42 });
}
function drawSkyWorld(rc: RC, ctx: CanvasRenderingContext2D, W: number, H: number, cameraX: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#a8cfe8'); g.addColorStop(0.65, '#d6ebf7'); g.addColorStop(1, '#edf5fa');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const flx = cameraX * 0.1; const FSP = 720;
  for (let i = Math.floor((flx - W * 0.6) / FSP) - 1; i <= Math.ceil((flx + W * 1.2) / FSP) + 1; i++) {
    const s = Math.abs(i * 4001) % 997 + 1; drawCloud(rc, i * FSP - flx + W / 2, H * 0.18 + sv(s) * H * 0.28, 55 + sv(s + 5) * 30, s, 0.45);
  }
  const mlx = cameraX * 0.35; const MSP = 460;
  for (let i = Math.floor((mlx - W * 0.6) / MSP) - 1; i <= Math.ceil((mlx + W * 1.2) / MSP) + 1; i++) {
    const s = Math.abs(i * 6271 + 3) % 997 + 1; drawCloud(rc, i * MSP - mlx + W / 2, H * 0.1 + sv(s) * H * 0.55, 36 + sv(s + 4) * 24, s, 0.85);
  }
  const blx = cameraX * 0.65; const BSP = 620;
  for (let i = Math.floor((blx - W * 0.6) / BSP) - 1; i <= Math.ceil((blx + W * 1.2) / BSP) + 1; i++) {
    const s = Math.abs(i * 9001 + 5) % 997 + 1; const bx = i * BSP - blx + W / 2; const by = H * 0.15 + sv(s) * H * 0.45;
    drawBird(rc, bx, by, s); drawBird(rc, bx + 26 + sv(s + 1) * 14, by - 8 + sv(s + 2) * 18, s + 10); drawBird(rc, bx - 18 + sv(s + 3) * 10, by + 14 + sv(s + 4) * 14, s + 20);
  }
}
function drawSpaceWorld(rc: RC, ctx: CanvasRenderingContext2D, W: number, H: number, cameraX: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d0d1a'); g.addColorStop(1, '#16122a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const slx = cameraX * 0.05; const SSP = 80;
  for (let i = Math.floor((slx - W * 0.6) / SSP) - 1; i <= Math.ceil((slx + W * 1.2) / SSP) + 1; i++) {
    const s = Math.abs(i * 2333) % 997 + 1; drawStar(rc, i * SSP - slx + W / 2, H * sv(s + 2), 1.5 + sv(s) * 2, s);
  }
  const mlx = cameraX * 0.12; const MSP2 = 140;
  for (let i = Math.floor((mlx - W * 0.6) / MSP2) - 1; i <= Math.ceil((mlx + W * 1.2) / MSP2) + 1; i++) {
    const s = Math.abs(i * 6547 + 1) % 997 + 1; drawStar(rc, i * MSP2 - mlx + W / 2, H * sv(s + 3), 2 + sv(s) * 2.5, s);
  }
  const plx = cameraX * 0.3; const PSP = 900;
  for (let i = Math.floor((plx - W * 0.6) / PSP) - 1; i <= Math.ceil((plx + W * 1.2) / PSP) + 1; i++) {
    const s = Math.abs(i * 8191 + 7) % 997 + 1; drawPlanet(rc, i * PSP - plx + W / 2, H * (0.1 + sv(s) * 0.6), 22 + sv(s + 1) * 25, s);
  }
  rc.circle(W * 0.82, H * 0.12, 60, { roughness: 1.5, strokeWidth: 2, stroke: 'rgba(210,205,180,0.6)', fill: 'rgba(230,225,200,0.18)', seed: 99 });
}
function drawOceanWorldBg(rc: RC, ctx: CanvasRenderingContext2D, W: number, H: number, groundY: number, cameraX: number) {
  // Sky half
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, '#b0d4e8'); g.addColorStop(1, '#d4ecf5');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, groundY);
  // Water base colour (no waves yet — goes under the boat)
  ctx.fillStyle = '#6ab8d4'; ctx.fillRect(0, groundY, W, H - groundY);
  // Clouds
  const clx = cameraX * 0.2; const CSP = 560;
  for (let i = Math.floor((clx - W * 0.6) / CSP) - 1; i <= Math.ceil((clx + W * 1.2) / CSP) + 1; i++) {
    const s = Math.abs(i * 3761) % 997 + 1; drawCloud(rc, i * CSP - clx + W / 2, groundY * (0.2 + sv(s) * 0.5), 40 + sv(s + 2) * 25, s, 0.75);
  }
}
function drawOceanWorldFg(rc: RC, ctx: CanvasRenderingContext2D, W: number, groundY: number, cameraX: number, t: number) {
  // Animated wave overlay — drawn ON TOP of the boat so hull looks submerged
  drawWave(rc, ctx, W, groundY, cameraX, t);
  rc.line(-500, groundY, W + 500, groundY, { roughness: 1.5, strokeWidth: 2, stroke: 'rgba(60,130,170,0.6)', seed: 55 });
}
function drawUnderwaterWorld(rc: RC, ctx: CanvasRenderingContext2D, W: number, H: number, cameraX: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a557a'); g.addColorStop(1, '#0d2e45');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const ly = y + 15 * Math.sin((px + cameraX * 0.1) * 0.04);
      px === 0 ? ctx.moveTo(px, ly) : ctx.lineTo(px, ly);
    }
    ctx.strokeStyle = '#80c8f0'; ctx.lineWidth = 8; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const bulx = cameraX * 0.4; const BuSP = 300;
  for (let i = Math.floor((bulx - W * 0.6) / BuSP) - 1; i <= Math.ceil((bulx + W * 1.2) / BuSP) + 1; i++) {
    const s = Math.abs(i * 4703) % 997 + 1; const bx = i * BuSP - bulx + W / 2;
    drawBubble(rc, bx + sv(s + 1) * 40 - 20, H * (0.1 + sv(s) * 0.7), 4 + sv(s + 2) * 6, s);
    drawBubble(rc, bx + sv(s + 3) * 30 - 15, H * (0.2 + sv(s + 1) * 0.5), 3 + sv(s + 4) * 4, s + 10);
  }
  const selx = cameraX * 0.8; const SeSP = 200; const seFloor = H * 0.9;
  for (let i = Math.floor((selx - W * 0.6) / SeSP) - 1; i <= Math.ceil((selx + W * 1.2) / SeSP) + 1; i++) {
    const s = Math.abs(i * 6133) % 997 + 1; drawSeaweed(rc, i * SeSP - selx + W / 2, seFloor, s);
  }
  rc.line(-500, seFloor, W + 500, seFloor, { roughness: 2, strokeWidth: 3, stroke: 'rgba(180,150,100,0.5)', seed: 77 });
}

// ── Component ─────────────────────────────────────────────────────────────────
function ControlsCard({ isFloating }: { isFloating: boolean }) {
  const rows = isFloating
    ? [
        { key: '← →', action: 'MOVE' },
        { key: '↑ ↓',  action: 'ALTITUDE' },
        { key: 'ESC',  action: 'EXIT' },
      ]
    : [
        { key: '← →', action: 'MOVE' },
        { key: '↑ / SPC', action: 'JUMP' },
        { key: 'ESC',  action: 'EXIT' },
      ];

  return (
    <div className="retro-controls-card">
      <div className="retro-controls-title">CONTROLS</div>
      <div className="retro-controls-divider" />
      {rows.map(({ key, action }) => (
        <div className="retro-controls-row" key={action}>
          <span className="retro-key">{key}</span>
          <span className="retro-action">{action}</span>
        </div>
      ))}
    </div>
  );
}

export function InteractiveCanvas({ sketchSvg, preset, exhaustSide, animationFrames, onExit }: InteractiveCanvasProps) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const sketchImageRef   = useRef<{ img: HTMLImageElement; w: number; h: number } | null>(null);
  // Per-frame image cache: populated when animationFrames prop arrives
  const frameImagesRef   = useRef<Array<{ img: HTMLImageElement; w: number; h: number }>>([]);
  const frameIndexRef    = useRef<number>(0);
  const worldType        = getWorldType(preset);
  const cfg              = getPresetConfig(preset);
  const isFloating       = !cfg.hasGround || worldType === 'underwater';

  // SVG → Image (preserves aspect ratio) — single fallback frame
  useEffect(() => {
    const { w: natW, h: natH } = getSvgDimensions(sketchSvg);
    const { w: drawW, h: drawH } = fitToBox(natW, natH);
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(sketchSvg);
    if (!svgStr.includes('xmlns=')) svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => { sketchImageRef.current = { img, w: drawW, h: drawH }; URL.revokeObjectURL(url); };
    img.src = url;
  }, [sketchSvg]);

  // Convert animation frame SVGs → Images when the prop arrives
  useEffect(() => {
    if (!animationFrames || animationFrames.length === 0) return;
    frameImagesRef.current = [];  // reset while loading
    const loaded: Array<{ img: HTMLImageElement; w: number; h: number }> = [];
    let remaining = animationFrames.length;

    animationFrames.forEach((frameSvg, i) => {
      const { w: natW, h: natH } = getSvgDimensions(frameSvg);
      const { w: drawW, h: drawH } = fitToBox(natW, natH);
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(frameSvg);
      if (!svgStr.includes('xmlns=')) svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        loaded[i] = { img, w: drawW, h: drawH };
        URL.revokeObjectURL(url);
        remaining--;
        if (remaining === 0) {
          frameImagesRef.current = loaded;
          frameIndexRef.current  = 0;
        }
      };
      img.src = url;
    });
  }, [animationFrames]);

  // Frame ticker — advances frame index at ~8 fps
  useEffect(() => {
    const interval = setInterval(() => {
      const frames = frameImagesRef.current;
      if (frames.length > 1) {
        frameIndexRef.current = (frameIndexRef.current + 1) % frames.length;
      }
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // Keys
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { keys[e.key] = true; };
    const up = (e: KeyboardEvent) => { keys[e.key] = false; if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', dn); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [onExit]);

  // Physics + loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); window.addEventListener('resize', resize);

    const W = canvas.width; const H = canvas.height; const groundY = H * GROUND_RATIO;
    const { Engine, Bodies, Composite, Runner, Body } = Matter;

    const engine = Engine.create({ gravity: { y: cfg.gravity } });
    const runner = Runner.create();
    const worldBodies: Matter.Body[] = [];
    if (cfg.hasGround) worldBodies.push(Bodies.rectangle(0, groundY + 25, 1_000_000, 50, { isStatic: true }));
    const floatWorlds: WorldType[] = ['sky', 'space', 'underwater'];
    const startY = floatWorlds.includes(worldType) ? H * 0.38 : groundY - 200;
    const box = Bodies.rectangle(0, startY, 160, 110, { restitution: 0.2, friction: 0.4, inertia: Infinity, inverseInertia: 0 });
    Composite.add(engine.world, [...worldBodies, box]);
    Runner.run(runner, engine);

    const rc  = rough.canvas(canvas);
    const ctx = canvas.getContext('2d')!;
    let cameraX = 0; let canJump = false; let t = 0;
    const particles: Particle[] = [];
    const isFloating = !cfg.hasGround || worldType === 'underwater';

    // ── Particle emitter ────────────────────────────────────────────────────
    function emitParticles(sx: number, sy: number, vx: number, vy: number) {
      if (Math.abs(vx) + Math.abs(vy) < 0.5) return;
      const sk = sketchImageRef.current;
      const sw = sk?.w ?? 160; const sh = sk?.h ?? 110;

      // Determine which side to emit from
      // Priority: Gemini-provided exhaustSide → velocity trailing direction
      let side = exhaustSide;
      if (side === 'none') {
        if (worldType === 'ground') {
          side = 'bottom';
        } else {
          // Trail: opposite to dominant velocity direction
          if (Math.abs(vx) >= Math.abs(vy)) side = vx > 0 ? 'left' : 'right';
          else                               side = vy > 0 ? 'top' : 'bottom';
        }
      }

      // Compute screen-space exhaust origin
      let ex = sx; let ey = sy;
      if (side === 'left')   { ex = sx - sw * 0.5; }
      if (side === 'right')  { ex = sx + sw * 0.5; }
      if (side === 'top')    { ey = sy - sh * 0.5; }
      if (side === 'bottom') { ey = sy + sh * 0.5; }

      // Exhaust velocity: away from the body in exhaustSide direction
      const evxBase = side === 'left' ? -1.5 : side === 'right' ? 1.5 : 0;
      const evyBase = side === 'top'  ? -1.5 : side === 'bottom' ? 1.5 : 0;

      if (worldType === 'ground') {
        // Dust from wheel contact points — always at the BOTTOM of the sketch,
        // at the left and right wheel positions (~25% inset from edges)
        const wheelY   = sy + sh * 0.5 + 2;  // just below bottom edge
        const leftWheelX  = sx - sw * 0.25;
        const rightWheelX = sx + sw * 0.25;
        for (const wx of [leftWheelX, rightWheelX]) {
          particles.push({
            x: wx + (Math.random() - 0.5) * 18,
            y: wheelY,
            vx: -vx * 0.3 + (Math.random() - 0.5) * 1.2,
            vy: -0.6 - Math.random() * 1.0,
            life: 25 + Math.random() * 20, maxLife: 45,
            r: 3 + Math.random() * 4, color: '155,135,110',
          });
        }
      }
      if (worldType === 'sky') {
        for (let i = 0; i < 2; i++) {
          particles.push({ x: ex + (Math.random() - 0.5) * 12, y: ey + (Math.random() - 0.5) * 12, vx: evxBase * (1 + Math.random()), vy: (Math.random() - 0.5) * 0.4, life: 20 + Math.random() * 15, maxLife: 35, r: 1.5, color: '140,170,200' });
        }
      }
      if (worldType === 'space') {
        for (let i = 0; i < 3; i++) {
          particles.push({ x: ex + (Math.random() - 0.5) * 14, y: ey + (Math.random() - 0.5) * 14, vx: evxBase * (1 + Math.random() * 1.5) + (Math.random() - 0.5), vy: evyBase * (1 + Math.random() * 1.5) + (Math.random() - 0.5), life: 15 + Math.random() * 20, maxLife: 35, r: 1.5 + Math.random() * 2.5, color: `${200 + Math.floor(Math.random() * 55)},${80 + Math.floor(Math.random() * 80)},30` });
        }
      }
      if (worldType === 'ocean' && Math.abs(vx) > 0.5 && t % 3 === 0) {
        for (let i = 0; i < 3; i++) {
          particles.push({ x: ex + (Math.random() - 0.5) * 20, y: ey, vx: evxBase * (0.5 + Math.random()), vy: -1.5 - Math.random() * 2, life: 20 + Math.random() * 15, maxLife: 35, r: 2 + Math.random() * 3, color: '80,170,210' });
        }
      }
      if (worldType === 'underwater' && t % 4 === 0) {
        particles.push({ x: ex + (Math.random() - 0.5) * sw * 0.3, y: ey + (Math.random() - 0.5) * sh * 0.3, vx: evxBase * (0.3 + Math.random()), vy: -(0.4 + Math.random() * 0.8), life: 40 + Math.random() * 30, maxLife: 70, r: 2 + Math.random() * 4, color: '150,210,235' });
      }
      while (particles.length > 200) particles.shift();
    }

    function updateAndDrawParticles() {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life--;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        const alpha = (p.life / p.maxLife) * 0.7;
        const r     = p.r * (0.5 + 0.5 * (p.life / p.maxLife));
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${alpha})`; ctx.fill();
      }
    }

    let raf: number;

    function draw() {
      t++;
      const { x, y } = box.position; const angle = box.angle;

      // Input
      canJump = cfg.hasGround && !isFloating && Math.abs(y - (groundY - 55)) < 8;
      let vx = box.velocity.x; let vy = box.velocity.y;
      if (keys['ArrowRight'])     vx = Math.min(vx + cfg.accelH, cfg.maxSpeedH);
      else if (keys['ArrowLeft']) vx = Math.max(vx - cfg.accelH, -cfg.maxSpeedH);
      else                        vx *= cfg.airBrake;
      if (isFloating) {
        if (keys['ArrowUp'])        vy = Math.max(vy - 0.6, -6);
        else if (keys['ArrowDown']) vy = Math.min(vy + 0.4, 3);
        else                        vy *= 0.9;
        if (y < 55)     vy = Math.max(vy, 0);
        if (y > H - 55) vy = Math.min(vy, 0);
      } else {
        if ((keys['ArrowUp'] || keys[' ']) && canJump) vy = cfg.jumpVy;
      }
      Body.setVelocity(box, { x: vx, y: vy });

      // Camera
      cameraX = lerp(cameraX, x + Math.sign(vx) * LOOK_AHEAD, LERP);
      const offsetX = W / 2 - cameraX;

      // World background
      if (worldType === 'ground')     drawGroundWorld(rc, ctx, W, H, groundY, cameraX);
      else if (worldType === 'sky')   drawSkyWorld(rc, ctx, W, H, cameraX);
      else if (worldType === 'space') drawSpaceWorld(rc, ctx, W, H, cameraX);
      else if (worldType === 'ocean') drawOceanWorldBg(rc, ctx, W, H, groundY, cameraX);
      else                            drawUnderwaterWorld(rc, ctx, W, H, cameraX);

      // Particles
      emitParticles(x + offsetX, y, vx, vy);

      // Sketch — use animated frame if available, else the static SVG
      const frames = frameImagesRef.current;
      const sketch = frames.length > 0
        ? frames[frameIndexRef.current % frames.length]
        : sketchImageRef.current;
      ctx.save(); ctx.translate(x + offsetX, y); ctx.rotate(angle);
      if (sketch) {
        ctx.drawImage(sketch.img, -sketch.w / 2, -sketch.h / 2, sketch.w, sketch.h);
      } else {
        rc.rectangle(-80, -55, 160, 110, { roughness: 1.5, strokeWidth: 2, stroke: '#1a1a1a', seed: 1 });
      }
      ctx.restore();

      // Ocean water overlay — drawn AFTER the boat so hull looks submerged
      if (worldType === 'ocean') drawOceanWorldFg(rc, ctx, W, groundY, cameraX, t);

      updateAndDrawParticles();

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      Runner.stop(runner); Engine.clear(engine);
      window.removeEventListener('resize', resize);
    };
  }, [preset, worldType, cfg, exhaustSide]);

  return (
    <div className="interactive-canvas-wrapper">
      <canvas ref={canvasRef} className="interactive-canvas" />
      <ControlsCard isFloating={isFloating} />
    </div>
  );
}
