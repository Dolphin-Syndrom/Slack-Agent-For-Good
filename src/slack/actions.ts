import type { App } from '@slack/bolt';
import {
  updateCommsDraftStatus,
  getCommsDraftById,
  updateCrisis,
  getCrisisById,
  getActiveCrises,
  getAllCrises,
} from '../db/queries';
import { buildStatusDashboardBlocks } from '../utils/formatter';

export function registerActions(app: App): void {
  // ── Approve Draft ─────────────────────────────────────────────────────────
  app.action('approve_draft', async ({ action, ack, say, body }) => {
    await ack();
    const draftId = (action as any).value;
    const draft = getCommsDraftById(draftId);

    if (!draft) {
      await say({ text: `❌ Draft \`${draftId}\` not found.` });
      return;
    }

    updateCommsDraftStatus(draftId, 'sent', body.user.id);

    await say({
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *Draft Approved & Sent* by <@${body.user.id}>\n\n*${draft.title}*\n\n${draft.content}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Draft ID: ${draftId.slice(0, 8)} | Type: ${draft.type} | Status: SENT` }],
        },
      ] as any,
      text: `✅ Draft approved: ${draft.title}`,
    });
  });

  // ── Discard Draft ─────────────────────────────────────────────────────────
  app.action('discard_draft', async ({ action, ack, respond }) => {
    await ack();
    const draftId = (action as any).value;
    updateCommsDraftStatus(draftId, 'draft'); // keep as draft but not sent
    await respond({
      replace_original: true,
      text: `🗑️ Draft \`${draftId.slice(0, 8)}\` discarded.`,
    });
  });

  // ── View Crisis Status ────────────────────────────────────────────────────
  app.action('crisis_status', async ({ action, ack, say }) => {
    await ack();
    const crisisId = (action as any).value;
    const crisis = getCrisisById(crisisId);

    if (!crisis) {
      await say({ text: `❌ Crisis \`${crisisId}\` not found.` });
      return;
    }

    const { getIntelByCrisis, getResourcesByCrisis } = await import('../db/queries');
    const { buildIntelUpdateBlocks } = await import('../utils/formatter');

    const intel = getIntelByCrisis(crisisId, 5);
    await say({
      blocks: buildIntelUpdateBlocks(crisis, intel) as any,
      text: `Crisis status: ${crisis.type} in ${crisis.location}`,
    });
  });

  // ── Add Resource (open modal) ─────────────────────────────────────────────
  app.action('add_resource', async ({ action, ack, client, body }) => {
    await ack();
    const crisisId = (action as any).value;

    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'add_resource_modal',
        private_metadata: crisisId,
        title: { type: 'plain_text', text: '📦 Add Resource', emoji: true },
        submit: { type: 'plain_text', text: 'Log Resource', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input',
            block_id: 'resource_type',
            label: { type: 'plain_text', text: 'Resource Type' },
            element: {
              type: 'static_select',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'Select type' },
              options: [
                { text: { type: 'plain_text', text: '👥 Volunteer', emoji: true }, value: 'volunteer' },
                { text: { type: 'plain_text', text: '🚗 Vehicle', emoji: true }, value: 'vehicle' },
                { text: { type: 'plain_text', text: '🏠 Shelter', emoji: true }, value: 'shelter' },
                { text: { type: 'plain_text', text: '🏥 Medical', emoji: true }, value: 'medical' },
                { text: { type: 'plain_text', text: '🍱 Food', emoji: true }, value: 'food' },
                { text: { type: 'plain_text', text: '💧 Water', emoji: true }, value: 'water' },
                { text: { type: 'plain_text', text: '⚡ Power', emoji: true }, value: 'power' },
                { text: { type: 'plain_text', text: '📦 Supplies', emoji: true }, value: 'supplies' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'resource_name',
            label: { type: 'plain_text', text: 'Resource Name / Description' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'e.g., Red Cross Volunteers, Rescue Boats' },
            },
          },
          {
            type: 'input',
            block_id: 'resource_quantity',
            label: { type: 'plain_text', text: 'Quantity' },
            element: {
              type: 'number_input',
              action_id: 'value',
              is_decimal_allowed: false,
              min_value: '1',
            },
          },
          {
            type: 'input',
            block_id: 'resource_unit',
            label: { type: 'plain_text', text: 'Unit' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'people, vehicles, beds, liters, meals...' },
            },
            optional: true,
          },
          {
            type: 'input',
            block_id: 'resource_location',
            label: { type: 'plain_text', text: 'Resource Location' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'Where is this resource stationed?' },
            },
            optional: true,
          },
          {
            type: 'input',
            block_id: 'resource_contact',
            label: { type: 'plain_text', text: 'Contact Info' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'Name / phone / email' },
            },
            optional: true,
          },
        ],
      },
    });
  });

  // ── Resolve Crisis ────────────────────────────────────────────────────────
  app.action('resolve_crisis', async ({ action, ack, say, body }) => {
    await ack();
    const crisisId = (action as any).value;
    const crisis = getCrisisById(crisisId);

    if (!crisis) {
      await say({ text: `❌ Crisis not found.` });
      return;
    }

    updateCrisis(crisisId, {
      status: 'RESOLVED',
      resolved_at: Date.now(),
      summary: `Resolved via Slack action by <@${body.user.id}>`,
    });

    await say({
      text: `✅ *Crisis RESOLVED* — ${crisis.type} in ${crisis.location}\nMarked resolved by <@${body.user.id}>. All operations stand down.`,
    });
  });

  // ── Activate Crisis Modal ─────────────────────────────────────────────────
  app.action('activate_crisis_modal', async ({ ack, client, body }) => {
    await ack();
    await client.views.open({
      trigger_id: (body as any).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'activate_crisis_modal',
        title: { type: 'plain_text', text: '🚨 Activate Crisis', emoji: true },
        submit: { type: 'plain_text', text: 'Activate', emoji: true },
        close: { type: 'plain_text', text: 'Cancel', emoji: true },
        blocks: [
          {
            type: 'input',
            block_id: 'crisis_type',
            label: { type: 'plain_text', text: 'Crisis Type' },
            element: {
              type: 'static_select',
              action_id: 'value',
              options: [
                { text: { type: 'plain_text', text: '🌊 Flood', emoji: true }, value: 'flood' },
                { text: { type: 'plain_text', text: '🔥 Wildfire', emoji: true }, value: 'wildfire' },
                { text: { type: 'plain_text', text: '🌍 Earthquake', emoji: true }, value: 'earthquake' },
                { text: { type: 'plain_text', text: '🌀 Hurricane', emoji: true }, value: 'hurricane' },
                { text: { type: 'plain_text', text: '🌪️ Tornado', emoji: true }, value: 'tornado' },
                { text: { type: 'plain_text', text: '🦠 Pandemic', emoji: true }, value: 'pandemic' },
                { text: { type: 'plain_text', text: '⚠️ Other Emergency', emoji: true }, value: 'emergency' },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'crisis_location',
            label: { type: 'plain_text', text: 'Location' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'City, State / Region (e.g., Austin, TX)' },
            },
          },
          {
            type: 'input',
            block_id: 'crisis_severity',
            label: { type: 'plain_text', text: 'Severity' },
            element: {
              type: 'static_select',
              action_id: 'value',
              initial_option: { text: { type: 'plain_text', text: '🔴 High', emoji: true }, value: 'high' },
              options: [
                { text: { type: 'plain_text', text: '🟡 Low', emoji: true }, value: 'low' },
                { text: { type: 'plain_text', text: '🟠 Medium', emoji: true }, value: 'medium' },
                { text: { type: 'plain_text', text: '🔴 High', emoji: true }, value: 'high' },
                { text: { type: 'plain_text', text: '🚨 Critical', emoji: true }, value: 'critical' },
              ],
            },
          },
        ],
      },
    });
  });

  // ── Refresh Dashboard ─────────────────────────────────────────────────────
  app.action('refresh_dashboard', async ({ ack, body, client }) => {
    await ack();
    const crises = getAllCrises();
    await client.views.publish({
      user_id: body.user.id,
      view: {
        type: 'home',
        blocks: buildStatusDashboardBlocks(crises) as any,
      },
    });
  });
}
