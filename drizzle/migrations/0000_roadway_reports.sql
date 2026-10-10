CREATE TYPE public.app_role AS ENUM ('admin','user');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id,role));
GRANT SELECT ON public.user_roles TO authenticated; GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_role ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
CREATE TABLE public.pothole_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference text NOT NULL DEFAULT ('RD-' || substr(gen_random_uuid()::text,1,6)), user_id uuid, location text NOT NULL, description text NOT NULL DEFAULT '', severity integer NOT NULL CHECK(severity BETWEEN 1 AND 3), criticality integer NOT NULL CHECK(criticality BETWEEN 1 AND 3), priority integer GENERATED ALWAYS AS (severity*20+criticality*10) STORED, status text NOT NULL DEFAULT 'Reported' CHECK(status IN ('Reported','Scheduled','In progress','Resolved')), latitude double precision NOT NULL DEFAULT 12.9716, longitude double precision NOT NULL DEFAULT 77.5946, photo_path text, team text, is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.pothole_reports TO anon; GRANT SELECT,INSERT,UPDATE ON public.pothole_reports TO authenticated; GRANT ALL ON public.pothole_reports TO service_role;
ALTER TABLE public.pothole_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_read ON public.pothole_reports FOR SELECT TO anon,authenticated USING(is_demo);
CREATE POLICY owner_read ON public.pothole_reports FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY create_report ON public.pothole_reports FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND NOT is_demo AND status='Reported' AND team IS NULL);
CREATE POLICY admin_update ON public.pothole_reports FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE POLICY photo_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='report-photos' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY photo_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='report-photos' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.has_role(auth.uid(),'admin')));
CREATE INDEX report_priority ON public.pothole_reports(priority DESC,created_at ASC);
INSERT INTO public.pothole_reports(reference,location,severity,criticality,status,latitude,longitude,is_demo,team,created_at) VALUES
('RD-1042','100 Feet Road, Indiranagar',3,3,'Reported',12.9784,77.6408,true,null,now()-interval '35 minutes'),
('RD-1041','Outer Ring Road, Marathahalli',3,2,'In progress',12.956,77.695,true,'Crew Alpha',now()-interval '2 hours'),
('RD-1040','MG Road, near Trinity Metro',2,3,'Scheduled',12.973,77.619,true,'Crew Bravo',now()-interval '3 hours'),
('RD-1039','Church Street, Ashok Nagar',2,2,'Reported',12.975,77.604,true,null,now()-interval '5 hours'),
('RD-1038','Koramangala 5th Block',1,2,'Resolved',12.934,77.621,true,'Crew Alpha',now()-interval '1 day'),
('RD-1037','Richmond Road, Langford Town',1,1,'Resolved',12.963,77.602,true,'Crew Bravo',now()-interval '2 days');