import { serializeThreads, reviveThread } from './serialize.js';
/** A fresh object each time: callers mutate the snapshot before writing it back. */
function emptySnapshot() {
    return { users: [], versions: {}, threads: {} };
}
export function memoryDriver() {
    let value = null;
    return {
        read: () => value,
        write: (_key, next) => {
            value = next;
        },
    };
}
/**
 * Survives a reload, which is the whole point: a reviewer who refreshes the
 * preview must not lose the thread they were in the middle of.
 */
export function localStorageDriver(namespace = 'adl.feedback') {
    return {
        read: (key) => {
            try {
                return globalThis.localStorage?.getItem(`${namespace}.${key}`) ?? null;
            }
            catch {
                return null;
            }
        },
        write: (key, value) => {
            try {
                globalThis.localStorage?.setItem(`${namespace}.${key}`, value);
            }
            catch {
                // Storage disabled or full. The session keeps working in memory.
            }
        },
    };
}
const KEY = 'snapshot';
export class DriverFeedbackRepository {
    driver;
    constructor(driver = memoryDriver()) {
        this.driver = driver;
    }
    read() {
        const raw = this.driver.read(KEY);
        if (!raw)
            return emptySnapshot();
        try {
            return { ...emptySnapshot(), ...JSON.parse(raw) };
        }
        catch {
            // Corrupt storage must not take the preview down with it.
            return emptySnapshot();
        }
    }
    write(snapshot) {
        this.driver.write(KEY, JSON.stringify(snapshot));
    }
    async listUsers() {
        return this.read().users;
    }
    async saveUser(user) {
        const snapshot = this.read();
        snapshot.users = [...snapshot.users.filter((u) => u.id !== user.id), user];
        this.write(snapshot);
    }
    async currentUser() {
        const snapshot = this.read();
        return snapshot.users.find((user) => user.id === snapshot.currentUserId);
    }
    async setCurrentUser(userId) {
        const snapshot = this.read();
        snapshot.currentUserId = userId;
        this.write(snapshot);
    }
    async listPreviewVersions(previewId) {
        return this.read().versions[previewId] ?? [];
    }
    async getPreviewVersion(previewId, versionId) {
        return (this.read().versions[previewId] ?? []).find((version) => version.id === versionId);
    }
    async savePreviewVersion(version) {
        const snapshot = this.read();
        const existing = snapshot.versions[version.previewId] ?? [];
        snapshot.versions[version.previewId] = [
            ...existing.filter((entry) => entry.id !== version.id),
            version,
        ];
        this.write(snapshot);
        return version;
    }
    async listThreads(previewId) {
        return (this.read().threads[previewId] ?? []).map(reviveThread);
    }
    async saveThreads(previewId, threads) {
        const snapshot = this.read();
        snapshot.threads[previewId] = serializeThreads(threads);
        this.write(snapshot);
    }
    async deleteThread(previewId, threadId) {
        const snapshot = this.read();
        snapshot.threads[previewId] = (snapshot.threads[previewId] ?? []).filter((thread) => thread.id !== threadId);
        this.write(snapshot);
    }
}
export function createInMemoryRepository() {
    return new DriverFeedbackRepository(memoryDriver());
}
export function createLocalStorageRepository(namespace) {
    return new DriverFeedbackRepository(localStorageDriver(namespace));
}
//# sourceMappingURL=repository.js.map