import type { MarketplaceCode } from "@/lib/omni/marketplace";
import { shopeeConnector } from "../shopee";
import { lazadaConnector } from "../lazada";
import { tiktokConnector } from "../tiktok";
import { facebookConnector } from "../facebook";
import type { MarketplaceConnector } from "./types";

/** Marketplace code → connector (P6.2 Shopee / Lazada, P6.3 TikTok Shop / Facebook catalog) */
const CONNECTORS: Record<MarketplaceCode, MarketplaceConnector> = {
  shopee: shopeeConnector,
  lazada: lazadaConnector,
  tiktok: tiktokConnector,
  facebook: facebookConnector,
};

export function connectorFor(code: MarketplaceCode): MarketplaceConnector {
  return CONNECTORS[code];
}
