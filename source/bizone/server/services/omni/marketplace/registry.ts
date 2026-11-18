import type { MarketplaceCode } from "@/lib/omni/marketplace";
import { shopeeConnector } from "../shopee";
import { lazadaConnector } from "../lazada";
import type { MarketplaceConnector } from "./types";

/** Marketplace code → connector (P6.2). TikTok Shop / Facebook join here in P6.3. */
const CONNECTORS: Record<MarketplaceCode, MarketplaceConnector> = {
  shopee: shopeeConnector,
  lazada: lazadaConnector,
};

export function connectorFor(code: MarketplaceCode): MarketplaceConnector {
  return CONNECTORS[code];
}
