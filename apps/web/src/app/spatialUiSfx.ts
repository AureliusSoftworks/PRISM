export const SPATIAL_UI_SFX_SOURCES = {
  "bot-hover": [
    "/audio/ui-asmr/bot-hover-02.mp3",
    "/audio/ui-asmr/bot-hover-04.mp3",
    "/audio/ui-asmr/bot-hover-05.mp3",
    "/audio/ui-asmr/bot-select-01.mp3",
  ],
  "bot-select": [
    "/audio/ui-asmr/bot-hover-01.mp3",
    "/audio/ui-asmr/bot-hover-03.mp3",
    "/audio/ui-asmr/bot-hover-07.mp3",
  ],
  "panel-open": [
    "/audio/ui-asmr/panel-open-01.mp3",
    "/audio/ui-asmr/panel-open-02.mp3",
    "/audio/ui-asmr/panel-open-03.mp3",
  ],
  "panel-close": [
    "/audio/ui-asmr/panel-close-01.mp3",
    "/audio/ui-asmr/panel-close-02.mp3",
    "/audio/ui-asmr/panel-close-03.mp3",
  ],
  toggle: [
    "/audio/ui-asmr/toggle-01.mp3",
    "/audio/ui-asmr/toggle-02.mp3",
    "/audio/ui-asmr/toggle-03.mp3",
  ],
  confirm: [
    "/audio/prism-companion/glass-tap-01.mp3",
    "/audio/prism-companion/glass-tap-02.mp3",
    "/audio/prism-companion/glass-tap-03.mp3",
    "/audio/prism-companion/glass-tap-04.mp3",
  ],
} as const;

export type SpatialUiSfxCue = keyof typeof SPATIAL_UI_SFX_SOURCES;

const SPATIAL_UI_SFX_CONFIG: Record<
  SpatialUiSfxCue,
  { cooldownMs: number; volume: number }
> = {
  "bot-hover": { cooldownMs: 46, volume: 0.24 },
  "bot-select": { cooldownMs: 70, volume: 0.3 },
  "panel-open": { cooldownMs: 90, volume: 0.18 },
  "panel-close": { cooldownMs: 90, volume: 0.18 },
  toggle: { cooldownMs: 55, volume: 0.16 },
  confirm: { cooldownMs: 80, volume: 0.2 },
};

const BOT_CARD_SELECTOR = [
  '[data-ui-sfx="bot-card"]',
  "button[data-bot-id]",
  '[data-marketplace-bot-card="true"]',
].join(",");
const EXPLICIT_CUES = new Set<SpatialUiSfxCue>(
  Object.keys(SPATIAL_UI_SFX_SOURCES) as SpatialUiSfxCue[],
);
const MAX_ACTIVE_UI_SFX = 8;
const PAN_RANGE = 0.88;

interface SpatialUiSfxContext {
  readonly currentTime: number;
  readonly destination: AudioDestinationNode;
  readonly state: AudioContextState;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  createStereoPanner(): StereoPannerNode;
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>;
  resume(): Promise<void>;
}

export interface SpatialUiSfxConnection {
  source: AudioBufferSourceNode;
  mono: GainNode;
  panner: StereoPannerNode;
  output: GainNode;
}

export interface SpatialUiSfxControlDescription {
  explicitCue?: string | null;
  hasPopup?: string | null;
  inputType?: string | null;
  isBotCard?: boolean;
  isSubmit?: boolean;
  label?: string | null;
  role?: string | null;
}

let audioContext: AudioContext | null = null;
let playbackEpoch = 0;
const encodedAssetPromises = new Map<string, Promise<ArrayBuffer | null>>();
const decodedAssetPromises = new Map<string, Promise<AudioBuffer | null>>();
const previousVariantByCue = new Map<SpatialUiSfxCue, number>();
const lastPlaybackAtByCue = new Map<SpatialUiSfxCue, number>();
const activeSources = new Set<AudioBufferSourceNode>();

export function spatialUiSfxVariantIndex(
  randomValue: number,
  previousVariantIndex: number,
  variantCount: number,
): number {
  if (!Number.isFinite(variantCount) || variantCount <= 1) return 0;
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.max(0, Math.min(0.999999, randomValue))
    : 0;
  const candidate = Math.floor(normalizedRandom * variantCount);
  return candidate === previousVariantIndex
    ? (candidate + 1) % variantCount
    : candidate;
}

export function spatialUiSfxStereoPanForRect(
  rect: Pick<DOMRect, "left" | "width">,
  viewportWidth: number,
): number {
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return 0;
  }
  const centerX = rect.left + rect.width / 2;
  const normalized = (centerX / viewportWidth) * 2 - 1;
  return Math.max(-PAN_RANGE, Math.min(PAN_RANGE, normalized * PAN_RANGE));
}

export function spatialUiSfxCueForControl(
  control: SpatialUiSfxControlDescription,
): SpatialUiSfxCue | null {
  if (control.isBotCard) return "bot-select";
  if (
    control.explicitCue &&
    EXPLICIT_CUES.has(control.explicitCue as SpatialUiSfxCue)
  ) {
    return control.explicitCue as SpatialUiSfxCue;
  }

  const inputType = control.inputType?.trim().toLowerCase() ?? "";
  const role = control.role?.trim().toLowerCase() ?? "";
  if (
    inputType === "checkbox" ||
    inputType === "radio" ||
    role === "switch"
  ) {
    return "toggle";
  }

  if (control.hasPopup) {
    return control.hasPopup === "closing" ? "panel-close" : "panel-open";
  }

  const label = control.label?.trim().toLowerCase() ?? "";
  if (/\b(?:close|dismiss|cancel|back|done)\b/u.test(label)) {
    return "panel-close";
  }
  if (
    control.isSubmit ||
    /\b(?:save|create|add|install|send|apply|confirm|continue|start|generate|publish|update|import|export)\b/u.test(
      label,
    )
  ) {
    return "confirm";
  }
  return null;
}

export function connectSpatialUiSfxAudio(
  context: Pick<
    AudioContext,
    "createBufferSource" | "createGain" | "createStereoPanner" | "destination"
  >,
  buffer: AudioBuffer,
  pan: number,
  volume: number,
): SpatialUiSfxConnection {
  const source = context.createBufferSource();
  const mono = context.createGain();
  const panner = context.createStereoPanner();
  const output = context.createGain();

  source.buffer = buffer;
  mono.channelCount = 1;
  mono.channelCountMode = "explicit";
  mono.channelInterpretation = "speakers";
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  output.gain.value = Math.max(0, Math.min(1, volume));

  source.connect(mono);
  mono.connect(panner);
  panner.connect(output);
  output.connect(context.destination);
  return { source, mono, panner, output };
}

function contextForSpatialUiSfx(): AudioContext | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new window.AudioContext({ latencyHint: "interactive" });
  }
  return audioContext;
}

function fetchEncodedAsset(source: string): Promise<ArrayBuffer | null> {
  const existing = encodedAssetPromises.get(source);
  if (existing) return existing;
  const request =
    typeof fetch === "function"
      ? fetch(source)
          .then((response) => {
            if (!response.ok) return null;
            return response.arrayBuffer();
          })
          .catch(() => null)
      : Promise.resolve(null);
  encodedAssetPromises.set(source, request);
  return request;
}

function decodeSpatialUiSfxAsset(
  context: SpatialUiSfxContext,
  source: string,
): Promise<AudioBuffer | null> {
  const existing = decodedAssetPromises.get(source);
  if (existing) return existing;
  const decoded = fetchEncodedAsset(source)
    .then((encoded) =>
      encoded ? context.decodeAudioData(encoded.slice(0)) : null,
    )
    .catch(() => null);
  decodedAssetPromises.set(source, decoded);
  return decoded;
}

function preloadSpatialUiSfxAssets(): void {
  for (const sources of Object.values(SPATIAL_UI_SFX_SOURCES)) {
    for (const source of sources) void fetchEncodedAsset(source);
  }
}

function releaseConnection(connection: SpatialUiSfxConnection): void {
  activeSources.delete(connection.source);
  connection.source.disconnect();
  connection.mono.disconnect();
  connection.panner.disconnect();
  connection.output.disconnect();
}

export async function playSpatialUiSfx(
  cue: SpatialUiSfxCue,
  options: {
    anchor?: Element | null;
    now?: number;
    random?: () => number;
    viewportWidth?: number;
  } = {},
): Promise<boolean> {
  const now = options.now ?? performance.now();
  const config = SPATIAL_UI_SFX_CONFIG[cue];
  const lastPlaybackAt = lastPlaybackAtByCue.get(cue) ?? -Infinity;
  if (now - lastPlaybackAt < config.cooldownMs) return false;
  lastPlaybackAtByCue.set(cue, now);

  const context = contextForSpatialUiSfx();
  if (!context) return false;
  if (context.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
  if (context.state !== "running") return false;

  const sources = SPATIAL_UI_SFX_SOURCES[cue];
  const previousVariant = previousVariantByCue.get(cue) ?? -1;
  const variantIndex = spatialUiSfxVariantIndex(
    (options.random ?? Math.random)(),
    previousVariant,
    sources.length,
  );
  previousVariantByCue.set(cue, variantIndex);
  const sourceUrl = sources[variantIndex]!;
  const epoch = playbackEpoch;
  const buffer = await decodeSpatialUiSfxAsset(context, sourceUrl);
  if (!buffer || epoch !== playbackEpoch) return false;

  const viewportWidth =
    options.viewportWidth ??
    (typeof window === "undefined" ? 0 : window.innerWidth);
  const pan = options.anchor
    ? spatialUiSfxStereoPanForRect(
        options.anchor.getBoundingClientRect(),
        viewportWidth,
      )
    : 0;
  const connection = connectSpatialUiSfxAudio(
    context,
    buffer,
    pan,
    config.volume,
  );
  while (activeSources.size >= MAX_ACTIVE_UI_SFX) {
    const oldest = activeSources.values().next().value;
    if (!oldest) break;
    oldest.stop();
    activeSources.delete(oldest);
  }
  activeSources.add(connection.source);
  connection.source.addEventListener(
    "ended",
    () => releaseConnection(connection),
    { once: true },
  );
  connection.source.start();
  return true;
}

export function stopSpatialUiSfx(): void {
  playbackEpoch += 1;
  for (const source of [...activeSources]) {
    source.stop();
    activeSources.delete(source);
  }
}

function closestElement(
  target: EventTarget | null,
  selector: string,
): Element | null {
  return target instanceof Element ? target.closest(selector) : null;
}

function botCardForEvent(event: Event): Element | null {
  const card = closestElement(event.target, BOT_CARD_SELECTOR);
  if (!card) return null;
  const disabled = closestElement(
    event.target,
    "[disabled],[aria-disabled='true']",
  );
  return disabled && card.contains(disabled) ? null : card;
}

function controlCueForEvent(event: Event): {
  anchor: Element;
  cue: SpatialUiSfxCue;
} | null {
  const botCard = botCardForEvent(event);
  if (botCard) return { anchor: botCard, cue: "bot-select" };

  const anchor = closestElement(
    event.target,
    "button,input,select,[role='switch'],[data-ui-sfx]",
  );
  if (!anchor || anchor.matches("[disabled],[aria-disabled='true']")) return null;
  const explicitCue = anchor
    .closest("[data-ui-sfx]")
    ?.getAttribute("data-ui-sfx");
  const expanded = anchor.getAttribute("aria-expanded");
  const cue = spatialUiSfxCueForControl({
    explicitCue,
    hasPopup: anchor.getAttribute("aria-haspopup")
      ? expanded === "true"
        ? "closing"
        : "opening"
      : null,
    inputType: anchor.getAttribute("type"),
    isSubmit:
      anchor instanceof HTMLButtonElement &&
      (anchor.type === "submit" || anchor.getAttribute("type") === "submit"),
    label:
      anchor.getAttribute("aria-label") ??
      anchor.getAttribute("title") ??
      anchor.textContent,
    role: anchor.getAttribute("role"),
  });
  return cue ? { anchor, cue } : null;
}

export function registerSpatialUiSfx(
  root: Document = document,
): () => void {
  preloadSpatialUiSfxAssets();

  const unlock = (): void => {
    const context = contextForSpatialUiSfx();
    if (context?.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  };
  const handlePointerOver = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") return;
    const card = botCardForEvent(event);
    if (!card) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && card.contains(relatedTarget)) return;
    void playSpatialUiSfx("bot-hover", { anchor: card });
  };
  const handleClick = (event: MouseEvent): void => {
    const playback = controlCueForEvent(event);
    if (playback) {
      void playSpatialUiSfx(playback.cue, { anchor: playback.anchor });
    }
  };
  const handleChange = (event: Event): void => {
    const anchor = closestElement(
      event.target,
      "input[type='checkbox'],input[type='radio'],select,[role='switch']",
    );
    if (!anchor || anchor.matches("[disabled],[aria-disabled='true']")) return;
    void playSpatialUiSfx("toggle", { anchor });
  };

  root.addEventListener("pointerdown", unlock, true);
  root.addEventListener("keydown", unlock, true);
  root.addEventListener("pointerover", handlePointerOver);
  root.addEventListener("click", handleClick);
  root.addEventListener("change", handleChange);
  return () => {
    root.removeEventListener("pointerdown", unlock, true);
    root.removeEventListener("keydown", unlock, true);
    root.removeEventListener("pointerover", handlePointerOver);
    root.removeEventListener("click", handleClick);
    root.removeEventListener("change", handleChange);
    stopSpatialUiSfx();
  };
}
