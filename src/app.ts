import 'dotenv/config';
import { App } from '@slack/bolt';
import express from 'express';
import { config } from './config';
import { getDb } from './db/schema';
import { registerCommands } from './slack/commands';
import { registerActions } from './slack/actions';
import { registerEvents, registerViews } from './slack/views';
import { createA2ARouter, registerWellKnown } from './a2a/server';
import { startMcpHttpServer } from './mcp/server';

async function main(): Promise<void> {
  console.log('🚨 Starting ResQ AI — Multi-Agent Crisis Response Coordinator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Initialize database
  console.log('🗄️  Initializing database...');
  getDb();
  console.log(`   ✓ SQLite database ready at ${config.db.path}`);

  // 2. Start MCP HTTP server
  console.log('🔧  Starting MCP server...');
  await startMcpHttpServer();

  // 3. Create Slack Bolt app (Socket Mode for local dev)
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
    port: config.app.port,
  });

  // 4. Register all Slack handlers
  console.log('⚡  Registering Slack handlers...');
  registerCommands(app);
  registerActions(app);
  registerEvents(app);
  registerViews(app);
  console.log('   ✓ Commands: /crisis, /resq');
  console.log('   ✓ Actions: approve_draft, add_resource, resolve_crisis, crisis_status');
  console.log('   ✓ Events: app_home_opened, app_mention');
  console.log('   ✓ Views: add_resource_modal, activate_crisis_modal');

  // 5. Create Express app for A2A server (runs on separate port)
  const expressApp = express();
  expressApp.use(express.json());

  // A2A agent endpoints
  expressApp.use('/a2a', createA2ARouter());

  // Well-known agent card
  registerWellKnown(expressApp);

  // Health check
  expressApp.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      service: 'resq-ai',
      version: '1.0.0',
      agents: ['orchestrator', 'intel', 'resource', 'comms', 'report'],
      mcp: `http://localhost:${config.app.mcpPort}/mcp`,
      a2a: `http://localhost:${config.app.a2aPort}/a2a`,
    });
  });

  // Start A2A + API server
  expressApp.listen(config.app.a2aPort, () => {
    console.log(`🤖  A2A server running on http://localhost:${config.app.a2aPort}`);
    console.log(`    Agent cards available at:`);
    console.log(`    → http://localhost:${config.app.a2aPort}/.well-known/agent.json`);
    console.log(`    → http://localhost:${config.app.a2aPort}/a2a/{intel,resource,comms,report,orchestrator}`);
  });

  // 6. Start Slack Bolt app
  await app.start();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅  ResQ AI is live! (Socket Mode — no public URL needed)');
  console.log('');
  console.log('📋  Quick Test:');
  console.log('    1. In Slack, type: /crisis activate flood "Austin TX" high');
  console.log('    2. Watch agents gather intel and allocate resources');
  console.log('    3. Type /resq report to generate a SITREP');
  console.log('');
  console.log('🔍  Services:');
  console.log(`    MCP Server:  http://localhost:${config.app.mcpPort}/mcp`);
  console.log(`    A2A Server:  http://localhost:${config.app.a2aPort}/a2a`);
  console.log(`    Health:      http://localhost:${config.app.a2aPort}/health`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error starting ResQ AI:', err);
  process.exit(1);
});
