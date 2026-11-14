import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "payload_jobs"
    SET "input" = jsonb_set(
      "input",
      '{user}',
      jsonb_build_object('relationTo', 'users', 'value', "input"->'user')
    )
    WHERE "task_slug" = 'schedulePublish'
      AND jsonb_typeof("input"->'user') IN ('number', 'string');
  `)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Original scalar users cannot be distinguished from already-normalized relationships.
}
