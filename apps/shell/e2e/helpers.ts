import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** The dock's way into the comment list, which is also the open-comment count. */
const PANEL_TOGGLE = /^\d+ comments?$/

export async function openPanel(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: PANEL_TOGGLE })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
}

export async function closePanel(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: PANEL_TOGGLE })
  if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click()
}

/**
 * Comment mode is on when the page loads, so a click on the page is a comment.
 * The panel overlays the right edge, so it goes away first - which is what a
 * reviewer does too.
 */
export async function comment(page: Page, selector: string, body: string): Promise<void> {
  await closePanel(page)
  await page.locator(selector).first().click({ force: true })
  await page.locator('.adl-composer textarea').fill(body)
  await page.locator('.adl-composer').getByRole('button', { name: 'Comment' }).click()
  await expect(page.locator('.adl-composer')).toHaveCount(0)
}

/**
 * Comment mode swallows clicks on the page, by design. A test that operates the
 * application rather than commenting on it switches first, the same as a
 * reviewer who wants to use the page.
 */
export async function browse(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Browse', exact: true }).click()
}

/**
 * Ask for the next version, the way a reviewer does. The shell has the next
 * build on the shelf, so this is what produces payments-dash 2.5.0.
 */
export async function requestNextVersion(page: Page): Promise<void> {
  await openPanel(page)
  await page.getByRole('button', { name: /^Request changes/ }).click()
  await page.getByRole('button', { name: /^Send \d+ comments?$/ }).click()
  await expect(page.locator('[data-mfe="payments-dash"][data-mfe-version="2.5.0"]')).toBeVisible({
    timeout: 15_000,
  })
}
