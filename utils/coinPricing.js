export const PRICING_CODES = {
  REQUIRED: "amount_required",
  INVALID: "amount_invalid",
  NOT_POSITIVE: "amount_not_positive",
  TOO_PRECISE: "amount_too_precise",
  BELOW_MIN: "below_minimum",
  ABOVE_MAX: "above_maximum",
  UNAVAILABLE: "pricing_unavailable",
};

export function readPricing(config) {
  const raw = config && config.custom_purchase;
  if (!raw || !raw.enabled) return null;
  const rate = Number(raw.coins_per_birr);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const min = Number(raw.min_etb);
  const max = Number(raw.max_etb);
  return {
    coinsPerBirr: rate,
    minEtb: Number.isFinite(min) ? min : 0,
    maxEtb: Number.isFinite(max) ? max : Infinity,
    decimals: Number.isFinite(Number(raw.decimal_places))
      ? Number(raw.decimal_places)
      : 2,
  };
}

export function quoteCoins(input, pricing, packages) {
  if (!pricing) {
    return {
      ok: false,
      code: PRICING_CODES.UNAVAILABLE,
      message: "Coin pricing is unavailable right now.",
    };
  }

  const raw = typeof input === "string" ? input.trim() : input;
  if (raw === "" || raw === null || raw === undefined) {
    return {
      ok: false,
      code: PRICING_CODES.REQUIRED,
      message: "Enter an amount in Birr.",
    };
  }

  if (!/^\d*\.?\d*$/.test(String(raw))) {
    return {
      ok: false,
      code: PRICING_CODES.INVALID,
      message: "Enter a valid amount in Birr.",
    };
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount)) {
    return {
      ok: false,
      code: PRICING_CODES.INVALID,
      message: "Enter a valid amount in Birr.",
    };
  }
  if (amount <= 0) {
    return {
      ok: false,
      code: PRICING_CODES.NOT_POSITIVE,
      message: "Enter an amount greater than 0.",
    };
  }

  const decimalsTyped = (String(raw).split(".")[1] || "").length;
  if (decimalsTyped > pricing.decimals) {
    return {
      ok: false,
      code: PRICING_CODES.TOO_PRECISE,
      message: `Amounts can have at most ${pricing.decimals} decimal places.`,
    };
  }

  if (amount < pricing.minEtb) {
    return {
      ok: false,
      code: PRICING_CODES.BELOW_MIN,
      message: `The smallest purchase is ${formatBirr(pricing.minEtb)} Birr.`,
    };
  }
  if (amount > pricing.maxEtb) {
    return {
      ok: false,
      code: PRICING_CODES.ABOVE_MAX,
      message: `The largest purchase is ${formatBirr(pricing.maxEtb)} Birr.`,
    };
  }

  const cents = Math.round(amount * 100);
  const coins = Math.floor((cents * pricing.coinsPerBirr) / 100);
  if (coins <= 0) {
    return {
      ok: false,
      code: PRICING_CODES.BELOW_MIN,
      message: `${formatBirr(amount)} Birr is too small to buy a coin.`,
    };
  }

  const matched = (Array.isArray(packages) ? packages : []).find(
    (p) => Math.round(Number(p._priceEtb ?? p.price_etb) * 100) === cents,
  );
  if (matched) {
    const total = Number(matched._totalCoins ?? matched.total_coins ?? 0);
    if (Number.isFinite(total) && total > 0) {
      return {
        ok: true,
        amount,
        coins: total,
        bonusCoins: Number(matched._bonusCoins ?? matched.bonus_coins ?? 0),
        matchedPackage: matched,
      };
    }
  }

  return { ok: true, amount, coins, bonusCoins: 0, matchedPackage: null };
}

export function formatBirr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
