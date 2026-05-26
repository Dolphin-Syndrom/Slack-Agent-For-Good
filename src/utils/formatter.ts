import type { CrisisRow, ResourceRow, IntelUpdateRow } from '../db/schema';

// ── Severity Emoji Map ────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  low: '🟡',
  medium: '🟠',
  high: '🔴',
  critical: '🚨',
};

const CRISIS_TYPE_EMOJI: Record<string, string> = {
  flood: '🌊',
  wildfire: '🔥',
  earthquake: '🌍',
  hurricane: '🌀',
  tornado: '🌪️',
  tsunami: '🌊',
  drought: '☀️',
  pandemic: '🦠',
  chemical: '☣️',
  nuclear: '☢️',
  default: '⚠️',
};

const STATUS_EMOJI: Record<string, string> = {
  ACTIVE: '🔴',
  CONTAINED: '🟡',
  RESOLVED: '✅',
  CANCELLED: '⬛',
};

// ── Block Kit Builders ────────────────────────────────────────────────────────

export type Block = Record<string, unknown>;

export function headerBlock(text: string): Block {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

export function sectionBlock(text: string, accessory?: Block): Block {
  const block: Block = {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
  if (accessory) block.accessory = accessory;
  return block;
}

export function fieldsBlock(fields: { title: string; value: string }[]): Block {
  return {
    type: 'section',
    fields: fields.map((f) => ({
      type: 'mrkdwn',
      text: `*${f.title}*\n${f.value}`,
    })),
  };
}

export function dividerBlock(): Block {
  return { type: 'divider' };
}

export function contextBlock(elements: string[]): Block {
  return {
    type: 'context',
    elements: elements.map((e) => ({ type: 'mrkdwn', text: e })),
  };
}

export function buttonBlock(
  text: string,
  actionId: string,
  value: string,
  style?: 'primary' | 'danger'
): Block {
  const btn: Block = {
    type: 'button',
    text: { type: 'plain_text', text, emoji: true },
    action_id: actionId,
    value,
  };
  if (style) btn.style = style;
  return btn;
}

export function actionsBlock(elements: Block[]): Block {
  return { type: 'actions', elements };
}

// ── Crisis Card ───────────────────────────────────────────────────────────────

export function buildCrisisActivatedBlocks(crisis: CrisisRow): Block[] {
  const typeEmoji = CRISIS_TYPE_EMOJI[crisis.type.toLowerCase()] ?? CRISIS_TYPE_EMOJI.default;
  const sevEmoji = SEVERITY_EMOJI[crisis.severity] ?? '⚠️';

  return [
    headerBlock(`${typeEmoji} CRISIS ACTIVATED: ${crisis.type.toUpperCase()} — ${crisis.location}`),
    fieldsBlock([
      { title: '🆔 Crisis ID', value: `\`${crisis.id.slice(0, 8)}\`` },
      { title: '📍 Location', value: crisis.location },
      { title: `${sevEmoji} Severity`, value: crisis.severity.toUpperCase() },
      { title: '⏱️ Started', value: `<!date^${Math.floor(crisis.started_at / 1000)}^{date_short_pretty} {time}|${new Date(crisis.started_at).toISOString()}>` },
    ]),
    dividerBlock(),
    sectionBlock('*Agents are being dispatched…* 🤖\n_Intel Agent · Resource Agent · Comms Agent are now active_'),
    actionsBlock([
      buttonBlock('📊 View Status', 'crisis_status', crisis.id, 'primary'),
      buttonBlock('📦 Add Resource', 'add_resource', crisis.id),
      buttonBlock('✅ Resolve Crisis', 'resolve_crisis', crisis.id, 'danger'),
    ]),
    contextBlock([`Crisis ID: ${crisis.id}`, 'ResQ AI • Multi-Agent Crisis Coordinator']),
  ];
}

export function buildIntelUpdateBlocks(
  crisis: CrisisRow,
  updates: IntelUpdateRow[]
): Block[] {
  const blocks: Block[] = [
    headerBlock(`🔍 Intelligence Report — ${crisis.location}`),
    contextBlock([`Crisis: ${crisis.type} | Status: ${crisis.status} | ${updates.length} updates`]),
    dividerBlock(),
  ];

  for (const update of updates.slice(0, 5)) {
    const sourceEmoji: Record<string, string> = {
      weather: '🌤️', news: '📰', usgs: '🌍', manual: '👤',
    };
    const emoji = sourceEmoji[update.source] ?? '📡';
    blocks.push(
      sectionBlock(`${emoji} *${update.title}*\n${update.content}${update.url ? `\n<${update.url}|Read more>` : ''}`)
    );
    blocks.push(contextBlock([
      `Source: ${update.source.toUpperCase()}`,
      `<!date^${Math.floor(update.created_at / 1000)}^{time}|${new Date(update.created_at).toISOString()}>`,
    ]));
    blocks.push(dividerBlock());
  }

  return blocks;
}

export function buildResourceSummaryBlocks(
  crisis: CrisisRow,
  resources: ResourceRow[]
): Block[] {
  const grouped = resources.reduce<Record<string, ResourceRow[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {});

  const resourceEmoji: Record<string, string> = {
    volunteer: '👥', vehicle: '🚗', shelter: '🏠', medical: '🏥', food: '🍱', water: '💧',
  };

  const blocks: Block[] = [
    headerBlock(`📦 Resource Dashboard — ${crisis.location}`),
    contextBlock([`${resources.length} resources tracked | Crisis: ${crisis.type}`]),
    dividerBlock(),
  ];

  for (const [type, items] of Object.entries(grouped)) {
    const emoji = resourceEmoji[type] ?? '📋';
    const available = items.filter((r) => r.status === 'available').reduce((s, r) => s + r.quantity, 0);
    const total = items.reduce((s, r) => s + r.quantity, 0);

    blocks.push(
      sectionBlock(`${emoji} *${type.toUpperCase()}*\nAvailable: ${available} / ${total} ${items[0].unit}`,
        buttonBlock('Manage', `manage_resource_type_${type}`, `${crisis.id}:${type}`)
      )
    );
  }

  blocks.push(dividerBlock());
  blocks.push(
    actionsBlock([
      buttonBlock('➕ Add Resource', 'add_resource', crisis.id, 'primary'),
      buttonBlock('📊 Full Report', 'crisis_status', crisis.id),
    ])
  );

  return blocks;
}

export function buildSitRepBlocks(
  crisis: CrisisRow,
  intel: IntelUpdateRow[],
  resources: ResourceRow[],
  sitrep: string
): Block[] {
  const sevEmoji = SEVERITY_EMOJI[crisis.severity] ?? '⚠️';
  const statusEmoji = STATUS_EMOJI[crisis.status] ?? '❓';
  const typeEmoji = CRISIS_TYPE_EMOJI[crisis.type.toLowerCase()] ?? '⚠️';

  return [
    headerBlock(`📋 SITUATION REPORT — ${crisis.type.toUpperCase()} | ${crisis.location}`),
    fieldsBlock([
      { title: 'Status', value: `${statusEmoji} ${crisis.status}` },
      { title: 'Severity', value: `${sevEmoji} ${crisis.severity.toUpperCase()}` },
      { title: 'Crisis Type', value: `${typeEmoji} ${crisis.type}` },
      { title: 'Intel Updates', value: `${intel.length} reports` },
      { title: 'Resources', value: `${resources.length} logged` },
      { title: 'Duration', value: formatDuration(Date.now() - crisis.started_at) },
    ]),
    dividerBlock(),
    sectionBlock(`*Executive Summary*\n${sitrep}`),
    dividerBlock(),
    contextBlock([
      `Generated by ResQ AI Report Agent`,
      `<!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|now>`,
    ]),
  ];
}

export function buildCommsDraftBlocks(
  draftId: string,
  title: string,
  content: string,
  type: string
): Block[] {
  const typeEmoji: Record<string, string> = {
    public_alert: '📢', press_release: '📰', volunteer_brief: '👥', sitrep: '📋',
  };

  return [
    headerBlock(`${typeEmoji[type] ?? '📝'} Draft: ${title}`),
    sectionBlock(content),
    dividerBlock(),
    actionsBlock([
      buttonBlock('✅ Approve & Send', 'approve_draft', draftId, 'primary'),
      buttonBlock('✏️ Edit', 'edit_draft', draftId),
      buttonBlock('🗑️ Discard', 'discard_draft', draftId, 'danger'),
    ]),
  ];
}

export function buildStatusDashboardBlocks(crises: CrisisRow[]): Block[] {
  const active = crises.filter((c) => c.status === 'ACTIVE');
  const resolved = crises.filter((c) => c.status === 'RESOLVED');

  const blocks: Block[] = [
    headerBlock('🚨 ResQ AI — Crisis Command Center'),
    fieldsBlock([
      { title: '🔴 Active Crises', value: `${active.length}` },
      { title: '✅ Resolved', value: `${resolved.length}` },
      { title: '📊 Total', value: `${crises.length}` },
      { title: '🤖 Agents', value: 'Online' },
    ]),
    dividerBlock(),
  ];

  if (active.length === 0) {
    blocks.push(sectionBlock('✅ *No active crises.* All clear.'));
  } else {
    blocks.push(sectionBlock('*Active Crisis Operations:*'));
    for (const crisis of active.slice(0, 5)) {
      const typeEmoji = CRISIS_TYPE_EMOJI[crisis.type.toLowerCase()] ?? '⚠️';
      blocks.push(
        sectionBlock(
          `${typeEmoji} *${crisis.type}* — ${crisis.location}\n${SEVERITY_EMOJI[crisis.severity] ?? ''} ${crisis.severity.toUpperCase()} | Started ${formatDuration(Date.now() - crisis.started_at)} ago`,
          buttonBlock('View', 'crisis_status', crisis.id)
        )
      );
    }
  }

  blocks.push(dividerBlock());
  blocks.push(
    actionsBlock([
      buttonBlock('🚨 Activate Crisis', 'activate_crisis_modal', 'new', 'primary'),
      buttonBlock('🔄 Refresh', 'refresh_dashboard', 'home'),
    ])
  );

  return blocks;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
