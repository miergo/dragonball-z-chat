/** Minimum system RAM (GB) when `navigator.deviceMemory` is available (Chrome). */
export const MIN_DEVICE_MEMORY_GB = 4;

export type DeviceTier = "live" | "unsupported";

export interface DeviceAssessment {
  tier: DeviceTier;
  reason?: string;
  adapterInfo?: string;
  /** True when deviceMemory was missing; we still allow live if WebGPU works. */
  ramUnknown?: boolean;
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<GpuAdapter | null>;
  };
  deviceMemory?: number;
};

type GpuAdapter = {
  requestAdapterInfo?: () => Promise<{ device?: string; description?: string }>;
};

let cached: DeviceAssessment | null = null;
let inFlight: Promise<DeviceAssessment> | null = null;

/**
 * Probe WebGPU + a rough RAM heuristic. Does not download model weights.
 * Result is cached for the page lifetime.
 */
export async function assessDevice(): Promise<DeviceAssessment> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const nav = navigator as GpuNavigator;
    if (!nav.gpu) {
      return cacheResult({
        tier: "unsupported",
        reason: "This browser has no WebGPU support.",
      });
    }

    let adapter: GpuAdapter | null = null;
    try {
      adapter = await nav.gpu.requestAdapter();
    } catch {
      return cacheResult({
        tier: "unsupported",
        reason: "WebGPU adapter request failed.",
      });
    }

    if (!adapter) {
      return cacheResult({
        tier: "unsupported",
        reason: "No WebGPU adapter available on this device.",
      });
    }

    const adapterInfo = await readAdapterLabel(adapter);
    const deviceMemory = nav.deviceMemory;

    if (typeof deviceMemory === "number") {
      if (deviceMemory < MIN_DEVICE_MEMORY_GB) {
        return cacheResult({
          tier: "unsupported",
          reason: `This device reports only ${deviceMemory} GB RAM (need ~${MIN_DEVICE_MEMORY_GB}+ for the local model).`,
          adapterInfo,
        });
      }
      return cacheResult({
        tier: "live",
        adapterInfo,
      });
    }

    return cacheResult({
      tier: "live",
      adapterInfo,
      ramUnknown: true,
      reason: "WebGPU ok; system RAM unknown — trying the small local model.",
    });
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function getCachedAssessment(): DeviceAssessment | null {
  return cached;
}

/** Test helper / recovery after a soft policy change. */
export function clearDeviceAssessmentCache(): void {
  cached = null;
}

function cacheResult(result: DeviceAssessment): DeviceAssessment {
  cached = result;
  return result;
}

async function readAdapterLabel(adapter: GpuAdapter): Promise<string | undefined> {
  try {
    if (typeof adapter.requestAdapterInfo !== "function") return undefined;
    const info = await adapter.requestAdapterInfo();
    return info.device || info.description || undefined;
  } catch {
    return undefined;
  }
}
