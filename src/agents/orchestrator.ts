import type { App } from '@slack/bolt';
import { createCrisis, updateCrisis, getCrisisById, getActiveCrises } from '../db/queries';
import { intelAgent } from './intel-agent';
import { resourceAgent } from './resource-agent';
import { commsAgent } from './comms-agent';
import { reportAgent } from './report-agent';
import { dispatchToAgents } from '../a2a/client';
import { AGENT_IDS } from '../a2a/agent-card';
import {
  buildCrisisActivatedBlocks,
  buildIntelUpdateBlocks,
  buildResourceSummaryBlocks,
  buildSitRepBlocks,
  buildCommsDraftBlocks,
  buildStatusDashboardBlocks,
} from '../utils/formatter';
import { getIntelByCrisis, getResourcesByCrisis } from '../db/queries';

// ── Crisis Activation ─────────────────────────────────────────────────────────

export type ActivationInput = {
  crisisType: string;
  location: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  requestedBy?: string;
  slackChannelId?: string;
  slackChannelName?: string;
  app?: App;
};

export type ActivationOutput = {
  crisisId: string;
  crisisChannelId?: string;
  status: 'activated' | 'error';
  message: string;
};

async function activate(input: ActivationInput): Promise<ActivationOutput> {
  const { crisisType, location, severity = 'high', requestedBy, slackChannelId, slackChannelName, app } = input;

  console.log(`[Orchestrator] Activating ${crisisType} crisis in ${location} (${severity})`);

  // 1. Create crisis record
  const crisis = createCrisis({
    type: crisisType,
    location,
    severity,
    slackChannelId,
    slackChannelName,
    summary: `${crisisType} crisis activated in ${location}. Agents being dispatched.`,
  });

  // 2. Try to create a dedicated Slack channel if we have the app
  let crisisChannelId: string | undefined = slackChannelId;

  if (app) {
    try {
      const channelName = `crisis-${crisisType.toLowerCase().replace(/\s+/g, '-')}-${location
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .slice(0, 20)}-${Date.now().toString().slice(-4)}`;

      const channelResult = await app.client.conversations.create({
        name: channelName,
        is_private: false,
      });

      crisisChannelId = channelResult.channel?.id;
      const crisisChannelName = channelResult.channel?.name ?? channelName;

      // Update crisis with channel info
      updateCrisis(crisis.id, {
        slack_channel_id: crisisChannelId,
        slack_channel_name: crisisChannelName,
      });

      // Post activation card to crisis channel
      if (crisisChannelId) {
        const updatedCrisis = getCrisisById(crisis.id)!;
        await app.client.chat.postMessage({
          channel: crisisChannelId,
          blocks: buildCrisisActivatedBlocks(updatedCrisis) as any,
          text: `🚨 CRISIS ACTIVATED: ${crisisType} in ${location}`,
        });

        // Post progress message
        await app.client.chat.postMessage({
          channel: crisisChannelId,
          text: '🤖 *ResQ AI agents are now gathering intelligence and allocating resources...*\n_This may take 30-60 seconds. Updates will appear below._',
        });
      }
    } catch (err) {
      console.warn('[Orchestrator] Could not create crisis channel:', (err as Error).message);
    }
  }

  // 3. Dispatch Intel + Resource agents in parallel via A2A
  console.log(`[Orchestrator] Dispatching Intel + Resource agents for crisis ${crisis.id}`);

  const agentInput = {
    crisisId: crisis.id,
    crisisType,
    location,
    severity,
  };

  // Run in background (don't await for Slack responsiveness)
  runAgentPipeline(crisis.id, agentInput, crisisChannelId, app).catch((err) =>
    console.error('[Orchestrator] Agent pipeline error:', err)
  );

  return {
    crisisId: crisis.id,
    crisisChannelId,
    status: 'activated',
    message: `Crisis ${crisis.id.slice(0, 8)} activated. Agents dispatched.`,
  };
}

async function runAgentPipeline(
  crisisId: string,
  input: { crisisId: string; crisisType: string; location: string; severity: string },
  channelId?: string,
  app?: App
): Promise<void> {
  try {
    // Phase 1: Intel + Resource in parallel
    const [intelResult, resourceResult] = await Promise.allSettled([
      intelAgent.gatherIntelligence(input),
      resourceAgent.allocateResources({ ...input, affectedPopulation: undefined }),
    ]);

    // Post Intel results to Slack
    if (app && channelId) {
      const intel = getIntelByCrisis(crisisId, 5);
      const crisis = getCrisisById(crisisId)!;

      if (intel.length > 0) {
        await app.client.chat.postMessage({
          channel: channelId,
          blocks: buildIntelUpdateBlocks(crisis, intel) as any,
          text: `🔍 Intelligence update for ${crisis.location}`,
        });
      }

      // Post Resource results
      const resources = getResourcesByCrisis(crisisId);
      if (resources.length > 0) {
        await app.client.chat.postMessage({
          channel: channelId,
          blocks: buildResourceSummaryBlocks(crisis, resources) as any,
          text: `📦 Resource recommendations for ${crisis.location}`,
        });
      }
    }

    // Phase 2: Draft initial public alert
    const commsResult = await commsAgent.draftCommunication({
      crisisId,
      crisisType: input.crisisType,
      location: input.location,
      severity: input.severity,
      draftType: 'public_alert',
    });

    // Post comms draft to Slack
    if (app && channelId) {
      await app.client.chat.postMessage({
        channel: channelId,
        blocks: buildCommsDraftBlocks(
          commsResult.draftId,
          commsResult.title,
          commsResult.content,
          commsResult.draftType
        ) as any,
        text: `📢 Draft public alert ready for ${input.location}`,
      });
    }

    console.log(`[Orchestrator] Agent pipeline complete for crisis ${crisisId}`);
  } catch (err) {
    console.error('[Orchestrator] Pipeline error:', err);
    if (app && channelId) {
      await app.client.chat.postMessage({
        channel: channelId,
        text: `⚠️ Some agents encountered errors during the pipeline. Crisis is still active. Type \`/resq status\` for current state.`,
      });
    }
  }
}

// ── Generate SITREP ───────────────────────────────────────────────────────────

async function generateSitRep(
  crisisId: string,
  channelId: string,
  app: App
): Promise<void> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) {
    await app.client.chat.postMessage({
      channel: channelId,
      text: `❌ Crisis \`${crisisId}\` not found.`,
    });
    return;
  }

  await app.client.chat.postMessage({
    channel: channelId,
    text: '📋 _Generating SITREP... (this takes ~15 seconds)_',
  });

  const result = await reportAgent.generateSitRep({ crisisId });
  const intel = getIntelByCrisis(crisisId, 5);
  const resources = getResourcesByCrisis(crisisId);

  await app.client.chat.postMessage({
    channel: channelId,
    blocks: buildSitRepBlocks(crisis, intel, resources, result.sitrep) as any,
    text: result.title,
  });
}

// ── Get Overview ──────────────────────────────────────────────────────────────

async function getCrisisOverview(): Promise<{ crises: ReturnType<typeof getActiveCrises> }> {
  return { crises: getActiveCrises() };
}

// ── A2A Task Handler ──────────────────────────────────────────────────────────

async function handleA2ATask(skill: string, input: unknown): Promise<unknown> {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;

  switch (skill) {
    case 'activate_crisis':
      return activate(parsed as ActivationInput);
    case 'get_crisis_overview':
      return getCrisisOverview();
    default:
      throw new Error(`Orchestrator Agent: unknown skill "${skill}"`);
  }
}

export const orchestratorAgent = {
  activate,
  generateSitRep,
  getCrisisOverview,
  handleA2ATask,
};
