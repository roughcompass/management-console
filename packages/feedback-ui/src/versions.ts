import type { Actor } from '@adl/anchor-core'

/**
 * A version of the page under review. The reviewer counts versions; the build
 * ids, locks and remote pins behind each one are the host's business and only
 * appear under Technical details.
 */
export interface ReviewVersion {
  /** The host's build id. Never shown. */
  id: string
  /** "Version 1". */
  label: string
  createdAt: string
  /** Set when the host built this version from a change request. */
  fromRequest?: string
  /** Comments the request that produced this version asked about. */
  addressing?: readonly string[]
  approvedAt?: string
  approvedBy?: Actor
}

export function versionLabel(index: number): string {
  return `Version ${index + 1}`
}

/** "Version 2 of 3" - where the reviewer is in the history. */
export function versionPosition(versions: readonly ReviewVersion[], currentId: string): string {
  const index = versions.findIndex((version) => version.id === currentId)
  if (index === -1) return versions[versions.length - 1]?.label ?? 'Version 1'
  return `${versions[index]!.label} of ${versions.length}`
}

export function isLatest(versions: readonly ReviewVersion[], currentId: string): boolean {
  return versions.length === 0 || versions[versions.length - 1]!.id === currentId
}
