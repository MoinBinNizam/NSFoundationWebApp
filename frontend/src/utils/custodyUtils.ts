export interface GenericCustodyAccount {
  _id: string;
  name: string;
  channel?: string;
  accountType?: string;
  cachedBalance?: number;
  derivedBalance?: number;
  holderId?: {
    _id?: string;
    name?: string;
    email?: string;
    accountantType?: string;
  } | string | null;
  [key: string]: any;
}

export type CustodyCategoryKey = 'MOIN' | 'SAMRAT' | 'EXTERNAL_WALLETS';

/**
 * Determines whether a custody account belongs to:
 * - Accountant Moin's Custody (Primary)
 * - Accountant Samrat's Custody (Assistant)
 * - Investment / Partner Wallets (External)
 */
export function getCustodyCategory(acc: GenericCustodyAccount): CustodyCategoryKey {
  const holder = typeof acc.holderId === 'object' && acc.holderId !== null ? acc.holderId : null;
  const holderType = holder?.accountantType;
  const holderEmail = (holder?.email || '').toLowerCase();
  const nameLower = (acc.name || '').toLowerCase();

  // Explicit external partner wallets
  if (acc.accountType === 'EXTERNAL_WALLET' || nameLower.includes('partner wallet') || nameLower.includes('external')) {
    return 'EXTERNAL_WALLETS';
  }

  // Accountant Samrat
  if (
    holderType === 'ASSISTANT' ||
    holderEmail.includes('assistant') ||
    nameLower.includes('samrat')
  ) {
    return 'SAMRAT';
  }

  // Accountant Moin
  if (
    holderType === 'PRIMARY' ||
    holderEmail.includes('admin') ||
    nameLower.includes('moin') ||
    nameLower.includes('merchant') ||
    nameLower.includes('ibbl') ||
    nameLower.includes('islami') ||
    nameLower.includes('physical petty cash') ||
    acc.accountType === 'ACCOUNTANT_CUSTODY'
  ) {
    return 'MOIN';
  }

  return 'EXTERNAL_WALLETS';
}

/**
 * Groups a list of custody accounts into Moin, Samrat, and External Wallets,
 * calculating respective category balance totals.
 */
export function groupCustodyAccounts<T extends GenericCustodyAccount>(accounts: T[]) {
  const moin: T[] = [];
  const samrat: T[] = [];
  const external: T[] = [];

  for (const acc of accounts) {
    const cat = getCustodyCategory(acc);
    if (cat === 'MOIN') {
      moin.push(acc);
    } else if (cat === 'SAMRAT') {
      samrat.push(acc);
    } else {
      external.push(acc);
    }
  }

  const getBal = (acc: T) =>
    acc.derivedBalance !== undefined
      ? Number(acc.derivedBalance || 0)
      : Number(acc.cachedBalance || 0);

  const moinTotal = moin.reduce((sum, a) => sum + getBal(a), 0);
  const samratTotal = samrat.reduce((sum, a) => sum + getBal(a), 0);
  const externalTotal = external.reduce((sum, a) => sum + getBal(a), 0);

  return {
    moin,
    samrat,
    external,
    externalWallets: external,
    moinTotal,
    samratTotal,
    externalTotal,
    grandTotal: moinTotal + samratTotal + externalTotal,
  };
}
