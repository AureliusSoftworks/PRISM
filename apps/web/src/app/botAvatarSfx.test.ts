import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import {
  BOT_AVATAR_SFX_DEFAULT_VOLUME,
  BOT_AVATAR_SFX_MAX_VOLUME,
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  type BotAvatarSfxV1,
} from "@localai/shared";
import {
  BOT_AVATAR_SFX_ATTACK_MS,
  BOT_AVATAR_SFX_LOOP_CROSSFADE_SECONDS,
  BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
  BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO,
  BOT_AVATAR_SFX_RELEASE_MS,
  BOT_AVATAR_SFX_THINKING_RUNTIME_GAIN,
  GENERATED_BOT_THINKING_SFX_PROMPT,
  PRISM_BOT_THINKING_SFX_FALLBACK_URLS,
  botAudioVoiceProfileWithThinkingSfx,
  botAvatarSfxAttackGainAt,
  botAvatarSfxLoopBounds,
  botAvatarSfxLoopRestartTime,
  botAvatarSfxOutputGain,
  botAvatarSfxOutputGainForState,
  botAvatarSfxReleaseGainAt,
  botAvatarSfxShouldPlay,
  botAvatarSfxStereoPanForRect,
  connectBotAvatarSfxSpatialAudio,
  createSeamlessBotAvatarSfxLoopBuffer,
  effectiveBotAvatarSfxPlayback,
  normalizeGeneratedBotThinkingSfxPrompt,
  normalizeBotAvatarSfxLoopBlob,
  playBotAvatarSfxSampleAudio,
  prismBotThinkingSfxFallback,
  prismBotThinkingSfxFallbackIndex,
  requestElevenLabsAvatarSfxLoop,
  stopBotAvatarSfxSampleAudio,
  stopBotAvatarSfxAudio,
  syncBotAvatarSfxAudio,
  type BotAvatarSfxAudioTarget,
} from "./botAvatarSfx.ts";

const sfx: BotAvatarSfxV1 = {
  v: 1,
  source: "upload",
  audioDataUrl: "data:audio/mpeg;base64,AQID",
  playWhileTalking: true,
  playWhileIdle: false,
  playWhileThinking: true,
  volume: BOT_AVATAR_SFX_MAX_VOLUME,
};

test("bot thinking SFX is downmixed to mono before spatial placement", () => {
  class FakeNode {
    readonly connections: FakeNode[] = [];
    connect<T extends FakeNode>(node: T): T {
      this.connections.push(node);
      return node;
    }
  }
  class FakeGain extends FakeNode {
    channelCount = 2;
    channelCountMode: ChannelCountMode = "max";
    channelInterpretation: ChannelInterpretation = "speakers";
    gain = { value: 1 };
  }
  class FakeStereoPanner extends FakeNode {
    pan = { value: 0 };
  }

  const source = new FakeNode();
  const mono = new FakeGain();
  const panner = new FakeStereoPanner();
  const output = new FakeGain();
  const destination = new FakeNode();
  let gainCreateCount = 0;
  const connection = connectBotAvatarSfxSpatialAudio(
    {
      createMediaElementSource: () =>
        source as unknown as MediaElementAudioSourceNode,
      createGain: (() => {
        gainCreateCount += 1;
        return (gainCreateCount === 1 ? mono : output) as unknown as GainNode;
      }) as AudioContext["createGain"],
      createStereoPanner: () =>
        panner as unknown as StereoPannerNode,
      destination: destination as unknown as AudioDestinationNode,
    },
    {} as HTMLMediaElement,
  );

  assert.equal(connection.mono.channelCount, 1);
  assert.equal(connection.mono.channelCountMode, "explicit");
  assert.equal(connection.mono.channelInterpretation, "speakers");
  assert.equal(source.connections[0], mono);
  assert.equal(mono.connections[0], panner);
  assert.equal(panner.connections[0], output);
  assert.equal(output.connections[0], destination);
});

test("bot thinking SFX follows the rendered bot's horizontal location", () => {
  assert.equal(botAvatarSfxStereoPanForRect({ left: 0, width: 0 }, 1_000), -1);
  assert.equal(
    botAvatarSfxStereoPanForRect({ left: 450, width: 100 }, 1_000),
    0,
  );
  assert.equal(
    botAvatarSfxStereoPanForRect({ left: 700, width: 100 }, 1_000),
    0.5,
  );
  assert.equal(
    botAvatarSfxStereoPanForRect({ left: 1_200, width: 100 }, 1_000),
    1,
  );
});

test("avatar SFX trims silent loop pads and plays the full audible body", () => {
  assert.deepEqual(botAvatarSfxLoopBounds(4), {
    startTime: BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
    endTime: 4 - BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
  });
  const shortBounds = botAvatarSfxLoopBounds(0.4);
  assert.ok(shortBounds);
  assert.ok(
    Math.abs(
      shortBounds.startTime - 0.4 * BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO,
    ) < 1e-10,
  );
  assert.ok(
    Math.abs(
      shortBounds.endTime - (0.4 - 0.4 * BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO),
    ) < 1e-10,
  );
  assert.equal(botAvatarSfxLoopBounds(0), null);
  assert.equal(botAvatarSfxLoopBounds(Number.NaN), null);
  assert.equal(
    botAvatarSfxLoopRestartTime(0, 4),
    BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
  );
  assert.equal(
    botAvatarSfxLoopRestartTime(
      4 - BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
      4,
    ),
    BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
  );
  assert.equal(
    botAvatarSfxLoopRestartTime(
      4 - BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS - 0.01,
      4,
    ),
    null,
  );
  assert.equal(botAvatarSfxLoopRestartTime(2, 4), null);
});

test("generated avatar loops bake the trimmed tail into a crossfaded buffer", () => {
  const input = Float32Array.from({ length: 100 }, (_, index) => index / 100);
  const decoded = {
    duration: 1,
    length: input.length,
    numberOfChannels: 1,
    sampleRate: 100,
    getChannelData: () => input,
  } as unknown as AudioBuffer;
  const edgeTrim = Math.min(
    BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
    1 * BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO,
  );
  const startFrame = Math.floor(edgeTrim * 100);
  const endFrame = Math.floor((1 - edgeTrim) * 100);
  const regionFrames = endFrame - startFrame;
  const crossfadeFrames = Math.min(
    Math.round(BOT_AVATAR_SFX_LOOP_CROSSFADE_SECONDS * 100),
    Math.floor(regionFrames / 4),
  );
  const loopFrames = regionFrames - crossfadeFrames;
  const outputData = new Float32Array(loopFrames);
  const output = {
    duration: outputData.length / 100,
    length: outputData.length,
    numberOfChannels: 1,
    sampleRate: 100,
    getChannelData: () => outputData,
  } as unknown as AudioBuffer;
  const context = {
    createBuffer: () => output,
  } as unknown as BaseAudioContext;

  const normalized = createSeamlessBotAvatarSfxLoopBuffer(
    context,
    decoded,
    BOT_AVATAR_SFX_LOOP_CROSSFADE_SECONDS,
  );

  assert.equal(normalized.length, loopFrames);
  assert.equal(normalized.duration, loopFrames / 100);
  assert.equal(outputData[0], input[startFrame + loopFrames]);
  assert.ok(outputData[1]! > input[startFrame + 1]!);
  assert.ok(outputData[1]! < input[startFrame + loopFrames + 1]!);
  assert.equal(outputData[loopFrames - 1], input[startFrame + loopFrames - 1]);
});

test("generated loop normalization emits a padded WAV fallback asset", async () => {
  const input = Float32Array.from({ length: 100 }, (_, index) => index / 100);
  const decoded = {
    duration: 1,
    length: input.length,
    numberOfChannels: 1,
    sampleRate: 100,
    getChannelData: () => input,
  } as unknown as AudioBuffer;
  const previousOfflineAudioContext = (
    globalThis as unknown as Record<string, unknown>
  ).OfflineAudioContext;
  class FakeOfflineAudioContext {
    async decodeAudioData(): Promise<AudioBuffer> {
      return decoded;
    }

    createBuffer(
      numberOfChannels: number,
      length: number,
      sampleRate: number,
    ): AudioBuffer {
      const channels = Array.from(
        { length: numberOfChannels },
        () => new Float32Array(length),
      );
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels,
        sampleRate,
        getChannelData: (channel: number) => channels[channel]!,
      } as unknown as AudioBuffer;
    }
  }
  Object.defineProperty(globalThis, "OfflineAudioContext", {
    configurable: true,
    value: FakeOfflineAudioContext,
  });

  try {
    const normalized = await normalizeBotAvatarSfxLoopBlob(
      new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }),
    );
    const bytes = new Uint8Array(await normalized.arrayBuffer());
    assert.equal(normalized.type, "audio/wav");
    assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
    assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), "WAVE");
  } finally {
    if (previousOfflineAudioContext === undefined) {
      Reflect.deleteProperty(globalThis, "OfflineAudioContext");
    } else {
      Object.defineProperty(globalThis, "OfflineAudioContext", {
        configurable: true,
        value: previousOfflineAudioContext,
      });
    }
  }
});

test("avatar SFX uses the approved equal-power attack and release", () => {
  assert.equal(BOT_AVATAR_SFX_ATTACK_MS, 120);
  assert.equal(BOT_AVATAR_SFX_RELEASE_MS, 240);
  assert.equal(botAvatarSfxAttackGainAt(0, 0.5, 0), 0);
  assert.equal(botAvatarSfxAttackGainAt(0, 0.5, 1), 0.5);
  assert.equal(botAvatarSfxReleaseGainAt(0.5, 0), 0.5);
  assert.ok(botAvatarSfxReleaseGainAt(0.5, 1) < 1e-10);
  assert.ok(
    Math.abs(botAvatarSfxAttackGainAt(0, 1, 0.5) - Math.SQRT1_2) <
      1e-10,
  );
  assert.ok(
    Math.abs(botAvatarSfxReleaseGainAt(1, 0.5) - Math.SQRT1_2) <
      1e-10,
  );
});

test("avatar SFX maps the editor demos to distinct playback states", () => {
  assert.equal(botAvatarSfxShouldPlay(sfx, "talking"), true);
  assert.equal(botAvatarSfxShouldPlay(sfx, "thinking"), true);
  assert.equal(botAvatarSfxShouldPlay(sfx, "idle"), false);
  assert.equal(botAvatarSfxShouldPlay(sfx, "blink"), false);
});

test("avatar SFX treats blink as not-talking and respects mute volume", () => {
  const idleLoop = {
    ...sfx,
    playWhileIdle: true,
    volume: 0.25,
  };
  assert.equal(botAvatarSfxShouldPlay(idleLoop, "idle"), true);
  assert.equal(botAvatarSfxShouldPlay(idleLoop, "blink"), true);
  assert.equal(botAvatarSfxShouldPlay({ ...idleLoop, volume: 0 }, "idle"), false);
});

test("automatic bot thinking SFX uses the exact prompt and thinking-only playback", () => {
  assert.equal(GENERATED_BOT_THINKING_SFX_PROMPT, "Computer calculating");
  const profile = botAudioVoiceProfileWithThinkingSfx(
    DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    "data:audio/mpeg;base64,AQID",
  );

  assert.equal(profile.avatarSfx?.prompt, "Computer calculating");
  assert.equal(profile.avatarSfx?.source, "elevenlabs");
  assert.equal(profile.avatarSfx?.playWhileTalking, false);
  assert.equal(profile.avatarSfx?.playWhileIdle, false);
  assert.equal(profile.avatarSfx?.playWhileThinking, true);
});

test("generated bots can carry a persona-specific thinking-loop brief", () => {
  const prompt = "Soft cassette transport ticks and a muted relay hum";
  const generated = botAudioVoiceProfileWithThinkingSfx(
    DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    "data:audio/mpeg;base64,AQID",
    prompt,
  );

  assert.equal(generated.avatarSfx?.prompt, prompt);
  assert.equal(generated.avatarSfx?.playWhileTalking, false);
  assert.equal(generated.avatarSfx?.playWhileIdle, false);
  assert.equal(generated.avatarSfx?.playWhileThinking, true);
  assert.equal(
    normalizeGeneratedBotThinkingSfxPrompt("  \n  "),
    GENERATED_BOT_THINKING_SFX_PROMPT,
  );
});

test("bots without selected audio use one of four stable PRISM thinking fallbacks", () => {
  assert.equal(PRISM_BOT_THINKING_SFX_FALLBACK_URLS.length, 4);
  assert.equal(new Set(PRISM_BOT_THINKING_SFX_FALLBACK_URLS).size, 4);
  const first = prismBotThinkingSfxFallback("bot-alpha");
  const repeated = prismBotThinkingSfxFallback("bot-alpha");
  assert.deepEqual(repeated, first);
  assert.equal(
    first.audioDataUrl,
    PRISM_BOT_THINKING_SFX_FALLBACK_URLS[
      prismBotThinkingSfxFallbackIndex("bot-alpha")
    ],
  );
  assert.equal(first.playWhileTalking, false);
  assert.equal(first.playWhileIdle, false);
  assert.equal(first.playWhileThinking, true);
  assert.equal(first.volume, BOT_AVATAR_SFX_DEFAULT_VOLUME);
  for (const publicUrl of PRISM_BOT_THINKING_SFX_FALLBACK_URLS) {
    const asset = statSync(new URL(`../../public${publicUrl}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 32_000, `${publicUrl} should contain a real MP3`);
  }
});

test("custom avatar audio wins over the fallback and explicit mute wins over both", () => {
  assert.equal(
    effectiveBotAvatarSfxPlayback(DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, "bot-a")
      ?.audioDataUrl.startsWith("/audio/avatar/prism-calculating-"),
    true,
  );
  assert.equal(
    effectiveBotAvatarSfxPlayback(
      { ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1, avatarSfx: sfx },
      "bot-a",
    )?.audioDataUrl,
    sfx.audioDataUrl,
  );
  assert.equal(
    effectiveBotAvatarSfxPlayback(
      {
        ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
        avatarSfx: sfx,
        avatarSfxMuted: true,
      },
      "bot-a",
    ),
    null,
  );
});

test("automatic thinking loops and fallbacks share the twenty-percent library volume", () => {
  const generated = botAudioVoiceProfileWithThinkingSfx(
    DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    "data:audio/mpeg;base64,AQID",
  );
  assert.equal(BOT_AVATAR_SFX_DEFAULT_VOLUME, 0.2);
  assert.equal(generated.avatarSfx?.volume, BOT_AVATAR_SFX_DEFAULT_VOLUME);
  assert.equal(
    prismBotThinkingSfxFallback("library-bot").volume,
    BOT_AVATAR_SFX_DEFAULT_VOLUME,
  );
});

test("Avatar SFX full scale stays quiet and inherits the complete voice gain", () => {
  assert.equal(BOT_AVATAR_SFX_MAX_VOLUME, 0.2);
  assert.equal(
    botAvatarSfxOutputGain({ volume: BOT_AVATAR_SFX_MAX_VOLUME }),
    0.2,
  );
  assert.equal(
    botAvatarSfxOutputGain({
      volume: BOT_AVATAR_SFX_MAX_VOLUME,
      voiceBusGain: 0.5,
    }),
    0.1,
  );
  assert.equal(
    botAvatarSfxShouldPlay({ ...sfx, voiceBusGain: 0 }, "thinking"),
    false,
  );
  assert.equal(BOT_AVATAR_SFX_THINKING_RUNTIME_GAIN, 0.35);
  assert.ok(
    Math.abs(
      botAvatarSfxOutputGainForState(
        { volume: BOT_AVATAR_SFX_MAX_VOLUME, voiceBusGain: 0.5 },
        "thinking",
      ) - 0.035,
    ) < 1e-10,
  );
  assert.equal(
    botAvatarSfxOutputGainForState(
      { volume: BOT_AVATAR_SFX_MAX_VOLUME, voiceBusGain: 0.5 },
      "talking",
    ),
    0.1,
  );
});

test("automatic and manual avatar loops share the guarded ElevenLabs request", async () => {
  let requestedUrl = "";
  let requestedBody = "";
  const blob = await requestElevenLabsAvatarSfxLoop(
    GENERATED_BOT_THINKING_SFX_PROMPT,
    "https://prism.local",
    async (input, init) => {
      requestedUrl = String(input);
      requestedBody = String(init?.body ?? "");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    },
  );

  assert.equal(requestedUrl, "https://prism.local/api/avatar/sfx/generate");
  assert.deepEqual(JSON.parse(requestedBody), {
    prompt: "Computer calculating",
  });
  assert.equal(blob.type, "audio/mpeg");
});

test("the guarded ElevenLabs request accepts a persona-specific loop brief", async () => {
  const prompt = "Soft cassette transport ticks and a muted relay hum";
  let requestedBody = "";
  await requestElevenLabsAvatarSfxLoop(
    prompt,
    "https://prism.local",
    async (_input, init) => {
      requestedBody = String(init?.body ?? "");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    },
  );

  assert.deepEqual(JSON.parse(requestedBody), { prompt });
});

class FakeAvatarSfxAudio implements BotAvatarSfxAudioTarget {
  src = "";
  currentTime = 0;
  duration = 4;
  loop = false;
  volume = 1;
  paused = true;
  ended = false;
  loadCalls = 0;
  pauseCalls = 0;
  playCalls = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  load(): void {
    this.loadCalls += 1;
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  async play(): Promise<void> {
    this.playCalls += 1;
    this.paused = false;
    this.ended = false;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

test("Avatar Studio sample fades in, trims its start, and releases before pausing", async () => {
  const audio = new FakeAvatarSfxAudio();
  await playBotAvatarSfxSampleAudio(
    audio as unknown as HTMLMediaElement,
    sfx,
  );
  assert.equal(audio.currentTime, BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS);
  assert.equal(audio.loop, false);
  assert.equal(audio.paused, false);
  assert.equal(audio.volume, 0);
  await new Promise((resolve) => setTimeout(resolve, BOT_AVATAR_SFX_ATTACK_MS + 40));
  assert.ok(Math.abs(audio.volume - sfx.volume) < 1e-10);

  stopBotAvatarSfxSampleAudio(audio as unknown as HTMLMediaElement);
  assert.equal(audio.paused, false);
  await new Promise((resolve) =>
    setTimeout(resolve, BOT_AVATAR_SFX_RELEASE_MS + 40),
  );
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
  assert.ok(audio.volume < 1e-10);
});

test("Avatar Studio restarts at the trimmed start when the media element reaches its end", async () => {
  const audio = new FakeAvatarSfxAudio();
  await playBotAvatarSfxSampleAudio(
    audio as unknown as HTMLMediaElement,
    sfx,
  );

  audio.currentTime = audio.duration;
  audio.ended = true;
  audio.paused = true;
  audio.emit("ended");

  assert.equal(audio.currentTime, BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS);
  assert.equal(audio.playCalls, 2);
  assert.equal(audio.loop, false);
  stopBotAvatarSfxSampleAudio(audio as unknown as HTMLMediaElement);
});

test("Avatar Studio sample cancels a release and fades source replacements safely", async () => {
  const audio = new FakeAvatarSfxAudio();
  await playBotAvatarSfxSampleAudio(
    audio as unknown as HTMLMediaElement,
    sfx,
  );
  await new Promise((resolve) => setTimeout(resolve, BOT_AVATAR_SFX_ATTACK_MS + 40));

  stopBotAvatarSfxSampleAudio(audio as unknown as HTMLMediaElement);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await playBotAvatarSfxSampleAudio(
    audio as unknown as HTMLMediaElement,
    sfx,
  );
  await new Promise((resolve) => setTimeout(resolve, BOT_AVATAR_SFX_ATTACK_MS + 40));
  assert.equal(audio.paused, false);
  assert.equal(audio.loadCalls, 1);

  const replacement = {
    ...sfx,
    audioDataUrl: "data:audio/mpeg;base64,BAUG",
  };
  await playBotAvatarSfxSampleAudio(
    audio as unknown as HTMLMediaElement,
    replacement,
  );
  assert.equal(audio.src, replacement.audioDataUrl);
  assert.equal(audio.loadCalls, 2);
  assert.equal(audio.currentTime, BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS);
  assert.equal(audio.paused, false);

  stopBotAvatarSfxSampleAudio(audio as unknown as HTMLMediaElement);
  await new Promise((resolve) =>
    setTimeout(resolve, BOT_AVATAR_SFX_RELEASE_MS + 40),
  );
  assert.equal(audio.paused, true);
});

test("avatar SFX keeps one loop running across enabled live states", () => {
  const audio = new FakeAvatarSfxAudio();
  const allStates = {
    ...sfx,
    playWhileIdle: true,
  };

  const loadedSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "idle",
    null,
  );
  assert.equal(loadedSource, sfx.audioDataUrl);
  assert.equal(audio.src, sfx.audioDataUrl);
  assert.equal(audio.loop, false);
  assert.equal(audio.volume, BOT_AVATAR_SFX_MAX_VOLUME);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 1);

  const talkingSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "talking",
    loadedSource,
  );
  const thinkingSource = syncBotAvatarSfxAudio(
    audio,
    allStates,
    "thinking",
    talkingSource,
  );
  assert.equal(thinkingSource, loadedSource);
  assert.equal(
    audio.volume,
    BOT_AVATAR_SFX_MAX_VOLUME * BOT_AVATAR_SFX_THINKING_RUNTIME_GAIN,
  );
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.paused, false);
});

test("avatar SFX pauses outside its checked states and resumes without reloading", () => {
  const audio = new FakeAvatarSfxAudio();
  const loadedSource = syncBotAvatarSfxAudio(audio, sfx, "talking", null);
  audio.currentTime = 1.25;

  const pausedSource = syncBotAvatarSfxAudio(
    audio,
    sfx,
    "idle",
    loadedSource,
  );
  assert.equal(pausedSource, loadedSource);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);

  syncBotAvatarSfxAudio(audio, sfx, "thinking", pausedSource);
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.playCalls, 2);

  audio.currentTime = 0.75;
  stopBotAvatarSfxAudio(audio);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
});
