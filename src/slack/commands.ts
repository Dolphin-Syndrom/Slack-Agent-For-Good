import type { App } from '@slack/bolt';
import { orchestratorAgent } from '../agents/orchestrator';
import { reportAgent } from '../agents/report-agent';
import { commsAgent } from '../agents/comms-agent';
import {
  getCrisisById,
  getActiveCrises,
  getAllCrises,
  getIntelByCrisis,
  getResourcesByCrisis,
  updateCrisis,
} from '../db/queries';
import {
  buildCrisisActivatedBlocks,
  buildStatusDashboardBlocks,
  buildIntelUpdateBlocks,
  buildSitRepBlocks,
  buildResourceSummaryBlocks,
} from '../utils/formatter';

export function registerCommands(app: App): void {
  // ── /crisis [activate|status|resolve|list] ────────────────────────────────
  app.command('/crisis', async ({ command, ack, respond, say, client }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase() ?? 'help';

    switch (subCommand) {
      case 'activate': {
        // /crisis activate <type> <location> [severity]
        // e.g. /crisis activate flood "Austin TX" critical
        const rawArgs = command.text.replace(/^activate\s*/i, '').trim();
        const parsed = parseCrisisArgs(rawArgs);

        if (!parsed.type || !parsed.location) {
          await respond({
            response_type: 'ephemeral',
            text: '❌ Usage: `/crisis activate <type> <location> [severity]`\nExample: `/crisis activate flood "Austin TX" critical`',
          });
          return;
        }

        await respond({
          response_type: 'in_channel',
          text: `🚨 *Activating ${parsed.type} crisis in ${parsed.location}...* _Agents are being dispatched._`,
        });

        try {
          const result = await orchestratorAgent.activate({
            crisisType: parsed.type,
            location: parsed.location,
            severity: parsed.severity as any,
            requestedBy: command.user_id,
            slackChannelId: command.channel_id,
            slackChannelName: command.channel_name,
            app,
          });

          if (result.crisisChannelId && result.crisisChannelId !== command.channel_id) {
            await respond({
              response_type: 'in_channel',
              text: `🚨 Crisis activated! Head to <#${result.crisisChannelId}> for the command center.\nCrisis ID: \`${result.crisisId.slice(0, 8)}\``,
            });
          }
        } catch (err) {
          await respond({
            response_type: 'ephemeral',
            text: `❌ Error activating crisis: ${(err as Error).message}`,
          });
        }
        break;
      }

      case 'status': {
        // /crisis status [crisis_id]
        const crisisId = args[1];

        if (crisisId) {
          const crisis = getCrisisById(crisisId) ??
            getActiveCrises().find((c) => c.id.startsWith(crisisId));

          if (!crisis) {
            await respond({ response_type: 'ephemeral', text: `❌ Crisis \`${crisisId}\` not found.` });
            return;
          }

          const intel = getIntelByCrisis(crisis.id, 5);
          const resources = getResourcesByCrisis(crisis.id);

          await respond({
            response_type: 'in_channel',
            blocks: buildIntelUpdateBlocks(crisis, intel) as any,
            text: `Crisis status for ${crisis.location}`,
          });
        } else {
          const crises = getAllCrises();
          await respond({
            response_type: 'in_channel',
            blocks: buildStatusDashboardBlocks(crises) as any,
            text: 'ResQ AI — Crisis Status Dashboard',
          });
        }
        break;
      }

      case 'resolve': {
        // /crisis resolve <crisis_id>
        const crisisId = args[1];
        if (!crisisId) {
          await respond({ response_type: 'ephemeral', text: '❌ Usage: `/crisis resolve <crisis_id>`' });
          return;
        }

        const crisis = getCrisisById(crisisId) ??
          getActiveCrises().find((c) => c.id.startsWith(crisisId));

        if (!crisis) {
          await respond({ response_type: 'ephemeral', text: `❌ Crisis not found: \`${crisisId}\`` });
          return;
        }

        updateCrisis(crisis.id, {
          status: 'RESOLVED',
          resolved_at: Date.now(),
          summary: `Resolved by <@${command.user_id}>`,
        });

        await say({
          blocks: [
            { type: 'header', text: { type: 'plain_text', text: `✅ Crisis Resolved: ${crisis.type} — ${crisis.location}`, emoji: true } },
            { type: 'section', text: { type: 'mrkdwn', text: `Crisis \`${crisis.id.slice(0, 8)}\` has been marked as *RESOLVED* by <@${command.user_id}>.\nAll operations stand down.` } },
          ] as any,
          text: `Crisis ${crisis.id.slice(0, 8)} resolved.`,
        });
        break;
      }

      case 'list': {
        const crises = getAllCrises().slice(0, 10);
        await respond({
          response_type: 'in_channel',
          blocks: buildStatusDashboardBlocks(crises) as any,
          text: 'ResQ AI — All Crises',
        });
        break;
      }

      default: {
        await respond({
          response_type: 'ephemeral',
          text: `🤖 *ResQ AI Commands:*
• \`/crisis activate <type> <location> [severity]\` — Activate a new crisis response
• \`/crisis status [crisis_id]\` — View crisis status
• \`/crisis resolve <crisis_id>\` — Mark crisis as resolved
• \`/crisis list\` — List all crises

• \`/resq report <crisis_id>\` — Generate SITREP
• \`/resq draft <type> <crisis_id>\` — Draft communication
• \`/resq intel <crisis_id>\` — Refresh intelligence

*Crisis Types:* flood, wildfire, earthquake, hurricane, tornado, pandemic, drought
*Severities:* low, medium, high, critical`,
        });
      }
    }
  });

  // ── /resq [report|draft|intel|help] ──────────────────────────────────────
  app.command('/resq', async ({ command, ack, respond, say }) => {
    await ack();

    const args = command.text.trim().split(/\s+/);
    const subCommand = args[0]?.toLowerCase() ?? 'help';

    switch (subCommand) {
      case 'report': {
        // /resq report <crisis_id>
        const crisisId = args[1] ?? getActiveCrises()[0]?.id;
        if (!crisisId) {
          await respond({ response_type: 'ephemeral', text: '❌ No active crises found. Usage: `/resq report <crisis_id>`' });
          return;
        }

        const crisis = getCrisisById(crisisId) ?? getActiveCrises().find((c) => c.id.startsWith(crisisId));
        if (!crisis) {
          await respond({ response_type: 'ephemeral', text: `❌ Crisis not found: \`${crisisId}\`` });
          return;
        }

        await respond({ response_type: 'ephemeral', text: `📋 _Generating SITREP for ${crisis.location}... (15-30 seconds)_` });

        try {
          const result = await reportAgent.generateSitRep({ crisisId: crisis.id });
          const intel = getIntelByCrisis(crisis.id, 5);
          const resources = getResourcesByCrisis(crisis.id);

          await say({
            blocks: buildSitRepBlocks(crisis, intel, resources, result.sitrep) as any,
            text: result.title,
          });
        } catch (err) {
          await respond({ response_type: 'ephemeral', text: `❌ SITREP generation failed: ${(err as Error).message}` });
        }
        break;
      }

      case 'draft': {
        // /resq draft <type> <crisis_id>
        // types: alert, press, volunteer, sitrep
        const draftTypeArg = args[1]?.toLowerCase() ?? 'alert';
        const crisisId = args[2] ?? getActiveCrises()[0]?.id;

        const draftTypeMap: Record<string, string> = {
          alert: 'public_alert',
          press: 'press_release',
          volunteer: 'volunteer_brief',
          sitrep: 'sitrep',
        };

        const draftType = (draftTypeMap[draftTypeArg] ?? 'public_alert') as any;

        const crisis = crisisId
          ? (getCrisisById(crisisId) ?? getActiveCrises().find((c) => c.id.startsWith(crisisId)))
          : getActiveCrises()[0];

        if (!crisis) {
          await respond({ response_type: 'ephemeral', text: '❌ No active crisis found. Run `/crisis activate` first.' });
          return;
        }

        await respond({ response_type: 'ephemeral', text: `✍️ _Drafting ${draftTypeArg} for ${crisis.location}..._` });

        try {
          const result = await commsAgent.draftCommunication({
            crisisId: crisis.id,
            crisisType: crisis.type,
            location: crisis.location,
            severity: crisis.severity,
            draftType,
            requestedBy: command.user_id,
          });

          await say({
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: result.title, emoji: true } },
              { type: 'section', text: { type: 'mrkdwn', text: result.content } },
              { type: 'divider' },
              {
                type: 'actions',
                elements: [
                  { type: 'button', text: { type: 'plain_text', text: '✅ Approve & Send', emoji: true }, action_id: 'approve_draft', value: result.draftId, style: 'primary' },
                  { type: 'button', text: { type: 'plain_text', text: '🗑️ Discard', emoji: true }, action_id: 'discard_draft', value: result.draftId, style: 'danger' },
                ],
              },
            ] as any,
            text: result.title,
          });
        } catch (err) {
          await respond({ response_type: 'ephemeral', text: `❌ Draft failed: ${(err as Error).message}` });
        }
        break;
      }

      case 'intel': {
        // /resq intel <crisis_id> — refresh intelligence
        const crisisId = args[1] ?? getActiveCrises()[0]?.id;
        const crisis = crisisId
          ? (getCrisisById(crisisId) ?? getActiveCrises().find((c) => c.id.startsWith(crisisId)))
          : getActiveCrises()[0];

        if (!crisis) {
          await respond({ response_type: 'ephemeral', text: '❌ No active crisis found.' });
          return;
        }

        await respond({ response_type: 'ephemeral', text: `🔍 _Refreshing intelligence for ${crisis.location}..._` });

        const { intelAgent } = await import('../agents/intel-agent');
        await intelAgent.gatherIntelligence({
          crisisId: crisis.id,
          crisisType: crisis.type,
          location: crisis.location,
          severity: crisis.severity,
        });

        const intel = getIntelByCrisis(crisis.id, 5);
        await say({
          blocks: buildIntelUpdateBlocks(crisis, intel) as any,
          text: `🔍 Intel refresh for ${crisis.location}`,
        });
        break;
      }

      default:
        await respond({
          response_type: 'ephemeral',
          text: `🤖 *ResQ AI — Quick Reference:*
• \`/resq report [crisis_id]\` — Generate situation report
• \`/resq draft <alert|press|volunteer|sitrep> [crisis_id]\` — Draft comms
• \`/resq intel [crisis_id]\` — Refresh intelligence
• \`/crisis activate <type> <location>\` — Start crisis response`,
        });
    }
  });
}

// ── Helper: Parse crisis arguments ────────────────────────────────────────────

function parseCrisisArgs(raw: string): {
  type: string;
  location: string;
  severity: string;
} {
  const severities = ['low', 'medium', 'high', 'critical'];
  const tokens = raw.match(/("([^"]+)"|'([^']+)'|\S+)/g) ?? [];
  const cleaned = tokens.map((t) => t.replace(/^["']|["']$/g, ''));

  // Last token might be severity
  const lastToken = cleaned[cleaned.length - 1]?.toLowerCase();
  const hasSeverity = severities.includes(lastToken ?? '');
  const severity = hasSeverity ? lastToken! : 'high';
  const main = hasSeverity ? cleaned.slice(0, -1) : cleaned;

  const [type, ...locationParts] = main;
  return {
    type: type ?? 'unknown',
    location: locationParts.join(' ') || 'Unknown Location',
    severity,
  };
}
