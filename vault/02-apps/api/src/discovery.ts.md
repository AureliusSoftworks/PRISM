---
title: "apps/api/src/discovery.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/discovery.ts"
status: "active"
---

# apps/api/src/discovery.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/health.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/discovery.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/discovery.ts`

## Import references
- `dnssd-advertise`
- `@localai/config`
- `./health.ts`

## Source preview
```text
import { advertise, type AdvertiseOptions } from "dnssd-advertise";
import type { AppConfig } from "@localai/config";
import { PRISM_API_VERSION, PRISM_SERVER_VERSION } from "./health.ts";

export const PRISM_DISCOVERY_TYPE = "prism";
export const PRISM_DISCOVERY_PROTOCOL = "tcp";

export interface DiscoveryServiceDescriptor {
  serviceType: "_prism._tcp";
  options: AdvertiseOptions;
}

export type StopDiscovery = () => Promise<void>;

export function buildDiscoveryTxt(): Record<string, string> {
  return {
    api: String(PRISM_API_VERSION),
    version: PRISM_SERVER_VERSION,
    pairing: "required",
    tls: "optional",
  };
}

export function buildDiscoveryServiceDescriptor(
  config: AppConfig
): DiscoveryServiceDescriptor {
  const serverName = config.serverName ?? process.env.PRISM_SERVER_NAME ?? "Prism Server";
  return {
    serviceType: "_prism._tcp",
    options: {
      name: serverName,
      type: PRISM_DISCOVERY_TYPE,
      protocol: PRISM_DISCOVERY_PROTOCOL,
      port: config.apiPort,
      txt: buildDiscoveryTxt(),
    },
  };
}

export function startPrismDiscovery(
  config: AppConfig,
  advertiseService: typeof advertise = advertise
): StopDiscovery | null {
  if (config.discoveryEnabled === false) {
    console.log("Prism LAN discovery disabled.");
    return null;
  }

  const descriptor = buildDiscoveryServiceDescriptor(config);
  try {
    const stop = a

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
