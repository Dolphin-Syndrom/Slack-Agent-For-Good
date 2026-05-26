import { getResourcesByCrisis, getActiveCrises } from '../../db/queries';
import type { ResourceRow } from '../../db/schema';

export type ResourceSearchResult = {
  crisisId: string;
  crisisLocation: string;
  resources: ResourceRow[];
  summary: ResourceSummary;
};

export type ResourceSummary = {
  total: number;
  available: number;
  allocated: number;
  depleted: number;
  byType: Record<string, { total: number; available: number }>;
};

export async function findResources(
  crisisId: string,
  resourceType?: string,
  status?: string
): Promise<ResourceSearchResult> {
  const crises = getActiveCrises();
  const crisis = crises.find((c) => c.id === crisisId || c.id.startsWith(crisisId));

  if (!crisis) {
    return {
      crisisId,
      crisisLocation: 'Unknown',
      resources: [],
      summary: { total: 0, available: 0, allocated: 0, depleted: 0, byType: {} },
    };
  }

  let resources = getResourcesByCrisis(crisis.id);

  if (resourceType) {
    resources = resources.filter((r) => r.type.toLowerCase() === resourceType.toLowerCase());
  }
  if (status) {
    resources = resources.filter((r) => r.status.toLowerCase() === status.toLowerCase());
  }

  const summary = buildSummary(resources);

  return {
    crisisId: crisis.id,
    crisisLocation: crisis.location,
    resources,
    summary,
  };
}

function buildSummary(resources: ResourceRow[]): ResourceSummary {
  const summary: ResourceSummary = {
    total: 0,
    available: 0,
    allocated: 0,
    depleted: 0,
    byType: {},
  };

  for (const r of resources) {
    summary.total += r.quantity;
    if (r.status === 'available') summary.available += r.quantity;
    if (r.status === 'allocated') summary.allocated += r.quantity;
    if (r.status === 'depleted') summary.depleted += r.quantity;

    if (!summary.byType[r.type]) summary.byType[r.type] = { total: 0, available: 0 };
    summary.byType[r.type].total += r.quantity;
    if (r.status === 'available') summary.byType[r.type].available += r.quantity;
  }

  return summary;
}

export function formatResourceReport(result: ResourceSearchResult): string {
  if (result.resources.length === 0) {
    return `📦 RESOURCE REPORT — ${result.crisisLocation}\nNo resources logged yet.`;
  }

  const { summary } = result;
  const typeLines = Object.entries(summary.byType)
    .map(([type, data]) => `• ${type}: ${data.available}/${data.total} available`)
    .join('\n');

  return `📦 RESOURCE REPORT — ${result.crisisLocation}
Total: ${summary.total} | Available: ${summary.available} | Allocated: ${summary.allocated}

By Type:
${typeLines}

${result.resources.length} resources tracked across ${Object.keys(summary.byType).length} categories.`;
}
