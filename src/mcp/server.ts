import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config } from '../config';
import { getWeather, formatWeatherReport } from './tools/get-weather';
import { getEarthquakes, formatEarthquakeReport } from './tools/get-earthquakes';
import { searchNews, formatNewsReport } from './tools/search-news';
import { findResources, formatResourceReport } from './tools/find-resources';
import {
  createCrisis,
  updateCrisis,
  getCrisisById,
  getActiveCrises,
  createIntelUpdate,
  createResource,
} from '../db/queries';

// ── MCP Server Setup ──────────────────────────────────────────────────────────

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'resq-ai-mcp',
    version: '1.0.0',
  });

  // ── Tool: Get Weather ───────────────────────────────────────────────────────
  server.tool(
    'get_weather',
    'Get current weather conditions and alerts for a location. Returns temperature, conditions, wind, humidity, and any active weather alerts.',
    { location: z.string().describe('City name or location (e.g., "Austin, TX", "Miami, FL")') },
    async ({ location }) => {
      const weather = await getWeather(location);
      return { content: [{ type: 'text', text: formatWeatherReport(weather) }] };
    }
  );

  // ── Tool: Get Earthquakes ────────────────────────────────────────────────────
  server.tool(
    'get_earthquakes',
    'Fetch recent earthquake data from USGS for a region. Returns magnitude, location, depth, and tsunami risk.',
    {
      location: z.string().describe('Region to check (e.g., "California", "Japan", "Texas")'),
      days: z.number().default(7).describe('Number of past days to query (default: 7)'),
      min_magnitude: z.number().default(3.0).describe('Minimum magnitude threshold (default: 3.0)'),
    },
    async ({ location, days, min_magnitude }) => {
      const data = await getEarthquakes(location, days, min_magnitude);
      return { content: [{ type: 'text', text: formatEarthquakeReport(data) }] };
    }
  );

  // ── Tool: Search News ────────────────────────────────────────────────────────
  server.tool(
    'search_news',
    'Search real-time news articles relevant to a crisis. Returns top articles with title, description, source, and URL.',
    {
      query: z.string().describe('Search query (e.g., "flood evacuation", "wildfire containment")'),
      location: z.string().describe('Location to focus the search on'),
    },
    async ({ query, location }) => {
      const news = await searchNews(query, location);
      return { content: [{ type: 'text', text: formatNewsReport(news) }] };
    }
  );

  // ── Tool: Find Resources ─────────────────────────────────────────────────────
  server.tool(
    'find_resources',
    'Query the resource database for a specific crisis. Returns available volunteers, vehicles, shelters, medical supplies, etc.',
    {
      crisis_id: z.string().describe('The crisis ID to query resources for'),
      resource_type: z.string().optional().describe('Filter by type: volunteer, vehicle, shelter, medical, food, water'),
      status: z.string().optional().describe('Filter by status: available, allocated, depleted'),
    },
    async ({ crisis_id, resource_type, status }) => {
      const result = await findResources(crisis_id, resource_type, status);
      return { content: [{ type: 'text', text: formatResourceReport(result) }] };
    }
  );

  // ── Tool: Create Crisis ──────────────────────────────────────────────────────
  server.tool(
    'create_crisis',
    'Create a new crisis record in the database. Returns the created crisis with its ID.',
    {
      type: z.string().describe('Crisis type: flood, wildfire, earthquake, hurricane, tornado, pandemic, etc.'),
      location: z.string().describe('Location/region of the crisis'),
      severity: z.enum(['low', 'medium', 'high', 'critical']).default('high'),
      summary: z.string().optional().describe('Initial situation summary'),
    },
    async ({ type, location, severity, summary }) => {
      const crisis = createCrisis({ type, location, severity, summary });
      return {
        content: [{
          type: 'text',
          text: `Crisis created successfully.\nID: ${crisis.id}\nType: ${crisis.type}\nLocation: ${crisis.location}\nSeverity: ${crisis.severity}\nStatus: ${crisis.status}`,
        }],
      };
    }
  );

  // ── Tool: Get Crisis Status ──────────────────────────────────────────────────
  server.tool(
    'get_crisis_status',
    'Get the current status and details of a crisis by ID.',
    {
      crisis_id: z.string().describe('The crisis ID to look up'),
    },
    async ({ crisis_id }) => {
      const crisis = getCrisisById(crisis_id) ?? getActiveCrises().find((c) => c.id.startsWith(crisis_id));
      if (!crisis) return { content: [{ type: 'text', text: `Crisis ${crisis_id} not found.` }] };
      return {
        content: [{
          type: 'text',
          text: `Crisis Status:\nID: ${crisis.id}\nType: ${crisis.type}\nLocation: ${crisis.location}\nSeverity: ${crisis.severity}\nStatus: ${crisis.status}\nStarted: ${new Date(crisis.started_at).toISOString()}\nSummary: ${crisis.summary ?? 'None'}`,
        }],
      };
    }
  );

  // ── Tool: Update Crisis ──────────────────────────────────────────────────────
  server.tool(
    'update_crisis',
    'Update a crisis status or summary.',
    {
      crisis_id: z.string().describe('The crisis ID to update'),
      status: z.enum(['ACTIVE', 'CONTAINED', 'RESOLVED', 'CANCELLED']).optional(),
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      summary: z.string().optional().describe('Updated situation summary'),
    },
    async ({ crisis_id, status, severity, summary }) => {
      updateCrisis(crisis_id, { status, severity, summary });
      return { content: [{ type: 'text', text: `Crisis ${crisis_id} updated successfully.` }] };
    }
  );

  // ── Tool: Log Intel Update ───────────────────────────────────────────────────
  server.tool(
    'log_intel_update',
    'Log an intelligence update for a crisis (news, weather, seismic, or manual report).',
    {
      crisis_id: z.string().describe('Crisis ID this update belongs to'),
      source: z.enum(['weather', 'news', 'usgs', 'manual']),
      title: z.string().describe('Brief title for this update'),
      content: z.string().describe('Full content of the update'),
      severity: z.string().optional(),
      url: z.string().optional(),
    },
    async ({ crisis_id, source, title, content, severity, url }) => {
      const update = createIntelUpdate({ crisisId: crisis_id, source, title, content, severity, url });
      return { content: [{ type: 'text', text: `Intel update logged. ID: ${update.id}` }] };
    }
  );

  // ── Tool: Log Resource ───────────────────────────────────────────────────────
  server.tool(
    'log_resource',
    'Log a new resource for a crisis (volunteers, vehicles, shelters, medical supplies, etc.).',
    {
      crisis_id: z.string().describe('Crisis ID this resource belongs to'),
      type: z.string().describe('Resource type: volunteer, vehicle, shelter, medical, food, water'),
      name: z.string().describe('Resource name or description'),
      quantity: z.number().default(1),
      unit: z.string().default('units').describe('Unit of measurement (people, trucks, beds, etc.)'),
      location: z.string().optional().describe('Where this resource is located'),
      contact: z.string().optional().describe('Contact person or number'),
    },
    async ({ crisis_id, type, name, quantity, unit, location, contact }) => {
      const resource = createResource({ crisisId: crisis_id, type, name, quantity, unit, location, contact });
      return { content: [{ type: 'text', text: `Resource logged. ID: ${resource.id}\n${name}: ${quantity} ${unit}` }] };
    }
  );

  return server;
}

// ── HTTP Transport Server ─────────────────────────────────────────────────────

export async function startMcpHttpServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  const mcpServer = createMcpServer();

  // Stateless MCP endpoint (one transport per request)
  app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });
    res.on('close', () => transport.close());

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/health', (_, res) => {
    res.json({ status: 'ok', server: 'resq-ai-mcp', version: '1.0.0' });
  });

  app.listen(config.app.mcpPort, () => {
    console.log(`🔧 MCP Server running on http://localhost:${config.app.mcpPort}/mcp`);
  });
}

// ── Standalone entrypoint ─────────────────────────────────────────────────────

if (require.main === module) {
  // Load env when running standalone
  require('dotenv').config();
  startMcpHttpServer().catch(console.error);
}
