import type { App } from '@slack/bolt';
import { createResource } from '../db/queries';
import { getAllCrises, getActiveCrises, getCrisisById } from '../db/queries';
import { buildStatusDashboardBlocks, buildCrisisActivatedBlocks } from '../utils/formatter';
import { orchestratorAgent } from '../agents/orchestrator';

export function registerViews(app: App): void {
  // ── Add Resource Modal Submit ──────────────────────────────────────────────
  app.view('add_resource_modal', async ({ view, ack, body, say }) => {
    await ack();

    const crisisId = view.private_metadata;
    const values = view.state.values;

    const type = values.resource_type?.value?.selected_option?.value ?? 'supplies';
    const name = values.resource_name?.value?.value ?? 'Unknown Resource';
    const quantity = parseInt(values.resource_quantity?.value?.value ?? '1', 10);
    const unit = values.resource_unit?.value?.value ?? 'units';
    const location = values.resource_location?.value?.value ?? undefined;
    const contact = values.resource_contact?.value?.value ?? undefined;

    const resource = createResource({
      crisisId,
      type,
      name,
      quantity,
      unit,
      location,
      contact,
    });

    // Notify channel
    const crisis = getCrisisById(crisisId);
    const channelId = crisis?.slack_channel_id;

    if (channelId) {
      await app.client.chat.postMessage({
        channel: channelId,
        text: `📦 *Resource Logged* by <@${body.user.id}>\n• *${name}* — ${quantity} ${unit} (${type})\n${location ? `📍 ${location}` : ''}${contact ? ` | 📞 ${contact}` : ''}`,
      });
    }
  });

  // ── Activate Crisis Modal Submit ──────────────────────────────────────────
  app.view('activate_crisis_modal', async ({ view, ack, body }) => {
    await ack();

    const values = view.state.values;
    const crisisType = values.crisis_type?.value?.selected_option?.value ?? 'emergency';
    const location = values.crisis_location?.value?.value ?? 'Unknown';
    const severity = (values.crisis_severity?.value?.selected_option?.value ?? 'high') as any;

    await orchestratorAgent.activate({
      crisisType,
      location,
      severity,
      requestedBy: body.user.id,
      app,
    });
  });
}

export function registerEvents(app: App): void {
  // ── App Home Opened ───────────────────────────────────────────────────────
  app.event('app_home_opened', async ({ event, client }) => {
    const crises = getAllCrises();

    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: buildStatusDashboardBlocks(crises) as any,
      },
    });
  });

  // ── App Mention (@ResQ AI ...) ────────────────────────────────────────────
  app.event('app_mention', async ({ event, say }) => {
    const text = (event as any).text?.toLowerCase() ?? '';

    if (text.includes('help')) {
      await say({
        text: `🤖 *ResQ AI — Crisis Response Coordinator*
        
I help emergency response teams coordinate crisis operations inside Slack.

*Quick Commands:*
• \`/crisis activate flood "Austin TX" high\` — Activate crisis response
• \`/crisis status\` — View all active crises
• \`/resq report\` — Generate situation report
• \`/resq draft alert\` — Draft public safety alert
• \`/resq intel\` — Refresh intelligence feed

Open my *Home* tab to see the crisis dashboard!`,
      });
    } else if (text.includes('status')) {
      const crises = getActiveCrises();
      await say({
        blocks: buildStatusDashboardBlocks(crises) as any,
        text: 'ResQ AI Status Dashboard',
      });
    } else {
      await say({
        text: `👋 Hi <@${(event as any).user}>! I'm *ResQ AI* — your crisis response coordinator.\n\nType \`/crisis activate\` to start, or say "@ResQ AI help" for a full guide.`,
      });
    }
  });
}
