import { Queue } from 'bullmq';
export declare function initSupabase(): import("@supabase/supabase-js").SupabaseClient<any, "public", any>;
export declare const jobQueue: Queue<any, any, string, any, any, string>;
export { processJob } from './processor';
