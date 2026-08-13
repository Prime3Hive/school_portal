# Archived migrations — do not run

These files are kept for reference only. They are **not** part of the migration
sequence and must never be applied to a live project.

| File | Why it was archived |
|---|---|
| `create_applications_table.sql` | Opens with `DROP TABLE IF EXISTS public.applications CASCADE;` — running it destroys every application record and any object depending on the table. It also defines a schema that conflicts with `0002_create_applications_table.sql` (`student_name`/`grade` vs `full_name`/`grade_applying_for`). Because it had no numeric prefix it sorted unpredictably next to `0001…0014`, so "run the migrations folder in order" could wipe the table. |
| `create_calendar_events_table.sql` | Superseded by `0003_create_calendar_events_table.sql`. |
| `create_notifications_table.sql` | Superseded by `0001_create_notifications_table.sql`. |

The live definitions now live in the numbered migrations. The applications table
schema is `0002` + `0012` (columns) + `0014` (policies, numbering, RPCs).
