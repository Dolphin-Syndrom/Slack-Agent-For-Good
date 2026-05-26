import { complete } from '../utils/llm';
import {
  getCrisisById,
  getIntelByCrisis,
  getResourcesByCrisis,
  getCommsDraftsByCrisis,
} from '../db/queries';

// ── Report Agent ──────────────────────────────────────────────────────────────

export type SitRepInput = {
  crisisId: string;
};

export type SitRepOutput = {
  crisisId: string;
  title: string;
  sitrep: string;
  generatedAt: string;
  metrics: {
    intelUpdates: number;
    resourcesTracked: number;
    communicationsDrafted: number;
    hoursActive: number;
  };
};

const SYSTEM_PROMPT = `You are the ResQ Report Agent — an AI specialist in emergency situation reporting.

Generate structured Situation Reports (SITREPs) following standard emergency management format:

## SITUATION REPORT
**1. SITUATION**
- Current status and key developments
- Affected area and population estimates
- Hazards and ongoing risks

**2. MISSION**
- Primary response objectives
- Current operational priorities

**3. CURRENT OPERATIONS**
- Active response activities
- Resource deployment status
- Key decisions made

**4. LOGISTICS & RESOURCES**
- Resource inventory summary
- Critical gaps and needs
- Supply chain status

**5. COMMUNICATIONS**
- Public messaging status
- Key stakeholder updates
- Media coordination

**6. NEXT ACTIONS**
- Immediate priorities (next 6 hours)
- Short-term priorities (next 24 hours)
- Key decisions needed

**7. ASSESSMENT**
- Overall situation assessment
- Risk level for next 24 hours
- Confidence level in information

Be factual, specific, and actionable. Use the provided data. Timestamp key facts.`;

async function generateSitRep(input: SitRepInput): Promise<SitRepOutput> {
  const { crisisId } = input;

  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  const intel = getIntelByCrisis(crisisId, 10);
  const resources = getResourcesByCrisis(crisisId);
  const comms = getCommsDraftsByCrisis(crisisId);

  const hoursActive = Math.round((Date.now() - crisis.started_at) / 3600000);

  const intelSummary = intel.length > 0
    ? intel.map((i) => `[${i.source.toUpperCase()}] ${i.title}: ${i.content.slice(0, 250)}`).join('\n\n')
    : 'No intelligence updates yet.';

  const resourceSummary = resources.length > 0
    ? resources
        .slice(0, 10)
        .map((r) => `• ${r.type}: ${r.name} — ${r.quantity} ${r.unit} (${r.status})`)
        .join('\n')
    : 'No resources logged yet.';

  const userMessage = `Generate a SITREP for the following crisis:

CRISIS OVERVIEW:
- Type: ${crisis.type}
- Location: ${crisis.location}
- Severity: ${crisis.severity.toUpperCase()}
- Status: ${crisis.status}
- Active for: ${hoursActive} hours
- Crisis ID: ${crisis.id.slice(0, 8)}

INTELLIGENCE UPDATES (${intel.length} total):
${intelSummary}

RESOURCE STATUS (${resources.length} items):
${resourceSummary}

COMMUNICATIONS (${comms.length} drafts, ${comms.filter((c) => c.status === 'sent').length} sent):
${comms.map((c) => `• ${c.type}: "${c.title}" — ${c.status}`).join('\n') || 'None drafted yet.'}

Generate a comprehensive SITREP now.`;

  const sitrep = await complete(SYSTEM_PROMPT, userMessage, {
    maxTokens: 2000,
    temperature: 0.2,
  });

  const title = `SITREP — ${crisis.type.toUpperCase()} | ${crisis.location} | T+${hoursActive}h`;

  return {
    crisisId,
    title,
    sitrep,
    generatedAt: new Date().toISOString(),
    metrics: {
      intelUpdates: intel.length,
      resourcesTracked: resources.length,
      communicationsDrafted: comms.length,
      hoursActive,
    },
  };
}

// ── A2A Task Handler ──────────────────────────────────────────────────────────

async function handleA2ATask(skill: string, input: unknown): Promise<unknown> {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;

  switch (skill) {
    case 'generate_sitrep':
      return generateSitRep(parsed as SitRepInput);
    default:
      throw new Error(`Report Agent: unknown skill "${skill}"`);
  }
}

export const reportAgent = {
  generateSitRep,
  handleA2ATask,
};
