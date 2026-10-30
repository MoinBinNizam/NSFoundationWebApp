import React, { useState } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

export type ModuleKey =
  | 'DASHBOARD'
  | 'MEMBERS'
  | 'PAYMENTS'
  | 'INVESTMENTS'
  | 'CUSTODY'
  | 'EXPENSES'
  | 'REPORTING'
  | 'GOVERNANCE';

interface GuideSection {
  title: string;
  titleBn: string;
  points: Array<{
    text: string;
    textBn: string;
    highlight?: boolean;
  }>;
}

const MODULE_GUIDES: Record<
  ModuleKey,
  {
    title: string;
    titleBn: string;
    subtitle: string;
    subtitleBn: string;
    badge: string;
    badgeBn: string;
    sections: GuideSection[];
  }
> = {
  DASHBOARD: {
    title: 'Executive Command Center Guide',
    titleBn: 'এক্সিকিউটিভ ড্যাশবোর্ড নির্দেশনা ও মেট্রিক্স বিশ্লেষণ',
    subtitle: 'Comprehensive financial status, cashflow velocity, and member standing at a glance.',
    subtitleBn: 'সমিতির মোট সম্পদ, তরল কাস্টডি তহবিল, বিনিয়োগকৃত মূলধন এবং রিয়েল-টাইম হিসাবের সারসংক্ষেপ।',
    badge: 'System Overview',
    badgeBn: 'সামগ্রিক হিসাব চিত্র',
    sections: [
      {
        title: 'Core Financial Metrics Explained',
        titleBn: 'ড্যাশবোর্ড মেট্রিক্স ও গণনার নিয়ম',
        points: [
          {
            text: 'Total Society Net Worth = Total Member Collections + Investment Profits + Liquid Custody - Operating Expenses.',
            textBn: 'মোট নেট সম্পদ = মোট সদস্য সঞ্চয় জমা + বিনিয়োগকৃত প্রকল্পের লাভ + অবশিষ্ট তরল ক্যাশ - পরিচালনা খরচ।',
            highlight: true,
          },
          {
            text: 'Liquid Custody = Sum of active accountant custody accounts (Accountant Moin Bank/bKash + Accountant Samrat Nagad).',
            textBn: 'তরল কাস্টডি তহবিল = হিসাবরক্ষক মঈন (ব্যাংক/বিকাশ) এবং হিসাবরক্ষক সম্রাট (নগদ)-এর হাতে বর্তমানে থাকা মোট তরল ব্যালেন্স।',
          },
          {
            text: 'Investments & Returns = Total capital currently deployed in agricultural/business projects + returned profits.',
            textBn: 'প্রকল্প বিনিয়োগ ও রিটার্ন = ২০২৪ সালে বিভিন্ন কৃষি/বাণিজ্য প্রকল্পে নিয়োজিত মূলধন ও অর্জিত নিট মুনাফা।',
          },
          {
            text: 'Outstanding Dues = Only active members are counted (৳22,040.00). Dropped members show ৳0.00 dues.',
            textBn: 'বকেয়া হিসাব = শুধুমাত্র সক্রিয় সদস্যদের বকেয়া গণনা করা হয় (৳ ২২,০৪০.০০)। বাদ পড়া সদস্যদের বকেয়া সর্বদা ৳ ০.০০।',
            highlight: true,
          },
        ],
      },
      {
        title: 'Operational Workflow',
        titleBn: 'অ্যাকাউন্ট্যান্ট ও অ্যাডমিনদের করণীয়',
        points: [
          {
            text: 'Verify all monthly ledger collections against payment receipts to prevent duplicate records.',
            textBn: 'পেমেন্ট ডুপ্লিকেসি এড়াতে মানি রিসিট ও ট্রানজেকশন আইডি মিলিয়ে প্রতি মাসের কালেকশন যাচাই করুন।',
          },
          {
            text: 'Track wallet reinvestments vs fresh accountant cash funding to maintain perfect reconciliation.',
            textBn: 'পার্টনার ওয়ালেট থেকে পুনঃবিনিয়োগ এবং হিসাবরক্ষকদের নগদ ক্যাশ থেকে সরাসরি বিনিয়োগ পৃথকভাবে পর্যবেক্ষণ করুন।',
          },
        ],
      },
    ],
  },
  MEMBERS: {
    title: 'Member Management & Exit Settlements Guide',
    titleBn: 'সদস্য ব্যবস্থাপনা, বাদ পড়া সদস্য ও রিফান্ড সেটেলমেন্ট গাইড',
    subtitle: 'Manage member roster, profile updates, dropped member exits, and refund payment vouchers.',
    subtitleBn: 'সদস্য তালিকা, শেয়ার বরাদ্দ, বাদ পড়া সদস্যদের রিফান্ড সেটেলমেন্ট ও ভাউচার প্রমাণ এক জায়গা থেকে পরিচালনা করুন।',
    badge: 'Member Registry & Exits',
    badgeBn: 'সদস্য ও রিফান্ড ম্যানেজমেন্ট',
    sections: [
      {
        title: 'Member Status & Share Rules',
        titleBn: 'সদস্য স্ট্যাটাস ও শেয়ার বরাদ্দ নিয়মাবলী',
        points: [
          {
            text: 'Active members pay ৳500 per share each month. Inactive members have temporarily suspended deposits.',
            textBn: 'সক্রিয় সদস্যরা প্রতি শেয়ারে প্রতি মাসে ৫০০ টাকা জমা প্রদান করেন। নিষ্ক্রিয় সদস্যদের জমা সাময়িক স্থগিত থাকে।',
          },
          {
            text: 'Dropped Members: When a member is dropped (e.g. NSF007, NSF032), their future obligations and monthly dues are automatically set to ৳0.00.',
            textBn: 'বাদ পড়া সদস্য (Dropped Members): কোনো সদস্যকে বাদ দিলে তার সকল ভবিষ্যৎ মাসিক প্রদেয় ও বকেয়া স্বয়ংক্রিয়ভাবে শূন্য (৳০.০০) হয়ে যাবে—চাই তাদের টাকা রিফান্ড করা হোক বা না হোক।',
            highlight: true,
          },
        ],
      },
      {
        title: 'Exit Settlement & Refund Policy',
        titleBn: 'রিফান্ড সেটেলমেন্ট ও ডকুমেন্টেশন নিয়ম',
        points: [
          {
            text: 'Policy Deduction: Standard policy deducts 9.99% from eligible principal contributions for administrative overhead.',
            textBn: 'সাধারণ নীতিমালায় মোট জমাকৃত মূলধন থেকে ৯.৯৯% প্রশাসনিক খরচ হিসেবে কর্তন করে অবশিষ্ট টাকা রিফান্ড করা হয়।',
          },
          {
            text: 'Director Waiver (0% Deduction): With Director approval (e.g. Salah Uddin Shuvo), full 100% refund can be disbursed with 0% deduction.',
            textBn: 'পরিচালকের বিশেষ অনুমতি (০% কর্তন): পরিচালক মহোদয়ের বিশেষ সিদ্ধান্তে কোনো কর্তন ছাড়াই সম্পূর্ণ টাকা রিফান্ড দেওয়া যায়।',
            highlight: true,
          },
          {
            text: 'Disbursing Account: Select whose custody account (Accountant Moin vs Samrat) the refund is paid from so custody balances sync automatically.',
            textBn: 'কার একাউন্ট থেকে টাকা যাচ্ছে: রিফান্ডের টাকা কোন হিসাবরক্ষকের কাস্টডি (মঈন বা সম্রাট) থেকে যাচ্ছে তা নির্ধারণ করলে ক্যাশ স্বয়ংক্রিয়ভাবে বিয়োগ হয়।',
            highlight: true,
          },
          {
            text: 'Receipt Document Upload: Always upload or attach the payment receipt/voucher proof (image/PDF) to maintain irrefutable audit evidence.',
            textBn: 'পেমেন্ট রিসিট ভাউচার আপলোড: রিফান্ড পরিশোধের প্রমাণ হিসেবে মানি রিসিট বা ব্যাংক/বিকাশ স্ক্রিনশট আপলোড করে সংরক্ষণ করুন।',
            highlight: true,
          },
        ],
      },
    ],
  },
  PAYMENTS: {
    title: 'Contributions & Payments Guide',
    titleBn: 'সঞ্চয় কিস্তি জমা, ট্রানজেকশন হিস্ট্রি ও ডুপ্লিকেসি প্রতিরোধ গাইড',
    subtitle: 'Unified payment recording, monthly ledger tracking, and penalty handling.',
    subtitleBn: 'প্রতি মাসের সঞ্চয় জমা, ট্রানজেকশন রিসিট সংরক্ষণ ও ডুপ্লিকেসি মুক্ত নিরাপদ লেজার ব্যবস্থাপনা।',
    badge: 'Collections & Ledgers',
    badgeBn: 'কালেকশন ও লেজার',
    sections: [
      {
        title: 'Strict De-duplication Architecture',
        titleBn: 'ডুপ্লিকেসি প্রতিরোধ ও নির্ভুল ডাটা এন্ট্রি',
        points: [
          {
            text: 'Each payment uses a unique receipt voucher reference. Duplicate records for the same member and month are strictly prevented.',
            textBn: 'প্রতিটি পেমেন্টের জন্য ইউনিক রিসিট নম্বর সংরক্ষিত থাকে। একই সদস্যের একই মাসের জন্য কোনো ডুপ্লিকেট পেমেন্ট এন্ট্রি হবে না।',
            highlight: true,
          },
          {
            text: 'Auto-Allocation: Received funds settle late penalties first, followed by principal share contributions.',
            textBn: 'অটো-অ্যালোকেশন: জমাকৃত টাকা থেকে প্রথমে বকেয়া জরিমানা বা ক্যাশআউট সমন্বয় হয়, এরপর মূল সঞ্চয় কিস্তিতে যুক্ত হয়।',
          },
          {
            text: 'Dropped Members Exclusion: Dropped members are excluded from overdue penalty calculations and dues reports.',
            textBn: 'বাদ পড়া সদস্য সুরক্ষা: ড্রপড সদস্যদের নামে কোনো নতুন পেনাল্টি বা বকেয়া লেজারে যুক্ত হয় না।',
          },
        ],
      },
      {
        title: 'Reconciliation with Custody',
        titleBn: 'কাস্টডি একাউন্টে জমা সমন্বয়',
        points: [
          {
            text: 'Direct gateway payments (bKash/Nagad/Bank) automatically debit the respective accountant custody wallet balance.',
            textBn: 'বিকাশ, নগদ বা ব্যাংক একাউন্টে জমা হওয়া টাকা স্বয়ংক্রিয়ভাবে সংশ্লিষ্ট হিসাবরক্ষকের কাস্টডি ব্যালেন্সে যুক্ত হয়।',
          },
        ],
      },
    ],
  },
  INVESTMENTS: {
    title: 'Investments & Reinvestments Cashflow Guide',
    titleBn: 'প্রকল্প বিনিয়োগ, রি-ইনভেস্টমেন্ট ও ক্যাশফ্লো নির্দেশনা',
    subtitle: 'First investments from accountant custody vs wallet reinvestments and profit distribution.',
    subtitleBn: 'হিসাবরক্ষকদের কাস্টডি থেকে প্রাথমিক বিনিয়োগ, পার্টনার ওয়ালেট থেকে পুনঃবিনিয়োগ এবং অর্জিত মুনাফা ট্র্যাকিং।',
    badge: 'Capital Deployment',
    badgeBn: 'মূলধন খাটানো ও রি-ইনভেস্টমেন্ট',
    sections: [
      {
        title: 'Cashflow Sources (Custody vs Partner Wallet)',
        titleBn: 'বিনিয়োগের উৎসের পুঙ্খানুপুঙ্খ হিসাব',
        points: [
          {
            text: 'First Investments (Accountant Custody): Deployed directly from Accountant Moin or Accountant Samrat custody, reducing their liquid cash balance.',
            textBn: 'প্রাথমিক বিনিয়োগ (কাস্টডি ক্যাশ): হিসাবরক্ষক মঈন বা হিসাবরক্ষক সম্রাটের কাস্টডি থেকে নগদ টাকা প্রকল্পে খাটে, যার ফলে হিসাবরক্ষকদের তরল ক্যাশ কমে যায়।',
            highlight: true,
          },
          {
            text: 'Project Maturity & Returns: When a project matures (e.g. Banana, Fish Farming), the principal and profits are credited to GrowUp Partner Wallet.',
            textBn: 'প্রকল্প সমাপ্তি ও লাভ: প্রকল্প শেষ হলে মূলধন এবং অর্জিত লাভ গ্রো-আপ পার্টনার ওয়ালেটে যুক্ত হয়।',
          },
          {
            text: 'Reinvestments (Wallet Reinvestment): Reinvested projects (e.g. Papaya, Cattle Ranch, Onion, Qurbani Cow) draw from Partner Wallet, NOT accountant custody.',
            textBn: 'রি-ইনভেস্টমেন্ট (পুনঃবিনিয়োগ): যেসব প্রকল্পে পার্টনার ওয়ালেটের টাকা পুনরায় খাটানো হয়, সেগুলোতে হিসাবরক্ষকদের নতুন নগদ টাকা দিতে হয় না।',
            highlight: true,
          },
        ],
      },
      {
        title: 'Year Boundary Rule',
        titleBn: 'সালভিত্তিক ডাটা নিরাপত্তা',
        points: [
          {
            text: '2024 projects (PRJ-2024-1 to PRJ-2024-11) are strictly isolated. Future 2025/2026 projects are kept in their respective stages.',
            textBn: 'শুধুমাত্র ২০২৪ সালের প্রকল্পসমূহ (SL ১ থেকে ১১) বর্তমান অডিটে অন্তর্ভুক্ত। ২০২৫ বা পরবর্তী সালের প্রকল্প ভবিষ্যতের হিসাবে যুক্ত হবে।',
          },
        ],
      },
    ],
  },
  CUSTODY: {
    title: 'Accountant Custody Accounts Guide',
    titleBn: 'হিসাবরক্ষক কাস্টডি ওয়ালেট ও নগদ তহবিল ব্যবস্থাপনা',
    subtitle: 'Dual-accountant tracking (Moin vs Samrat) for cash, bank, and mobile wallets.',
    subtitleBn: 'হিসাবরক্ষক মঈন ও হিসাবরক্ষক সম্রাটের ব্যাংক, বিকাশ ও নগদ তহবিলের স্বচ্ছ রিয়েল-টাইম ব্যালেন্স।',
    badge: 'Accountant Custody',
    badgeBn: 'হিসাবরক্ষক কাস্টডি ট্র্যাকিং',
    sections: [
      {
        title: 'Accountant Wallets & Ownership',
        titleBn: 'হিসাবরক্ষকভিত্তিক তহবিল বণ্টন',
        points: [
          {
            text: 'Accountant Moin Custody: Covers Moin IBBL Bank, Moin bKash Custody, and Physical Cash.',
            textBn: 'হিসাবরক্ষক মঈন কাস্টডি: ইসলামী ব্যাংক একাউন্ট, ব্যক্তিগত বিকাশ কাস্টডি ও ক্যাশ ইন হ্যান্ড অন্তর্ভুক্ত।',
          },
          {
            text: 'Accountant Samrat Custody: Covers Samrat Nagad Wallet and designated collections.',
            textBn: 'হিসাবরক্ষক সম্রাট কাস্টডি: নগদ ওয়ালেট ও সংশ্লিষ্ট সদস্য কালেকশন অন্তর্ভুক্ত।',
          },
          {
            text: 'Live Derived Balance: Balances are calculated by formula: Total Inflows (Deposits, Returns) - Total Outflows (Investments, Refunds, Expenses).',
            textBn: 'স্বয়ংক্রিয় ব্যালেন্স: মোট অন্তর্মুখী জমা (সঞ্চয়, রিটার্ন) - মোট বহির্গামী প্রবাহ (বিনিয়োগ, রিফান্ড, খরচ) = বর্তমান ব্যালেন্স।',
            highlight: true,
          },
        ],
      },
    ],
  },
  EXPENSES: {
    title: 'Operating Expenses & Vouchers Guide',
    titleBn: 'প্রশাসনিক খরচ ও ভাউচার অডিট গাইড',
    subtitle: 'Track operational vouchers, printing, conveyance, and annual meeting expenses.',
    subtitleBn: 'সমিতির প্রাতিষ্ঠানিক কাগজপত্র, যাতায়াত, বার্ষিক মিটিং ও অফিস খরচ যথাযথ ভাউচারসহ সংরক্ষণ।',
    badge: 'Operational Vouchers',
    badgeBn: 'খরচ ও ভাউচার',
    sections: [
      {
        title: 'Expense Recording Rules',
        titleBn: 'খরচ এন্ট্রির নিয়মাবলী',
        points: [
          {
            text: 'Every expense voucher must specify category, date, exact amount, authorizer, and disbursing custody account.',
            textBn: 'প্রতিটি খরচের জন্য ভাউচার নম্বর, খরচের খাত, টাকার পরিমাণ, অনুমোদনকারী ও যে কাস্টডি থেকে দেওয়া হয়েছে তা বাধ্যতামূলক।',
          },
          {
            text: '2024 Staged Expenses: Exactly 5 official vouchers totaling ৳9,500.00 as verified by the audit workbook.',
            textBn: '২০২৪ সালের নির্ধারিত খরচ: অডিট শীট অনুযায়ী মোট ৫টি অনুমোদিত ভাউচারে সর্বমোট ৯,৫০০.০০ টাকা।',
            highlight: true,
          },
        ],
      },
    ],
  },
  REPORTING: {
    title: 'Audit & Financial Reporting Guide',
    titleBn: 'বার্ষিক অডিট শিট ও আর্থিক প্রতিবেদন গাইড',
    subtitle: '35-member authoritative reconciliation matching Updated-NS FOUNDATION 2024.xlsx.',
    subtitleBn: 'এক্সেল ওয়ার্কবুকের সাথে ১০০% শতভাগ সামঞ্জস্যপূর্ণ ৩৫ সদস্যের বার্ষিক অডিট ও ক্রস-চেক।',
    badge: 'Audit & Cross-Check',
    badgeBn: 'বার্ষিক অডিট ও প্রতিবেদন',
    sections: [
      {
        title: '2024 Audit Sheet Reconciliation',
        titleBn: '২০২৪ সালের অডিট শিটের গুরুত্বপূর্ণ বিষয়',
        points: [
          {
            text: 'Total Members: Exactly 35 registered members (33 Active, 2 Dropped: NSF007 and NSF032).',
            textBn: 'মোট সদস্য: ঠিক ৩৫ জন সদস্য (৩৩ জন সক্রিয়, ২ জন বাদ পড়া: NSF007 বায়জিদ ও NSF032 তানভীর)।',
          },
          {
            text: 'Zero Dues for Dropped Members: NSF007 and NSF032 show ৳0.00 dues in all audit sheets and year accounts.',
            textBn: 'বাদ পড়া সদস্যদের বকেয়া শূন্য: NSF007 এবং NSF032 উভয়ের বকেয়া অডিট শিটে সম্পূর্ণ ৳ ০.০০।',
            highlight: true,
          },
          {
            text: 'Active Member Dues: Exactly ৳22,040.00 outstanding dues across 9 active members as cross-checked with the workbook.',
            textBn: 'সক্রিয় সদস্যদের মোট বকেয়া: এক্সেল অডিট শিট অনুযায়ী ৯ জন সক্রিয় সদস্যের সর্বমোট বকেয়া ঠিক ৳ ২২,০৪০.০০।',
            highlight: true,
          },
          {
            text: 'Total Collections: ৳388,975.00 collected from 304 unique payments across 12 months with 0 duplication.',
            textBn: 'মোট সংগৃহীত সঞ্চয়: ১২ মাসে মোট ৩০৪টি অনন্য পেমেন্ট থেকে সংগৃহীত সর্বমোট ৳ ৩,৮৮,৯৭৫.০০ (কোনো ডুপ্লিকেশন নেই)।',
          },
        ],
      },
    ],
  },
  GOVERNANCE: {
    title: 'Governance, Policies & Annual Closing Guide',
    titleBn: 'সমিতি পরিচালনা, নীতিমালা ও বার্ষিক ক্লোজিং গাইড',
    subtitle: 'Institutional constitution, policy amendments, and executive year-end locking.',
    subtitleBn: 'সমিতির মূল সংবিধান, ধারা সংশোধন ও বছর শেষে নির্বাহী বোর্ড কর্তৃক আর্থিক হিসাব লক করা।',
    badge: 'Governance & Constitution',
    badgeBn: 'সংবিধান ও ক্লোজিং',
    sections: [
      {
        title: 'Policy Amendment & Historical Versions',
        titleBn: 'নীতিমালা সংশোধন ও সংস্করণ সংরক্ষণ',
        points: [
          {
            text: 'Changes to foundation policies require a documented reason and create an immutable audit log.',
            textBn: 'নীতিমালার যেকোনো পরিবর্তনের জন্য সুস্পষ্ট কারণ উল্লেখ করতে হয় এবং পূর্বের সংস্করণ সংরক্ষিত থাকে।',
          },
          {
            text: 'Annual Closing: Reviews and freezes the year ledger upon board approval to ensure historical figures remain tamper-proof.',
            textBn: 'বার্ষিক ক্লোজিং: পরিচালনা পর্ষদ কর্তৃক অনুমোদনের মাধ্যমে বছরের লেজার লক করা হয় যাতে কেউ ডাটা পরিবর্তন করতে না পারে।',
          },
        ],
      },
    ],
  },
};

interface ModuleGuideProps {
  moduleKey: ModuleKey;
  defaultOpen?: boolean;
}

export const ModuleGuide: React.FC<ModuleGuideProps> = ({ moduleKey, defaultOpen = false }) => {
  const { language } = usePreferences();
  const isBn = language === 'bn';
  const guide = MODULE_GUIDES[moduleKey];

  const storageKey = `ns_module_guide_open_${moduleKey}`;
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? saved === 'true' : defaultOpen;
  });

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    localStorage.setItem(storageKey, String(next));
  };

  if (!guide) return null;

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/30 via-slate-900/40 to-slate-950/60 p-4 sm:p-5 shadow-lg backdrop-blur-md transition-all mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-inner">
            <HelpCircle size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {isBn ? guide.titleBn : guide.title}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
                {isBn ? guide.badgeBn : guide.badge}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
              {isBn ? guide.subtitleBn : guide.subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition shadow-sm"
        >
          <span>{isOpen ? (isBn ? 'গাইড লুকান' : 'Hide Guide') : (isBn ? 'ব্যবহারবিধি ও নির্দেশিকা' : 'How It Works')}</span>
          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
          {guide.sections.map((sec, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/5 bg-slate-950/50 p-3.5 space-y-2.5 hover:border-white/10 transition-colors"
            >
              <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-blue-400 shrink-0" />
                <span>{isBn ? sec.titleBn : sec.title}</span>
              </h4>
              <ul className="space-y-2 text-xs">
                {sec.points.map((pt, pIdx) => (
                  <li
                    key={pIdx}
                    className={`flex items-start gap-2 p-1.5 rounded-lg ${
                      pt.highlight
                        ? 'bg-blue-500/10 border border-blue-500/20 text-blue-100 font-medium'
                        : 'text-gray-300'
                    }`}
                  >
                    <CheckCircle2
                      size={14}
                      className={`shrink-0 mt-0.5 ${
                        pt.highlight ? 'text-emerald-400' : 'text-blue-400'
                      }`}
                    />
                    <span className="leading-relaxed">{isBn ? pt.textBn : pt.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
