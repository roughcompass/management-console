import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const BADGE = '[data-mfe="payments-dash"] tbody tr:first-child .badge'
const SUMMARY_CARD = '[data-mfe="payments-dash"] .saltCard'
const THREAD = '.adl-thread'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Threads persist across reloads, so each test starts from a clean preview.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector('[data-mfe="payments-dash"] tbody tr')
})

async function comment(page: Page, selector: string, body: string) {
  await page.getByRole('button', { name: 'Comment on a node' }).click()
  await page.locator(selector).first().click({ force: true })
  await page.locator('.adl-composer textarea').fill(body)
  await page.locator('.adl-composer').getByRole('button', { name: 'Comment' }).click()
  await expect(page.locator('.adl-composer')).toHaveCount(0)
}

async function rebuild(page: Page) {
  await page.getByRole('button', { name: /payments-dash 2\.5\.0/ }).click()
  await expect(page.locator('[data-mfe="payments-dash"][data-mfe-version="2.5.0"]')).toBeVisible()
}

test('mounts two federated remotes under one instrumented Frame', async ({ page }) => {
  await expect(page.locator('[data-mfe="payments-dash"]')).toBeVisible()
  await expect(page.locator('[data-mfe="limits-panel"]')).toBeVisible()
  // The shell and both remotes are built separately and instrumented
  // separately, so every zone carries its own build's source ids.
  await expect(
    page.locator('[data-mfe="payments-dash"] [data-de-provenance-id]').first(),
  ).toBeVisible()
  await expect(
    page.locator('[data-mfe="limits-panel"] [data-de-provenance-id]').first(),
  ).toBeVisible()
})

test('anchors a comment to a node inside a remote', async ({ page }) => {
  await comment(page, BADGE, 'this badge is the wrong blue')

  const pin = page.locator('.adl-pin')
  await expect(pin).toHaveCount(1)
  await expect(pin).toHaveAttribute('data-status', 'resolved')
  // The path crosses the federation boundary: Frame and zone from the host
  // contract, components from the remote's own build. PositionsTable appears
  // now that the Salt table rows are instrumented too.
  await expect(page.locator(`${THREAD} .adl-mono`).first()).toHaveText(
    'Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PaymentsDash > PositionsTable > StatusBadge',
  )
  // The application id comes from the remote's own manifest, not from its
  // federation name: they are allowed to differ, and here they do.
  await expect(page.locator(`${THREAD} .adl-mono`).nth(1)).toContainText('payments-web · src/v1/')
})

test('carries a comment across a remote version bump and says how it held', async ({ page }) => {
  await comment(page, BADGE, 'this badge is the wrong blue')
  await rebuild(page)

  const thread = page.locator(THREAD).first()
  await expect(thread.getByText('this badge is the wrong blue')).toBeVisible()
  // Same level, lower confidence: the authored instance key carried it into a
  // new file with restructured markup.
  await expect(thread.locator('.adl-chip[data-status="degraded"]')).toBeVisible()
  await expect(thread).toContainText('provenance · 0.80')
  await expect(thread.locator('.adl-stale')).toContainText('mfes.payments-dash: 2.4.1 → 2.5.0')
  await expect(page.locator('.adl-pin')).toHaveCount(1)
})

test('orphans a comment on a node the rebuild removed, with the crop to show what it was', async ({
  page,
}) => {
  await comment(page, SUMMARY_CARD, 'this card is too quiet')
  await rebuild(page)

  const thread = page.locator(THREAD).first()
  await expect(thread.locator('.adl-chip[data-status="orphaned"]')).toBeVisible()
  await expect(page.getByText('1 lost their anchor in this build')).toBeVisible()
  await expect(page.locator('.adl-metric', { hasText: 'ORPHAN RATE' })).toContainText('100%')
  await expect(page.locator('.adl-pin')).toHaveCount(0)
  // An orphan the reviewer cannot recognise is an orphan nobody triages.
  await expect(thread.locator('img.adl-crop')).toBeVisible()
  await expect(thread.getByText(/why \(5 levels tried\)/)).toBeVisible()
})

test('captures feedback on things that are not on screen', async ({ page }) => {
  await page.getByRole('button', { name: /Show feedback/ }).click()
  await page.getByRole('tab', { name: 'Network' }).click()
  const request = page
    .locator('.adl-panel-body .adl-card', { hasText: '/api/accounts/:id/positions' })
    .first()
  await expect(request).toBeVisible()
  await request.getByRole('button', { name: 'Comment' }).click()
  await request.locator('input').fill('this should go through the entitlement-gated hook')
  await request.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('tab', { name: 'Runtime' }).click()
  // Federation activity is a runtime event like any other.
  await expect(
    page.locator('.adl-panel-body .adl-card', { hasText: 'remote-loaded' }).first(),
  ).toBeVisible()
  await expect(
    page.locator('.adl-panel-body .adl-card', { hasText: 'entitlement-decision' }).first(),
  ).toBeVisible()

  await page.getByRole('tab', { name: 'Build' }).click()
  // Inactive tab panels stay mounted, so scope to what is actually on screen.
  await expect(
    page.locator('.adl-card:visible', { hasText: 'payments-web (remote)' }).first(),
  ).toContainText('ui-provenance-manifest.json')
  await expect(page.locator('.adl-card:visible', { hasText: '@salt-ds/core' }).first()).toBeVisible()

  await page.getByRole('tab', { name: 'Comments' }).click()
  const thread = page.locator(THREAD, { hasText: 'entitlement-gated hook' })
  await expect(thread.locator('.adl-mono').first()).toContainText(
    'network-interaction · GET /api/accounts/:id/positions',
  )

  // A non-visual anchor does not depend on any DOM surviving the rebuild.
  await rebuild(page)
  await expect(thread.locator('.adl-chip[data-status="resolved"]')).toBeVisible()
})

test('keeps threads across a reload of the preview', async ({ page }) => {
  await comment(page, BADGE, 'this badge is the wrong blue')
  await page.reload()
  await page.waitForSelector('[data-mfe="payments-dash"] tbody tr')

  await page.getByRole('button', { name: /Show feedback/ }).click()
  const thread = page.locator(THREAD).first()
  await expect(thread.getByText('this badge is the wrong blue')).toBeVisible()
  await expect(thread.locator('.adl-chip[data-status="resolved"]')).toBeVisible()
})
