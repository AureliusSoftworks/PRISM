import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prismRenderPlatformForUserAgent } from "./renderPlatform.ts";

describe("prismRenderPlatformForUserAgent", () => {
  it("recognizes the Windows WebView2 user agent", () => {
    assert.equal(
      prismRenderPlatformForUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
      ),
      "windows",
    );
  });

  it("recognizes the macOS WebKit user agent", () => {
    assert.equal(
      prismRenderPlatformForUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15",
      ),
      "macos",
    );
  });

  it("leaves Linux and unknown renderers on the default treatment", () => {
    assert.equal(
      prismRenderPlatformForUserAgent(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
      ),
      "other",
    );
  });
});
