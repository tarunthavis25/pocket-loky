import { createClient } from '@supabase/supabase-js';

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const projectKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabase = projectUrl && projectKey ? createClient(projectUrl, projectKey, {
  auth: { flowType: 'pkce' }
}) : null;
