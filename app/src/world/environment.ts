import { z } from 'zod';
import { reducedMotion } from '../ui/art';

/**
 * Part 7 — Environmental Events & Atmosphere
 *
 * Implements a synchronized Day/Night cycle (`morning`, `afternoon`, `sunset`,
 * `evening`, `night`) and Weather system (`clear`, `cloudy`, `light_rain`,
 * `heavy_rain`, `fog`, `autumn_leaves`) with local particle rendering,
 * warm window/lamp lighting, WebAudio ambient synthesis, and accessibility controls.
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'sunset' | 'evening' | 'night';
export type WeatherKind = 'clear' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'fog' | 'autumn_leaves';
export type ParticleQuality = 'off' | 'low' | 'medium' | 'high';

export interface EnvironmentState {
  timeOfDay: TimeOfDay;
  cycleMode: 'manual' | 'auto';
  /** Progress 0..1 within the full day cycle when auto mode is enabled */
  cycleProgress: number;
  /** Full day duration in seconds (default 300s = 5 minutes) */
  cycleDurationSeconds: number;
  weather: WeatherKind;
  weatherAutoChange: boolean;
  ambientAudioEnabled: boolean;
  ambientVolume: number;
  ambientSound: 'weather' | 'rain' | 'wind' | 'brown_noise';
  particleQuality: ParticleQuality;
  revision: number;
}

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: '🌅 Mañana clara',
  afternoon: '☀️ Tarde soleada',
  sunset: '🌇 Atardecer dorado',
  evening: '🌆 Crepúsculo',
  night: '🌙 Noche estrellada',
};

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: '☀️ Despejado',
  cloudy: '☁️ Nublado suave',
  light_rain: '🌦️ Lluvia ligera',
  heavy_rain: '🌧️ Lluvia intensa',
  fog: '🌫️ Niebla de bosque',
  autumn_leaves: '🍂 Brisa de hojas',
};

export const environmentStateSchema = z.object({
  timeOfDay: z.enum(['morning', 'afternoon', 'sunset', 'evening', 'night']),
  cycleMode: z.enum(['manual', 'auto']),
  cycleProgress: z.number().min(0).max(1),
  cycleDurationSeconds: z.number().min(30).max(3600),
  weather: z.enum(['clear', 'cloudy', 'light_rain', 'heavy_rain', 'fog', 'autumn_leaves']),
  weatherAutoChange: z.boolean(),
  ambientAudioEnabled: z.boolean(),
  ambientVolume: z.number().min(0).max(1),
  ambientSound: z.enum(['weather', 'rain', 'wind', 'brown_noise']).default('weather'),
  particleQuality: z.enum(['off', 'low', 'medium', 'high']),
  revision: z.number().int().nonnegative(),
});

export interface LightingProfile {
  overlayColor: string;
  overlayAlpha: number;
  lampIntensity: number;
  windowWarmth: number;
  starAlpha: number;
  shadowStrength: number;
}

export function getLightingProfile(timeOfDay: TimeOfDay, weather: WeatherKind): LightingProfile {
  const base: Record<TimeOfDay, LightingProfile> = {
    morning: {
      overlayColor: '255, 232, 188',
      overlayAlpha: 0.06,
      lampIntensity: 0.15,
      windowWarmth: 0.45,
      starAlpha: 0,
      shadowStrength: 0.28,
    },
    afternoon: {
      overlayColor: '255, 248, 225',
      overlayAlpha: 0.0,
      lampIntensity: 0.1,
      windowWarmth: 0.35,
      starAlpha: 0,
      shadowStrength: 0.34,
    },
    sunset: {
      overlayColor: '235, 118, 68',
      overlayAlpha: 0.18,
      lampIntensity: 0.72,
      windowWarmth: 0.85,
      starAlpha: 0.2,
      shadowStrength: 0.3,
    },
    evening: {
      overlayColor: '38, 52, 88',
      overlayAlpha: 0.32,
      lampIntensity: 0.92,
      windowWarmth: 0.95,
      starAlpha: 0.65,
      shadowStrength: 0.24,
    },
    night: {
      overlayColor: '14, 24, 46',
      overlayAlpha: 0.46,
      lampIntensity: 1.0,
      windowWarmth: 1.0,
      starAlpha: 0.95,
      shadowStrength: 0.2,
    },
  };

  const profile = { ...base[timeOfDay] };
  if (weather === 'cloudy') {
    profile.overlayAlpha = Math.min(0.52, profile.overlayAlpha + 0.07);
    profile.shadowStrength *= 0.75;
  } else if (weather === 'light_rain') {
    profile.overlayColor = timeOfDay === 'night' ? '14, 26, 48' : '46, 68, 86';
    profile.overlayAlpha = Math.min(0.54, profile.overlayAlpha + 0.12);
    profile.lampIntensity = Math.max(profile.lampIntensity, 0.65);
  } else if (weather === 'heavy_rain') {
    profile.overlayColor = '24, 38, 56';
    profile.overlayAlpha = Math.min(0.58, profile.overlayAlpha + 0.18);
    profile.lampIntensity = Math.max(profile.lampIntensity, 0.85);
    profile.windowWarmth = Math.max(profile.windowWarmth, 0.9);
  } else if (weather === 'fog') {
    profile.overlayAlpha = Math.min(0.5, profile.overlayAlpha + 0.08);
  }
  return profile;
}

export function progressToTimeOfDay(progress: number): TimeOfDay {
  const p = ((progress % 1) + 1) % 1;
  if (p < 0.22) return 'morning';
  if (p < 0.5) return 'afternoon';
  if (p < 0.66) return 'sunset';
  if (p < 0.82) return 'evening';
  return 'night';
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  color: string;
}

export class EnvironmentController {
  private state: EnvironmentState = {
    timeOfDay: 'afternoon',
    cycleMode: 'manual',
    cycleProgress: 0.35,
    cycleDurationSeconds: 240,
    weather: 'clear',
    weatherAutoChange: false,
    ambientAudioEnabled: false,
    ambientVolume: 0.35,
    ambientSound: 'weather',
    particleQuality: 'medium',
    revision: 1,
  };

  private particles: WeatherParticle[] = [];
  private audioCtx: AudioContext | null = null;
  private noiseNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private listeners = new Set<(state: EnvironmentState) => void>();

  constructor() {
    try {
      const raw = localStorage.getItem('studyvillage-environment-v1');
      if (raw) {
        const parsed = environmentStateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) this.state = parsed.data;
      }
    } catch { /* Use defaults when storage is unavailable. */ }
  }

  getState(): EnvironmentState {
    return { ...this.state };
  }

  subscribe(listener: (state: EnvironmentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<EnvironmentState>, bumpRevision = true): EnvironmentState {
    const next: EnvironmentState = {
      ...this.state,
      ...patch,
      revision: bumpRevision ? this.state.revision + 1 : (patch.revision ?? this.state.revision),
    };
    if (patch.cycleProgress !== undefined && next.cycleMode === 'auto') {
      next.timeOfDay = progressToTimeOfDay(next.cycleProgress);
    }
    const parsed = environmentStateSchema.safeParse(next);
    if (!parsed.success) return this.state;
    const weatherChanged = parsed.data.weather !== this.state.weather || parsed.data.particleQuality !== this.state.particleQuality;
    const soundChanged = parsed.data.ambientSound !== this.state.ambientSound;
    this.state = parsed.data;
    try { localStorage.setItem('studyvillage-environment-v1', JSON.stringify(this.state)); } catch { /* Storage may be unavailable. */ }
    if (soundChanged && this.audioCtx) { void this.audioCtx.close(); this.audioCtx = null; this.gainNode = null; this.noiseNode = null; }
    if (weatherChanged) {
      this.rebuildParticles();
    }
    this.syncAmbientAudio();
    for (const listener of this.listeners) listener(this.getState());
    return this.getState();
  }

  applyRemoteState(raw: unknown): EnvironmentState {
    const parsed = environmentStateSchema.safeParse(raw);
    if (!parsed.success) return this.state;
    if (parsed.data.revision < this.state.revision) return this.state;
    return this.update(
      {
        timeOfDay: parsed.data.timeOfDay,
        cycleMode: parsed.data.cycleMode,
        cycleProgress: parsed.data.cycleProgress,
        cycleDurationSeconds: parsed.data.cycleDurationSeconds,
        weather: parsed.data.weather,
        weatherAutoChange: parsed.data.weatherAutoChange,
        revision: parsed.data.revision,
      },
      false,
    );
  }

  tick(dtSeconds: number): boolean {
    if (dtSeconds <= 0) return false;
    let changed = false;
    if (this.state.cycleMode === 'auto' && !reducedMotion()) {
      const nextProgress = (this.state.cycleProgress + dtSeconds / Math.max(30, this.state.cycleDurationSeconds)) % 1;
      const nextTod = progressToTimeOfDay(nextProgress);
      this.state.cycleProgress = nextProgress;
      if (nextTod !== this.state.timeOfDay) {
        this.state.timeOfDay = nextTod;
        changed = true;
        for (const listener of this.listeners) listener(this.getState());
      }
    }
    this.stepParticles(dtSeconds);
    return changed;
  }

  private rebuildParticles(): void {
    this.particles = [];
    if (this.state.particleQuality === 'off' || reducedMotion()) return;
    const mult = this.state.particleQuality === 'low' ? 0.45 : this.state.particleQuality === 'high' ? 1.35 : 1.0;

    let count = 0;
    if (this.state.weather === 'light_rain') count = Math.round(42 * mult);
    else if (this.state.weather === 'heavy_rain') count = Math.round(95 * mult);
    else if (this.state.weather === 'autumn_leaves') count = Math.round(26 * mult);
    else if (this.state.weather === 'fog') count = Math.round(14 * mult);
    else if (this.state.weather === 'cloudy') count = Math.round(8 * mult);

    const leafColors = ['#d97941', '#e6a145', '#b85332', '#c88a3b'];
    for (let i = 0; i < count; i++) {
      const seedA = ((i * 97 + 31) % 100) / 100;
      const seedB = ((i * 53 + 17) % 100) / 100;
      if (this.state.weather === 'light_rain' || this.state.weather === 'heavy_rain') {
        const heavy = this.state.weather === 'heavy_rain';
        this.particles.push({
          x: seedA * 768,
          y: seedB * 432,
          vx: heavy ? -48 : -24,
          vy: heavy ? 310 + seedA * 80 : 210 + seedA * 50,
          size: heavy ? 11 : 7,
          alpha: heavy ? 0.52 : 0.38,
          phase: seedA * Math.PI * 2,
          color: 'rgba(185, 220, 245, 0.72)',
        });
      } else if (this.state.weather === 'autumn_leaves') {
        this.particles.push({
          x: seedA * 768,
          y: seedB * 432,
          vx: 22 + seedA * 18,
          vy: 28 + seedB * 20,
          size: 4,
          alpha: 0.85,
          phase: seedA * Math.PI * 2,
          color: leafColors[i % leafColors.length],
        });
      } else if (this.state.weather === 'fog' || this.state.weather === 'cloudy') {
        this.particles.push({
          x: seedA * 768,
          y: 40 + seedB * 330,
          vx: 8 + seedA * 6,
          vy: 0,
          size: 90 + seedB * 70,
          alpha: this.state.weather === 'fog' ? 0.14 : 0.08,
          phase: seedA * Math.PI * 2,
          color: 'rgba(226, 238, 232, 1)',
        });
      }
    }
  }

  private stepParticles(dt: number): void {
    if (this.state.particleQuality === 'off' || reducedMotion()) return;
    if (this.particles.length === 0 && this.state.weather !== 'clear') {
      this.rebuildParticles();
    }
    for (const p of this.particles) {
      p.phase += dt * 2.2;
      if (this.state.weather === 'autumn_leaves') {
        p.x += (p.vx + Math.sin(p.phase) * 14) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.y > 440) {
        p.y = -10;
        p.x = (p.x + 137) % 768;
      }
      if (p.x > 790) p.x = -20;
      if (p.x < -30) p.x = 780;
    }
  }

  /**
   * Renders the synchronized Day/Night lighting tint, stars/fireflies at night,
   * and weather particles onto a 768x432 world/area canvas.
   */
  drawAtmosphere(
    ctx: CanvasRenderingContext2D,
    w = 768,
    h = 432,
    lampPositions: readonly { x: number; y: number; groundY?: number }[] = [],
    isInterior = false,
  ): void {
    const profile = getLightingProfile(this.state.timeOfDay, this.state.weather);

    // 1. Weather particles (outdoor scenes only)
    if (!isInterior && this.state.particleQuality !== 'off' && !reducedMotion()) {
      ctx.save();
      if (this.state.weather === 'light_rain' || this.state.weather === 'heavy_rain') {
        ctx.strokeStyle = 'rgba(186, 222, 248, 0.58)';
        ctx.lineWidth = this.state.weather === 'heavy_rain' ? 1.6 : 1.2;
        ctx.beginPath();
        for (const p of this.particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.035, p.y + p.size);
        }
        ctx.stroke();
      } else if (this.state.weather === 'autumn_leaves') {
        for (const p of this.particles) {
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size - 1);
        }
      } else if (this.state.weather === 'fog' || this.state.weather === 'cloudy') {
        for (const p of this.particles) {
          ctx.fillStyle = `rgba(224, 236, 232, ${p.alpha})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.34, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 2. Day/Night global color grade
    const effectiveAlpha = isInterior ? profile.overlayAlpha * 0.45 : profile.overlayAlpha;
    if (effectiveAlpha > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(${profile.overlayColor}, ${effectiveAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 3. Warm lamp halos during sunset/evening/night or rain
    if (profile.lampIntensity > 0.25 && lampPositions.length > 0) {
      ctx.save();
      for (const lamp of lampPositions) {
        const radius = 58 * profile.lampIntensity;
        const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, radius);
        grad.addColorStop(0, `rgba(255, 218, 138, ${(0.42 * profile.lampIntensity).toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(255, 192, 102, ${(0.16 * profile.lampIntensity).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 192, 102, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, radius, 0, Math.PI * 2);
        ctx.fill();
        if (lamp.groundY !== undefined) {
          const ground = ctx.createRadialGradient(lamp.x, lamp.groundY, 0, lamp.x, lamp.groundY, radius * .7);
          ground.addColorStop(0, `rgba(255, 208, 128, ${(.14 * profile.lampIntensity).toFixed(3)})`);
          ground.addColorStop(1, 'rgba(255, 208, 128, 0)');
          ctx.fillStyle = ground; ctx.beginPath(); ctx.ellipse(lamp.x, lamp.groundY, radius * .7, radius * .28, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // 4. Night fireflies / stars in outdoor areas
    if (!isInterior && profile.starAlpha > 0.2 && !reducedMotion()) {
      ctx.save();
      const now = performance.now() / 1000;
      for (let i = 0; i < 12; i++) {
        const fx = ((i * 67 + 43) % 720) + 24 + Math.sin(now * 0.9 + i) * 6;
        const fy = ((i * 89 + 29) % 360) + 32 + Math.cos(now * 1.1 + i * 2) * 5;
        const glow = (0.35 + 0.35 * Math.sin(now * 2.3 + i * 1.7)) * profile.starAlpha;
        ctx.fillStyle = `rgba(255, 240, 165, ${glow.toFixed(3)})`;
        ctx.fillRect(Math.round(fx), Math.round(fy), 3, 3);
      }
      ctx.restore();
    }
  }

  /**
   * Synthesizes gentle pink/brown noise for rain or forest breeze using the
   * browser's native WebAudio API — zero external audio file dependencies.
   */
  private syncAmbientAudio(): void {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!this.state.ambientAudioEnabled || this.state.ambientVolume <= 0.01) {
      if (this.gainNode && this.audioCtx) {
        this.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.15);
      }
      return;
    }

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
        const bufferSize = this.audioCtx.sampleRate * 2;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          output[i] = (b0 + b1 + b2) * 0.35;
        }
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = { weather: 650, rain: 2400, wind: 450, brown_noise: 180 }[this.state.ambientSound];

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0;

        source.connect(filter);
        filter.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        source.start();
        this.noiseNode = source;
      }

      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }

      if (this.gainNode) {
        const weatherFactor = this.state.ambientSound !== 'weather' ? 0.18 :
          this.state.weather === 'heavy_rain'
            ? 0.25
            : this.state.weather === 'light_rain'
              ? 0.15
              : this.state.weather === 'autumn_leaves'
                ? 0.08
                : 0.04;
        this.gainNode.gain.setTargetAtTime(
          this.state.ambientVolume * weatherFactor,
          this.audioCtx.currentTime,
          0.25,
        );
      }
    } catch {
      // Ignore WebAudio autoplay restrictions in headless tests
    }
  }

  dispose(): void {
    try {
      this.noiseNode?.disconnect();
      void this.audioCtx?.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}
