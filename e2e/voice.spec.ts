import { API, expect, openChat, test } from './fixtures';

// Chrome/Edge's fake microphone: a generated beep, no real device or permission prompt.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, permissions: ['microphone'] });

test.describe('voice messages', () => {
  test('record, send, and the result is a playable Ogg/Opus voice note', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const before = await page.getByTestId('voice').count();
    await page.getByRole('button', { name: 'Ovozli xabar', exact: true }).click();
    const bar = page.getByTestId('voice-bar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Yozilmoqda');
    await expect(page.getByTestId('voice-time')).not.toHaveText('0:00'); // the timer runs
    await page.waitForTimeout(1500);
    await bar.getByRole('button', { name: 'Ovozli xabarni yuborish' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.getByTestId('voice')).toHaveCount(before + 1);

    // what reached the server is a real Ogg Opus file that the browser can decode
    const audioSrc = await page.locator('audio').last().getAttribute('src');
    expect(audioSrc).toBeTruthy();
    const res = await page.evaluate(async (src) => {
      const r = await fetch(src!, { credentials: 'include' });
      const b = new Uint8Array(await r.arrayBuffer());
      const magic = String.fromCharCode(...b.slice(0, 4));
      const dur = await new Promise<number>((ok) => {
        const a = new Audio(URL.createObjectURL(new Blob([b], { type: 'audio/ogg' })));
        a.onloadedmetadata = () => ok(a.duration);
        a.onerror = () => ok(-1);
      });
      return { magic, type: r.headers.get('content-type'), dur, size: b.length };
    }, audioSrc);
    expect(res.magic).toBe('OggS');
    expect(res.size).toBeGreaterThan(500);
    expect(res.dur === Infinity || res.dur > 0.5).toBe(true); // decodable (Infinity = duration not yet known for a stream)
    expect(res.type).toContain('audio/ogg');
  });

  test('trash button and Escape throw the recording away', async ({ loggedIn: page, request }) => {
    await openChat(page, 'Bobur Yusupov');
    const count = () => page.getByTestId('voice').count();
    const before = await count();
    await page.getByRole('button', { name: 'Ovozli xabar', exact: true }).click();
    await expect(page.getByTestId('voice-bar')).toBeVisible();
    await page.getByRole('button', { name: 'Yozishni bekor qilish' }).click();
    await expect(page.getByTestId('voice-bar')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ovozli xabar', exact: true }).click();
    await expect(page.getByTestId('voice-bar')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('voice-bar')).toHaveCount(0);
    await expect(page.getByRole('log')).toBeVisible(); // Escape stopped the recording only
    expect(await count()).toBe(before);
    expect((await request.get(`${API}/health`)).ok()).toBe(true);
  });

  test('a recording shorter than a second is not sent', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const before = await page.getByTestId('voice').count();
    await page.getByRole('button', { name: 'Ovozli xabar', exact: true }).click();
    await page.getByRole('button', { name: 'Ovozli xabarni yuborish' }).click();
    await expect(page.getByText('Xabar juda qisqa')).toBeVisible();
    expect(await page.getByTestId('voice').count()).toBe(before);
  });
});

test.describe('round video messages', () => {
  test('camera button opens the recorder; record, send, and the bubble-less circle plays', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const before = await page.getByTestId('round').count();
    await page.getByRole('button', { name: 'Video xabar', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Dumaloq video xabar' });
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('qizil tugmani bosing');
    const rec = dlg.getByRole('button', { name: 'Yozishni boshlash' });
    await expect(rec).toBeEnabled(); // camera is live
    await rec.click();
    await expect(dlg.getByTestId('round-time')).toContainText('●');
    await page.waitForTimeout(1800);
    await dlg.getByRole('button', { name: 'Ovozli xabarni yuborish' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId('round')).toHaveCount(before + 1, { timeout: 15_000 });

    const circle = page.getByTestId('round').last();
    const box = (await circle.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(2); // a circle, not a rectangle
    expect(await circle.evaluate((e) => getComputedStyle(e).borderRadius)).not.toBe('0px');
    const info = await circle.locator('video').evaluate(async (v: HTMLVideoElement) => {
      await new Promise<void>((ok) => (v.readyState >= 1 ? ok() : v.addEventListener('loadedmetadata', () => ok(), { once: true })));
      return { w: v.videoWidth, h: v.videoHeight, d: v.duration };
    });
    expect(info.w).toBe(info.h); // square recording
    expect(info.w).toBe(384);
    await circle.click();
    await expect.poll(() => circle.locator('video').evaluate((v: HTMLVideoElement) => !v.paused || v.currentTime > 0)).toBe(true);
  });

  test('cancel and Escape close the recorder without sending', async ({ loggedIn: page }) => {
    await openChat(page, 'Bobur Yusupov');
    const before = await page.getByTestId('round').count();
    await page.getByRole('button', { name: 'Video xabar', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Dumaloq video xabar' });
    await dlg.getByRole('button', { name: 'Yozishni bekor qilish' }).click();
    await expect(dlg).toHaveCount(0);
    await page.getByRole('button', { name: 'Video xabar', exact: true }).click();
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    expect(await page.getByTestId('round').count()).toBe(before);
  });
});
