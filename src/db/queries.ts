import { v4 as uuidv4 } from 'uuid';
import { getDb } from './schema';
import type { CrisisRow, ResourceRow, IntelUpdateRow, CommsDraftRow } from './schema';

// ── Crisis Queries ────────────────────────────────────────────────────────────

export function createCrisis(data: {
  type: string;
  location: string;
  severity?: string;
  slackChannelId?: string;
  slackChannelName?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}): CrisisRow {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO crises (id, type, location, severity, status, slack_channel_id, slack_channel_name, started_at, updated_at, summary, metadata)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.type,
    data.location,
    data.severity ?? 'high',
    data.slackChannelId ?? null,
    data.slackChannelName ?? null,
    now,
    now,
    data.summary ?? null,
    JSON.stringify(data.metadata ?? {})
  );

  return getCrisisById(id)!;
}

export function getCrisisById(id: string): CrisisRow | undefined {
  return getDb()
    .prepare('SELECT * FROM crises WHERE id = ?')
    .get(id) as CrisisRow | undefined;
}

export function getActiveCrises(): CrisisRow[] {
  return getDb()
    .prepare("SELECT * FROM crises WHERE status = 'ACTIVE' ORDER BY started_at DESC")
    .all() as CrisisRow[];
}

export function getAllCrises(): CrisisRow[] {
  return getDb()
    .prepare('SELECT * FROM crises ORDER BY started_at DESC')
    .all() as CrisisRow[];
}

export function updateCrisis(
  id: string,
  updates: Partial<Pick<CrisisRow, 'status' | 'severity' | 'summary' | 'slack_channel_id' | 'slack_channel_name' | 'resolved_at' | 'metadata'>>
): void {
  const db = getDb();
  const fields = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(', ');
  const values = Object.values(updates);
  db.prepare(`UPDATE crises SET ${fields}, updated_at = ? WHERE id = ?`).run(
    ...values,
    Date.now(),
    id
  );
}

// ── Resource Queries ──────────────────────────────────────────────────────────

export function createResource(data: {
  crisisId: string;
  type: string;
  name: string;
  quantity?: number;
  unit?: string;
  location?: string;
  contact?: string;
  notes?: string;
}): ResourceRow {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO resources (id, crisis_id, type, name, quantity, unit, status, location, contact, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, ?, ?)
  `).run(
    id, data.crisisId, data.type, data.name,
    data.quantity ?? 1, data.unit ?? 'units',
    data.location ?? null, data.contact ?? null, data.notes ?? null,
    now, now
  );

  return getDb().prepare('SELECT * FROM resources WHERE id = ?').get(id) as ResourceRow;
}

export function getResourcesByCrisis(crisisId: string): ResourceRow[] {
  return getDb()
    .prepare('SELECT * FROM resources WHERE crisis_id = ? ORDER BY created_at DESC')
    .all(crisisId) as ResourceRow[];
}

export function updateResourceStatus(id: string, status: 'available' | 'allocated' | 'depleted'): void {
  getDb()
    .prepare('UPDATE resources SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id);
}

// ── Intel Queries ─────────────────────────────────────────────────────────────

export function createIntelUpdate(data: {
  crisisId: string;
  source: string;
  title: string;
  content: string;
  severity?: string;
  url?: string;
  rawData?: unknown;
}): IntelUpdateRow {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO intel_updates (id, crisis_id, source, title, content, severity, url, raw_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, data.crisisId, data.source, data.title, data.content,
    data.severity ?? null, data.url ?? null,
    data.rawData ? JSON.stringify(data.rawData) : null,
    now
  );

  return db.prepare('SELECT * FROM intel_updates WHERE id = ?').get(id) as IntelUpdateRow;
}

export function getIntelByCrisis(crisisId: string, limit = 20): IntelUpdateRow[] {
  return getDb()
    .prepare('SELECT * FROM intel_updates WHERE crisis_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(crisisId, limit) as IntelUpdateRow[];
}

// ── Comms Queries ─────────────────────────────────────────────────────────────

export function createCommsDraft(data: {
  crisisId: string;
  type: string;
  title: string;
  content: string;
  createdBy?: string;
}): CommsDraftRow {
  const db = getDb();
  const id = uuidv4();
  const now = Date.now();

  db.prepare(`
    INSERT INTO comms_drafts (id, crisis_id, type, title, content, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)
  `).run(id, data.crisisId, data.type, data.title, data.content, data.createdBy ?? null, now, now);

  return db.prepare('SELECT * FROM comms_drafts WHERE id = ?').get(id) as CommsDraftRow;
}

export function updateCommsDraftStatus(
  id: string,
  status: 'draft' | 'approved' | 'sent',
  approvedBy?: string
): void {
  getDb()
    .prepare('UPDATE comms_drafts SET status = ?, approved_by = ?, updated_at = ? WHERE id = ?')
    .run(status, approvedBy ?? null, Date.now(), id);
}

export function getCommsDraftsByCrisis(crisisId: string): CommsDraftRow[] {
  return getDb()
    .prepare('SELECT * FROM comms_drafts WHERE crisis_id = ? ORDER BY created_at DESC')
    .all(crisisId) as CommsDraftRow[];
}

export function getCommsDraftById(id: string): CommsDraftRow | undefined {
  return getDb()
    .prepare('SELECT * FROM comms_drafts WHERE id = ?')
    .get(id) as CommsDraftRow | undefined;
}

// ── A2A Task Queries ──────────────────────────────────────────────────────────

export function createA2ATask(agentId: string, input: unknown): string {
  const id = uuidv4();
  const now = Date.now();
  getDb()
    .prepare(`
      INSERT INTO a2a_tasks (id, agent_id, status, input, created_at, updated_at)
      VALUES (?, ?, 'submitted', ?, ?, ?)
    `)
    .run(id, agentId, JSON.stringify(input), now, now);
  return id;
}

export function updateA2ATask(
  id: string,
  status: 'working' | 'completed' | 'failed',
  output?: unknown,
  error?: string
): void {
  getDb()
    .prepare('UPDATE a2a_tasks SET status = ?, output = ?, error = ?, updated_at = ? WHERE id = ?')
    .run(status, output ? JSON.stringify(output) : null, error ?? null, Date.now(), id);
}

export function getA2ATask(id: string): { id: string; agent_id: string; status: string; input: string; output: string | null; error: string | null } | undefined {
  return getDb()
    .prepare('SELECT * FROM a2a_tasks WHERE id = ?')
    .get(id) as any;
}
