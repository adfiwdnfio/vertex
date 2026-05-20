import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");

const stooqFields = "sd2t2ohlcvp";

const stooqMap = [
  { bucket: "quotes", key: "SPX", symbol: "^spx", name: "S&P 500" },
  { bucket: "quotes", key: "COMP", symbol: "^ndq", name: "NASDAQ" },
  { bucket: "quotes", key: "DJI", symbol: "^dji", name: "DOW" },
  { bucket: "quotes", key: "GOLD", symbol: "xauusd", name: "Gold" },
  { bucket: "quotes", key: "OIL", symbol: "cl.f", name: "Oil" },
  { bucket: "quotes", key: "VIX", symbol: "vi.f", name: "VIX" },
  { bucket: "futures", key: "ES", symbol: "es.f", name: "S&P Futures" },
  { bucket: "futures", key: "NQ", symbol: "nq.f", name: "Nasdaq Futures" },
  { bucket: "futures", key: "YM", symbol: "ym.f", name: "Dow Futures" },
  { bucket: "futures", key: "GC", symbol: "gc.f", name: "Gold Futures" },
  { bucket: "futures", key: "CL", symbol: "cl.f", name: "Oil Futures" },
  { bucket: "futures", key: "VX", symbol: "vi.f", name: "VIX Futures" }
];

function csvCell(line) {
  return line.split(",").map((v) => v.trim());
}

function quoteFromStooq(row, fallbackName) {
  const close = Number(row[6]);
  const prev = Number(row[8]);
  if (!Number.isFinite(close) || !Number.isFinite(prev) || prev <= 0) return null;
  const change = close - prev;
  return {
    name: fallbackName,
    price: close,
    prevClose: prev,
    change,
    pct: (change / prev) * 100
  };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Vertex dashboard data updater"
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function fetchStooq(symbol, name) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=${stooqFields}&h&e=csv`;
  const text = await fetchText(url);
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  return quoteFromStooq(csvCell(lines[1]), name);
}

async function fetchCoinGeckoBtc() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Vertex dashboard data updater"
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for CoinGecko BTC`);
  const data = await res.json();
  const price = Number(data?.bitcoin?.usd);
  const pct = Number(data?.bitcoin?.usd_24h_change);
  if (!Number.isFinite(price) || !Number.isFinite(pct)) return null;
  const prevClose = price / (1 + pct / 100);
  return {
    name: "BTC",
    price,
    prevClose,
    change: price - prevClose,
    pct
  };
}

async function main() {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    sources: ["Stooq", "CoinGecko"],
    quotes: {},
    futures: {}
  };

  const results = await Promise.allSettled(stooqMap.map(async (item) => {
    const quote = await fetchStooq(item.symbol, item.name);
    if (quote) snapshot[item.bucket][item.key] = quote;
  }));

  const failures = results.filter((r) => r.status === "rejected").map((r) => String(r.reason));
  const btc = await fetchCoinGeckoBtc().catch((err) => {
    failures.push(String(err));
    return null;
  });
  if (btc) snapshot.quotes.BTC = btc;
  if (btc) snapshot.futures.BTC = btc;

  snapshot.errors = failures.slice(0, 5);

  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, "markets.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote data/markets.json with ${Object.keys(snapshot.quotes).length} quotes and ${Object.keys(snapshot.futures).length} futures.`);
  if (failures.length) console.warn(failures.join("\n"));
}

await main();
