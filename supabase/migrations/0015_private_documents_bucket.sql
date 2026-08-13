-- Migration: 0015
-- Description: Take the `documents` bucket private.
--
-- ⚠️  APPLY AFTER 0014, AND ONLY ONCE `js/storage-urls.js` IS DEPLOYED.
--     That script re-signs every document link at the moment it is opened. If
--     the bucket goes private while an old build is live, receipt and document
--     links in the admin console and the student portal will 400.
--
-- Why: applicant documents are birth certificates and passport photographs of
-- children, and receipts carry bank details. They were written to a PUBLIC
-- bucket, with the permanent URL stored in the database — so anyone who ever
-- saw a link, or guessed a path, kept access indefinitely. Paths were also
-- derived from sequential application numbers (`applications/TBD20260001/…`),
-- which made guessing realistic. 0014 replaced those with random ids; this
-- migration removes the public exposure itself.
--
-- After this runs, objects are reachable only through a signed URL minted by
-- someone the policies below allow to read them.

BEGIN;

-- ============================================================
-- 1. Flip the bucket to private
-- ============================================================
UPDATE storage.buckets
SET    public = false,
       file_size_limit = 5242880,                       -- 5 MB, matching the client-side check
       allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
WHERE  id = 'documents';


-- ============================================================
-- 2. Object policies
--    Note: storage.objects.owner is auth.uid() for authenticated uploads and
--    NULL for anonymous ones, which is what separates "an applicant's
--    documents" from "a signed-in student's receipt".
-- ============================================================
DROP POLICY IF EXISTS "documents: anon submit application files" ON storage.objects;
DROP POLICY IF EXISTS "documents: users upload own files"        ON storage.objects;
DROP POLICY IF EXISTS "documents: staff read all"                ON storage.objects;
DROP POLICY IF EXISTS "documents: owners read own"               ON storage.objects;
DROP POLICY IF EXISTS "documents: admins delete"                 ON storage.objects;

-- Prospective applicants are not signed in, so they must be able to write —
-- but only into the applications/ prefix, and never read anything back.
CREATE POLICY "documents: anon submit application files"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'applications'
  );

-- Signed-in users (students paying fees, staff attaching receipts) may upload.
CREATE POLICY "documents: users upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Admin and staff review every document and receipt.
CREATE POLICY "documents: staff read all"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.current_user_has_role(ARRAY['admin','staff'])
  );

-- A user can always re-open a file they uploaded themselves (their own receipt).
CREATE POLICY "documents: owners read own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());

-- Cleanup is an admin action only.
CREATE POLICY "documents: admins delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.current_user_has_role(ARRAY['admin'])
  );

COMMIT;

-- ------------------------------------------------------------------
-- Verify after applying:
--   1. Submit a test application with a document  → upload succeeds
--   2. Paste the stored public URL into a logged-out browser → 400 (expected)
--   3. Open the application in the admin console → document opens via signed URL
--   4. Student portal → a bank deposit receipt still opens for its own student
-- ------------------------------------------------------------------
