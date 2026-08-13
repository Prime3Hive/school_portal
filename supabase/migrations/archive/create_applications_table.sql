-- ============================================
-- APPLICATIONS TABLE MIGRATION
-- Manages student applications from public blog
-- ============================================

-- Drop table if exists (for clean migration)
DROP TABLE IF EXISTS public.applications CASCADE;

-- Create applications table
CREATE TABLE public.applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Application Info
    application_number text UNIQUE NOT NULL, -- e.g., TBD20260001
    
    -- Student Information
    student_name text NOT NULL,
    student_dob date,
    student_gender text CHECK (student_gender IN ('male', 'female', 'other')),
    grade text NOT NULL,
    previous_school text,
    
    -- Parent/Guardian Information
    parent_name text NOT NULL,
    parent_email text NOT NULL,
    parent_phone text NOT NULL,
    parent_address jsonb DEFAULT '{}'::jsonb,
    
    -- Application Documents
    application_form_url text, -- Supabase Storage URL for filled form
    birth_certificate_url text, -- Birth certificate
    passport_photo_url text, -- Student passport photo
    previous_report_url text, -- Previous school report (optional)
    other_documents jsonb DEFAULT '[]'::jsonb, -- Array of additional document URLs
    
    -- Payment Information
    application_fee_amount numeric DEFAULT 0 CHECK (application_fee_amount >= 0),
    application_fee_paid boolean DEFAULT false,
    payment_reference text, -- Paystack reference
    payment_date timestamptz,
    payment_method text, -- e.g., 'paystack', 'bank_transfer'
    
    -- Application Status
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'incomplete')),
    
    -- Review Information
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_date timestamptz,
    notes text,
    rejection_reason text,
    
    -- Auto-generated accounts (populated on approval)
    student_id uuid REFERENCES public.students(id), -- Created student record
    guardian_auth_id uuid, -- Created guardian auth account
    
    -- Metadata
    submitted_date timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_applications_parent_email ON public.applications(parent_email);
CREATE INDEX idx_applications_application_number ON public.applications(application_number);
CREATE INDEX idx_applications_submitted_date ON public.applications(submitted_date DESC);
CREATE INDEX idx_applications_student_id ON public.applications(student_id);

-- Enable Row Level Security
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Public can insert (submit applications)
CREATE POLICY "Anyone can submit applications"
    ON public.applications
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Public can view their own application by email
CREATE POLICY "Applicants can view their own applications"
    ON public.applications
    FOR SELECT
    TO public
    USING (parent_email = current_setting('request.jwt.claims', true)::json->>'email');

-- Authenticated admins can view all applications
CREATE POLICY "Admins can view all applications"
    ON public.applications
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Authenticated admins can update applications
CREATE POLICY "Admins can update applications"
    ON public.applications
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Authenticated admins can delete applications
CREATE POLICY "Admins can delete applications"
    ON public.applications
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated_at
    BEFORE UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION update_applications_updated_at();

-- Create function to generate application number
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS text AS $$
DECLARE
    year_prefix text;
    sequence_num integer;
    app_number text;
BEGIN
    year_prefix := 'TBD' || EXTRACT(YEAR FROM now())::text;
    
    -- Get the count of applications this year
    SELECT COUNT(*) + 1 INTO sequence_num
    FROM public.applications
    WHERE application_number LIKE year_prefix || '%';
    
    -- Format: TBD2026XXXX (4 digits)
    app_number := year_prefix || LPAD(sequence_num::text, 4, '0');
    
    RETURN app_number;
END;
$$ LANGUAGE plpgsql;

-- Comment on table
COMMENT ON TABLE public.applications IS 'Stores student applications submitted from the public blog/website';
