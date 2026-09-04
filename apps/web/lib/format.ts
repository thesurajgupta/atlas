export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** §11: golden-hour position is minutes elapsed since estimated fraud
 * initiation. Rendered as "Xh Ym" so it reads instantly, no calculation
 * required of the investigator. */
export function formatGoldenHour(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** §15.5: "Do not output unsupported precision. 0.31 — not 0.3147." */
export function formatProbability(p: number): string {
  return p.toFixed(2);
}

export function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function formatTypology(typology: string): string {
  return typology
    .toLowerCase()
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatChannel(channel: string): string {
  const known: Record<string, string> = {
    ATM: "ATM",
    AEPS_BC: "AePS / BC agent",
    BANK_BRANCH: "Bank branch",
    POS_CASHBACK: "POS cashback",
    MERCHANT_QR: "Merchant QR",
    PREPAID_GIFT: "Prepaid / gift card",
    CRYPTO_P2P: "Crypto P2P",
  };
  return known[channel] ?? channel;
}
