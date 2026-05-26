import { complete } from '../utils/llm';
import { getResourcesByCrisis, createResource, updateResourceStatus } from '../db/queries';
import type { ResourceRow } from '../db/schema';

export type ResourceAllocationInput = {
  crisisId: string;
  crisisType: string;
  location: string;
  severity: string;
  affectedPopulation?: number;
};

export type ResourceAllocationOutput = {
  crisisId: string;
  recommendedResources: RecommendedResource[];
  allocationPlan: string;
  currentInventory: ResourceRow[];
};

export type RecommendedResource = {
  type: string;
  name: string;
  quantity: number;
  unit: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  rationale: string;
};

const SYSTEM_PROMPT = `You are the ResQ Resource Agent — an AI specialist in emergency resource allocation.
Given a crisis scenario, analyze severity and create a prioritized resource allocation plan.
Base quantities on standard emergency management guidelines (WHO: 3L water/person/day; 1 shelter bed per 10 evacuees).
Format as a structured, actionable plan field commanders can use immediately.`;

async function allocateResources(input: ResourceAllocationInput): Promise<ResourceAllocationOutput> {
  const { crisisId, crisisType, location, severity, affectedPopulation } = input;
  const existing = getResourcesByCrisis(crisisId);
  const population = affectedPopulation ?? defaultPopulation(severity);

  const allocationPlan = await complete(
    SYSTEM_PROMPT,
    `Crisis Resource Request:
- Type: ${crisisType} | Location: ${location} | Severity: ${severity}
- Affected population: ~${population.toLocaleString()}
- Existing logged resources: ${existing.length}

Create a comprehensive, prioritized resource allocation plan for the first 72 hours.`,
    { maxTokens: 1500, temperature: 0.2 }
  );

  const recommendations = buildRecommendations(crisisType, severity, population);

  // Auto-log CRITICAL resources to DB
  for (const rec of recommendations.filter((r) => r.priority === 'CRITICAL').slice(0, 3)) {
    createResource({
      crisisId,
      type: rec.type,
      name: `[NEEDED] ${rec.name}`,
      quantity: rec.quantity,
      unit: rec.unit,
      notes: `Auto-recommended. Priority: ${rec.priority}`,
    });
  }

  return {
    crisisId,
    recommendedResources: recommendations,
    allocationPlan,
    currentInventory: getResourcesByCrisis(crisisId),
  };
}

function defaultPopulation(severity: string): number {
  return ({ low: 500, medium: 5000, high: 25000, critical: 100000 }[severity] ?? 10000);
}

function buildRecommendations(
  crisisType: string,
  severity: string,
  population: number
): RecommendedResource[] {
  const shelterBeds = Math.ceil(population * 0.1);
  const volunteers = Math.ceil(population * 0.02);
  const vehicles = Math.ceil(volunteers / 5);

  const base: RecommendedResource[] = [
    { type: 'shelter', name: 'Emergency Shelter Beds', quantity: shelterBeds, unit: 'beds', priority: 'CRITICAL', rationale: '10% of affected need immediate shelter' },
    { type: 'volunteer', name: 'Emergency Volunteers', quantity: volunteers, unit: 'people', priority: 'CRITICAL', rationale: '1 per 50 affected residents' },
    { type: 'water', name: 'Drinking Water', quantity: population * 3, unit: 'liters/day', priority: 'CRITICAL', rationale: 'WHO standard: 3L/person/day' },
    { type: 'food', name: 'Emergency Rations', quantity: population * 3, unit: 'meals/day', priority: 'HIGH', rationale: '3 meals/person/day' },
    { type: 'vehicle', name: 'Logistics Vehicles', quantity: vehicles, unit: 'vehicles', priority: 'HIGH', rationale: '1 per 5 volunteers' },
    { type: 'medical', name: 'First Aid Kits', quantity: Math.ceil(population / 50), unit: 'kits', priority: 'HIGH', rationale: '1 per 50 people' },
  ];

  if (crisisType.toLowerCase().includes('flood')) {
    base.push({ type: 'vehicle', name: 'Rescue Boats', quantity: Math.ceil(volunteers / 10), unit: 'boats', priority: 'CRITICAL', rationale: 'Essential for water rescue' });
  }
  if (crisisType.toLowerCase().includes('wildfire') || crisisType.toLowerCase().includes('fire')) {
    base.push({ type: 'medical', name: 'N95 Respirator Masks', quantity: population, unit: 'masks', priority: 'CRITICAL', rationale: 'Smoke inhalation prevention' });
  }

  return base;
}

async function handleA2ATask(skill: string, input: unknown): Promise<unknown> {
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  if (skill === 'allocate_resources') return allocateResources(parsed as ResourceAllocationInput);
  if (skill === 'get_resource_status') {
    const resources = getResourcesByCrisis((parsed as any).crisisId);
    return { crisisId: (parsed as any).crisisId, currentInventory: resources };
  }
  throw new Error(`Resource Agent: unknown skill "${skill}"`);
}

export const resourceAgent = { allocateResources, handleA2ATask };
