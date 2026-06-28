import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildApiHealthUrlFromHost,
  buildApiRootLandingHtml,
  buildWebAppUrlFromApiHost,
  renderApiRootLandingHtml,
} from "../api-root-landing.ts";

describe("API root landing URL helpers", () => {
  it("converts an IPv4 API host to the web app port", () => {
    assert.equal(
      buildWebAppUrlFromApiHost("192.168.1.20:18787", 18788),
      "http://192.168.1.20:18788"
    );
  });

  it("converts a hostname API host to the web app port", () => {
    assert.equal(
      buildWebAppUrlFromApiHost("prism-server.local:18787", 18788),
      "http://prism-server.local:18788"
    );
  });

  it("falls back to localhost when the host header is missing or invalid", () => {
    assert.equal(buildWebAppUrlFromApiHost(undefined, 18788), "http://localhost:18788");
    assert.equal(buildWebAppUrlFromApiHost("bad/host:18787", 18788), "http://localhost:18788");
  });

  it("keeps the API health link on the API host and port", () => {
    assert.equal(
      buildApiHealthUrlFromHost("192.168.1.20:18787", 18787),
      "http://192.168.1.20:18787/api/health"
    );
  });
});

describe("API root landing HTML", () => {
  it("renders a helpful HTML landing page with escaped URLs", () => {
    const html = renderApiRootLandingHtml({
      webUrl: "http://prism-server.local:18788/?x=<tag>",
      healthUrl: "http://prism-server.local:18787/api/health",
      qrDataUrl: null,
    });

    assert.match(html, /<!doctype html>/);
    assert.match(html, /Prism API is running/);
    assert.match(html, /Open Prism/);
    assert.match(html, /API health/);
    assert.match(html, /http:\/\/prism-server\.local:18788\/\?x=&lt;tag&gt;/);
    assert.doesNotMatch(html, /href="[^"]*<tag>/);
  });

  it("can generate QR-backed landing HTML", async () => {
    const html = await buildApiRootLandingHtml({
      hostHeader: "192.168.1.20:18787",
      apiPort: 18787,
      webPort: 18788,
    });

    assert.match(html, /data:image\/png;base64,/);
    assert.match(html, /http:\/\/192\.168\.1\.20:18788/);
  });
});
