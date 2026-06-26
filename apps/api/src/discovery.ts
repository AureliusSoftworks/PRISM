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
    pairing: "disabled",
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
  // Discovery is a sub-behavior of local-network access: it must never advertise
  // while the server is private to the host machine, and it can still be opted
  // out independently via PRISM_DISCOVERY_ENABLED even when LAN access is on.
  if (config.lanAccessEnabled !== true) {
    console.log("Prism LAN discovery disabled (local-only mode).");
    return null;
  }
  if (config.discoveryEnabled === false) {
    console.log("Prism LAN discovery disabled.");
    return null;
  }

  const descriptor = buildDiscoveryServiceDescriptor(config);
  try {
    const stop = advertiseService(descriptor.options);
    console.log(
      `Prism LAN discovery advertising ${descriptor.serviceType} as "${descriptor.options.name}" on port ${config.apiPort}`
    );
    return stop;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Prism LAN discovery failed to start: ${message}`);
    return null;
  }
}
