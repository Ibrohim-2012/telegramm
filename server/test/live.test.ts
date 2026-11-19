import { describe, expect, it } from 'vitest';
import { MockTelegramService, MOCK_CODE } from '../src/services/MockTelegramService.js';
import { formatTable, makePng, runLiveChecks } from '../src/tools/liveChecks.js';

const ready = async () => {
  const s = new MockTelegramService({ realtimeMs: 0 });
  await s.sendCode('+998901234567');
  await s.signIn(MOCK_CODE);
  return s;
};

describe('live-check runner (dry run on the mock)', () => {
  it('passes every check and leaves Saved Messages clean', async () => {
    const svc = await ready();
    const before = (await svc.getHistory('1', { limit: 100 })).items.length;
    const lines: string[] = [];
    const rows = await runLiveChecks({ svc, searchQuery: 'barno', log: (l) => lines.push(l), eventTimeoutMs: 500 });
    expect(rows.filter((r) => r.status === 'fail')).toEqual([]);
    expect(rows.filter((r) => r.status === 'pass').length).toBeGreaterThanOrEqual(11);
    expect((await svc.getHistory('1', { limit: 100 })).items.length).toBe(before); // cleaned up
    expect(formatTable(rows)).toContain('Fayl yuborish');
  });

  it('only ever writes to Saved Messages (the chat with yourself)', async () => {
    const svc = await ready();
    const touched = new Set<string>();
    for (const m of ['sendMessage', 'editMessage', 'deleteMessages', 'sendMedia', 'markRead'] as const) {
      const orig = svc[m].bind(svc) as (id: string, ...a: unknown[]) => Promise<unknown>;
      (svc as unknown as Record<string, unknown>)[m] = (id: string, ...a: unknown[]) => (touched.add(id), orig(id, ...a));
    }
    await runLiveChecks({ svc, searchQuery: 'barno', log: () => {}, eventTimeoutMs: 500 });
    expect([...touched]).toEqual(['1']);
  });

  it('stops at the first failure, reports it, and still cleans up', async () => {
    const svc = await ready();
    const orig = svc.editMessage.bind(svc);
    svc.editMessage = async () => {
      throw new Error('boom');
    };
    const rows = await runLiveChecks({ svc, searchQuery: 'barno', log: () => {}, eventTimeoutMs: 300 });
    const fail = rows.find((r) => r.status === 'fail');
    expect(fail?.feature).toContain('Tahrirlash');
    expect(rows.at(-1)).toBe(fail); // nothing ran after the failure
    svc.editMessage = orig;
    const leftovers = (await svc.getHistory('1', { limit: 50 })).items.filter((m) => m.text.includes('[live-test'));
    expect(leftovers).toEqual([]);
  });

  it('fails clearly when the realtime event never arrives', async () => {
    const svc = await ready();
    svc.onEvent = () => () => {}; // swallow subscriptions: no events can be received
    const rows = await runLiveChecks({ svc, searchQuery: 'barno', log: () => {}, eventTimeoutMs: 100 });
    expect(rows.find((r) => r.status === 'fail')?.detail).toContain('realtime');
  });

  it('can log out at the end when confirmed', async () => {
    const svc = await ready();
    const rows = await runLiveChecks({ svc, searchQuery: 'barno', log: () => {}, eventTimeoutMs: 500, confirmLogout: async () => true });
    expect(rows.at(-1)).toMatchObject({ feature: 'Chiqish (logout)', status: 'pass' });
    expect(svc.getAuthState()).toBe('logged_out');
  });
});

describe('makePng', () => {
  it('produces a valid PNG header, IHDR size and IEND trailer', () => {
    const png = makePng(10, 7);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(10);
    expect(png.readUInt32BE(20)).toBe(7);
    expect(png.subarray(-8, -4).toString()).toBe('IEND');
  });
});
