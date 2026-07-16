import type {
  PrismPixiApplication,
  PrismPixiModule,
} from "./PrismSceneHost";
import type { PrismSceneQualityConfig } from "./prismSceneRuntime";
import {
  COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS,
  coffeeAtmosphereHexColor,
  coffeeAtmosphereMixColor,
  coffeeAtmosphereMotes,
  coffeeAtmosphereMotionEnabled,
  coffeeAtmospherePalette,
  coffeeAtmosphereSpeakerLift,
  type CoffeeAtmosphereMoteSeed,
  type CoffeeAtmospherePhase,
  type CoffeeAtmosphereTheme,
} from "./coffeeAtmosphere";

export interface CoffeeAtmosphereSemanticState {
  phase: CoffeeAtmospherePhase;
  theme: CoffeeAtmosphereTheme;
  seed: string;
  activeSpeakerColor: string | null;
  replayActive: boolean;
}

interface RuntimeMote {
  seed: CoffeeAtmosphereMoteSeed;
  sprite: import("pixi.js").Sprite;
  x: number;
  y: number;
}

export class CoffeeAtmosphereController {
  private readonly pixi: PrismPixiModule;
  private readonly app: PrismPixiApplication;
  private readonly root: import("pixi.js").Container;
  private readonly glowLayer: import("pixi.js").Container;
  private readonly moteLayer: import("pixi.js").Container;
  private readonly glowTexture: import("pixi.js").Texture;
  private readonly moteTexture: import("pixi.js").Texture;
  private readonly baseGlows: import("pixi.js").Sprite[];
  private readonly speakerGlow: import("pixi.js").Sprite;
  private readonly onObjectCount?: (count: number) => void;
  private state: CoffeeAtmosphereSemanticState;
  private quality: PrismSceneQualityConfig;
  private motes: RuntimeMote[] = [];
  private width = 1;
  private height = 1;
  private elapsedSeconds = 0;
  private speakerBlendElapsedMs = COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS;
  private speakerColorStart = 0x46dcff;
  private speakerColorTarget = 0x46dcff;
  private speakerAlphaStart = 0;
  private speakerAlphaTarget = 0;
  private destroyed = false;

  constructor(options: {
    pixi: PrismPixiModule;
    app: PrismPixiApplication;
    state: CoffeeAtmosphereSemanticState;
    quality: PrismSceneQualityConfig;
    onObjectCount?: (count: number) => void;
  }) {
    this.pixi = options.pixi;
    this.app = options.app;
    this.state = options.state;
    this.quality = options.quality;
    this.onObjectCount = options.onObjectCount;
    this.root = new this.pixi.Container({ isRenderGroup: true });
    this.glowLayer = new this.pixi.Container();
    this.moteLayer = new this.pixi.Container();
    this.glowTexture = this.createGlowTexture();
    this.moteTexture = this.createMoteTexture();
    this.baseGlows = coffeeAtmospherePalette(this.state.theme).map(
      (color, index) => {
        const sprite = new this.pixi.Sprite({
          texture: this.glowTexture,
          anchor: 0.5,
          blendMode: "add",
          tint: coffeeAtmosphereHexColor(color) ?? 0xffffff,
          alpha: this.baseGlowAlpha(index),
        });
        this.glowLayer.addChild(sprite);
        return sprite;
      },
    );
    this.speakerGlow = new this.pixi.Sprite({
      texture: this.glowTexture,
      anchor: 0.5,
      blendMode: "add",
      tint: 0x46dcff,
      alpha: 0,
    });
    this.glowLayer.addChild(this.speakerGlow);
    this.root.addChild(this.glowLayer, this.moteLayer);
    this.app.stage.addChild(this.root);
    this.rebuildMotes();
    this.setSemanticState(this.state, true);
  }

  setSemanticState(
    state: CoffeeAtmosphereSemanticState,
    immediate = false,
  ): void {
    if (this.destroyed) return;
    const seedChanged = state.seed !== this.state.seed;
    const themeChanged = state.theme !== this.state.theme;
    this.state = state;
    if (seedChanged) this.rebuildMotes();
    if (themeChanged) this.applyPalette();
    const nextSpeakerColor = coffeeAtmosphereHexColor(state.activeSpeakerColor);
    this.speakerColorStart = this.speakerGlow.tint as number;
    this.speakerColorTarget =
      nextSpeakerColor ??
      (coffeeAtmosphereHexColor(coffeeAtmospherePalette(state.theme)[2] ?? null) ??
        0x46dcff);
    this.speakerAlphaStart = this.speakerGlow.alpha;
    this.speakerAlphaTarget = nextSpeakerColor
      ? coffeeAtmosphereSpeakerLift(this.state.theme)
      : 0;
    this.speakerBlendElapsedMs = immediate
      ? COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS
      : 0;
    if (immediate) {
      this.speakerGlow.tint = this.speakerColorTarget;
      this.speakerGlow.alpha = this.speakerAlphaTarget;
    }
    const motionEnabled =
      coffeeAtmosphereMotionEnabled(state) &&
      this.quality.continuousMotion &&
      this.quality.particleCount > 0;
    this.moteLayer.visible = motionEnabled;
    if (!coffeeAtmosphereMotionEnabled(state)) {
      this.speakerGlow.alpha = 0;
      this.speakerAlphaTarget = 0;
    }
    this.applyLayout();
  }

  setQuality(quality: PrismSceneQualityConfig): void {
    if (this.destroyed) return;
    const countChanged = quality.particleCount !== this.quality.particleCount;
    this.quality = quality;
    if (countChanged) this.rebuildMotes();
    this.moteLayer.visible =
      coffeeAtmosphereMotionEnabled(this.state) &&
      quality.continuousMotion &&
      quality.particleCount > 0;
    this.onObjectCount?.(this.objectCount);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.applyLayout();
  }

  tick(deltaMs: number): void {
    if (this.destroyed) return;
    this.updateSpeakerBlend(deltaMs);
    if (!this.moteLayer.visible) return;
    const deltaSeconds = Math.min(0.05, Math.max(0, deltaMs / 1_000));
    this.elapsedSeconds += deltaSeconds;
    for (const mote of this.motes) {
      mote.y -= mote.seed.speed * deltaSeconds;
      if (mote.y < 0.12) mote.y = 0.84;
      const sway = Math.sin(this.elapsedSeconds * 0.42 + mote.seed.phase);
      mote.sprite.x = (mote.x + sway * mote.seed.sway) * this.width;
      mote.sprite.y = mote.y * this.height;
      mote.sprite.rotation += mote.seed.rotationSpeed * deltaSeconds;
    }
  }

  get objectCount(): number {
    return this.baseGlows.length + this.motes.length + 4;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.stage.removeChild(this.root);
    this.root.destroy({ children: true });
    this.glowTexture.destroy(true);
    this.moteTexture.destroy(true);
    this.motes = [];
  }

  private createGlowTexture(): import("pixi.js").Texture {
    const graphics = new this.pixi.Graphics();
    for (let index = 12; index >= 1; index -= 1) {
      const radius = (index / 12) * 32;
      const alpha = 0.018 + ((12 - index) / 11) ** 2 * 0.12;
      graphics.circle(32, 32, radius).fill({ color: 0xffffff, alpha });
    }
    const texture = this.app.renderer.generateTexture({
      target: graphics,
      frame: new this.pixi.Rectangle(0, 0, 64, 64),
      resolution: 1,
    });
    graphics.destroy();
    return texture;
  }

  private createMoteTexture(): import("pixi.js").Texture {
    const graphics = new this.pixi.Graphics();
    graphics.poly([4, 0, 8, 8, 0, 8], true).fill({
      color: 0xffffff,
      alpha: 0.9,
    });
    const texture = this.app.renderer.generateTexture({
      target: graphics,
      frame: new this.pixi.Rectangle(0, 0, 8, 8),
      resolution: 1,
    });
    graphics.destroy();
    return texture;
  }

  private rebuildMotes(): void {
    for (const mote of this.motes) mote.sprite.destroy();
    this.moteLayer.removeChildren();
    const palette = coffeeAtmospherePalette(this.state.theme);
    this.motes = coffeeAtmosphereMotes(
      this.state.seed,
      this.quality.particleCount,
    ).map((seed) => {
      const sprite = new this.pixi.Sprite({
        texture: this.moteTexture,
        anchor: 0.5,
        blendMode: "add",
        tint:
          coffeeAtmosphereHexColor(
            palette[seed.colorIndex % palette.length] ?? null,
          ) ?? 0xffffff,
        alpha: seed.alpha,
        scale: seed.scale,
        rotation: seed.rotation,
      });
      this.moteLayer.addChild(sprite);
      return { seed, sprite, x: seed.x, y: seed.y };
    });
    this.moteLayer.visible =
      coffeeAtmosphereMotionEnabled(this.state) &&
      this.quality.continuousMotion &&
      this.quality.particleCount > 0;
    this.applyLayout();
    this.onObjectCount?.(this.objectCount);
  }

  private applyPalette(): void {
    const palette = coffeeAtmospherePalette(this.state.theme);
    this.baseGlows.forEach((sprite, index) => {
      sprite.tint =
        coffeeAtmosphereHexColor(palette[index % palette.length] ?? null) ??
        0xffffff;
      sprite.alpha = this.baseGlowAlpha(index);
    });
    this.motes.forEach((mote) => {
      mote.sprite.tint =
        coffeeAtmosphereHexColor(
          palette[mote.seed.colorIndex % palette.length] ?? null,
        ) ?? 0xffffff;
    });
  }

  private applyLayout(): void {
    const size = Math.min(this.width, this.height);
    const positions = [
      [0.44, 0.47],
      [0.56, 0.46],
      [0.54, 0.55],
      [0.46, 0.56],
    ] as const;
    this.baseGlows.forEach((sprite, index) => {
      const position = positions[index] ?? positions[0];
      sprite.position.set(position[0] * this.width, position[1] * this.height);
      sprite.width = size * (index % 2 === 0 ? 0.84 : 0.72);
      sprite.height = size * (index % 2 === 0 ? 0.58 : 0.68);
    });
    this.speakerGlow.position.set(this.width * 0.5, this.height * 0.51);
    this.speakerGlow.width = size * 0.74;
    this.speakerGlow.height = size * 0.54;
    for (const mote of this.motes) {
      mote.sprite.x = mote.x * this.width;
      mote.sprite.y = mote.y * this.height;
    }
  }

  private updateSpeakerBlend(deltaMs: number): void {
    if (
      this.speakerBlendElapsedMs >= COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS
    )
      return;
    this.speakerBlendElapsedMs = Math.min(
      COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS,
      this.speakerBlendElapsedMs + Math.max(0, deltaMs),
    );
    const amount =
      this.speakerBlendElapsedMs / COFFEE_ATMOSPHERE_SPEAKER_BLEND_MS;
    this.speakerGlow.tint = coffeeAtmosphereMixColor(
      this.speakerColorStart,
      this.speakerColorTarget,
      amount,
    );
    this.speakerGlow.alpha =
      this.speakerAlphaStart +
      (this.speakerAlphaTarget - this.speakerAlphaStart) * amount;
  }

  private baseGlowAlpha(index: number): number {
    const base = this.state.theme === "light" ? 0.022 : 0.038;
    return base + (index % 2 === 0 ? 0.004 : 0);
  }
}
