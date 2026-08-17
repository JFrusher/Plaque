import { get, set } from "idb-keyval";
import type { PrinterProfile } from "../core/print/printerProfile";

/**
 * Printer profiles, per device.
 *
 * Never written into a project file: the profile describes the machine in the
 * room, not the design. Moving a project to another laptop must not carry the
 * old printer's scale factor with it — that would print wrong on the new one and
 * look like Plaque's fault.
 */
const PRINTERS_KEY = "plaque.printers";
const ACTIVE_KEY = "plaque.printer.active";

export async function loadPrinters(): Promise<{ printers: PrinterProfile[]; activeId: string | null }> {
  try {
    const printers = (await get<PrinterProfile[]>(PRINTERS_KEY)) ?? [];
    const activeId = (await get<string>(ACTIVE_KEY)) ?? null;
    return {
      printers: printers.filter(isProfile),
      activeId: printers.some((p) => p.id === activeId) ? activeId : null,
    };
  } catch {
    // Blocked storage. Uncalibrated is the safe default: scale 1 changes nothing.
    return { printers: [], activeId: null };
  }
}

export async function savePrinters(printers: PrinterProfile[], activeId: string | null): Promise<void> {
  await set(PRINTERS_KEY, printers);
  await set(ACTIVE_KEY, activeId);
}

function isProfile(value: unknown): value is PrinterProfile {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p["id"] === "string" && typeof p["name"] === "string" && typeof p["scale"] === "number";
}
