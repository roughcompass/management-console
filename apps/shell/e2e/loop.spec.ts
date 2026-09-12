import { expect, test } from '@playwright/test'
import { closePanel, comment, openPanel, requestNextVersion } from './helpers'

// The third row is the failed settlement, so the comment on it is one a
// reviewer of a Salt application would actually write.
const FAILED_STATUS = '[data-mfe="payments-dash"] tbody tr:nth-child(3) .status'
const SUMMARY_CARD = '[data-mfe="payments-dash"] .saltCard'
const THREAD = '.adl-thread'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Comments persist across reloads, so each test starts from a clean page.
  // These tests also read the engineering layer (paths, levels, the lock diff),
  // which a reviewer turns on once and the toolbar remembers.
  await page.evaluate(() => {
    localStorage.clear()
    localStorage.setItem('adl:details', '1')
  })
  await page.reload()
  await page.waitForSelector('[data-mfe="payments-dash"] tbody tr')
})

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

test('a click on the page is a comment, with no mode to arm first', async ({ page }) => {
  await comment(page, FAILED_STATUS, 'a failed settlement is an error, not a caution')

  const pin = page.locator('.adl-pin')
  await expect(pin).toHaveCount(1)
  await expect(pin).toHaveAttribute('data-status', 'resolved')

  await openPanel(page)
  // What she sees is the thing in the words of the page.
  await expect(page.locator(`${THREAD} .adl-thread-title`).first()).toHaveText(
    'Status badge “Failed” in Payments',
  )
  // The path crosses the federation boundary: Frame and zone from the host
  // contract, components from the remote's own build.
  await expect(page.locator(`${THREAD} .adl-mono`).first()).toHaveText(
    'Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PaymentsDash > PositionsTable > StatusBadge',
  )
  // The application id comes from the remote's own manifest, not from its
  // federation name: they are allowed to differ, and here they do.
  await expect(page.locator(`${THREAD} .adl-mono`).nth(1)).toContainText('payments-web · src/v1/')
})

test('carries a comment into the version it asked for, and says how it held', async ({ page }) => {
  await comment(page, FAILED_STATUS, 'a failed settlement is an error, not a caution')
  await requestNextVersion(page)

  const thread = page.locator(THREAD).first()
  await expect(thread.getByText('a failed settlement is an error, not a caution')).toBeVisible()
  // 2.5.0 is a different module, so the emitted source id from 2.4.1 is gone.
  // The component name and the authored instance key carry the anchor instead,
  // which is a weaker claim than an exact id match - so the comment says it
  // moved rather than pretending nothing did.
  await expect(thread.getByText('Moved')).toBeVisible()
  await expect(thread).toContainText('provenance · 0.75')
  await expect(thread.locator('.adl-stale')).toContainText('mfes.payments-dash: 2.4.1 → 2.5.0')
  await expect(page.locator('.adl-pin')).toHaveCount(1)
})

test('says a comment is gone when the new version removed what it was on', async ({ page }) => {
  await comment(page, SUMMARY_CARD, 'this card is too quiet')
  await requestNextVersion(page)

  const thread = page.locator(THREAD).first()
  await expect(thread.getByText('Gone')).toBeVisible()
  await expect(thread.getByText('This is not on the page in this version.')).toBeVisible()
  await expect(page.locator('.adl-pin')).toHaveCount(0)
  // A comment whose subject she cannot recognise is one nobody can triage.
  await expect(thread.locator('img.adl-crop')).toBeVisible()
  await expect(thread.getByText(/why \(5 levels tried\)/)).toBeVisible()
})

test('keeps and reverts versions from the Versions view', async ({ page }) => {
  await comment(page, FAILED_STATUS, 'a failed settlement is an error, not a caution')
  await requestNextVersion(page)

  await page.getByRole('tab', { name: 'Versions' }).click()
  await expect(page.getByText("You're viewing this")).toBeVisible()
  await expect(page.getByText(/Built from 1 comment/)).toBeVisible()

  // Wrong? Back to what she had, and the page really goes back.
  await page.getByRole('button', { name: 'Go back to Version 1' }).click()
  await expect(page.locator('[data-mfe="payments-dash"][data-mfe-version="2.4.1"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to Version 2' })).toBeVisible()

  // Right? Approve it, and it is marked ready to deploy.
  await page.getByRole('button', { name: 'Back to Version 2' }).click()
  await expect(page.locator('[data-mfe="payments-dash"][data-mfe-version="2.5.0"]')).toBeVisible()
  await page.getByRole('tab', { name: 'Versions' }).click()
  await page.getByRole('button', { name: 'Approve for deployment' }).click()
  await expect(page.getByText('Ready to deploy')).toBeVisible()
  await expect(page.getByText(/Approved by Dana Whitfield/)).toBeVisible()
})

test('captures feedback on things that are not on screen', async ({ page }) => {
  await openPanel(page)
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

  // A non-visual anchor does not depend on any DOM surviving the new version.
  await requestNextVersion(page)
  await expect(thread.locator('.adl-chip[data-status="resolved"]').first()).toBeVisible()
})

test('keeps comments across a reload of the page', async ({ page }) => {
  await comment(page, FAILED_STATUS, 'a failed settlement is an error, not a caution')
  await closePanel(page)
  await page.reload()
  await page.waitForSelector('[data-mfe="payments-dash"] tbody tr')

  await openPanel(page)
  const thread = page.locator(THREAD).first()
  await expect(thread.getByText('a failed settlement is an error, not a caution')).toBeVisible()
  await expect(thread.locator('.adl-chip[data-status="resolved"]').first()).toBeVisible()
})
