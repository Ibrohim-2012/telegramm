import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { TelegramService } from '../services/TelegramService.js';
import type { Message, TgEvent } from '../types.js';

export interface Row {
  feature: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

export interface LiveCtx {
  svc: TelegramService;
  /** Builds a fresh service from the saved session (simulates a server restart). */
  restart?: () => Promise<TelegramService>;
  /** Asked at the very end; returning true logs out. */
  confirmLogout?: () => Promise<boolean>;
  /** Query for the global search check (real: a well-known name). */
  searchQuery: string;
  log: (line: string) => void;
  eventTimeoutMs?: number;
}

/* ---------- tiny PNG encoder (no deps) so the photo test needs no fixtures ---------- */
const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

export function makePng(w = 96, h = 64): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x * 3] = Math.round((x / w) * 255);
      raw[row + 2 + x * 3] = Math.round((y / h) * 255);
      raw[row + 3 + x * 3] = 160;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const isImage = (b: Buffer) => (b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') || b.subarray(0, 5).toString() === '<svg ';

/** Resolves with the first event matching `pred`, or rejects on timeout. Subscribe BEFORE triggering the action. */
function expectEvent(svc: TelegramService, pred: (e: TgEvent) => boolean, ms: number, what: string) {
  let off = () => {};
  let timer: NodeJS.Timeout;
  const p = new Promise<TgEvent>((resolve, reject) => {
    off = svc.onEvent((e) => {
      if (pred(e)) {
        clearTimeout(timer);
        off();
        resolve(e);
      }
    });
    timer = setTimeout(() => {
      off();
      reject(new Error(`${what}: ${ms / 1000}s ichida realtime hodisa kelmadi`));
    }, ms);
  });
  return Object.assign(p, { cancel: () => (clearTimeout(timer), off()) });
}

class Stop extends Error {}

/**
 * Exercises the whole stack against the user's own "Saved Messages" only. Stops at the first failure
 * (after cleaning up whatever it created) so the cause is obvious.
 */
export async function runLiveChecks(ctx: LiveCtx): Promise<Row[]> {
  const rows: Row[] = [];
  const created: number[] = [];
  let svc = ctx.svc;
  const ms = ctx.eventTimeoutMs ?? 15_000;
  const tag = `[live-test ${Date.now().toString(36)}]`;

  const step = async (feature: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn();
      rows.push({ feature, status: 'pass', detail });
      ctx.log(`  ✅ ${feature} — ${detail}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({ feature, status: 'fail', detail: msg });
      ctx.log(`  ❌ ${feature} — ${msg}`);
      throw new Stop(msg);
    }
  };
  const skip = (feature: string, why: string) => {
    rows.push({ feature, status: 'skip', detail: why });
    ctx.log(`  ⏭  ${feature} — ${why}`);
  };
  const need: (cond: unknown, msg: string) => asserts cond = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };
  const track = (m: Message) => (created.push(m.id), m);

  const me = await svc.getMe();
  const saved = me.id; // Saved Messages == chat with yourself
  ctx.log(`Faqat "Saqlangan xabarlar" (id ${saved}) ishlatiladi.`);

  try {
    await step('Profil (getMe)', async () => {
      need(me.id && me.firstName !== undefined, 'profil bo‘sh');
      return `${me.firstName}${me.username ? ` @${me.username}` : ''}`;
    });

    await step('Dialog ro‘yxati + o‘qilmaganlar', async () => {
      const page = await svc.getDialogs({ limit: 30, offset: 0 });
      need(Array.isArray(page.items) && page.total >= page.items.length, 'dialog ro‘yxati noto‘g‘ri');
      need(page.items.every((d) => d.id && Number.isInteger(d.unread) && d.unread >= 0), 'unread hisoblagichlari noto‘g‘ri');
      const unread = page.items.reduce((n, d) => n + d.unread, 0);
      return `${page.items.length}/${page.total} ta chat, jami o‘qilmagan: ${unread}`;
    });

    let sent!: Message;
    await step('Matn yuborish + realtime qabul', async () => {
      const ev = expectEvent(svc, (e) => e.type === 'message:new' && e.message.text.includes(tag) && e.message.dialogId === saved, ms, 'message:new');
      try {
        sent = track(await svc.sendMessage(saved, `${tag} salom **dunyo**`));
      } catch (e) {
        ev.cancel();
        throw e;
      }
      await ev;
      need(sent.out && sent.dialogId === saved, 'yuborilgan xabar noto‘g‘ri');
      return `id ${sent.id}`;
    });

    await step('Tahrirlash (edit) + realtime', async () => {
      const ev = expectEvent(svc, (e) => e.type === 'message:edit' && e.message.id === sent.id, ms, 'message:edit');
      let edited: Message;
      try {
        edited = await svc.editMessage(saved, sent.id, `${tag} tahrirlandi`);
      } catch (e) {
        ev.cancel();
        throw e;
      }
      await ev;
      need(edited.text.includes('tahrirlandi'), 'matn o‘zgarmadi');
      const h = await svc.getHistory(saved, { limit: 10 });
      need(h.items.find((m) => m.id === sent.id)?.text.includes('tahrirlandi'), 'tarixda tahrir ko‘rinmadi');
      return 'matn yangilandi';
    });

    let reply!: Message;
    await step('Javob (reply)', async () => {
      reply = track(await svc.sendMessage(saved, `${tag} javob`, sent.id));
      need(reply.replyToId === sent.id, 'replyToId mos kelmadi');
      const h = await svc.getHistory(saved, { limit: 10 });
      need(h.items.find((m) => m.id === reply.id)?.replyToId === sent.id, 'tarixda reply bog‘lanishi yo‘q');
      return `#${reply.id} → #${sent.id}`;
    });

    await step('O‘chirish (delete)', async () => {
      await svc.deleteMessages(saved, [reply.id], true);
      const h = await svc.getHistory(saved, { limit: 20 });
      need(!h.items.some((m) => m.id === reply.id), 'o‘chirilgan xabar tarixda turibdi');
      created.splice(created.indexOf(reply.id), 1);
      return `#${reply.id} o‘chirildi`;
    });

    await step('Rasm yuborish + yuklab olish', async () => {
      const png = makePng();
      const m = track(await svc.sendMedia(saved, { name: 'live-test.png', mime: 'image/png', data: png }, { caption: `${tag} rasm`, asFile: false }));
      need(m.media?.kind === 'photo', `rasm kutilgan edi, keldi: ${m.media?.kind ?? 'media yo‘q'}`);
      const full = await svc.openMedia(saved, m.id, false);
      need(full.data.length > 0 && isImage(full.data), 'yuklangan rasm bo‘sh yoki rasm emas');
      const thumb = await svc.openMedia(saved, m.id, true);
      need(thumb.data.length > 0, 'preview bo‘sh');
      return `to‘liq ${full.data.length} B, preview ${thumb.data.length} B`;
    });

    await step('Fayl yuborish + bayt-baytiga yuklab olish', async () => {
      const data = randomBytes(100 * 1024);
      const m = track(await svc.sendMedia(saved, { name: 'live-test.bin', mime: 'application/octet-stream', data }, { asFile: true }));
      need(m.media?.kind === 'file', `fayl kutilgan edi, keldi: ${m.media?.kind ?? 'media yo‘q'}`);
      const back = await svc.openMedia(saved, m.id, false);
      need(back.data.equals(data), `baytlar mos emas (${back.data.length} ≠ ${data.length})`);
      return `${data.length} B bir xil`;
    });

    await step('Tarix + sahifalash', async () => {
      for (let i = 1; i <= 3; i++) track(await svc.sendMessage(saved, `${tag} sahifa ${i}`));
      const p1 = await svc.getHistory(saved, { limit: 4 });
      need(p1.items.length === 4 && p1.hasMore, `1-sahifa: ${p1.items.length} ta, hasMore=${p1.hasMore}`);
      const ids1 = p1.items.map((m) => m.id);
      need(ids1.every((x, i) => i === 0 || x > ids1[i - 1]!), 'xabarlar tartibi noto‘g‘ri');
      const p2 = await svc.getHistory(saved, { limit: 4, beforeId: ids1[0]! });
      need(p2.items.length > 0, '2-sahifa bo‘sh');
      need(p2.items.every((m) => m.id < ids1[0]!), '2-sahifa xabarlari 1-sahifa bilan kesishyapti');
      need(new Set([...p1.items, ...p2.items].map((m) => m.id)).size === p1.items.length + p2.items.length, 'dublikat xabarlar');
      return `${p1.items.length} + ${p2.items.length} ta, kesishish yo‘q`;
    });

    await step('Qidiruv (global)', async () => {
      const r = await svc.searchGlobal(ctx.searchQuery);
      need(r.length > 0, `"${ctx.searchQuery}" bo‘yicha natija yo‘q`);
      need(r.every((d) => d.id && d.title !== undefined), 'natija shakli noto‘g‘ri');
      return `${r.length} ta natija ("${ctx.searchQuery}")`;
    });

    await step('O‘qildi deb belgilash (markRead)', async () => {
      const last = (await svc.getHistory(saved, { limit: 1 })).items[0];
      need(last, 'tarix bo‘sh');
      await svc.markRead(saved, last.id);
      const d = (await svc.getDialogs({ limit: 100, offset: 0 })).items.find((x) => x.id === saved);
      need(!d || d.unread === 0, `Saqlangan xabarlar unread=${d?.unread}`);
      return 'unread = 0';
    });

    if (ctx.restart) {
      await step('Server qayta ishga tushishi → saqlangan sessiya', async () => {
        await svc.dispose();
        svc = await ctx.restart!();
        need(svc.getAuthState() === 'ready', `sessiya tiklanmadi (holat: ${svc.getAuthState()})`);
        const again = await svc.getMe();
        need(again.id === me.id, 'boshqa akkaunt ochildi');
        const h = await svc.getHistory(saved, { limit: 3 });
        need(h.items.length > 0, 'qayta ulanishdan keyin tarix bo‘sh');
        return 'qayta kod so‘ralmadi';
      });
    } else {
      skip('Server qayta ishga tushishi → saqlangan sessiya', 'MOCK rejimda sessiya fayli yo‘q');
    }
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
  } finally {
    // Always leave Saved Messages as we found it.
    if (created.length) {
      try {
        await svc.deleteMessages(saved, created, true);
        ctx.log(`  🧹 ${created.length} ta sinov xabari o‘chirildi`);
      } catch (e) {
        ctx.log(`  ⚠ tozalashda xato: ${e instanceof Error ? e.message : e}. "${tag}" bilan boshlanuvchi xabarlarni qo‘lda o‘chiring`);
      }
    }
  }

  if (rows.every((r) => r.status !== 'fail') && ctx.confirmLogout && (await ctx.confirmLogout())) {
    try {
      await svc.logout();
      rows.push({ feature: 'Chiqish (logout)', status: 'pass', detail: 'sessiya fayli o‘chirildi' });
      ctx.log('  ✅ Chiqish (logout)');
    } catch (e) {
      rows.push({ feature: 'Chiqish (logout)', status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return rows;
}

export function formatTable(rows: Row[]): string {
  const icon = { pass: '✅', fail: '❌', skip: '⏭ ' } as const;
  const w = Math.max(...rows.map((r) => r.feature.length), 7);
  const lines = rows.map((r) => `${icon[r.status]} ${r.feature.padEnd(w)}  ${r.detail}`);
  return lines.join('\n');
}
