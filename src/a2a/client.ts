import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { createA2ATask, updateA2ATask, getA2ATask } from '../db/queries';
import type { AgentId } from './agent-card';

// ── A2A Protocol Types ────────────────────────────────────────────────────────

export type TaskStatus = 'submitted' | 'working' | 'completed' | 'failed';

export type A2ATask = {
  id: string;
  skill: string;
  input: unknown;
  metadata?: Record<string, unknown>;
};

export type A2ATaskResult = {
  taskId: string;
  status: TaskStatus;
  output?: unknown;
  error?: string;
};

// ── A2A Client ────────────────────────────────────────────────────────────────
// Sends tasks to other agents via HTTP POST

export async function sendA2ATask(
  agentId: AgentId,
  skill: string,
  input: unknown,
  metadata?: Record<string, unknown>
): Promise<A2ATaskResult> {
  const taskId = uuidv4();
  const baseUrl = config.app.a2aBaseUrl;

  // Log task in DB
  createA2ATask(agentId, { skill, input, metadata });

  try {
    const response = await axios.post(
      `${baseUrl}/a2a/${agentId}`,
      {
        jsonrpc: '2.0',
        method: 'tasks/send',
        id: taskId,
        params: {
          id: taskId,
          skill,
          message: {
            role: 'user',
            parts: [{ type: 'text', text: typeof input === 'string' ? input : JSON.stringify(input) }],
          },
          metadata,
        },
      },
      { timeout: 60000 }
    );

    const result = response.data?.result;
    updateA2ATask(taskId, 'completed', result);
    return {
      taskId,
      status: 'completed',
      output: result,
    };
  } catch (err) {
    const error = (err as Error).message;
    updateA2ATask(taskId, 'failed', undefined, error);
    return {
      taskId,
      status: 'failed',
      error,
    };
  }
}

// ── Parallel A2A Dispatch ─────────────────────────────────────────────────────
// Send tasks to multiple agents simultaneously

export async function dispatchToAgents(
  tasks: Array<{ agentId: AgentId; skill: string; input: unknown }>
): Promise<A2ATaskResult[]> {
  return Promise.allSettled(
    tasks.map((t) => sendA2ATask(t.agentId, t.skill, t.input))
  ).then((results) =>
    results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { taskId: tasks[i].agentId, status: 'failed' as TaskStatus, error: r.reason?.message }
    )
  );
}
