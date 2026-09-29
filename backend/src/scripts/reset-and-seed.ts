import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/db.js';
import {
  User,
  Member,
  ShareHistory,
  CustodyAccount,
  CustodyMovement,
  PenaltyRule,
  GatewayRate,
  SystemConfig,
  ModulePermission,
} from '../models/index.js';
import {
  UserRole,
  MemberDesignation,
  AccountantType,
  UserStatus,
  MemberStatus,
  CustodyChannel,
  AccountType,
  MovementType,
  MovementSourceType,
  ShareEventType,
} from '../types/models.js';

dotenv.config();

interface CsvRow {
  memberId: string;
  name: string;
  phone: string;
  joinDate: string;
  shares: number;
  monthlyAmount: number;
  status: string;
  designation: MemberDesignation;
}

function parseDesignationAndName(rawName: string): { name: string; designation: MemberDesignation } {
  const trimmed = rawName.trim();
  if (trimmed.includes('-Director')) {
    return { name: trimmed.replace('-Director', '').trim(), designation: MemberDesignation.DIRECTOR };
  }
  if (trimmed.includes('-President')) {
    return { name: trimmed.replace('-President', '').trim(), designation: MemberDesignation.PRESIDENT };
  }
  if (trimmed.includes('-Accountant')) {
    return { name: trimmed.replace('-Accountant', '').trim(), designation: MemberDesignation.ACCOUNTANT };
  }
  if (trimmed.includes('-Asst. Acc')) {
    return { name: trimmed.replace('-Asst. Acc', '').trim(), designation: MemberDesignation.ASSISTANT_ACCOUNTANT };
  }
  if (trimmed.includes('-GS')) {
    return { name: trimmed.replace('-GS', '').trim(), designation: MemberDesignation.GENERAL_SECRETARY };
  }
  if (trimmed.includes('-Convener')) {
    return { name: trimmed.replace('-Convener', '').trim(), designation: MemberDesignation.CONVENER };
  }
  return { name: trimmed, designation: MemberDesignation.GENERAL_MEMBER };
}

function parseCsvDate(dateStr: string): Date {
  // Format in CSV: M/D/YYYY e.g. 1/2/2024
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    return new Date(Date.UTC(year, month, day));
  }
  return new Date(dateStr);
}

export async function resetAndSeedDatabase(): Promise<void> {
  console.log('--- Commencing Complete Database Wipe & Fresh Seeding ---');
  await connectDatabase();

  // 1. Wipe all collections cleanly
  console.log('Purging existing documents across all collections...');
  const collections = await mongoose.connection.db?.collections();
  if (collections) {
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
  console.log('Database successfully wiped.');

  // 2. Parse CSV
  const csvPath = path.resolve(process.cwd(), '../docs/Updated-NS FOUNDATION 2024 - Sorted Members.csv');
  const fallbackCsvPath = path.resolve(process.cwd(), 'docs/Updated-NS FOUNDATION 2024 - Sorted Members.csv');
  const resolvedPath = fs.existsSync(csvPath) ? csvPath : fallbackCsvPath;

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV file not found at ${csvPath} or ${fallbackCsvPath}`);
  }

  const fileContent = fs.readFileSync(resolvedPath, 'utf8');
  const lines = fileContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const membersToInsert: CsvRow[] = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 6) {
      const memberId = cols[0].trim();
      const rawName = cols[1].trim();
      const phone = cols[2].trim();
      const joinDateStr = cols[3].trim();
      const shares = parseInt(cols[4].trim(), 10) || 1;
      const monthlyAmount = parseInt(cols[5].trim(), 10) || 500;
      const status = cols[6] ? cols[6].trim() : 'Active';

      const { name, designation } = parseDesignationAndName(rawName);

      membersToInsert.push({
        memberId,
        name,
        phone,
        joinDate: joinDateStr,
        shares,
        monthlyAmount,
        status,
        designation,
      });
    }
  }

  console.log(`Parsed ${membersToInsert.length} members from CSV.`);

  // 3. Insert Members & Share Histories
  const insertedMembersMap = new Map<string, any>();
  const moinUserId = new mongoose.Types.ObjectId();

  for (const m of membersToInsert) {
    const joinDate = parseCsvDate(m.joinDate);
    const effectiveMonth = `${joinDate.getUTCFullYear()}-${String(joinDate.getUTCMonth() + 1).padStart(2, '0')}`;

    const memberDoc = await Member.create({
      memberId: m.memberId,
      name: m.name,
      phone: m.phone,
      designation: m.designation,
      status: MemberStatus.ACTIVE,
      joinDate,
      cashoutDue: 0,
    });

    insertedMembersMap.set(m.memberId, memberDoc);

    await ShareHistory.create({
      memberId: memberDoc._id,
      shareCount: m.shares,
      previousShareCount: 0,
      effectiveMonth,
      eventType: ShareEventType.INITIAL_ALLOCATION,
      notes: `Initial share registration from 2024 founding ledger (${m.shares} shares)`,
      changedBy: moinUserId,
    });
  }

  console.log(`Successfully created ${insertedMembersMap.size} members with initial share histories.`);

  // 4. Create Users for Board of Directors and Staff
  console.log('Seeding Board of Directors and Staff User accounts...');

  const moinMember = insertedMembersMap.get('NSF003');
  const shuvoMember = insertedMembersMap.get('NSF001');
  const safiqulMember = insertedMembersMap.get('NSF002');
  const samratMember = insertedMembersMap.get('NSF004');
  const nayemMember = insertedMembersMap.get('NSF005');
  const hannanMember = insertedMembersMap.get('NSF006');
  const bayzidMember = insertedMembersMap.get('NSF007');

  const defaultPasswordHash = await bcrypt.hash('Admin@123456', 10);
  const directorPasswordHash = await bcrypt.hash('Director@123456', 10);
  const presidentPasswordHash = await bcrypt.hash('President@123456', 10);
  const assistantPasswordHash = await bcrypt.hash('Assistant@123456', 10);
  const gsPasswordHash = await bcrypt.hash('GS@123456', 10);
  const convenerPasswordHash = await bcrypt.hash('Convener@123456', 10);
  const memberPasswordHash = await bcrypt.hash('Member@123456', 10);

  const moinUser = await User.create({
    _id: moinUserId,
    name: 'Moin Uddin',
    email: 'admin@nsfoundation.org',
    phone: moinMember?.phone || '+8801747-969042',
    passwordHash: defaultPasswordHash,
    role: UserRole.SUPER_ADMIN,
    accountantType: AccountantType.PRIMARY,
    designation: MemberDesignation.ACCOUNTANT,
    memberId: moinMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const shuvoUser = await User.create({
    name: 'Salah Uddin Shuvo',
    email: 'director@nsfoundation.org',
    phone: shuvoMember?.phone || '+8801521-213224',
    passwordHash: directorPasswordHash,
    role: UserRole.ADMIN,
    accountantType: null,
    designation: MemberDesignation.DIRECTOR,
    memberId: shuvoMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const safiqulUser = await User.create({
    name: 'Safiqul Islam',
    email: 'president@nsfoundation.org',
    phone: safiqulMember?.phone || '+8801763-900449',
    passwordHash: presidentPasswordHash,
    role: UserRole.ADMIN,
    accountantType: null,
    designation: MemberDesignation.PRESIDENT,
    memberId: safiqulMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const samratUser = await User.create({
    name: 'Nurul Amin Samrat',
    email: 'assistant@nsfoundation.org',
    phone: samratMember?.phone || '+8801780-503933',
    passwordHash: assistantPasswordHash,
    role: UserRole.ACCOUNTANT,
    accountantType: AccountantType.ASSISTANT,
    designation: MemberDesignation.ASSISTANT_ACCOUNTANT,
    memberId: samratMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const nayemUser = await User.create({
    name: 'Nayem Islam',
    email: 'gs@nsfoundation.org',
    phone: nayemMember?.phone || '+8801723-639354',
    passwordHash: gsPasswordHash,
    role: UserRole.ADMIN,
    accountantType: null,
    designation: MemberDesignation.GENERAL_SECRETARY,
    memberId: nayemMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const hannanUser = await User.create({
    name: 'Abdul Hannan Khan',
    email: 'convener@nsfoundation.org',
    phone: hannanMember?.phone || '+8801715-854708',
    passwordHash: convenerPasswordHash,
    role: UserRole.ADMIN,
    accountantType: null,
    designation: MemberDesignation.CONVENER,
    memberId: hannanMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const memberDemoUser = await User.create({
    name: 'Bayzid Hasan',
    email: 'member@nsfoundation.org',
    phone: bayzidMember?.phone || '+8801737-612640',
    passwordHash: memberPasswordHash,
    role: UserRole.MEMBER,
    accountantType: null,
    designation: MemberDesignation.GENERAL_MEMBER,
    memberId: bayzidMember?._id,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  console.log('Seeded Users:');
  console.log(` - Super Admin / Accountant: ${moinUser.email} (Moin Uddin)`);
  console.log(` - Director: ${shuvoUser.email} (Salah Uddin Shuvo)`);
  console.log(` - President: ${safiqulUser.email} (Safiqul Islam)`);
  console.log(` - Assistant Accountant: ${samratUser.email} (Nurul Amin Samrat)`);
  console.log(` - General Secretary: ${nayemUser.email} (Nayem Islam)`);
  console.log(` - Convener: ${hannanUser.email} (Abdul Hannan Khan)`);
  console.log(` - Member Demo: ${memberDemoUser.email} (Bayzid Hasan)`);

  // 5. Seed Custody Accounts with double-entry balance
  console.log('Seeding authoritative custody accounts...');

  const moinBank = await CustodyAccount.create({
    name: 'Islami Bank Bangladesh Ltd (IBBL)',
    accountType: AccountType.ACCOUNTANT_CUSTODY,
    channel: CustodyChannel.BANK,
    accountNumber: 'IBBL-2050-1920-8841',
    cachedBalance: 100000,
    holderId: moinUser._id,
    isActive: true,
  });

  const samratNagad = await CustodyAccount.create({
    name: 'Samrat Nagad Wallet',
    accountType: AccountType.ACCOUNTANT_CUSTODY,
    channel: CustodyChannel.NAGAD,
    accountNumber: 'NAGAD-01780503933',
    cachedBalance: 80000,
    holderId: samratUser._id,
    isActive: true,
  });

  const bkashAccount = await CustodyAccount.create({
    name: 'bKash Society Merchant/Agent',
    accountType: AccountType.ACCOUNTANT_CUSTODY,
    channel: CustodyChannel.BKASH,
    accountNumber: 'BKASH-01747969042',
    cachedBalance: 50000,
    holderId: moinUser._id,
    isActive: true,
  });

  const pettyCash = await CustodyAccount.create({
    name: 'Physical Petty Cash',
    accountType: AccountType.ACCOUNTANT_CUSTODY,
    channel: CustodyChannel.CASH,
    accountNumber: 'CASH-VAULT-01',
    cachedBalance: 20000,
    holderId: moinUser._id,
    isActive: true,
  });

  // Seed opening double-entry movements
  const openingMovements = [
    { accountId: moinBank._id, amount: 100000, desc: 'Opening IBBL Operating Balance', holder: moinUser._id },
    { accountId: samratNagad._id, amount: 80000, desc: 'Opening Nagad Wallet Balance', holder: samratUser._id },
    { accountId: bkashAccount._id, amount: 50000, desc: 'Opening bKash Gateway Balance', holder: moinUser._id },
    { accountId: pettyCash._id, amount: 20000, desc: 'Opening Physical Petty Cash Vault', holder: moinUser._id },
  ];

  for (const om of openingMovements) {
    await CustodyMovement.create({
      custodyAccountId: om.accountId,
      movementType: MovementType.IN,
      amount: om.amount,
      sourceType: MovementSourceType.ADJUSTMENT,
      date: new Date('2024-01-01'),
      description: om.desc,
      performedBy: om.holder,
    });
  }

  console.log('Seeded 4 custody accounts with paired ledger opening movements.');

  // 6. Seed System Config & Rules
  console.log('Configuring default society parameters...');
  await SystemConfig.create({
    key: 'MONTHLY_SHARE_VALUE',
    value: 500,
    description: 'Standard monthly share subscription value in BDT',
  });

  await PenaltyRule.create({
    effectiveFrom: '2024-01',
    ratePerShare: 40,
    graceDayOfMonth: 15,
    isActive: true,
    description: 'Society late fee of 40 BDT per active share applied after 15th of month',
    createdBy: moinUser._id,
  });

  await GatewayRate.create([
    {
      channel: CustodyChannel.BKASH,
      cashoutRatePercentage: 1.85,
      roundingIncrement: 0,
      fixedFee: 0,
      description: 'Standard bKash Cashout Fee (1.85%)',
    },
    {
      channel: CustodyChannel.NAGAD,
      cashoutRatePercentage: 1.49,
      roundingIncrement: 0,
      fixedFee: 0,
      description: 'Standard Nagad Cashout Fee (1.49%)',
    },
    {
      channel: CustodyChannel.BANK,
      cashoutRatePercentage: 0,
      roundingIncrement: 0,
      fixedFee: 0,
      description: 'Bank Transfers / CellFin carry 0% cashout fee',
    },
    {
      channel: CustodyChannel.CASH,
      cashoutRatePercentage: 0,
      roundingIncrement: 0,
      fixedFee: 0,
      description: 'Cash collections carry 0% cashout fee',
    },
  ]);

  // 7. Seed Dynamic Module Permissions
  console.log('Seeding dynamic role & module permission matrices...');

  const allModuleKeys = [
    'DASHBOARD',
    'DOCUMENTS',
    'MEMBERS',
    'SHARES',
    'PAYMENTS',
    'CUSTODY',
    'INVESTMENTS',
    'PROJECT_WALLETS',
    'EXPENSES',
    'SETTINGS',
    'GOVERNANCE',
    'AUDIT',
    'MIGRATIONS',
    'DISTRIBUTION',
    'PERMISSIONS',
  ];

  const buildModulesConfig = (canViewKeys: string[], canEditKeys: string[]) => {
    const res: Record<string, { canView: boolean; canEdit: boolean }> = {};
    for (const key of allModuleKeys) {
      res[key] = {
        canView: canViewKeys.includes(key),
        canEdit: canEditKeys.includes(key),
      };
    }
    return res;
  };

  const defaultRolePermissions = [
    {
      roleOrDesignation: 'SUPER_ADMIN',
      modules: buildModulesConfig(allModuleKeys, allModuleKeys),
    },
    {
      roleOrDesignation: 'DIRECTOR',
      // Director has Admin full editorial permission EXCEPT read-only on PAYMENTS, MEMBERS, CUSTODY
      modules: buildModulesConfig(
        allModuleKeys,
        allModuleKeys.filter((k) => !['PAYMENTS', 'MEMBERS', 'CUSTODY', 'PERMISSIONS'].includes(k))
      ),
    },
    {
      roleOrDesignation: 'PRESIDENT',
      modules: buildModulesConfig(
        allModuleKeys,
        ['DASHBOARD', 'DOCUMENTS', 'INVESTMENTS', 'EXPENSES', 'SETTINGS', 'GOVERNANCE', 'AUDIT']
      ),
    },
    {
      roleOrDesignation: 'ACCOUNTANT',
      modules: buildModulesConfig(
        allModuleKeys,
        ['DASHBOARD', 'DOCUMENTS', 'SHARES', 'PAYMENTS', 'CUSTODY', 'INVESTMENTS', 'PROJECT_WALLETS', 'EXPENSES']
      ),
    },
    {
      roleOrDesignation: 'ASSISTANT_ACCOUNTANT',
      modules: buildModulesConfig(
        ['DASHBOARD', 'DOCUMENTS', 'SHARES', 'PAYMENTS', 'CUSTODY', 'EXPENSES'],
        ['PAYMENTS', 'CUSTODY', 'EXPENSES']
      ),
    },
    {
      roleOrDesignation: 'GENERAL_SECRETARY',
      modules: buildModulesConfig(
        allModuleKeys,
        ['DASHBOARD', 'DOCUMENTS', 'MEMBERS', 'SETTINGS', 'GOVERNANCE', 'AUDIT']
      ),
    },
    {
      roleOrDesignation: 'CONVENER',
      modules: buildModulesConfig(
        allModuleKeys,
        ['DASHBOARD', 'DOCUMENTS', 'GOVERNANCE', 'AUDIT']
      ),
    },
    {
      roleOrDesignation: 'GENERAL_MEMBER',
      modules: buildModulesConfig(
        ['DASHBOARD', 'DOCUMENTS', 'SHARES'],
        []
      ),
    },
    {
      roleOrDesignation: 'ADMIN',
      modules: buildModulesConfig(
        allModuleKeys,
        allModuleKeys.filter((k) => k !== 'PERMISSIONS')
      ),
    },
    {
      roleOrDesignation: 'MEMBER',
      modules: buildModulesConfig(
        ['DASHBOARD', 'DOCUMENTS', 'SHARES'],
        []
      ),
    },
  ];

  for (const perm of defaultRolePermissions) {
    await ModulePermission.create({
      roleOrDesignation: perm.roleOrDesignation,
      modules: perm.modules,
      updatedBy: moinUser._id,
    });
  }

  console.log('--- Database Reset & Seed Completed Successfully! ---');
}

// Execute directly if run as a script
if (process.argv[1]?.endsWith('reset-and-seed.ts') || process.argv[1]?.endsWith('reset-and-seed.js')) {
  resetAndSeedDatabase()
    .then(() => {
      console.log('Seeding script finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding script failed with error:', err);
      process.exit(1);
    });
}
