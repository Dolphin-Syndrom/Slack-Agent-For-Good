// Agent-to-Agent (A2A) Protocol — Agent Card Definitions
// Based on the Google A2A specification: https://google.github.io/A2A/

export type AgentCapability = {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
};

export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  inputModes: string[];
  outputModes: string[];
  examples?: string[];
};

export type AgentCard = {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: AgentCapability;
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
};

export const AGENT_IDS = {
  ORCHESTRATOR: 'orchestrator',
  INTEL: 'intel',
  RESOURCE: 'resource',
  COMMS: 'comms',
  REPORT: 'report',
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

export function buildAgentCard(agentId: AgentId, baseUrl: string): AgentCard {
  const cards: Record<AgentId, AgentCard> = {
    orchestrator: {
      name: 'ResQ Orchestrator Agent',
      description: 'Master coordinator that receives crisis activation requests and dispatches specialized sub-agents via A2A.',
      url: `${baseUrl}/a2a/orchestrator`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills: [
        {
          id: 'activate_crisis',
          name: 'Activate Crisis Response',
          description: 'Spin up all agents for a new crisis event',
          inputModes: ['text/plain'],
          outputModes: ['application/json'],
          examples: ['Activate flood crisis for Austin TX severity high'],
        },
        {
          id: 'get_crisis_overview',
          name: 'Get Crisis Overview',
          description: 'Return a summary of all active crises and agent statuses',
          inputModes: ['text/plain'],
          outputModes: ['application/json'],
        },
      ],
    },

    intel: {
      name: 'ResQ Intel Agent',
      description: 'Intelligence gathering agent that collects weather, seismic, and news data via MCP tools.',
      url: `${baseUrl}/a2a/intel`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [
        {
          id: 'gather_intel',
          name: 'Gather Intelligence',
          description: 'Collect weather, seismic, and news data for a crisis location',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
          examples: ['Gather intel for flood crisis in Austin TX'],
        },
      ],
    },

    resource: {
      name: 'ResQ Resource Agent',
      description: 'Resource allocation agent that tracks and optimally assigns volunteers, vehicles, shelters, and supplies.',
      url: `${baseUrl}/a2a/resource`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [
        {
          id: 'allocate_resources',
          name: 'Allocate Resources',
          description: 'Suggest optimal resource allocation for a crisis based on type and severity',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
        {
          id: 'get_resource_status',
          name: 'Get Resource Status',
          description: 'Return current resource availability for a crisis',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
    },

    comms: {
      name: 'ResQ Comms Agent',
      description: 'Communications drafting agent that generates public alerts, press releases, and volunteer briefings.',
      url: `${baseUrl}/a2a/comms`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [
        {
          id: 'draft_alert',
          name: 'Draft Public Alert',
          description: 'Generate a public safety alert for the crisis',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
        {
          id: 'draft_volunteer_brief',
          name: 'Draft Volunteer Briefing',
          description: 'Generate a briefing document for deployed volunteers',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
    },

    report: {
      name: 'ResQ Report Agent',
      description: 'Situation report generator that produces structured SITREPs and operational summaries.',
      url: `${baseUrl}/a2a/report`,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      skills: [
        {
          id: 'generate_sitrep',
          name: 'Generate SITREP',
          description: 'Generate a structured Situation Report for a crisis',
          inputModes: ['application/json'],
          outputModes: ['application/json'],
        },
      ],
    },
  };

  return cards[agentId];
}
