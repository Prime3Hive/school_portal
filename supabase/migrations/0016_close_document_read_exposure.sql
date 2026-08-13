-- Migration: 0016
-- Description: Close the anon read path into the `documents` bucket.
--
-- ⚠️  THIS FIXES A LIVE DATA EXPOSURE. Apply immediately.
--
-- What was wrong
-- --------------
-- 0015 took the bucket private and created five correctly-scoped object
-- policies. It worked, and it changed nothing — because Postgres OR-combines
-- permissive policies, and 0015 only dropped *its own* policy names. Nine
-- legacy `documents` policies predating it survived, including:
--
--   "Public read access for documents"
--       SELECT · {public} · USING (bucket_id = 'documents')
--
-- No path scoping, and {public} includes anon. The anon key ships in the source
-- of every public page, so anyone who viewed source could enumerate and
-- download the entire bucket. Confirmed against production before this fix:
--
--   POST /storage/v1/object/list/documents  prefix=applications/  → 200, 20 objects
--   POST /storage/v1/object/list/documents  prefix=receipts/      → 200,  8 objects
--   GET  /storage/v1/object/documents/applications/<file>         → 200 application/pdf
--
-- 111 applicant documents (birth certificates and passport photographs of
-- children) and 8 payment receipts (carrying bank details) were readable by
-- anyone on the internet.
--
-- This is the same defect that neutered 0013: dropping by exact name misses
-- every policy someone created under a different one. The lesson is that a
-- hardening migration must enumerate what is actually on the table, not what
-- the previous migration happened to call things.
--
-- What survives, and why
-- ----------------------
--   "Users can view own documents"   SELECT · authenticated · own folder OR admin/staff
--   "Admins can manage all documents" ALL   · authenticated · admin only
--   documents: {staff read all, owners read own, admins delete, users upload
--               own files, anon submit application files}  — 0015's five
--
-- Nothing legitimate depended on the anon read. The bucket has been private
-- since 0015, so the `getPublicUrl()` links still present in the client already
-- return 400; document access goes through `js/storage-urls.js`, which mints a
-- signed URL as the signed-in admin, staff member or owning student.

BEGIN;

-- The whole-bucket hole: {public} covers anon, and there is no path predicate.
DROP POLICY IF EXISTS "Public read access for documents" ON storage.objects;

-- Narrower, but still an anonymous read of every applicant's uploads.
DROP POLICY IF EXISTS "Public can read application documents" ON storage.objects;

-- Exact duplicate of 0015's "documents: anon submit application files" — same
-- bucket, same applications/ prefix check. Applicant uploads keep working
-- through 0015's policy.
DROP POLICY IF EXISTS "Public can upload application documents" ON storage.objects;

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying — every one of these must now fail for anon:
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -X POST "$SUPABASE_URL/storage/v1/object/list/documents" \
--     -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
--     -H 'Content-Type: application/json' -d '{"prefix":"applications/","limit":10}'
--   → expect 200 with an EMPTY array (RLS filters every row), not 20 objects
--
--   GET /storage/v1/object/documents/applications/<known-file> with the anon key
--   → expect 400 / 404, not 200
--
-- And these must still work:
--   - admin console opens an application's documents (signed URL)
--   - a student opens their own bank-deposit receipt
--   - a new applicant uploads a birth certificate
-- ------------------------------------------------------------------
