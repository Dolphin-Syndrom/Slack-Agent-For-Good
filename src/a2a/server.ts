import express, { Router } from 'express';
import { config } from '../config';
import { buildAgentCard, AGENT_IDS } from './agent-card';
import { intelAgent } from '../agents/intel-agent';
import { resourceAgent } from '../agents/resource-agent';
import { commsAgent } from '../agents/comms-agent';
import { reportAgent } from '../agents/report-agent';
import { orchestratorAgent } from '../agents/orchestrator';

// ── A2A Task Handler Registry ─────────────────────────────────────────────────

type TaskHandler = (skill: string, input: unknown) => Promise<unknown>;

const agentHandlers: Record<string, TaskHandler> = {
  [AGENT_IDS.ORCHESTRATOR]: (skill, input) => orchestratorAgent.handleA2ATask(skill, input),
  [AGENT_IDS.INTEL]: (skill, input) => intelAgent.handleA2ATask(skill, input),
  [AGENT_IDS.RESOURCE]: (skill, input) => resourceAgent.handleA2ATask(skill, input),
  [AGENT_IDS.COMMS]: (skill, input) => commsAgent.handleA2ATask(skill, input),
  [AGENT_IDS.REPORT]: (skill, input) => reportAgent.handleA2ATask(skill, input),
};

// ── A2A Router ────────────────────────────────────────────────────────────────

export function createA2ARouter(): Router {
  const router = express.Router();

  // Agent Card Discovery (GET /.well-known/agent.json or GET /a2a/:agentId)
  router.get('/:agentId', (req, res) => {
    const { agentId } = req.params;
    if (!agentHandlers[agentId]) {
      res.status(404).json({ error: `Agent "${agentId}" not found` });
      return;
    }
    const card = buildAgentCard(agentId as any, config.app.a2aBaseUrl);
    res.json(card);
  });

  // Task Submission (POST /a2a/:agentId)
  router.post('/:agentId', async (req, res) => {
    const { agentId } = req.params;
    const handler = agentHandlers[agentId];

    if (!handler) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Agent "${agentId}" not found` },
        id: req.body?.id ?? null,
      });
      return;
    }

    const { method, params, id } = req.body ?? {};

    if (method !== 'tasks/send') {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Unknown method: ${method}` },
        id: id ?? null,
      });
      return;
    }

    const skill = params?.skill ?? 'default';
    const input = params?.message?.parts?.[0]?.text ?? params?.message ?? params;

    try {
      const result = await handler(skill, input);
      res.json({ jsonrpc: '2.0', result, id: id ?? null });
    } catch (err) {
      console.error(`[A2A] Error in agent ${agentId}:`, err);
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: (err as Error).message },
        id: id ?? null,
      });
    }
  });

  return router;
}

// ── Well-Known Agent Discovery ────────────────────────────────────────────────

export function registerWellKnown(app: express.Application): void {
  app.get('/.well-known/agent.json', (_, res) => {
    res.json(buildAgentCard(AGENT_IDS.ORCHESTRATOR, config.app.a2aBaseUrl));
  });
}
