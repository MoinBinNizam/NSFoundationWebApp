import dotenv from 'dotenv';
import http from 'http';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { ReportingService } from '../services/reporting.service.js';
import { generateToken } from '../utils/jwt.js';

dotenv.config();

async function run() {
  let server: http.Server | null = null;
  try {
    console.log('--- Issue #11 Dashboard & Reports integration test ---');
    await connectDatabase();
    const [moin, samrat] = await Promise.all([
      User.findOne({ email: 'admin@nsfoundation.org' }),
      User.findOne({ email: 'assistant@nsfoundation.org' }),
    ]);
    if (!moin || !samrat) throw new Error('Seeded primary and assistant accountant users are required.');

    const dashboard = await ReportingService.getDashboard({}, moin as any);
    if (dashboard.roleScope !== 'ORGANIZATION') throw new Error('Admin dashboard must have organization scope.');
    if (!dashboard.metrics.dues || typeof dashboard.metrics.dues.total !== 'number') throw new Error('Dashboard must include the total outstanding dues metric.');
    if (!dashboard.trend.length || !dashboard.trend.every((item: any) => typeof item.collections === 'number' && typeof item.expenses === 'number' && typeof item.dues === 'number')) throw new Error('Dashboard must return numeric monthly trend data.');
    const collection = await ReportingService.getReport('collection', { page: 1, limit: 10, sortBy: 'date', sortDirection: 'desc' }, samrat as any);
    if (collection.pagination.limit !== 10) throw new Error('Report pagination must default to/retain 10 records.');
    let samratBlocked = false;
    try { await ReportingService.getReport('investments', { page: 1, limit: 10 }, samrat as any); } catch (error: any) { samratBlocked = error?.statusCode === 403; }
    if (!samratBlocked) throw new Error('Assistant accountant was not blocked from investment report access.');
    const investment = await ReportingService.getReport('investments', { page: 1, limit: 10 }, moin as any);
    const csv = ReportingService.csv(collection.rows);
    if (!csv.includes('\n') && collection.rows.length) throw new Error('CSV report output is invalid.');

    // Exercise the actual Express route and authorization middleware, rather
    // than only the service, on an ephemeral local port.
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not allocate a test HTTP port.');
    const makeToken = (user: any) => generateToken({ userId: user._id.toString(), email: user.email, role: user.role, accountantType: user.accountantType });
    const [assistantResponse, primaryResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${address.port}/api/investments/stats`, { headers: { Authorization: `Bearer ${makeToken(samrat)}` } }),
      fetch(`http://127.0.0.1:${address.port}/api/investments/stats`, { headers: { Authorization: `Bearer ${makeToken(moin)}` } }),
    ]);
    if (assistantResponse.status !== 403 || !primaryResponse.ok) throw new Error('Investment route authorization middleware did not enforce the required roles.');
    console.log(`✓ Admin organization dashboard returned ${dashboard.recentActivity.length} activity events.`);
    console.log(`✓ Dashboard includes ${dashboard.trend.length} monthly trend points and ${dashboard.metrics.dues.count} outstanding ledger months.`);
    console.log(`✓ Accountant collection report is scoped and paginated at ${collection.pagination.limit} records.`);
    console.log(`✓ Samrat denied investment report; Moin received ${investment.pagination.total} investment rows.`);
    console.log('✓ HTTP route test confirmed Samrat receives 403 and Moin receives 200 for investment API access.');
    console.log('✓ CSV output generated from the same filtered report rows.');
  } catch (error) {
    console.error('Issue #11 test failed:', error);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
  }
}
run();
