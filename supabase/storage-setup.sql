-- Storage buckets setup for Supabase
-- Run this in Supabase SQL Editor or use the Supabase Dashboard

-- Create storage buckets (if not already created via Dashboard)
-- Note: Buckets are typically created via Supabase Dashboard or Storage API
-- This is documentation of the required buckets and their policies

-- Bucket: documents
-- Purpose: Student/staff documents, certificates, ID cards
-- RLS Policies:
-- 1. Users can upload to their own folder
-- 2. Admins can upload/view/delete any document
-- 3. Users can view their own documents

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket: profile-photos
-- Purpose: User profile photos
-- RLS Policies:
-- 1. Users can upload/update their own photo
-- 2. All authenticated users can view photos

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Bucket: assignments
-- Purpose: Student assignment submissions
-- RLS Policies:
-- 1. Students can upload to their assignments
-- 2. Teachers can view assignments for their classes
-- 3. Admins can view all

INSERT INTO storage.buckets (id, name, public)
VALUES ('assignments', 'assignments', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket: resources
-- Purpose: Learning resources, lesson materials
-- RLS Policies:
-- 1. Teachers can upload resources
-- 2. Students can view resources for their classes
-- 3. Admins can manage all

INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'documents' bucket
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'staff')
    )
  )
);

CREATE POLICY "Admins can manage all documents"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Storage Policies for 'profile-photos' bucket
CREATE POLICY "Users can upload own photo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update own photo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view profile photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'profile-photos');

-- Storage Policies for 'assignments' bucket
CREATE POLICY "Students can upload assignments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assignments' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('student', 'teacher', 'admin')
  )
);

CREATE POLICY "Teachers and admins can view assignments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'assignments' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  )
);

CREATE POLICY "Admins can manage assignments"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'assignments' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Storage Policies for 'resources' bucket
CREATE POLICY "Teachers can upload resources"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resources' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  )
);

CREATE POLICY "Authenticated users can view resources"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'resources');

CREATE POLICY "Teachers can update own resources"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resources' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
);

CREATE POLICY "Admins can manage all resources"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'resources' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
