import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { MigrateUpArgs } from '@payloadcms/db-postgres'
import type { SQL } from '@payloadcms/db-postgres/drizzle'
import { PgDialect } from '@payloadcms/db-postgres/drizzle/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrations } from '../../../src/migrations'

// Opt in to a disposable, unexposed container; never use the application's DATABASE_URL.
describe.skipIf(process.env.RUN_MIGRATION_DB_TESTS !== 'true')('Payload upgrade migrations', () => {
  const container = `v4-migration-test-${randomUUID()}`
  const dialect = new PgDialect()
  let started = false

  function query(input: string): string {
    return execFileSync(
      'docker',
      ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'],
      { input, encoding: 'utf8' },
    ).trim()
  }

  beforeAll(async () => {
    execFileSync('docker', [
      'run',
      '--detach',
      '--pull=never',
      '--name',
      container,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      'postgres:18',
    ])
    started = true
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        // TCP probe: the image's init-phase temporary server only listens on the unix socket.
        execFileSync('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], {
          stdio: 'ignore',
        })
        ready = true
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    if (!ready) throw new Error('Isolated migration database did not become ready')

    for (const migration of migrations) {
      if (migration.name === '20261102_194709') {
        query(`
          INSERT INTO payload_jobs (id, task_slug, input) VALUES
            (1, 'schedulePublish', '{"user":42,"type":"publish"}'),
            (2, 'schedulePublish', '{"user":"43"}'),
            (3, 'schedulePublish', '{"user":{"relationTo":"users","value":44},"locale":"sv"}'),
            (4, 'schedulePublish', '{"user":null}'),
            (5, 'schedulePublish', '{}'),
            (6, 'inline', '{"user":45}'),
            (7, 'schedulePublish', NULL);
          INSERT INTO payload_jobs_log
            (_order, _parent_id, id, executed_at, completed_at, task_slug, task_i_d, input, state)
          VALUES
            (1, 1, 'null-input', now(), now(), 'schedulePublish', '1', NULL, 'succeeded'),
            (2, 1, 'existing-input', now(), now(), 'schedulePublish', '1', '{"kept":true}', 'succeeded');
        `)
      }
      await migration.up({
        db: {
          execute: async (statement: SQL) => query(dialect.sqlToQuery(statement).sql),
        },
      } as unknown as MigrateUpArgs)
    }
  }, 60_000)

  afterAll(() => {
    if (started) execFileSync('docker', ['rm', '--force', container], { stdio: 'ignore' })
  })

  it('replays the registered baseline and backfills nullable job log inputs before constraining them', () => {
    expect(query(`SELECT input FROM payload_jobs_log WHERE id = 'null-input'`)).toBe('{}')
    expect(query(`SELECT input FROM payload_jobs_log WHERE id = 'existing-input'`)).toBe(
      '{"kept": true}',
    )
    expect(
      query(`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'payload_jobs_log' AND column_name = 'input'
    `),
    ).toBe('NO')
  })

  it('provides the nullable refresh session fields required by the pinned Payload version', () => {
    expect(
      query(`
      SELECT column_name || ':' || data_type || ':' || is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users_sessions' AND column_name IN ('refresh_count', 'refreshed_at')
      ORDER BY column_name
    `),
    ).toBe('refresh_count:numeric:YES\nrefreshed_at:timestamp with time zone:YES')
  })

  it('normalizes only legacy scheduling-user scalars and preserves every other input', () => {
    const inputs = query(`SELECT coalesce(input::text, 'null') FROM payload_jobs ORDER BY id`)
      .split('\n')
      .map((input) => JSON.parse(input))
    expect(inputs).toEqual([
      { user: { relationTo: 'users', value: 42 }, type: 'publish' },
      { user: { relationTo: 'users', value: '43' } },
      { user: { relationTo: 'users', value: 44 }, locale: 'sv' },
      { user: null },
      {},
      { user: 45 },
      null,
    ])
  })
})
