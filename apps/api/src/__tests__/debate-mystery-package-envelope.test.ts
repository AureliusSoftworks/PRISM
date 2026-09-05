import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PortableMysteryEnvelopeError,
  inspectPortableMysteryEnvelopeHeaderV1,
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "../debate-mystery-package-envelope.ts";

const payload = Buffer.from("compressed mansion payload");
const metadata = {
  packageType: "mansion" as const,
  title: "Jungle Mansion",
  creatorName: "Prism",
  compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: "0.15.0" },
  expandedBytes: 100,
  assetCount: 2,
  contentWarnings: ["Storms"],
};

describe("portable mystery package envelope", () => {
  it("opens the automatic spoiler seal and exposes only its public header", () => {
    const envelope = sealPortableMysteryEnvelopeV1({ payload, mode: "spoiler_seal", metadata });
    const header = inspectPortableMysteryEnvelopeHeaderV1(envelope);
    assert.equal(header.title, "Jungle Mansion");
    assert.equal(header.encryptionMode, "spoiler_seal");
    assert.deepEqual(Buffer.from(openPortableMysteryEnvelopeV1({ envelope }).payload), payload);
  });

  it("requires the exact password without revealing a different failure", () => {
    const envelope = sealPortableMysteryEnvelopeV1({
      payload,
      mode: "password",
      password: "correct horse battery staple",
      metadata,
    });
    assert.throws(
      () => openPortableMysteryEnvelopeV1({ envelope, password: "wrong" }),
      (error) => error instanceof PortableMysteryEnvelopeError && error.message === "Package authentication failed.",
    );
    assert.deepEqual(
      Buffer.from(openPortableMysteryEnvelopeV1({
        envelope,
        password: "correct horse battery staple",
      }).payload),
      payload,
    );
  });

  it("authenticates header, salt, IV, ciphertext, and tag against modification", () => {
    const original = Buffer.from(sealPortableMysteryEnvelopeV1({ payload, mode: "spoiler_seal", metadata }));
    for (const offset of [15, 40, original.length - 20, original.length - 1]) {
      const tampered = Buffer.from(original);
      tampered[offset] ^= 0x01;
      assert.throws(() => openPortableMysteryEnvelopeV1({ envelope: tampered }));
    }
  });
});
