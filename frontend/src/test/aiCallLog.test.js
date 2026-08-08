/**
 * AI call instrumentation, and the removal of client-side retry stacking.
 *
 * Every outbound AI call is counted with the trigger that caused it, so a walk
 * through the app can be audited against what the client actually asked for.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { recordAiCall, aiCallCount, aiCallSummary, aiCallList, resetAiCalls } from '../lib/aiCallLog';
import { api } from '../api';

beforeEach(() => { resetAiCalls(); vi.restoreAllMocks(); });
afterEach(() => { resetAiCalls(); });

describe('aiCallLog', () => {
  it('counts calls', () => {
    recordAiCall('execroom:generate-solutions', '/api/v1/ai/chat');
    recordAiCall('advisor:chat-send', '/api/v1/ai/chat');
    expect(aiCallCount()).toBe(2);
  });

  it('groups by trigger so a stray caller is identifiable', () => {
    recordAiCall('execroom:generate-solutions', '/api/v1/ai/chat');
    recordAiCall('execroom:generate-solutions', '/api/v1/ai/chat');
    recordAiCall('wizard:generate-questionnaire', '/api/v1/ai/questionnaire');
    expect(aiCallSummary()).toEqual({
      total: 3,
      byTrigger: { 'execroom:generate-solutions': 2, 'wizard:generate-questionnaire': 1 },
    });
  });

  it('labels an unlabelled call rather than hiding it', () => {
    recordAiCall(undefined, '/api/v1/ai/chat');
    expect(aiCallList()[0].trigger).toBe('unlabelled');
  });

  it('reset zeroes the counters for a clean manual pass', () => {
    recordAiCall('a', '/x');
    resetAiCalls();
    expect(aiCallCount()).toBe(0);
  });

  it('exposes the counters on window for a manual walk-through', () => {
    expect(typeof window.__aiCalls.summary).toBe('function');
    expect(typeof window.__aiCalls.reset).toBe('function');
  });
});

describe('api.aiPost', () => {
  it('records the call with its trigger', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: 'hi' }) })));
    await api.aiPost('/api/v1/ai/chat', { message: 'x' }, undefined, 'execroom:room-chat');
    expect(aiCallSummary()).toEqual({ total: 1, byTrigger: { 'execroom:room-chat': 1 } });
  });

  it('does not retry on top of the backend — one client action, one request', async () => {
    // app.ai_client already backs off on 429/5xx/529 and app.ai_providers
    // already fails over. A client retry loop here multiplied every overload
    // into (3 x backend retries x providers) upstream calls.
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 529, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.aiPost('/api/v1/ai/chat', { message: 'x' }, undefined, 'execroom:room-chat'))
      .rejects.toThrow(/529/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiCallCount()).toBe(1);
  });
});
