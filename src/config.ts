import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  slack: {
    botToken: required('SLACK_BOT_TOKEN'),
    signingSecret: required('SLACK_SIGNING_SECRET'),
    appToken: required('SLACK_APP_TOKEN'),
  },
  groq: {
    apiKey: required('GROQ_API_KEY'),
    model: optional('GROQ_MODEL', 'llama-3.3-70b-versatile'),
  },
  apis: {
    openWeatherKey: optional('OPENWEATHER_API_KEY', ''),
    newsApiKey: optional('NEWS_API_KEY', ''),
  },
  app: {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: parseInt(optional('PORT', '3000'), 10),
    mcpPort: parseInt(optional('MCP_SERVER_PORT', '3001'), 10),
    a2aPort: parseInt(optional('A2A_SERVER_PORT', '3002'), 10),
    a2aBaseUrl: optional('A2A_BASE_URL', 'http://localhost:3002'),
    mcpServerUrl: optional('MCP_SERVER_URL', 'http://localhost:3001'),
  },
  db: {
    path: optional('DB_PATH', './data/resq.db'),
  },
  crisis: {
    intelPollIntervalMinutes: parseInt(
      optional('INTEL_POLL_INTERVAL_MINUTES', '5'),
      10
    ),
    defaultSeverity: optional('DEFAULT_CRISIS_SEVERITY', 'high') as
      | 'low'
      | 'medium'
      | 'high'
      | 'critical',
  },
} as const;

export type Config = typeof config;
