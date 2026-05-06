import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Snapshot } from '../core/types.js'

export class SnapshotStore {
  private snapshots = new Map<string, Snapshot>()
  private dir: string
  private updated = false

  constructor(dir: string) {
    this.dir = join(process.cwd(), dir)
  }

  /** Load all snapshots from disk */
  async loadAll(): Promise<void> {
    try {
      await access(this.dir)
    } catch {
      return
    }

    const files = await readdir(this.dir)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))

    for (const file of jsonFiles) {
      const content = await readFile(join(this.dir, file), 'utf-8')
      const snapshot = JSON.parse(content) as Snapshot
      this.snapshots.set(snapshot.name, snapshot)
    }
  }

  /** Get a snapshot by name */
  get(name: string): Snapshot | undefined {
    return this.snapshots.get(name)
  }

  /** Check if a snapshot exists */
  has(name: string): boolean {
    return this.snapshots.has(name)
  }

  /** Set or update a snapshot */
  set(name: string, value: unknown): void {
    this.snapshots.set(name, {
      name,
      value,
      updatedAt: new Date().toISOString(),
    })
    this.updated = true
  }

  /** Save all snapshots to disk */
  async save(): Promise<void> {
    if (!this.updated) return

    await mkdir(this.dir, { recursive: true })

    for (const [name, snapshot] of this.snapshots) {
      const filePath = join(this.dir, `${this.sanitizeFilename(name)}.json`)
      await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
    }

    this.updated = false
  }

  /** Remove a snapshot */
  remove(name: string): boolean {
    this.updated = true
    return this.snapshots.delete(name)
  }

  /** List all snapshot names */
  list(): string[] {
    return Array.from(this.snapshots.keys())
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100)
  }
}
