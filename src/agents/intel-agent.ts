import { runAgentLoop, complete, type ToolDefinition } from '../utils/llm';
import { getWeather, formatWeatherReport } from '../mcp/tools/get-weather';
import { getEarthquakes, formatEarthquakeReport } from '../mcp/tools/get-earthquakes';
import { searchNews, formatNewsReport } from '../mcp/tools/search-news';
import { createIntelUpdate, getCrisisById } from '../db/queries';

// ── Tool Definitions ──────────────────────────────────────────────────────────

const INTEL_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather conditions and active alerts for a location.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City or region name' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_earthquakes',
      description: 'Fetch recent earthquake data from USGS for a region.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Region (e.g. California, Japan)' },
          days: { type: 'string', description: 'Number of past days (default: 7)' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_news',
      description: 'Search real-time news for crisis-relevant articles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search terms (e.g. "flood evacuation emergency")' },
          location: { type: 'string', description: 'Location focus for the search' },
        },
        required: ['query', 'location'],
      },
    },
  },
];

// ── Tool Handlers ─────────────────────────────────────────────────────────────

const toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  get_weather: async (args) => {
    const w = await getWeather(args.location as string);
    return formatWeatherReport(w);
  },
  get_earthquakes: async (args) => {
    const d = await getEarthquakes(args.location as string, Number(args.days ?? 7));
    return formatEarthquakeReport(d);
  },
  search_news: async (args) => {
    const n = await searchNews(args.query as string, args.location as string);
    return formatNewsReport(n);
  },
};

// ── Intel Agent ───────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the ResQ Intel Agent — a specialized AI for gathering crisis intelligence.

Your mission: When given a crisis type and location, use your tools to collect comprehensive situational intelligence:
1. Call get_weather to understand current conditions and any active weather alerts
2. Call get_earthquakes if relevant (seismic activity, post-earthquake flooding, etc.)
3. Call search_news with relevant keywords to find the latest crisis coverage

After gathering data, synthesize a concise intelligence briefing:
- Current conditions on the ground
- Key risks and hazards
- Estimated affected population
- Infrastructure status (power, roads, communications)
- Recommended immediate actions

Be specific, factual, and actionable. Focus on information that helps emergency responders make decisions.`;

export type IntelGatherInput = {
  crisisId: string;
  crisisType: string;
  location: string;
  severity: string;
};

export type IntelGatherOutput = {
  crisisId: string;
  briefing: string;
  updateCount: number;
  sources: string[];
};

async function gatherIntelligence(input: IntelGatherInput): Promise<IntelGatherOutput> {
  const { crisisId, crisisType, location, severity } = input;

  const userMessage = `Crisis Intelligence Request:
- Type: ${crisisType}
- Location: ${location}
- Severity: ${severity}
- Crisis ID: ${crisisId}

Please gather comprehensive intelligence for this ${crisisType} crisis in ${location}. Use all available tools to collect weather, seismic, and news data, then synthesize a briefing.`;

  const briefing = await runAgentLoop(
    SYSTEM_PROMPT,
    userMessage,
    INTEL_TOOLS,
    toolHandlers,
    { maxIterations: 8, temperature: 0.2 }
  );

  // Log all intelligence to the database
  const weather = await getWeather(location);
  const news = await searchNews(crisisType, location);
  const earthquakes = await getEarthquakes(location, 7);

  const savedUpdates: string[] = [];

  // Save weather intel
  createIntelUpdate({
    crisisId,
    source: 'weather',
    title: `Weather Conditions — ${location}`,
    content: formatWeatherReport(weather),
    severity: weather.alerts.length > 0 ? 'HIGH' : 'LOW',
    rawData: weather,
  });
  savedUpdates.push('weather');

  // Save news intel
  for (const article of news.articles.slice(0, 3)) {
    createIntelUpdate({
      crisisId,
      source: 'news',
      title: article.title,
      content: article.description,
      url: article.url,
      severity: article.relevanceScore > 3 ? 'HIGH' : 'MEDIUM',
    });
  }
  savedUpdates.push('news');

  // Save seismic intel if significant
  if (earthquakes.count > 0) {
    createIntelUpdate({
      crisisId,
      source: 'usgs',
      title: `Seismic Activity — ${location} (${earthquakes.count} events)`,
      content: formatEarthquakeReport(earthquakes),
      severity: earthquakes.maxMagnitude >= 5.0 ? 'HIGH' : 'LOW',
      rawData: earthquakes,
    });
    savedUpdates.push('usgs');
  }

  // Save the AI briefing as a manual intel update
  createIntelUpdate({
    crisisId,
    source: 'manual',
    title: `AI Intelligence Briefing — ${crisisType} in ${location}`,
    content: briefing,
    severity: severity.toUpperCase(),
  });

  return {
    crisisId,
    briefing,
    updateCount: savedUpdates.length + news.articles.length,
    sources: savedUpdates,
  };
}

// ── A2A Task Handler ──────────────────────────────────────────────────────────

async function handleA2ATask(skill: string, input: unknown): Promise<unknown> {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;

  switch (skill) {
    case 'gather_intel':
      return gatherIntelligence(parsed as IntelGatherInput);
    default:
      throw new Error(`Intel Agent: unknown skill "${skill}"`);
  }
}

export const intelAgent = {
  gatherIntelligence,
  handleA2ATask,
};
