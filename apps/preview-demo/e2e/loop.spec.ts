import { expect, test } from '@playwright/test'

const BADGE = '.positions tbody tr:first-child .badge'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.positions tbody tr')
})

async function commentOnNode(page: import('@playwright/test').Page, selector: string, body: string) {
  await page.getByRole('button', { name: 'Comment on a node' }).click()
  await page.locator(selector).click({ force: true })
  await page.locator('.adl-composer textarea').fill(body)
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
}

test('anchors a comment to a node in the running preview', async ({ page }) => {
  await commentOnNode(page, BADGE, 'this badge is the wrong blue')

  const pin = page.locator('.adl-pin')
  await expect(pin).toHaveCount(1)
  await expect(pin).toHaveAttribute('data-status', 'resolved')
  await expect(page.locator('.adl-card .adl-mono').first()).toHaveText(
    'Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PaymentsDash > PositionsTable > StatusBadge',
  )
})

test('carries a comment across a rebuild and says how it held', async ({ page }) => {
  await commentOnNode(page, BADGE, 'this badge is the wrong blue')
  await page.getByRole('button', { name: /payments-dash 2\.5\.0/ }).click()

  const card = page.locator('.adl-card').first()
  await expect(card.getByText('this badge is the wrong blue')).toBeVisible()
  // Same level, lower confidence: the authored instance key carried it into a
  // new file with restructured markup.
  await expect(card.locator('.adl-chip[data-status="degraded"]')).toBeVisible()
  await expect(card.locator('.adl-stale')).toContainText('mfes.payments-dash: 2.4.1')
  await expect(page.locator('.adl-pin')).toHaveCount(1)
})

test('orphans a comment on a node the rebuild removed, and shows the rate', async ({ page }) => {
  await commentOnNode(page, '.card h3', 'this heading is too quiet')
  await page.getByRole('button', { name: /payments-dash 2\.5\.0/ }).click()

  await expect(page.locator('.adl-chip[data-status="orphaned"]').first()).toBeVisible()
  await expect(page.getByText('1 lost their anchor in this build')).toBeVisible()
  await expect(page.locator('.adl-metric', { hasText: 'ORPHAN RATE' })).toContainText('100%')
  await expect(page.locator('.adl-pin')).toHaveCount(0)
  await expect(page.getByText(/why \(5 levels tried\)/)).toBeVisible()
})

test('captures feedback on things that are not on screen', async ({ page }) => {
  await page.getByRole('tab', { name: 'Network' }).click()
  // StrictMode runs the loading effect twice in dev, so the same call is
  // recorded twice. Both entries are real; comment on the first.
  const request = page
    .locator('.adl-panel-body .adl-card', { hasText: '/api/accounts/:id/positions' })
    .first()
  await expect(request).toBeVisible()
  await request.getByRole('button', { name: 'Comment' }).click()
  await request.locator('input.adl-input').fill('this should go through the entitlement-gated hook')
  await request.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('tab', { name: 'Runtime' }).click()
  const decision = page
    .locator('.adl-panel-body .adl-card', { hasText: 'entitlement-decision' })
    .first()
  await expect(decision).toBeVisible()

  await page.getByRole('tab', { name: 'Build' }).click()
  await expect(page.getByText('PREVIEW_TTL_MINUTES')).toBeVisible()

  await page.getByRole('tab', { name: 'Comments' }).click()
  const card = page.locator('.adl-card', { hasText: 'entitlement-gated hook' })
  await expect(card.locator('.adl-mono').first()).toContainText('network-interaction · GET /api/accounts/:id/positions')
  // A non-visual anchor does not depend on the DOM surviving the rebuild.
  await page.getByRole('button', { name: /payments-dash 2\.5\.0/ }).click()
  await expect(card.locator('.adl-chip[data-status="resolved"]')).toBeVisible()
})
