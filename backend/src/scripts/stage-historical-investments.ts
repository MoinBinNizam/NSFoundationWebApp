/** Posts the reviewed Historical Investments manifest. Dry-run unless STAGE_INVESTMENTS=YES. */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AuditLog,
  CustodyAccount,
  InvestmentFunding,
  InvestmentProject,
  InvestmentReturn,
  User,
} from '../models/index.js';
import {
  AccountType,
  CustodyChannel,
  ProjectStatus,
  ReturnDestinationType,
  UserRole,
} from '../types/models.js';
import { connectDatabase } from '../config/db.js';

dotenv.config();

type StagedFunding = {
  source: 'MOIN_CUSTODY' | 'SAMRAT_CUSTODY' | 'PARTNER_WALLET';
  channel: 'BANK' | 'BKASH' | 'NAGAD' | 'WALLET';
  amount: number;
  notes: string;
};

type StagedReturn = {
  maturityDate: string;
  principalReturned: number;
  actualProfit: number;
  actualLoss: number;
  totalReturn: number;
  destinationType: 'EXTERNAL_WALLET' | 'ACCOUNTANT_CUSTODY';
  notes: string;
};

type StagedProject = {
  sourceRow: number;
  serialNo: number;
  projectId: string;
  name: string;
  invoiceNo: string;
  invoiceTo: string;
  category: string;
  externalEntity: string;
  startDate: string;
  maturityDate: string;
  duration: string;
  targetPrincipal: number;
  totalFunded: number;
  expectedROI: number | null;
  status: 'MATURED' | 'ACTIVE';
  fundings: StagedFunding[];
  returns: StagedReturn[];
};

type Manifest = {
  projects: StagedProject[];
  metadata: {
    totalProjects: number;
    maturedProjects: number;
    activeProjects: number;
    totalTargetPrincipal: number;
    totalFunded: number;
    fundingDistribution: {
      moinCustody: number;
      samratCustody: number;
      partnerWallets: number;
    };
    totalRealizedProfit: number;
    totalReturned: number;
  };
};

const manifestPath = join(
  process.cwd(),
  '..',
  'docs',
  'import-historical-evidence',
  'normalized-manifests',
  'investments-staging',
  'staging-manifest.json'
);

async function main() {
  await connectDatabase();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;

  // 1. Locate Actor
  const adminUser =
    (await User.findOne({ role: UserRole.SUPER_ADMIN })) ||
    (await User.findOne({ role: UserRole.ADMIN })) ||
    (await User.findOne({ name: { $regex: 'Moin', $options: 'i' } }));

  if (!adminUser) {
    throw new Error('No administrator user found in MongoDB to perform staging.');
  }

  // 2. Fetch or prepare custody accounts
  const allAccounts = await CustodyAccount.find({ isActive: true }).lean();
  const moinBank = allAccounts.find((a) => a.channel === 'BANK');
  const moinBkash = allAccounts.find((a) => a.channel === 'BKASH' && a.name.includes('Merchant'));
  const samratNagad = allAccounts.find((a) => a.channel === 'NAGAD');
  const samratBkash = allAccounts.find((a) => a.channel === 'BKASH' && a.name.includes('Samrat'));

  // Ensure Partner Wallets exist
  const getOrCreateWallet = async (name: string, entity: string) => {
    let wallet = await CustodyAccount.findOne({ name, isActive: true });
    if (!wallet) {
      wallet = await CustodyAccount.create({
        name,
        accountType: AccountType.EXTERNAL_WALLET,
        channel: CustodyChannel.WALLET,
        accountNumber: `HIST-WALLET-${entity.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
        isActive: true,
        cachedBalance: 0,
        notes: `Authoritative historical partner wallet for ${entity}`,
      });
    }
    return wallet;
  };

  const growUpWallet = await getOrCreateWallet('GrowUp Partner Wallet', 'GrowUp');
  const zaynWallet = await getOrCreateWallet('Zayn Farm Partner Wallet', 'Zayn Farm');
  const hungryBirdsWallet = await getOrCreateWallet('Hungry Birds Barisal Partner Wallet', 'Hungry Birds Barisal');

  const walletForEntity = (entity: string) => {
    const e = entity.toLowerCase();
    if (e.includes('zayn')) return zaynWallet;
    if (e.includes('hungry')) return hungryBirdsWallet;
    return growUpWallet;
  };

  const existingProjects = await InvestmentProject.countDocuments();

  if (process.env.VERIFY_INVESTMENTS === 'YES') {
    const dbProjects = await InvestmentProject.find().lean();
    const dbFundings = await InvestmentFunding.find().lean();
    const dbReturns = await InvestmentReturn.find().lean();
    const auditCount = await AuditLog.collection.countDocuments({ action: 'IMPORT_HISTORICAL_INVESTMENT' });

    const totalDbFunded = dbProjects.reduce((s, p) => s + p.totalFunded, 0);
    const totalDbProfit = dbReturns.reduce((s, r) => s + r.actualProfit, 0);

    const summary = {
      expected: {
        projects: manifest.metadata.totalProjects,
        maturedProjects: manifest.metadata.maturedProjects,
        activeProjects: manifest.metadata.activeProjects,
        totalFunded: manifest.metadata.totalFunded,
        totalRealizedProfit: manifest.metadata.totalRealizedProfit,
      },
      actual: {
        projects: dbProjects.length,
        fundings: dbFundings.length,
        returns: dbReturns.length,
        totalFunded: totalDbFunded,
        totalRealizedProfit: totalDbProfit,
        auditLogs: auditCount,
      },
    };

    console.log(JSON.stringify(summary, null, 2));

    if (
      dbProjects.length !== manifest.metadata.totalProjects ||
      totalDbFunded !== manifest.metadata.totalFunded
    ) {
      throw new Error('Historical Investments staging verification failed.');
    }
    console.log('Historical Investments verified with 0 variances.');
    return;
  }

  console.log(
    JSON.stringify(
      {
        manifest: manifest.metadata,
        existingDbProjects: existingProjects,
        partnerWalletsReady: {
          growUp: growUpWallet.name,
          zayn: zaynWallet.name,
          hungryBirds: hungryBirdsWallet.name,
        },
      },
      null,
      2
    )
  );

  if (process.env.STAGE_INVESTMENTS !== 'YES') {
    console.log('Dry-run complete. Set STAGE_INVESTMENTS=YES to commit to MongoDB.');
    return;
  }

  const createdProjectIds: Types.ObjectId[] = [];
  const createdFundingIds: Types.ObjectId[] = [];
  const createdReturnIds: Types.ObjectId[] = [];

  try {
    for (const item of manifest.projects) {
      let project = await InvestmentProject.findOne({ projectId: item.projectId });
      if (!project) {
        project = await InvestmentProject.create({
          projectId: item.projectId,
          name: item.name,
          description: `Authoritative historical investment project. Invoice: ${item.invoiceNo || 'N/A'}, Invoiced to: ${item.invoiceTo || 'N/A'}, Duration: ${item.duration || 'N/A'}`.trim(),
          category: item.category,
          externalEntity: item.externalEntity,
          startDate: new Date(item.startDate),
          maturityDate: item.maturityDate ? new Date(item.maturityDate) : undefined,
          targetPrincipal: item.targetPrincipal,
          totalFunded: item.totalFunded,
          expectedROI: item.expectedROI || undefined,
          status: item.status === 'MATURED' ? ProjectStatus.MATURED : ProjectStatus.ACTIVE,
        });
        createdProjectIds.push(project._id);
      }

      // Fundings
      for (const f of item.fundings) {
        let accountId = growUpWallet._id;
        if (f.source === 'MOIN_CUSTODY') {
          accountId = f.channel === 'BANK' ? moinBank!._id : moinBkash!._id;
        } else if (f.source === 'SAMRAT_CUSTODY') {
          accountId = f.channel === 'NAGAD' ? samratNagad!._id : samratBkash!._id;
        } else {
          accountId = walletForEntity(item.externalEntity)._id;
        }

        const fundingDoc = await InvestmentFunding.create({
          projectId: project._id,
          custodyAccountId: accountId,
          amount: f.amount,
          date: new Date(item.startDate),
          transactionRef: item.invoiceNo || '',
          fundedBy: adminUser._id,
          notes: `[HIST-INV] ${f.notes}`,
        });
        createdFundingIds.push(fundingDoc._id);
      }

      // Returns
      for (const r of item.returns) {
        const destAccount = walletForEntity(item.externalEntity);

        const returnDoc = await InvestmentReturn.create({
          projectId: project._id,
          maturityDate: new Date(r.maturityDate),
          principalReturned: r.principalReturned,
          actualProfit: r.actualProfit,
          actualLoss: 0,
          totalReturn: r.totalReturn,
          destinationType:
            r.destinationType === 'EXTERNAL_WALLET'
              ? ReturnDestinationType.EXTERNAL_WALLET
              : ReturnDestinationType.ACCOUNTANT_CUSTODY,
          destinationCustodyAccountId: destAccount._id,
          notes: `[HIST-INV] ${r.notes}`,
          recordedBy: adminUser._id,
        });
        createdReturnIds.push(returnDoc._id);
      }

      // Audit Log
      await AuditLog.create({
        performedBy: adminUser._id,
        action: 'IMPORT_HISTORICAL_INVESTMENT',
        entityName: 'InvestmentProject',
        entityId: project._id,
        afterState: {
          projectId: item.projectId,
          name: item.name,
          externalEntity: item.externalEntity,
          amount: item.totalFunded,
          status: item.status,
          fundingsCount: item.fundings.length,
          returnsCount: item.returns.length,
        },
        reason: 'Approved historical investment staging from authoritative Investment.xlsx.',
      });
    }

    console.log(
      `Successfully staged ${createdProjectIds.length} historical investment projects, ` +
      `${createdFundingIds.length} funding records, and ${createdReturnIds.length} return records.`
    );
  } catch (error) {
    if (createdReturnIds.length) await InvestmentReturn.deleteMany({ _id: { $in: createdReturnIds } });
    if (createdFundingIds.length) await InvestmentFunding.deleteMany({ _id: { $in: createdFundingIds } });
    if (createdProjectIds.length) await InvestmentProject.deleteMany({ _id: { $in: createdProjectIds } });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
