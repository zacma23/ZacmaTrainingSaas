import sql0001 from '../../supabase/migrations/0001_initial_zacma_schema.sql?raw';
import sql0002 from '../../supabase/migrations/0002_reminders_and_notifications.sql?raw';
import sql0003 from '../../supabase/migrations/0003_student_portal_and_general_staff.sql?raw';
import sql0004 from '../../supabase/migrations/0004_ai_audit_and_migration_tracking.sql?raw';

export interface BundledSqlMigration {
  version: string;
  filename: string;
  sizeBytes: number;
  sql: string;
}

export const BUNDLED_SQL_MIGRATIONS: BundledSqlMigration[] = [
  {
    version: '0001',
    filename: '0001_initial_zacma_schema.sql',
    sizeBytes: sql0001.length,
    sql: sql0001,
  },
  {
    version: '0002',
    filename: '0002_reminders_and_notifications.sql',
    sizeBytes: sql0002.length,
    sql: sql0002,
  },
  {
    version: '0003',
    filename: '0003_student_portal_and_general_staff.sql',
    sizeBytes: sql0003.length,
    sql: sql0003,
  },
  {
    version: '0004',
    filename: '0004_ai_audit_and_migration_tracking.sql',
    sizeBytes: sql0004.length,
    sql: sql0004,
  },
];

export const COMBINED_SUPABASE_MIGRATION_SQL = BUNDLED_SQL_MIGRATIONS.map((m) => m.sql.trim()).join(
  '\n\n-- ----------------------------------------------------------------------------\n\n'
);
