import 'dotenv/config';

// These are the NAMES of the variables we expect to find in the .env file
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  lowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD) || 3,
  approvalSlaHours: Number(process.env.APPROVAL_SLA_HOURS) || 48,
  enableJobs: process.env.ENABLE_JOBS !== 'false',
};