import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "keyword-data");

const API_URL = "https://api.keywordseverywhere.com/v1/get_keyword_data";

const KWE_API_KEY = process.env.KWE_API_KEY;
if (!KWE_API_KEY) {
  console.error("ERROR: KWE_API_KEY environment variable is not set.");
  process.exit(1);
}

// ── Keyword lists per locale ────────────────────────────────────────

interface LocaleConfig {
  code: string;
  country: string;
  currency: string;
  keywords: string[];
}

const LOCALES: LocaleConfig[] = [
  {
    code: "en",
    country: "us",
    currency: "USD",
    keywords: [
      "trend analysis",
      "AI market research",
      "market trend analyzer",
      "knowledge graph",
      "real-time market analysis",
      "market research tool",
      "stock analysis tool",
      "evidence graph",
      "trend analyzer tool",
      "trending market topics",
      "market analysis today",
      "stock market trends",
      "AI trend analysis",
      "evidence-based research",
      "market intelligence",
    ],
  },
  {
    code: "es",
    country: "mx",
    currency: "MXN",
    keywords: [
      "analisis de tendencias",
      "investigacion de mercado IA",
      "herramienta de tendencias",
      "analisis de mercado",
      "tendencias de mercado",
      "inteligencia de mercado",
      "analisis de acciones",
      "grafico de evidencia",
      "analisis en tiempo real",
      "noticias del mercado",
    ],
  },
  {
    code: "zh",
    country: "cn",
    currency: "CNY",
    keywords: [
      "趋势分析",
      "市场研究AI",
      "实时市场分析",
      "知识图谱",
      "AI市场研究",
      "市场趋势分析",
      "股票分析工具",
      "证据图谱",
      "市场情报分析",
      "热门市场话题",
    ],
  },
];

// ── Types ───────────────────────────────────────────────────────────

interface KeywordResult {
  keyword: string;
  volume: number;
  cpc: number;
  competition: number;
  trend: number[];
}

interface ApiDataItem {
  keyword: string;
  vol: number;
  cpc: { value: string | number; currency: string };
  competition: number;
  trend: { month: string; year: number; value: number }[];
}

// ── Fetch keyword data for one locale ───────────────────────────────

async function fetchKeywordData(locale: LocaleConfig): Promise<KeywordResult[]> {
  console.log(`Fetching ${locale.code} (${locale.country}): ${locale.keywords.length} keywords...`);

  const body = new URLSearchParams();
  // API expects keywords[] as repeated params or comma-separated
  // Using the kw[] format documented for form-encoded requests
  for (const kw of locale.keywords) {
    body.append("kw[]", kw);
  }
  body.append("country", locale.country);
  body.append("currency", locale.currency);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KWE_API_KEY}`,
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`API returned ${res.status} for ${locale.code}: ${text}`);
  }

  const json = await res.json();
  const data: ApiDataItem[] = json.data ?? json;

  return data.map((item) => ({
    keyword: item.keyword,
    volume: item.vol ?? 0,
    cpc: typeof item.cpc === "object" ? Number(item.cpc.value) : Number(item.cpc ?? 0),
    competition: item.competition ?? 0,
    trend: Array.isArray(item.trend) ? item.trend.map((t) => t.value) : [],
  }));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  let hasError = false;

  for (const locale of LOCALES) {
    try {
      const results = await fetchKeywordData(locale);
      const outPath = resolve(OUT_DIR, `${locale.code}.json`);
      writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
      console.log(`  ✓ Wrote ${results.length} keywords → ${outPath}`);
    } catch (err) {
      console.error(`  ✗ Failed for ${locale.code}:`, err instanceof Error ? err.message : err);
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log("Done.");
}

main();
