import type { AudioEnergy } from '../audio/AudioEngine';
import type { VisualizerSettings } from '../types/visualizer';
import type { FrameTrigger } from './SceneRenderer';

// ============================================================================
// Fast Multi-Octave 2D Curl-Noise Vector Field (AAA Fluid Silk Ribbons)
// ============================================================================
function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(x: number, y: number): number {
  return (
    valueNoise2D(x, y) * 0.58 +
    valueNoise2D(x * 2.07 + 17.3, y * 2.07 - 9.1) * 0.28 +
    valueNoise2D(x * 4.13 - 5.7, y * 4.13 + 23.4) * 0.14
  );
}

function sampleCurl(x: number, y: number, t: number): [number, number] {
  const eps = 0.075;
  const sx = x * 3.0 + t * 0.26;
  const sy = y * 3.0 - t * 0.38;
  const nY1 = fbm2D(sx, sy + eps);
  const nY2 = fbm2D(sx, sy - eps);
  const nX1 = fbm2D(sx + eps, sy);
  const nX2 = fbm2D(sx - eps, sy);
  const dndy = (nY1 - nY2) / (2 * eps);
  const dndx = (nX1 - nX2) / (2 * eps);
  return [dndy, -dndx];
}

// ============================================================================
// AAA Physics Particle Pool (Typed Struct-of-Arrays, Zero-GC, 24,000+ cap)
// ============================================================================
const MAX_PARTICLES = 24000;
const FLOATS_PER_PARTICLE = 10; // x, y, r, g, b, a, size, kind, vx, vy
const PARTICLE_KIND_FLUID = 0; // Curl-noise thermal buoyancy silk ribbons
const PARTICLE_KIND_SPARK = 1; // Velocity-stretched physics spark streaks with bounce
const PARTICLE_KIND_STARDUST = 2; // 4-point optical diffraction star glints & bokeh
const PARTICLE_KIND_RING = 3; // Expanding neon shockwave ring

interface FBO {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

// ============================================================================
// GLSL ES 3.00 Shaders (Velocity-Stretched Physics Particles + 3-Octave AAA Bloom)
// ============================================================================
const QUAD_VS = `#version 300 es
precision highp float;
const vec2 POS[4] = vec2[](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const SCENE_COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 c = texture(uScene, vec2(vUv.x, 1.0 - vUv.y));
  fragColor = c;
}
`;

const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;     // normalized 0..1 (x right, y up from bottom)
layout(location = 1) in vec4 aColor;   // rgb + alpha
layout(location = 2) in vec2 aMeta;    // x = sizePx, y = kind
layout(location = 3) in vec2 aVel;     // velocity vector for trajectory streak stretching

uniform float uDpr;
uniform float uAspect;
out vec4 vColor;
out float vKind;
out vec2 vDir;
out float vSpeed;

void main() {
  vec2 clip = aPos * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);

  // Compute screen-space velocity direction (note gl_PointCoord y goes top->bottom, so negate vy)
  vec2 screenVel = vec2(aVel.x * uAspect, -aVel.y);
  float spd = length(screenVel);
  vDir = spd > 0.001 ? screenVel / spd : vec2(0.0, -1.0);
  vSpeed = spd;

  // Give fast sparks larger point quad so velocity-stretched comet streaks render cleanly
  float stretchBoost = (aMeta.y > 0.5 && aMeta.y < 1.5) ? (1.0 + clamp(spd * 4.2, 0.0, 2.8)) : 1.0;
  gl_PointSize = clamp(aMeta.x * stretchBoost * uDpr, 1.5, 180.0);

  vColor = aColor;
  vKind = aMeta.y;
}
`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vKind;
in vec2 vDir;
in float vSpeed;
out vec4 fragColor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);

  float alpha = 0.0;
  vec3 col = vColor.rgb;

  if (vKind < 0.5) {
    // Fluid Curl-Noise Silk Wisp: lush bright pinpoint + velvety luminous nebula aura
    float core = exp(-r2 * 6.5);
    float halo = pow(1.0 - r, 2.1) * 0.52;
    alpha = (core + halo) * vColor.a;
    col = mix(col, vec3(1.0), core * 0.36);
  } else if (vKind < 1.5) {
    // AAA Velocity-Aligned Stretched Spark Comet Streak!
    vec2 perp = vec2(-vDir.y, vDir.x);
    float along = dot(p, vDir);
    float across = dot(p, perp);
    float stretch = 1.0 + clamp(vSpeed * 5.0, 0.2, 3.6);
    // Offset head slightly forward along flight direction, taper tail gracefully behind
    float head = exp(-((along - 0.18) * (along - 0.18) * 14.0 + across * across * (16.0 * stretch)));
    float tail = exp(-(along * along * 2.2 + across * across * (28.0 + stretch * 8.0))) * smoothstep(-1.0, 0.35, along);
    alpha = (head * 1.15 + tail * 0.85) * vColor.a;
    col = mix(col, vec3(1.0), clamp(head * 0.9, 0.0, 1.0));
  } else if (vKind < 2.5) {
    // 4-Point Optical Diffraction Star Glint + Soft Bokeh Orb
    float bokeh = smoothstep(1.0, 0.15, r);
    float crossH = exp(-abs(p.y) * 12.0) * smoothstep(1.0, 0.0, abs(p.x));
    float crossV = exp(-abs(p.x) * 12.0) * smoothstep(1.0, 0.0, abs(p.y));
    float star = (crossH + crossV) * 0.42;
    alpha = (bokeh * bokeh * 0.72 + star) * vColor.a;
    col = mix(col, vec3(1.0), clamp(star * 0.75, 0.0, 1.0));
  } else {
    // Crisp Expanding Neon Shockwave Ring
    float ring = exp(-pow((r - 0.8) * 12.0, 2.0));
    float inner = exp(-pow((r - 0.68) * 6.5, 2.0)) * 0.32;
    alpha = (ring + inner) * vColor.a;
    col = mix(col, vec3(1.0), ring * 0.48);
  }

  fragColor = vec4(col * alpha, alpha);
}
`;

const BRIGHT_EXTRACT_FS = `#version 300 es
precision highp float;
uniform sampler2D uInput;
uniform float uThreshold;
uniform float uPianoHeightNorm;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uInput, vUv).rgb;
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float sat = (maxC - minC) / max(maxC, 0.001);

  // Emphasize saturated neon tubes, sparks & particles so bloom glows with rich pure color!
  float energy = mix(luma, maxC, 0.72) * (0.7 + sat * 0.45);
  float knee = 0.16;
  float soft = clamp((energy - uThreshold + knee) / (2.0 * knee), 0.0, 1.0);
  soft = soft * soft * (3.0 - 2.0 * soft);
  float contrib = max(soft * 0.78, step(uThreshold, energy));

  // Keep unpressed white keys & realistic hands crisp, while letting lit colored keys & strike edge bloom!
  float inPiano = smoothstep(uPianoHeightNorm + 0.005, uPianoHeightNorm - 0.014, vUv.y);
  float coloredKeyAllow = smoothstep(0.28, 0.54, sat);
  float mask = mix(1.0, coloredKeyAllow, inPiano);

  // Boost chroma slightly in bloom buffer so neon glow stays lush and vibrant
  vec3 richCol = mix(vec3(luma), c, 1.24);
  vec3 bloom = min(vec3(1.4), max(vec3(0.0), richCol) * contrib * max(0.0, energy - uThreshold * 0.55) * 1.38) * mask;
  fragColor = vec4(bloom, 1.0);
}
`;

const KAWASE_DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uHalfPixel;
uniform float uSpread;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 hp = uHalfPixel * uSpread;
  vec3 sum = texture(uTex, vUv).rgb * 4.0;
  sum += texture(uTex, vUv - hp).rgb;
  sum += texture(uTex, vUv + hp).rgb;
  sum += texture(uTex, vUv + vec2(hp.x, -hp.y)).rgb;
  sum += texture(uTex, vUv - vec2(hp.x, -hp.y)).rgb;
  fragColor = vec4(sum / 8.0, 1.0);
}
`;

const KAWASE_UP_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uHalfPixel;
uniform float uSpread;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 hp = uHalfPixel * uSpread;
  vec3 sum = vec3(0.0);
  sum += texture(uTex, vUv + vec2(-hp.x * 2.0, 0.0)).rgb;
  sum += texture(uTex, vUv + vec2(-hp.x, hp.y)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(0.0, hp.y * 2.0)).rgb;
  sum += texture(uTex, vUv + vec2(hp.x, hp.y)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(hp.x * 2.0, 0.0)).rgb;
  sum += texture(uTex, vUv + vec2(hp.x, -hp.y)).rgb * 2.0;
  sum += texture(uTex, vUv + vec2(0.0, -hp.y * 2.0)).rgb;
  sum += texture(uTex, vUv + vec2(-hp.x, -hp.y)).rgb * 2.0;
  fragColor = vec4(sum / 12.0, 1.0);
}
`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uBase;
uniform sampler2D uBloom0; // Tight crisp core glow
uniform sampler2D uBloom1; // Mid satin neon aura
uniform sampler2D uBloom2; // Wide atmospheric concert halo
uniform vec2 uTexelSize;
uniform float uBloomIntensity;
uniform float uSharpness;
uniform float uChromatic;
uniform float uAudioEnergy;
in vec2 vUv;
out vec4 fragColor;

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 center = texture(uBase, vUv).rgb;

  // Razor-sharp base detail clarity so note gaps, borders & labels stay tack-sharp
  vec3 base = center;
  if (uSharpness > 0.01) {
    vec3 n = texture(uBase, vUv + vec2(0.0, uTexelSize.y)).rgb;
    vec3 s = texture(uBase, vUv - vec2(0.0, uTexelSize.y)).rgb;
    vec3 e = texture(uBase, vUv + vec2(uTexelSize.x, 0.0)).rgb;
    vec3 w = texture(uBase, vUv - vec2(uTexelSize.x, 0.0)).rgb;
    vec3 blur = (n + s + e + w) * 0.25;
    vec3 detail = clamp(center - blur, vec3(-0.22), vec3(0.22));
    base = clamp(center + detail * (uSharpness * 1.1), 0.0, 1.45);
  }

  // Subtle radial chromatic aberration strictly on bloom layers (preserves razor-sharp base!)
  vec2 dir = (vUv - 0.5) * uChromatic * 0.0075 * (1.0 + uAudioEnergy * 0.28);

  vec3 b0;
  b0.r = texture(uBloom0, vUv + dir * 0.7).r;
  b0.g = texture(uBloom0, vUv).g;
  b0.b = texture(uBloom0, vUv - dir * 0.7).b;

  vec3 b1;
  b1.r = texture(uBloom1, vUv + dir * 1.15).r;
  b1.g = texture(uBloom1, vUv).g;
  b1.b = texture(uBloom1, vUv - dir * 1.15).b;

  vec3 b2;
  b2.r = texture(uBloom2, vUv + dir * 1.65).r;
  b2.g = texture(uBloom2, vUv).g;
  b2.b = texture(uBloom2, vUv - dir * 1.65).b;

  // 3-Octave Optical Inverse-Square Glow Stack (luscious AAA neon radiance, zero milky haze!)
  vec3 rawBloom = b0 * 0.76 + b1 * 0.58 + b2 * 0.36;
  float bLuma = dot(rawBloom, vec3(0.2126, 0.7152, 0.0722));
  vec3 satBloom = max(vec3(0.0), mix(vec3(bLuma), rawBloom, 1.28));
  vec3 bloom = satBloom * uBloomIntensity * (1.0 + uAudioEnergy * 0.14);

  // Preserve dark gaps between notes while letting vibrant neon bloom radiate around them
  vec3 hdr = base + bloom * (1.0 - min(vec3(0.32), base * 0.25));
  vec3 mapped = mix(hdr, acesFilm(hdr * 1.06), smoothstep(0.78, 2.4, max(hdr.r, max(hdr.g, hdr.b))));
  fragColor = vec4(clamp(mapped, 0.0, 1.0), 1.0);
}
`;

export class WebGLCompositor {
  public readonly canvas: HTMLCanvasElement;
  public readonly isWebGL2: boolean;

  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;

  private copyProg: WebGLProgram | null = null;
  private particleProg: WebGLProgram | null = null;
  private brightProg: WebGLProgram | null = null;
  private downProg: WebGLProgram | null = null;
  private upProg: WebGLProgram | null = null;
  private compProg: WebGLProgram | null = null;

  private emptyVao: WebGLVertexArrayObject | null = null;
  private particleVao: WebGLVertexArrayObject | null = null;
  private particleVbo: WebGLBuffer | null = null;
  private sceneTex: WebGLTexture | null = null;

  private baseFbo: FBO | null = null;
  private bloomFbos: FBO[] = [];

  // AAA Physics Particle Simulation Arrays
  private readonly pCountCap = MAX_PARTICLES;
  private pActive = 0;
  private readonly pX = new Float32Array(MAX_PARTICLES);
  private readonly pY = new Float32Array(MAX_PARTICLES);
  private readonly pVx = new Float32Array(MAX_PARTICLES);
  private readonly pVy = new Float32Array(MAX_PARTICLES);
  private readonly pR = new Float32Array(MAX_PARTICLES);
  private readonly pG = new Float32Array(MAX_PARTICLES);
  private readonly pB = new Float32Array(MAX_PARTICLES);
  private readonly pLife = new Float32Array(MAX_PARTICLES);
  private readonly pMaxLife = new Float32Array(MAX_PARTICLES);
  private readonly pSize = new Float32Array(MAX_PARTICLES);
  private readonly pKind = new Float32Array(MAX_PARTICLES);
  private readonly pSeed = new Float32Array(MAX_PARTICLES);
  private readonly pBounces = new Uint8Array(MAX_PARTICLES);

  private readonly gpuBuffer = new Float32Array(MAX_PARTICLES * FLOATS_PER_PARTICLE);
  private dustTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (gl) {
      this.gl = gl;
      this.isWebGL2 = true;
      this.initWebGL(gl);
    } else {
      this.isWebGL2 = false;
      this.ctx2d = canvas.getContext('2d', { alpha: false });
    }
  }

  public clearParticles(): void {
    this.pActive = 0;
  }

  public resize(width: number, height: number): void {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    if (this.canvas.width === w && this.canvas.height === h && this.baseFbo) return;

    this.canvas.width = w;
    this.canvas.height = h;

    if (this.gl) {
      this.rebuildFbos(this.gl, w, h);
    }
  }

  public renderFrame(
    sceneCanvas: HTMLCanvasElement,
    hitLineY: number,
    triggers: FrameTrigger[],
    clockSec: number,
    dt: number,
    dpr: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy
  ): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const hitYNorm = 1 - hitLineY / Math.max(1, height);
    const aspect = width / Math.max(1, height);

    if (settings.particlesEnabled) {
      this.spawnFromTriggers(triggers, hitYNorm, dt, settings);
      this.spawnAmbientStardust(dt, settings, audioEnergy, hitYNorm);
      this.stepParticles(dt, clockSec, hitYNorm, settings, audioEnergy, aspect);
    } else {
      this.pActive = 0;
    }

    if (this.gl && this.baseFbo && this.bloomFbos.length >= 4) {
      this.renderWebGL(sceneCanvas, dpr, aspect, settings, audioEnergy);
    } else if (this.ctx2d) {
      this.renderFallback2D(sceneCanvas, settings);
    }
  }

  private emitParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    r: number,
    g: number,
    b: number,
    maxLife: number,
    size: number,
    kind: number
  ): void {
    let idx: number;
    if (this.pActive < this.pCountCap) {
      idx = this.pActive++;
    } else {
      idx = Math.floor(Math.random() * this.pCountCap);
    }

    this.pX[idx] = x;
    this.pY[idx] = y;
    this.pVx[idx] = vx;
    this.pVy[idx] = vy;
    this.pR[idx] = r;
    this.pG[idx] = g;
    this.pB[idx] = b;
    this.pLife[idx] = 0;
    this.pMaxLife[idx] = maxLife;
    this.pSize[idx] = size;
    this.pKind[idx] = kind;
    this.pSeed[idx] = Math.random() * 100;
    this.pBounces[idx] = 0;
  }

  private spawnFromTriggers(
    triggers: FrameTrigger[],
    hitYNorm: number,
    dt: number,
    settings: VisualizerSettings
  ): void {
    const density = settings.particleDensity;
    const sizeScale = settings.particleSize;
    const speedScale = settings.particleSpeed;

    for (let i = 0; i < triggers.length; i++) {
      const tr = triggers[i];
      const r = tr.color.r / 255;
      const g = tr.color.g / 255;
      const b = tr.color.b / 255;

      // A. Curl-Noise Thermal Buoyancy Silk Ribbons
      if (settings.fluidSilkEnabled) {
        const count = tr.isAttack
          ? Math.round((15 + tr.velocity * 22) * density)
          : Math.max(1, Math.round((4 + tr.velocity * 6) * density * Math.min(2, dt * 60)));

        for (let k = 0; k < count; k++) {
          const jitterX = (Math.random() - 0.5) * 0.011;
          const jitterY = Math.random() * 0.008;
          const vx = (Math.random() - 0.5) * 0.055 * speedScale;
          const vy = (0.1 + Math.random() * 0.17 + tr.velocity * 0.09) * speedScale;
          const life = (1.35 + Math.random() * 1.95) / Math.max(0.5, speedScale * 0.85);
          const sz = (3.0 + Math.random() * 5.8) * sizeScale;
          const v = (Math.random() - 0.5) * 0.18;
          this.emitParticle(
            tr.xNorm + jitterX,
            hitYNorm + jitterY,
            vx,
            vy,
            Math.min(1, Math.max(0, r + v)),
            Math.min(1, Math.max(0, g + v * 0.6)),
            Math.min(1, Math.max(0, b - v * 0.45)),
            life,
            sz,
            PARTICLE_KIND_FLUID
          );
        }
      }

      // B. AAA Physics Velocity-Stretched Sparks (arcing + bouncing off keyboard edge!)
      if (settings.sparksEnabled && tr.isAttack) {
        const sparkCount = Math.round((12 + tr.velocity * 20) * density);
        for (let k = 0; k < sparkCount; k++) {
          // Fan outward symmetrically in an energetic fountain
          const angle = Math.PI * 0.16 + Math.random() * Math.PI * 0.68;
          const spd = (0.2 + Math.random() * 0.48) * (0.65 + tr.velocity * 0.72) * speedScale;
          const vx = Math.cos(angle) * spd * 0.52;
          const vy = Math.sin(angle) * spd;
          const life = 0.55 + Math.random() * 0.85;
          const sz = (3.4 + Math.random() * 4.8) * sizeScale;
          this.emitParticle(
            tr.xNorm + (Math.random() - 0.5) * 0.006,
            hitYNorm + 0.005,
            vx,
            vy,
            Math.min(1, r * 0.72 + 0.28),
            Math.min(1, g * 0.72 + 0.28),
            Math.min(1, b * 0.72 + 0.28),
            life,
            sz,
            PARTICLE_KIND_SPARK
          );
        }
      }

      // C. Optical Star-Cross Glints on crisp attacks
      if (settings.stardustEnabled && tr.isAttack && tr.velocity > 0.42) {
        const glintCount = Math.max(1, Math.round(2.5 * density));
        for (let k = 0; k < glintCount; k++) {
          this.emitParticle(
            tr.xNorm + (Math.random() - 0.5) * 0.014,
            hitYNorm + 0.008 + Math.random() * 0.025,
            (Math.random() - 0.5) * 0.04,
            (0.06 + Math.random() * 0.1) * speedScale,
            Math.min(1, r * 0.5 + 0.5),
            Math.min(1, g * 0.5 + 0.5),
            Math.min(1, b * 0.5 + 0.5),
            0.55 + Math.random() * 0.5,
            (7.5 + Math.random() * 7.5) * sizeScale,
            PARTICLE_KIND_STARDUST
          );
        }
      }

      // D. Velocity Shockwave Ring on strong accents
      if (settings.shockwavesEnabled && tr.isAttack && tr.velocity > 0.52) {
        this.emitParticle(
          tr.xNorm,
          hitYNorm + 0.004,
          0,
          0.022 * speedScale,
          r,
          g,
          b,
          0.46 + tr.velocity * 0.24,
          (20 + tr.velocity * 30) * sizeScale,
          PARTICLE_KIND_RING
        );
      }
    }
  }

  private spawnAmbientStardust(
    dt: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy,
    hitYNorm: number
  ): void {
    if (!settings.stardustEnabled) return;
    this.dustTimer += dt * (16 + audioEnergy.overall * 50) * settings.particleDensity;
    const toSpawn = Math.floor(this.dustTimer);
    if (toSpawn <= 0) return;
    this.dustTimer -= toSpawn;

    for (let i = 0; i < Math.min(toSpawn, 8); i++) {
      const x = Math.random();
      const y = hitYNorm + Math.random() * (1 - hitYNorm);
      const vx = (Math.random() - 0.5) * 0.015;
      const vy = (0.016 + Math.random() * 0.032) * settings.particleSpeed;
      const tint = Math.random();
      const r = tint < 0.33 ? 0.55 : tint < 0.66 ? 0.92 : 0.98;
      const g = tint < 0.33 ? 0.85 : tint < 0.66 ? 0.68 : 0.84;
      const b = tint < 0.33 ? 1.0 : tint < 0.66 ? 1.0 : 0.58;
      this.emitParticle(
        x,
        y,
        vx,
        vy,
        r,
        g,
        b,
        2.6 + Math.random() * 2.4,
        (2.4 + Math.random() * 4.2) * settings.particleSize,
        PARTICLE_KIND_STARDUST
      );
    }
  }

  private stepParticles(
    dt: number,
    clockSec: number,
    hitYNorm: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy,
    aspect: number
  ): void {
    const turb = settings.particleTurbulence;
    const speed = settings.particleSpeed;
    const audioBoost = 1 + audioEnergy.overall * 0.58;

    let writeIdx = 0;
    const count = this.pActive;

    for (let i = 0; i < count; i++) {
      const life = this.pLife[i] + dt;
      const maxLife = this.pMaxLife[i];
      if (life >= maxLife) continue;

      const kind = this.pKind[i];
      let x = this.pX[i];
      let y = this.pY[i];
      let vx = this.pVx[i];
      let vy = this.pVy[i];
      let sz = this.pSize[i];
      let bounces = this.pBounces[i];

      if (kind === PARTICLE_KIND_FLUID) {
        // Multi-octave Curl-Noise vorticity + thermal buoyancy updraft
        const [cx, cy] = sampleCurl(x * aspect * 0.72, y * 1.15, clockSec * 0.78);
        const curlStrength = 0.25 * turb * speed * audioBoost;
        const buoyancy = (0.145 + (1 - life / maxLife) * 0.06) * speed;
        vx += (cx * curlStrength - vx * 1.55) * dt;
        vy += ((buoyancy + cy * curlStrength * 0.72) - vy * 0.92) * dt;
        x += vx * dt;
        y += vy * dt;
      } else if (kind === PARTICLE_KIND_SPARK) {
        // Real ballistic physics: gravity + quadratic air drag + elastic keyboard-edge bounce!
        const spd2 = vx * vx + vy * vy;
        const drag = Math.exp(-dt * (1.55 + Math.min(2.5, spd2 * 3.5)));
        vx *= drag;
        vy = vy * drag - 0.88 * dt;
        x += vx * dt;
        y += vy * dt;

        // Elastic bounce right off the piano strike bar!
        if (y <= hitYNorm && vy < 0 && bounces < 2) {
          y = hitYNorm + 0.002;
          const restitution = 0.44 + (this.pSeed[i] % 1) * 0.2;
          vy = Math.abs(vy) * restitution;
          vx = vx * 0.78 + (Math.sin(this.pSeed[i] * 19.3 + bounces) * 0.06);
          bounces++;
        }
      } else if (kind === PARTICLE_KIND_STARDUST) {
        const sway = Math.sin(clockSec * 1.8 + this.pSeed[i]) * 0.015;
        x += (vx + sway) * dt;
        y += vy * dt;
      } else {
        // Expanding neon shockwave ring
        sz += dt * 165 * settings.particleSize;
        y += vy * dt;
      }

      if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.15) continue;

      this.pX[writeIdx] = x;
      this.pY[writeIdx] = y;
      this.pVx[writeIdx] = vx;
      this.pVy[writeIdx] = vy;
      this.pR[writeIdx] = this.pR[i];
      this.pG[writeIdx] = this.pG[i];
      this.pB[writeIdx] = this.pB[i];
      this.pLife[writeIdx] = life;
      this.pMaxLife[writeIdx] = maxLife;
      this.pSize[writeIdx] = sz;
      this.pKind[writeIdx] = kind;
      this.pSeed[writeIdx] = this.pSeed[i];
      this.pBounces[writeIdx] = bounces;

      const t = life / maxLife;
      let alpha: number;
      if (kind === PARTICLE_KIND_FLUID) {
        alpha = Math.min(1, t * 7.5) * Math.pow(1 - t, 1.48) * 0.56;
      } else if (kind === PARTICLE_KIND_SPARK) {
        const twinkle = 0.76 + 0.24 * Math.sin(clockSec * 42 + this.pSeed[i]);
        alpha = Math.pow(1 - t, 1.15) * 0.98 * twinkle;
      } else if (kind === PARTICLE_KIND_STARDUST) {
        const sparkle = 0.65 + 0.35 * Math.sin(clockSec * 9.0 + this.pSeed[i]);
        alpha = Math.sin(t * Math.PI) * (0.36 + audioEnergy.overall * 0.4) * sparkle;
      } else {
        alpha = Math.pow(1 - t, 1.75) * 0.72;
      }

      const off = writeIdx * FLOATS_PER_PARTICLE;
      this.gpuBuffer[off] = x;
      this.gpuBuffer[off + 1] = y;
      this.gpuBuffer[off + 2] = this.pR[writeIdx];
      this.gpuBuffer[off + 3] = this.pG[writeIdx];
      this.gpuBuffer[off + 4] = this.pB[writeIdx];
      this.gpuBuffer[off + 5] = alpha;
      this.gpuBuffer[off + 6] = kind === PARTICLE_KIND_FLUID ? sz * (0.68 + (1 - t) * 0.72) : sz;
      this.gpuBuffer[off + 7] = kind;
      this.gpuBuffer[off + 8] = vx;
      this.gpuBuffer[off + 9] = vy;

      writeIdx++;
    }

    this.pActive = writeIdx;
  }

  private renderWebGL(
    sceneCanvas: HTMLCanvasElement,
    dpr: number,
    aspect: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy
  ): void {
    const gl = this.gl!;
    const baseFbo = this.baseFbo!;
    const [b0, b1, b2, b3] = this.bloomFbos;

    // 1. Upload crisp 2D scene canvas to GPU texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);

    // 2. Copy Scene into baseFbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseFbo.fb);
    gl.viewport(0, 0, baseFbo.width, baseFbo.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.copyProg);
    gl.uniform1i(gl.getUniformLocation(this.copyProg!, 'uScene'), 0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3. Render Additive AAA Physics Particles into baseFbo
    if (this.pActive > 0 && this.particleProg) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(this.particleProg);
      gl.uniform1f(gl.getUniformLocation(this.particleProg, 'uDpr'), dpr);
      gl.uniform1f(gl.getUniformLocation(this.particleProg, 'uAspect'), aspect);
      gl.bindVertexArray(this.particleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.gpuBuffer.subarray(0, this.pActive * FLOATS_PER_PARTICLE));
      gl.drawArrays(gl.POINTS, 0, this.pActive);
      gl.disable(gl.BLEND);
    }

    // 4. 3-Octave Multi-Pass Dual-Kawase AAA Optical HDR Bloom
    const spread = settings.bloomRadius;
    if (settings.bloomIntensity > 0.01) {
      // 4a. Extract bright saturated neon highlights into b0 (1/2 res)
      gl.bindFramebuffer(gl.FRAMEBUFFER, b0.fb);
      gl.viewport(0, 0, b0.width, b0.height);
      gl.useProgram(this.brightProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseFbo.tex);
      gl.uniform1i(gl.getUniformLocation(this.brightProg!, 'uInput'), 0);
      gl.uniform1f(gl.getUniformLocation(this.brightProg!, 'uThreshold'), settings.bloomThreshold);
      gl.uniform1f(gl.getUniformLocation(this.brightProg!, 'uPianoHeightNorm'), settings.pianoHeightRatio);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 4b. Downsample chain: b0 -> b1 -> b2 -> b3
      const chain = [b0, b1, b2, b3];
      gl.useProgram(this.downProg);
      for (let i = 0; i < chain.length - 1; i++) {
        const src = chain[i];
        const dst = chain[i + 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.width, dst.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(gl.getUniformLocation(this.downProg!, 'uTex'), 0);
        gl.uniform2f(gl.getUniformLocation(this.downProg!, 'uHalfPixel'), 0.5 / src.width, 0.5 / src.height);
        gl.uniform1f(gl.getUniformLocation(this.downProg!, 'uSpread'), spread);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // 4c. Upsample wide halo cleanly: b3 -> b2 (b2 = wide halo, b1 = mid satin aura, b0 = tight core glow!)
      gl.useProgram(this.upProg);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b2.fb);
      gl.viewport(0, 0, b2.width, b2.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, b3.tex);
      gl.uniform1i(gl.getUniformLocation(this.upProg!, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(this.upProg!, 'uHalfPixel'), 0.5 / b3.width, 0.5 / b3.height);
      gl.uniform1f(gl.getUniformLocation(this.upProg!, 'uSpread'), spread * 1.2);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.BLEND);
    }

    // 5. Final 3-Octave Composite + Clarity + Chromatic Prism -> Screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.compProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseFbo.tex);
    gl.uniform1i(gl.getUniformLocation(this.compProg!, 'uBase'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b0.tex);
    gl.uniform1i(gl.getUniformLocation(this.compProg!, 'uBloom0'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, b1.tex);
    gl.uniform1i(gl.getUniformLocation(this.compProg!, 'uBloom1'), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, b2.tex);
    gl.uniform1i(gl.getUniformLocation(this.compProg!, 'uBloom2'), 3);

    gl.uniform2f(
      gl.getUniformLocation(this.compProg!, 'uTexelSize'),
      1.0 / Math.max(1, this.canvas.width),
      1.0 / Math.max(1, this.canvas.height)
    );
    gl.uniform1f(gl.getUniformLocation(this.compProg!, 'uBloomIntensity'), settings.bloomIntensity);
    gl.uniform1f(gl.getUniformLocation(this.compProg!, 'uSharpness'), settings.sharpness);
    gl.uniform1f(gl.getUniformLocation(this.compProg!, 'uChromatic'), settings.chromaticAberration);
    gl.uniform1f(gl.getUniformLocation(this.compProg!, 'uAudioEnergy'), audioEnergy.overall);

    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private renderFallback2D(sceneCanvas: HTMLCanvasElement, settings: VisualizerSettings): void {
    const ctx = this.ctx2d!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.drawImage(sceneCanvas, 0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.pActive; i++) {
      const off = i * FLOATS_PER_PARTICLE;
      const x = this.gpuBuffer[off] * w;
      const y = (1 - this.gpuBuffer[off + 1]) * h;
      const r = Math.round(this.gpuBuffer[off + 2] * 255);
      const g = Math.round(this.gpuBuffer[off + 3] * 255);
      const b = Math.round(this.gpuBuffer[off + 4] * 255);
      const a = this.gpuBuffer[off + 5];
      const sz = this.gpuBuffer[off + 6] * 0.5;
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, sz), 0, Math.PI * 2);
      ctx.fill();
    }

    if (settings.bloomIntensity > 0.1) {
      ctx.globalAlpha = Math.min(0.8, settings.bloomIntensity * 0.35);
      ctx.filter = `blur(${Math.round(8 * settings.bloomRadius)}px)`;
      ctx.drawImage(this.canvas, 0, 0, w, h);
    }
    ctx.restore();
  }

  private initWebGL(gl: WebGL2RenderingContext): void {
    this.copyProg = this.createProgram(gl, QUAD_VS, SCENE_COPY_FS);
    this.particleProg = this.createProgram(gl, PARTICLE_VS, PARTICLE_FS);
    this.brightProg = this.createProgram(gl, QUAD_VS, BRIGHT_EXTRACT_FS);
    this.downProg = this.createProgram(gl, QUAD_VS, KAWASE_DOWN_FS);
    this.upProg = this.createProgram(gl, QUAD_VS, KAWASE_UP_FS);
    this.compProg = this.createProgram(gl, QUAD_VS, COMPOSITE_FS);

    this.emptyVao = gl.createVertexArray();

    // Particle VAO + VBO (10 floats stride)
    this.particleVao = gl.createVertexArray();
    this.particleVbo = gl.createBuffer();
    gl.bindVertexArray(this.particleVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.gpuBuffer.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_PARTICLE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * 4);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 8 * 4);
    gl.bindVertexArray(null);

    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  private rebuildFbos(gl: WebGL2RenderingContext, width: number, height: number): void {
    this.destroyFbos(gl);
    const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    const internalFormat = hasFloat ? gl.RGBA16F : gl.RGBA8;
    const type = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    this.baseFbo = this.createFbo(gl, width, height, internalFormat, type);
    const divisors = [2, 4, 8, 16];
    this.bloomFbos = divisors.map((d) =>
      this.createFbo(gl, Math.max(2, Math.floor(width / d)), Math.max(2, Math.floor(height / d)), internalFormat, type)
    );
  }

  private createFbo(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    internalFormat: number,
    type: number
  ): FBO {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fb, tex, width, height };
  }

  private destroyFbos(gl: WebGL2RenderingContext): void {
    const all = [...(this.baseFbo ? [this.baseFbo] : []), ...this.bloomFbos];
    for (const f of all) {
      gl.deleteFramebuffer(f.fb);
      gl.deleteTexture(f.tex);
    }
    this.baseFbo = null;
    this.bloomFbos = [];
  }

  private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile error: ${log}`);
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${log}`);
    }
    return prog;
  }

  public dispose(): void {
    if (!this.gl) return;
    const gl = this.gl;
    this.destroyFbos(gl);
    [this.copyProg, this.particleProg, this.brightProg, this.downProg, this.upProg, this.compProg].forEach(
      (p) => p && gl.deleteProgram(p)
    );
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.particleVbo) gl.deleteBuffer(this.particleVbo);
    if (this.particleVao) gl.deleteVertexArray(this.particleVao);
    if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
  }
}
