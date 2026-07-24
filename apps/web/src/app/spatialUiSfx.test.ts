import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  SPATIAL_UI_SFX_SOURCES,
  connectSpatialUiSfxAudio,
  spatialUiSfxCueForControl,
  spatialUiSfxStereoPanForRect,
  spatialUiSfxVariantIndex,
} from "./spatialUiSfx.ts";

test("ships a varied tactile UI library with real local assets", () => {
  const sources = Object.values(SPATIAL_UI_SFX_SOURCES).flat();
  assert.equal(sources.length, 20);
  assert.equal(new Set(sources).size, 20);
  assert.equal(SPATIAL_UI_SFX_SOURCES["bot-hover"].length, 4);
  assert.equal(SPATIAL_UI_SFX_SOURCES["bot-select"].length, 3);

  for (const source of sources) {
    const asset = statSync(new URL(`../../public${source}`, import.meta.url));
    assert.ok(asset.isFile());
    assert.ok(asset.size > 7_000, `${source} should contain a real MP3`);
  }
});

test("registers the spatial UI layer and identifies every bot-card surface", () => {
  const pageSource = readFileSync(
    new URL("./page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    pageSource,
    /import \{ registerSpatialUiSfx \} from "\.\/spatialUiSfx";/u,
  );
  assert.match(
    pageSource,
    /useEffect\(\(\) => registerSpatialUiSfx\(\), \[\]\);/u,
  );
  assert.match(pageSource, /data-ui-sfx="bot-card"/u);
  assert.match(pageSource, /data-marketplace-bot-card="true"/u);
  assert.match(pageSource, /data-bot-id=\{b\.id\}/u);
  assert.match(pageSource, /data-bot-id=\{bot\.id\}/u);
});

test("maps screen position to a restrained but clearly directional stereo pan", () => {
  assert.equal(
    spatialUiSfxStereoPanForRect({ left: 0, width: 0 }, 1_000),
    -0.88,
  );
  assert.equal(
    spatialUiSfxStereoPanForRect({ left: 450, width: 100 }, 1_000),
    0,
  );
  assert.equal(
    spatialUiSfxStereoPanForRect({ left: 950, width: 50 }, 1_000),
    0.836,
  );
  assert.equal(
    spatialUiSfxStereoPanForRect({ left: 1_200, width: 100 }, 1_000),
    0.88,
  );
  assert.equal(
    spatialUiSfxStereoPanForRect(
      { left: Number.NaN, width: 10 },
      1_000,
    ),
    0,
  );
});

test("varies repeated cues without immediately selecting the same source", () => {
  assert.equal(spatialUiSfxVariantIndex(0, -1, 7), 0);
  assert.equal(spatialUiSfxVariantIndex(0, 0, 7), 1);
  assert.equal(spatialUiSfxVariantIndex(0.999, 6, 7), 0);
  assert.equal(spatialUiSfxVariantIndex(Number.NaN, -1, 7), 0);
});

test("classifies high-value controls into restrained semantic cue families", () => {
  assert.equal(
    spatialUiSfxCueForControl({ isBotCard: true }),
    "bot-select",
  );
  assert.equal(
    spatialUiSfxCueForControl({ hasPopup: "opening" }),
    "panel-open",
  );
  assert.equal(
    spatialUiSfxCueForControl({ hasPopup: "closing" }),
    "panel-close",
  );
  assert.equal(
    spatialUiSfxCueForControl({ inputType: "checkbox" }),
    "toggle",
  );
  assert.equal(
    spatialUiSfxCueForControl({ label: "Save bot" }),
    "confirm",
  );
  assert.equal(
    spatialUiSfxCueForControl({ label: "Ordinary utility" }),
    null,
  );
});

test("downmixes each tactile cue before placing it in stereo space", () => {
  class FakeNode {
    readonly connections: FakeNode[] = [];
    connect<T extends FakeNode>(node: T): T {
      this.connections.push(node);
      return node;
    }
  }
  class FakeSource extends FakeNode {
    buffer: AudioBuffer | null = null;
  }
  class FakeGain extends FakeNode {
    channelCount = 2;
    channelCountMode: ChannelCountMode = "max";
    channelInterpretation: ChannelInterpretation = "speakers";
    gain = { value: 1 };
  }
  class FakePanner extends FakeNode {
    pan = { value: 0 };
  }

  const source = new FakeSource();
  const mono = new FakeGain();
  const output = new FakeGain();
  const panner = new FakePanner();
  const destination = new FakeNode();
  let gainCount = 0;
  const connection = connectSpatialUiSfxAudio(
    {
      createBufferSource: () =>
        source as unknown as AudioBufferSourceNode,
      createGain: (() => {
        gainCount += 1;
        return (gainCount === 1 ? mono : output) as unknown as GainNode;
      }) as AudioContext["createGain"],
      createStereoPanner: () =>
        panner as unknown as StereoPannerNode,
      destination: destination as unknown as AudioDestinationNode,
    },
    {} as AudioBuffer,
    0.72,
    0.24,
  );

  assert.equal(connection.mono.channelCount, 1);
  assert.equal(connection.mono.channelCountMode, "explicit");
  assert.equal(connection.mono.channelInterpretation, "speakers");
  assert.equal(connection.panner.pan.value, 0.72);
  assert.equal(connection.output.gain.value, 0.24);
  assert.equal(source.connections[0], mono);
  assert.equal(mono.connections[0], panner);
  assert.equal(panner.connections[0], output);
  assert.equal(output.connections[0], destination);
});
