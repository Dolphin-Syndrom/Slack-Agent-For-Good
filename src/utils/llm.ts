import Groq from 'groq-sdk';
import { config } from '../config';

// ── Groq Client Singleton ─────────────────────────────────────────────────────

let _groq: Groq | null = null;

export function getGroqClient(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: config.groq.apiKey });
  return _groq;
}

// ── Type Definitions ──────────────────────────────────────────────────────────

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
};

export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type LLMResponse = {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
};

// ── Core Chat Function ────────────────────────────────────────────────────────

export async function chat(
  messages: Message[],
  tools?: ToolDefinition[],
  opts?: { maxTokens?: number; temperature?: number }
): Promise<LLMResponse> {
  const groq = getGroqClient();

  const completion = await groq.chat.completions.create({
    model: config.groq.model,
    messages: messages as any,
    tools: tools as any,
    tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
    max_tokens: opts?.maxTokens ?? 4096,
    temperature: opts?.temperature ?? 0.3,
  });

  const choice = completion.choices[0];
  return {
    content: choice.message.content ?? null,
    toolCalls: (choice.message.tool_calls as ToolCall[]) ?? [],
    finishReason: choice.finish_reason ?? 'stop',
  };
}

// ── Agentic Loop ──────────────────────────────────────────────────────────────
// Runs LLM with tool calls until the model stops calling tools
// toolHandlers: map of tool name → async function returning a string result

export async function runAgentLoop(
  systemPrompt: string,
  userMessage: string,
  tools: ToolDefinition[],
  toolHandlers: Record<string, (args: Record<string, unknown>) => Promise<string>>,
  opts?: { maxIterations?: number; temperature?: number }
): Promise<string> {
  const maxIter = opts?.maxIterations ?? 10;
  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < maxIter; i++) {
    const response = await chat(messages, tools, { temperature: opts?.temperature });

    if (response.toolCalls.length === 0) {
      return response.content ?? '';
    }

    // Append assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: response.content ?? '',
      ...(response.toolCalls.length > 0 ? { tool_calls: response.toolCalls } as any : {}),
    });

    // Execute all tool calls
    for (const toolCall of response.toolCalls) {
      const handler = toolHandlers[toolCall.function.name];
      let result: string;

      if (handler) {
        try {
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          result = await handler(args);
        } catch (err) {
          result = `Error executing tool: ${(err as Error).message}`;
        }
      } else {
        result = `Tool "${toolCall.function.name}" not found.`;
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }

    if (response.finishReason === 'stop') break;
  }

  // Final call to get summary
  const final = await chat(messages, undefined);
  return final.content ?? 'Agent completed without response.';
}

// ── Simple Completion ─────────────────────────────────────────────────────────

export async function complete(
  systemPrompt: string,
  userMessage: string,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    undefined,
    opts
  );
  return response.content ?? '';
}
