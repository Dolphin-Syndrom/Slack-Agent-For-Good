import { complete } from '../utils/llm';
import { createCommsDraft, getIntelByCrisis, getCrisisById } from '../db/queries';

// ── Comms Agent ───────────────────────────────────────────────────────────────

export type CommsDraftInput = {
  crisisId: string;
  crisisType: string;
  location: string;
  severity: string;
  draftType: 'public_alert' | 'press_release' | 'volunteer_brief' | 'sitrep';
  additionalContext?: string;
  requestedBy?: string;
};

export type CommsDraftOutput = {
  draftId: string;
  title: string;
  content: string;
  draftType: string;
  crisisId: string;
};

const SYSTEM_PROMPTS: Record<string, string> = {
  public_alert: `You are the ResQ Communications Agent specializing in PUBLIC SAFETY ALERTS.
Write clear, urgent, actionable alerts for the general public. Use simple language (8th grade reading level).
Structure: 1) What's happening, 2) Who is affected, 3) What to do NOW, 4) Where to get help, 5) Contact info.
Be concise (under 200 words). Avoid jargon. Use imperative verbs. Start with the most critical action.`,

  press_release: `You are the ResQ Communications Agent specializing in PRESS RELEASES.
Write formal, factual press releases for media distribution. 
Structure: Headline, Dateline, Lead paragraph (who/what/when/where/why), Body (facts, quotes placeholder, context), Boilerplate, Contact.
Professional tone, AP style. Under 400 words. Avoid speculation. Include official-sounding agency name.`,

  volunteer_brief: `You are the ResQ Communications Agent specializing in VOLUNTEER BRIEFINGS.
Write operational briefings for deployed emergency volunteers.
Structure: Situation overview, Your mission, Assigned zones, Safety protocols, Chain of command, Reporting procedures, Emergency contacts.
Clear, direct, actionable. Include specific tasks. Emphasize safety. Under 500 words.`,

  sitrep: `You are the ResQ Communications Agent specializing in SITUATION REPORTS (SITREPs).
Write structured military/emergency management style SITREPs.
Standard SITREP format: 1-SITUATION, 2-MISSION, 3-EXECUTION, 4-ADMINISTRATION & LOGISTICS, 5-COMMAND & SIGNAL.
Include metrics where available. Factual, concise, no ambiguity. Timestamp all data points.`,
};

async function draftCommunication(input: CommsDraftInput): Promise<CommsDraftOutput> {
  const { crisisId, crisisType, location, severity, draftType, additionalContext, requestedBy } = input;

  // Pull recent intel for context
  const intel = getIntelByCrisis(crisisId, 5);
  const intelContext = intel.length > 0
    ? '\n\nAvailable Intelligence:\n' + intel.map((i) => `[${i.source}] ${i.title}: ${i.content.slice(0, 200)}`).join('\n')
    : '';

  const systemPrompt = SYSTEM_PROMPTS[draftType] ?? SYSTEM_PROMPTS.public_alert;

  const userMessage = `Draft a ${draftType.replace('_', ' ')} for the following crisis:

Crisis Details:
- Type: ${crisisType}
- Location: ${location}
- Severity: ${severity.toUpperCase()}
- Crisis ID: ${crisisId.slice(0, 8)}
${additionalContext ? `\nAdditional Context: ${additionalContext}` : ''}
${intelContext}

Generate the complete ${draftType.replace('_', ' ')} text now.`;

  const content = await complete(systemPrompt, userMessage, {
    maxTokens: 1000,
    temperature: 0.4,
  });

  const titles: Record<string, string> = {
    public_alert: `🚨 PUBLIC SAFETY ALERT: ${crisisType.toUpperCase()} — ${location}`,
    press_release: `PRESS RELEASE: Emergency Response to ${crisisType} in ${location}`,
    volunteer_brief: `VOLUNTEER OPERATIONAL BRIEFING — ${location} ${crisisType} Response`,
    sitrep: `SITREP #1 — ${crisisType.toUpperCase()} | ${location} | ${new Date().toUTCString()}`,
  };

  const title = titles[draftType] ?? `Communication Draft — ${crisisType} ${location}`;

  // Save to database
  const draft = createCommsDraft({
    crisisId,
    type: draftType,
    title,
    content,
    createdBy: requestedBy,
  });

  return {
    draftId: draft.id,
    title,
    content,
    draftType,
    crisisId,
  };
}

// ── A2A Task Handler ──────────────────────────────────────────────────────────

async function handleA2ATask(skill: string, input: unknown): Promise<unknown> {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;

  switch (skill) {
    case 'draft_alert':
      return draftCommunication({ ...(parsed as CommsDraftInput), draftType: 'public_alert' });
    case 'draft_press_release':
      return draftCommunication({ ...(parsed as CommsDraftInput), draftType: 'press_release' });
    case 'draft_volunteer_brief':
      return draftCommunication({ ...(parsed as CommsDraftInput), draftType: 'volunteer_brief' });
    case 'draft_sitrep':
      return draftCommunication({ ...(parsed as CommsDraftInput), draftType: 'sitrep' });
    case 'draft_communication':
      return draftCommunication(parsed as CommsDraftInput);
    default:
      throw new Error(`Comms Agent: unknown skill "${skill}"`);
  }
}

export const commsAgent = {
  draftCommunication,
  handleA2ATask,
};
