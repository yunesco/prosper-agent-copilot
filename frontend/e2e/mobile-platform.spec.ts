import { expect, test } from '@playwright/test';
import { revealAgentFields, seedOriginal } from './seed';

for (const width of [390, 1024]) {
  test.describe(`touch platform at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true });

    test('editable controls retain readable fonts and the app keeps accessible viewport settings', async ({
      page,
    }) => {
      await seedOriginal(page);
      await page.goto('/');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
      await revealAgentFields(page);
      const name = page.getByLabel('Agent name', { exact: true });
      const guidelines = page.getByLabel('Client guidelines', { exact: true });
      for (const control of [name, guidelines]) {
        await expect(control).toHaveCSS('font-size', '16px');
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.locator('html')).toHaveCSS('overscroll-behavior', 'none');
      await expect(page.locator('body')).toHaveCSS('overscroll-behavior', 'none');
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('-webkit-text-size-adjust'),
        ),
      ).toBe('100%');
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
      expect(viewport).toContain('viewport-fit=cover');
      expect(viewport).toContain('interactive-widget=resizes-content');
      expect(viewport).not.toMatch(/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=/);

      // Exercise the explicit text-xs overrides used by real advanced controls.
      if (width < 768) await page.getByRole('button', { name: 'Graph', exact: true }).click();
      await page
        .getByRole('button', {
          name: "Inspect transition: Record the caller's name and reason once both are known.",
          exact: true,
        })
        .click();
      if (width < 768) await page.getByRole('button', { name: 'Details', exact: true }).click();
      await page.getByText('Function details', { exact: true }).click();
      await expect(page.getByLabel('Function name', { exact: true })).toHaveCSS('font-size', '16px');
      await page.getByText('Advanced JSON', { exact: true }).click();
      await expect(page.getByLabel('Collected fields JSON', { exact: true })).toHaveCSS('font-size', '16px');

      await page.getByRole('tab', { name: 'Copilot', exact: true }).click();
      const composer = page.getByLabel('Message Copilot', { exact: true });
      await expect(composer).toHaveCSS('font-size', '16px');
      await expect(composer).toHaveAttribute('enterkeyhint', 'send');
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
    });
  });
}
