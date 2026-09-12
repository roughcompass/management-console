import type { Actor, CommentThread } from '@adl/anchor-core'
import { serializeThreads, reviveThread } from './serialize.js'
import type { FeedbackRepository, PreviewVersion, StorageDriver } from './types.js'

interface Snapshot {
  users: Actor[]
  currentUserId?: string
  versions: Record<string, PreviewVersion[]>
  threads: Record<string, CommentThread[]>
}

/** A fresh object each time: callers mutate the snapshot before writing it back. */
function emptySnapshot(): Snapshot {
  return { users: [], versions: {}, threads: {} }
}

export function memoryDriver(): StorageDriver {
  let value: string | null = null
  return {
    read: () => value,
    write: (_key, next) => {
      value = next
    },
  }
}

/**
 * Survives a reload, which is the whole point: a reviewer who refreshes the
 * preview must not lose the thread they were in the middle of.
 */
export function localStorageDriver(namespace = 'adl.feedback'): StorageDriver {
  return {
    read: (key) => {
      try {
        return globalThis.localStorage?.getItem(`${namespace}.${key}`) ?? null
      } catch {
        return null
      }
    },
    write: (key, value) => {
      try {
        globalThis.localStorage?.setItem(`${namespace}.${key}`, value)
      } catch {
        // Storage disabled or full. The session keeps working in memory.
      }
    },
  }
}

const KEY = 'snapshot'

export class DriverFeedbackRepository implements FeedbackRepository {
  constructor(private driver: StorageDriver = memoryDriver()) {}

  private read(): Snapshot {
    const raw = this.driver.read(KEY)
    if (!raw) return emptySnapshot()
    try {
      return { ...emptySnapshot(), ...(JSON.parse(raw) as Partial<Snapshot>) }
    } catch {
      // Corrupt storage must not take the preview down with it.
      return emptySnapshot()
    }
  }

  private write(snapshot: Snapshot): void {
    this.driver.write(KEY, JSON.stringify(snapshot))
  }

  async listUsers(): Promise<Actor[]> {
    return this.read().users
  }

  async saveUser(user: Actor): Promise<void> {
    const snapshot = this.read()
    snapshot.users = [...snapshot.users.filter((u) => u.id !== user.id), user]
    this.write(snapshot)
  }

  async currentUser(): Promise<Actor | undefined> {
    const snapshot = this.read()
    return snapshot.users.find((user) => user.id === snapshot.currentUserId)
  }

  async setCurrentUser(userId: string): Promise<void> {
    const snapshot = this.read()
    snapshot.currentUserId = userId
    this.write(snapshot)
  }

  async listPreviewVersions(previewId: string): Promise<PreviewVersion[]> {
    return this.read().versions[previewId] ?? []
  }

  async getPreviewVersion(previewId: string, versionId: string): Promise<PreviewVersion | undefined> {
    return (this.read().versions[previewId] ?? []).find((version) => version.id === versionId)
  }

  async savePreviewVersion(version: PreviewVersion): Promise<PreviewVersion> {
    const snapshot = this.read()
    const existing = snapshot.versions[version.previewId] ?? []
    snapshot.versions[version.previewId] = [
      ...existing.filter((entry) => entry.id !== version.id),
      version,
    ]
    this.write(snapshot)
    return version
  }

  async listThreads(previewId: string): Promise<CommentThread[]> {
    return (this.read().threads[previewId] ?? []).map(reviveThread)
  }

  async saveThreads(previewId: string, threads: readonly CommentThread[]): Promise<void> {
    const snapshot = this.read()
    snapshot.threads[previewId] = serializeThreads(threads)
    this.write(snapshot)
  }

  async deleteThread(previewId: string, threadId: string): Promise<void> {
    const snapshot = this.read()
    snapshot.threads[previewId] = (snapshot.threads[previewId] ?? []).filter(
      (thread) => thread.id !== threadId,
    )
    this.write(snapshot)
  }
}

export function createInMemoryRepository(): FeedbackRepository {
  return new DriverFeedbackRepository(memoryDriver())
}

export function createLocalStorageRepository(namespace?: string): FeedbackRepository {
  return new DriverFeedbackRepository(localStorageDriver(namespace))
}
