import 'dotenv/config';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
if (!process.env.MASTER_KEY) throw new Error('MASTER_KEY missing');
