export const BOOST_DURATIONS = [
  { hours: 12, label: "12 Hours", fallbackCost: 100 },
  { hours: 24, label: "24 Hours", fallbackCost: 170 },
  { hours: 72, label: "3 Days", fallbackCost: 300 },
];

export const DEFAULT_TARGETING = {
  target_gender: "all",
  target_age_min: null,
  target_age_max: null,
  target_location: null,
};

export function targetingKey(t) {
  return [
    t?.target_gender || "all",
    t?.target_age_min ?? "",
    t?.target_age_max ?? "",
    t?.target_location ?? "",
  ].join("|");
}

export function toCoins(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function pricingFromConfig(config) {
  const table = {};
  if (!config || typeof config !== "object") return table;

  const list = config.duration_options || config.durations || config.options;
  if (Array.isArray(list)) {
    for (const item of list) {
      const hours = toCoins(
        item?.hours ?? item?.duration_hours ?? item?.duration,
      );
      const cost = toCoins(
        item?.cost ?? item?.coins ?? item?.price ?? item?.coin_cost,
      );
      if (hours && cost !== null) table[hours] = cost;
    }
  }

  const map = config.pricing || config.costs || config.duration_costs;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    for (const [key, value] of Object.entries(map)) {
      const hours = toCoins(key);
      const cost = toCoins(value);
      if (hours && cost !== null) table[hours] = cost;
    }
  }

  return table;
}

export function resolveDurationCosts({ calculated = {}, config = null } = {}) {
  const fromConfig = pricingFromConfig(config);
  const out = {};
  for (const d of BOOST_DURATIONS) {
    const live = toCoins(calculated[d.hours]);
    out[d.hours] = {
      cost: live ?? fromConfig[d.hours] ?? d.fallbackCost,
      exact: live !== null && live !== undefined,
    };
  }
  return out;
}
export function formatCoins(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
}
