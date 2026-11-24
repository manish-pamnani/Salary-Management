import { createContext, useContext } from "react";
import type { Meta } from "./api";

export const MetaContext = createContext<Meta | null>(null);

/** Filter options and the org calendar's "today", loaded once at start-up. */
export function useMeta(): Meta {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error("useMeta must be used inside <MetaContext.Provider>");
  return meta;
}

export function exponentOf(meta: Meta, currency: string): number {
  return meta.currencies.find((c) => c.code === currency)?.minorUnitExponent ?? 2;
}
