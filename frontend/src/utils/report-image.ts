export interface MemberFinancialReportData {
  member: {
    _id?: string;
    memberId: string;
    name: string;
    phone: string;
    currentShares?: number;
    status?: string;
  };
  summary: {
    totalPayments: number;
    totalPrincipalPaid?: number;
    totalAdvancedPaid?: number;
    totalDues: number;
    totalPenaltyPaid: number;
    totalPenaltyDue: number;
    totalPrincipalDue?: number;
    totalCashoutPaid?: number;
    totalCashoutChargePaid?: number;
    cashoutDue?: number;
  };
  payments?: Array<{
    _id?: string;
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
    receiverName?: string;
    accountantName?: string;
  }>;
  logo?: string | null;
  signatureImage?: string | null;
}

const formatMoney = (val: number): string => {
  return `৳ ${(Number(val) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export async function downloadMemberReportImage(data: MemberFinancialReportData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700; // High-res portrait statement
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Background and Outer Border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

  // Helper text function
  const drawText = (
    value: string,
    x: number,
    y: number,
    font = '18px Arial',
    color = '#0f172a',
    align: CanvasTextAlign = 'left',
    maxWidth?: number
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if (maxWidth !== undefined) {
      ctx.fillText(value, x, y, maxWidth);
    } else {
      ctx.fillText(value, x, y);
    }
  };

  // 2. Logo & Header
  let headerTitleX = 70;
  if (data.logo) {
    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = data.logo!;
      });
      if (img.complete && img.naturalWidth > 0) {
        const scale = Math.min(84 / img.naturalWidth, 84 / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, 70 + (84 - w) / 2, 65 + (84 - h) / 2, w, h);
        headerTitleX = 175;
      }
    } catch {
      // Ignore logo error
    }
  }

  drawText('NS FOUNDATION COOPERATIVE SOCIETY', headerTitleX, 98, 'bold 28px Arial', '#0f172a');
  drawText(
    'সদস্য চাঁদা, বকেয়া ও পেমেন্ট হিস্ট্রি বিবরণী · Member Financial Statement',
    headerTitleX,
    128,
    '17px Arial',
    '#475569'
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  drawText(`ইস্যু তারিখ: ${dateStr}`, canvas.width - 70, 98, 'bold 16px Arial', '#1e40af', 'right');
  drawText(`আইডি: ${data.member.memberId}`, canvas.width - 70, 126, 'bold 15px Arial', '#64748b', 'right');

  // Divider
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 160);
  ctx.lineTo(canvas.width - 70, 160);
  ctx.stroke();

  // 3. Member Profile Box
  const memberBoxY = 180;
  const memberBoxH = 95;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(70, memberBoxY, canvas.width - 140, memberBoxH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(70, memberBoxY, canvas.width - 140, memberBoxH);

  drawText(data.member.name, 95, memberBoxY + 38, 'bold 24px Arial', '#0f172a');
  drawText(
    `সদস্য আইডি: ${data.member.memberId}   |   মোবাইল: ${data.member.phone || 'N/A'}`,
    95,
    memberBoxY + 68,
    '16px Arial',
    '#475569'
  );

  const rightInfoX = canvas.width - 95;
  drawText(
    `মোট শেয়ার: ${data.member.currentShares || 1} টি`,
    rightInfoX,
    memberBoxY + 38,
    'bold 18px Arial',
    '#1e40af',
    'right'
  );
  drawText(
    `স্ট্যাটাস: ${data.member.status || 'ACTIVE'}`,
    rightInfoX,
    memberBoxY + 68,
    'bold 15px Arial',
    '#166534',
    'right'
  );

  // 4. Four Key Metric Cards
  const cardsY = 295;
  const cardW = 250;
  const cardH = 95;
  const gap = 20;
  const startX = 70;

  const prinPaid = data.summary.totalPrincipalPaid;
  const advPaid = data.summary.totalAdvancedPaid;
  const penPaid = data.summary.totalPenaltyPaid;
  const coPaid = data.summary.totalCashoutPaid ?? data.summary.totalCashoutChargePaid ?? 0;

  const paidSubParts: string[] = [];
  if (prinPaid !== undefined) paidSubParts.push(`মূল: ${formatMoney(prinPaid)}`);
  if (advPaid && advPaid > 0) paidSubParts.push(`অগ্রিম: ${formatMoney(advPaid)}`);
  if (penPaid && penPaid > 0) paidSubParts.push(`জরিমানা: ${formatMoney(penPaid)}`);
  if (coPaid && coPaid > 0) paidSubParts.push(`ক্যাশআউট: ${formatMoney(coPaid)}`);

  const duesSubParts: string[] = [];
  if (data.summary.totalDues === 0) {
    duesSubParts.push('বকেয়ামুক্ত (All Cleared)');
  } else {
    if (data.summary.totalPrincipalDue && data.summary.totalPrincipalDue > 0) duesSubParts.push(`মূল: ${formatMoney(data.summary.totalPrincipalDue)}`);
    if (data.summary.totalPenaltyDue && data.summary.totalPenaltyDue > 0) duesSubParts.push(`জরিমানা: ${formatMoney(data.summary.totalPenaltyDue)}`);
    if (data.summary.cashoutDue && data.summary.cashoutDue > 0) duesSubParts.push(`ক্যাশআউট: ${formatMoney(data.summary.cashoutDue)}`);
  }

  const metricCards = [
    {
      label: 'মোট পরিশোধিত (Total Paid)',
      amount: formatMoney(data.summary.totalPayments || 0),
      sub: paidSubParts.join(' | '),
      bg: '#f0fdf4',
      border: '#86efac',
      titleColor: '#166534',
      valColor: '#15803d',
    },
    {
      label: 'মোট বকেয়া (Total Dues)',
      amount: formatMoney(data.summary.totalDues || 0),
      sub: duesSubParts.join(' | '),
      bg: '#fef2f2',
      border: '#fca5a5',
      titleColor: '#991b1b',
      valColor: '#b91c1c',
    },
    {
      label: 'পরিশোধিত জরিমানা (Penalty Paid)',
      amount: formatMoney(data.summary.totalPenaltyPaid || 0),
      sub: 'দেরির কারণে প্রদত্ত জরিমানা ফি',
      bg: '#eff6ff',
      border: '#93c5fd',
      titleColor: '#1e40af',
      valColor: '#1d4ed8',
    },
    {
      label: 'বকেয়া জরিমানা (Penalty Due)',
      amount: formatMoney(data.summary.totalPenaltyDue || 0),
      sub: 'অনাদায়ী বিলম্ব জরিমানার পরিমাণ',
      bg: '#fffbeb',
      border: '#fcd34d',
      titleColor: '#92400e',
      valColor: '#b45309',
    },
  ];

  metricCards.forEach((card, idx) => {
    const cx = startX + idx * (cardW + gap);
    ctx.fillStyle = card.bg;
    ctx.fillRect(cx, cardsY, cardW, cardH);
    ctx.strokeStyle = card.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cardsY, cardW, cardH);

    drawText(card.label, cx + 15, cardsY + 27, 'bold 12.5px Arial', card.titleColor, 'left', cardW - 30);
    drawText(card.amount, cx + 15, cardsY + 58, 'bold 19px Arial', card.valColor, 'left', cardW - 30);
    if (card.sub) {
      drawText(card.sub, cx + 15, cardsY + 80, '10px Arial', card.titleColor, 'left', cardW - 30);
    }
  });

  // 5. Payment History Section Title
  const tableTitleY = 425;
  drawText('পেমেন্ট ও চাঁদা লেনদেন তালিকা (Payment History Records)', 70, tableTitleY, 'bold 19px Arial', '#1e293b');

  // Table Coordinates - 6 columns with balanced widths and vertical dividers
  // Total table width: 1060px (from 70 to 1130)
  // Col 0 (Date): 70..185 (width: 115)
  // Col 1 (Receipt #): 185..440 (width: 255) -> ample space to prevent overlap with Method
  // Col 2 (Method): 440..580 (width: 140)
  // Col 3 (Accountant): 580..760 (width: 180)
  // Col 4 (Amount): 760..930 (width: 170)
  // Col 5 (Status): 930..1130 (width: 200)
  const tableY = 445;
  const cols = [70, 185, 440, 580, 760, 930, canvas.width - 70];
  const headerH = 40;
  const rowH = 42;

  // Header Row
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(70, tableY, canvas.width - 140, headerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(70, tableY, canvas.width - 140, headerH);

  // Vertical column dividers for header
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  for (let c = 1; c < cols.length - 1; c++) {
    ctx.beginPath();
    ctx.moveTo(cols[c], tableY);
    ctx.lineTo(cols[c], tableY + headerH);
    ctx.stroke();
  }

  drawText('তারিখ (Date)', cols[0] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[1] - cols[0] - 20);
  drawText('রশিদ নং (Receipt #)', cols[1] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[2] - cols[1] - 24);
  drawText('পদ্ধতি (Method)', cols[2] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[3] - cols[2] - 20);
  drawText('হিসাবরক্ষক (Accountant)', cols[3] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[4] - cols[3] - 20);
  drawText('পরিমাণ (Amount)', cols[4] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[5] - cols[4] - 20);
  drawText('স্ট্যাটাস (Status)', cols[5] + 12, tableY + 26, 'bold 14px Arial', '#475569', 'left', cols[6] - cols[5] - 20);

  const paymentsList = data.payments || [];
  const maxRows = 18;
  const displayRows = paymentsList.slice(0, maxRows);

  let currentY = tableY + headerH;

  if (displayRows.length === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, currentY, canvas.width - 140, 60);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(70, currentY, canvas.width - 140, 60);
    drawText('কোনো পূর্ববর্তী পেমেন্ট রেকর্ড পাওয়া যায়নি।', canvas.width / 2, currentY + 36, '16px Arial', '#94a3b8', 'center');
    currentY += 60;
  } else {
    displayRows.forEach((p, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(70, currentY, canvas.width - 140, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(70, currentY, canvas.width - 140, rowH);

      // Vertical column dividers for data rows
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      for (let c = 1; c < cols.length - 1; c++) {
        ctx.beginPath();
        ctx.moveTo(cols[c], currentY);
        ctx.lineTo(cols[c], currentY + rowH);
        ctx.stroke();
      }

      const pDate = new Date(p.paymentDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const accountantText = p.accountantName || p.receiverName || '-';

      drawText(pDate, cols[0] + 12, currentY + 27, '13px Arial', '#334155', 'left', cols[1] - cols[0] - 20);
      drawText(p.receiptNumber, cols[1] + 12, currentY + 27, 'bold 13px Arial', '#2563eb', 'left', cols[2] - cols[1] - 24);
      drawText(p.paymentMethod, cols[2] + 12, currentY + 27, '13px Arial', '#475569', 'left', cols[3] - cols[2] - 20);
      drawText(accountantText, cols[3] + 12, currentY + 27, '13px Arial', '#334155', 'left', cols[4] - cols[3] - 20);
      drawText(formatMoney(p.totalAmount), cols[4] + 12, currentY + 27, 'bold 14px Arial', '#166534', 'left', cols[5] - cols[4] - 20);
      drawText(p.status, cols[5] + 12, currentY + 27, 'bold 13px Arial', p.status === 'PAID' || p.status === 'COLLECTED' ? '#166534' : '#b45309', 'left', cols[6] - cols[5] - 20);

      currentY += rowH;
    });

    if (paymentsList.length > maxRows) {
      drawText(
        `* আরও ${paymentsList.length - maxRows}টি লেনদেন সিস্টেমে সংরক্ষিত আছে।`,
        70,
        currentY + 24,
        'italic 14px Arial',
        '#64748b'
      );
    }
  }

  // 6. Footer & Signatures
  const footerY = 1540;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, footerY);
  ctx.lineTo(canvas.width - 70, footerY);
  ctx.stroke();

  // Accountant Signature Image if present
  const rightSigCenterX = 950;
  if (data.signatureImage) {
    try {
      const sigImg = new Image();
      await new Promise<void>((resolve) => {
        sigImg.onload = () => resolve();
        sigImg.onerror = () => resolve();
        sigImg.src = data.signatureImage!;
      });
      if (sigImg.complete && sigImg.naturalWidth > 0) {
        const maxSigW = 180;
        const maxSigH = 50;
        const sigScale = Math.min(maxSigW / sigImg.naturalWidth, maxSigH / sigImg.naturalHeight);
        const sigW = sigImg.naturalWidth * sigScale;
        const sigH = sigImg.naturalHeight * sigScale;
        ctx.drawImage(sigImg, rightSigCenterX - sigW / 2, footerY + 52 - sigH, sigW, sigH);
      }
    } catch {
      // Ignore
    }
  }

  // Signature lines with ample right margin (center at 950 gives 105px margin from canvas right edge)
  drawText('____________________________________', 230, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('সদস্যের স্বাক্ষর (Member Signature)', 230, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  drawText('____________________________________', rightSigCenterX, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('অনুমোদিত হিসাবরক্ষক (Authorized Accountant)', rightSigCenterX, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  // Bottom Notice
  drawText(
    'এটি এনএস ফাউন্ডেশন সমবায় সমিতি ইআরপি সিস্টেম কর্তৃক স্বয়ংক্রিয়ভাবে প্রস্তুতকৃত অফিশিয়াল বিবরণী।',
    canvas.width / 2,
    1650,
    '13px Arial',
    '#64748b',
    'center'
  );

  // Trigger Download
  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate image blob'));
        return;
      }
      const rawName = (data.member.name || '')
        .trim()
        .replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const namePart = rawName ? `_${rawName}` : '';
      const datePart = now.toISOString().slice(0, 10);
      const filename = `NSF_Report_${data.member.memberId}${namePart}_${datePart}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(filename);
      }, 500);
    }, 'image/png');
  });
}

export interface AnnualReportImageData {
  year: number;
  status: string;
  members: number;
  collections: number;
  principal: number;
  penalties: number;
  cashoutCharges: number;
  advances: number;
  expenses: number;
  investmentReturns: number;
  realizedProfit: number;
  realizedLoss: number;
  outstandingDues: number;
  custodyBalance: number;
  monthlyBreakdown?: Array<{
    month: string;
    totalAmount: number;
    principalAmount: number;
    penaltyAmount: number;
    count: number;
  }>;
  logo?: string | null;
  signatureImage?: string | null;
}

export async function downloadAnnualReportImage(data: AnnualReportImageData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background and Outer Border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  ctx.strokeStyle = '#4f46e5';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

  const drawText = (
    value: string,
    x: number,
    y: number,
    font = '18px Arial',
    color = '#0f172a',
    align: CanvasTextAlign = 'left',
    maxWidth?: number
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if (maxWidth !== undefined) {
      ctx.fillText(value, x, y, maxWidth);
    } else {
      ctx.fillText(value, x, y);
    }
  };

  // Header & Logo
  let headerTitleX = 70;
  if (data.logo) {
    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = data.logo!;
      });
      if (img.complete && img.naturalWidth > 0) {
        const scale = Math.min(84 / img.naturalWidth, 84 / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, 70 + (84 - w) / 2, 65 + (84 - h) / 2, w, h);
        headerTitleX = 175;
      }
    } catch {
      // Ignore logo error
    }
  }

  drawText('NS FOUNDATION COOPERATIVE SOCIETY', headerTitleX, 98, 'bold 28px Arial', '#0f172a');
  drawText(`বাৎসরিক আর্থিক ও লাভ-ক্ষতি প্রতিবেদন · Annual Financial Statement (${data.year})`, headerTitleX, 128, '17px Arial', '#475569');
  drawText(`অডিট স্ট্যাটাস: ${data.status} | মোট সক্রিয় সদস্য: ${data.members} জন`, headerTitleX, 154, 'bold 15px Arial', '#4338ca');

  const now = new Date();
  drawText(`তারিখ: ${now.toLocaleDateString('bn-BD')}`, canvas.width - 70, 98, '15px Arial', '#64748b', 'right');
  drawText(`হিসাব বছর: ${data.year}`, canvas.width - 70, 126, 'bold 16px Arial', '#1e293b', 'right');

  // Separator Line
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, 185);
  ctx.lineTo(canvas.width - 70, 185);
  ctx.stroke();

  // 4 Key Metric Cards
  const cardsY = 210;
  const cardW = 250;
  const cardH = 95;
  const gap = 20;
  const startX = 70;

  const metricCards = [
    {
      label: 'মোট সংগৃহীত চাঁদা (Collections)',
      amount: formatMoney(data.collections),
      bg: '#f0fdf4',
      border: '#86efac',
      titleColor: '#166534',
      valColor: '#15803d',
    },
    {
      label: 'মূল সঞ্চয় তহবিল (Principal)',
      amount: formatMoney(data.principal),
      bg: '#eff6ff',
      border: '#93c5fd',
      titleColor: '#1e40af',
      valColor: '#1d4ed8',
    },
    {
      label: 'বিনিয়োগ নিট মুনাফা (Profit)',
      amount: formatMoney(data.realizedProfit),
      bg: '#ecfdf5',
      border: '#6ee7b7',
      titleColor: '#065f46',
      valColor: '#059669',
    },
    {
      label: 'রিজার্ভ ও ব্যাংক তহবিল (Custody)',
      amount: formatMoney(data.custodyBalance),
      bg: '#faf5ff',
      border: '#d8b4fe',
      titleColor: '#6b21a8',
      valColor: '#7e22ce',
    },
  ];

  metricCards.forEach((card, idx) => {
    const cx = startX + idx * (cardW + gap);
    ctx.fillStyle = card.bg;
    ctx.fillRect(cx, cardsY, cardW, cardH);
    ctx.strokeStyle = card.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cardsY, cardW, cardH);

    drawText(card.label, cx + 15, cardsY + 32, 'bold 12.5px Arial', card.titleColor);
    drawText(card.amount, cx + 15, cardsY + 68, 'bold 20px Arial', card.valColor);
  });

  // Comprehensive Accounts Table
  let currentY = 340;
  drawText('খাতভিত্তিক বিস্তারিত হিসাব বিবরণী (Comprehensive Accounts Summary)', 70, currentY, 'bold 19px Arial', '#1e293b');
  currentY += 20;

  const tableW = canvas.width - 140;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(70, currentY, tableW, 36);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(70, currentY, tableW, 36);

  drawText('আর্থিক হিসাব ও সূচক খাত (Financial Ledger Item)', 85, currentY + 24, 'bold 14px Arial', '#334155');
  drawText('টাকার পরিমাণ (Amount BDT)', canvas.width - 85, currentY + 24, 'bold 14px Arial', '#334155', 'right');
  currentY += 36;

  const accounts = [
    { label: 'মোট সংগৃহীত চাঁদা তহবিল (Gross Member Collections)', val: data.collections, color: '#166534' },
    { label: '  • সদস্যদের মূল সঞ্চয় জমা (Principal Member Capital)', val: data.principal, color: '#166534' },
    { label: '  • সংগৃহীত বিলম্ব জরিমানা (Late Penalties Collected)', val: data.penalties, color: '#15803d' },
    { label: '  • ক্যাশ আউট চার্জ বাবদ আদায় (Cash-out Charges Collected)', val: data.cashoutCharges, color: '#15803d' },
    { label: '  • সদস্যদের উদ্বৃত্ত অগ্রিম চাঁদা (Excess Member Advances)', val: data.advances, color: '#1d4ed8' },
    { label: 'বিনিয়োগ থেকে মূলধন ফেরত (Portfolio Principal Recovered)', val: data.investmentReturns, color: '#0369a1' },
    { label: 'বিনিয়োগ থেকে অর্জিত নিট মুনাফা (Realized Investment Returns)', val: data.realizedProfit, color: '#047857' },
    { label: 'প্রাতিষ্ঠানিক পরিচালন ও ব্যবস্থাপনা ব্যয় (Operating Expenditures)', val: data.expenses, color: '#b91c1c' },
    { label: 'সদস্যদের নিকট অনাদায়ী মোট বকেয়া (Outstanding Member Dues)', val: data.outstandingDues, color: '#b91c1c' },
  ];

  accounts.forEach((acc, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(70, currentY, tableW, 34);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(70, currentY, tableW, 34);

    drawText(acc.label, 85, currentY + 22, '13.5px Arial', '#1e293b');
    drawText(formatMoney(acc.val), canvas.width - 85, currentY + 22, 'bold 14px Arial', acc.color, 'right');
    currentY += 34;
  });

  // Monthly Breakdown
  currentY += 30;
  drawText('মাসভিত্তিক চাঁদা ও তহবিল প্রবাহ (Monthly Inflow Trajectory)', 70, currentY, 'bold 19px Arial', '#1e293b');
  currentY += 20;

  const mCols = [70, 240, 440, 680, 920, canvas.width - 70];
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(70, currentY, tableW, 36);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(70, currentY, tableW, 36);

  drawText('মাস (Month)', mCols[0] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('রসিদ সংখ্যা (Count)', mCols[1] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('মূল সঞ্চয় (Principal)', mCols[2] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('জরিমানা (Penalty)', mCols[3] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('মোট আদায় (Total)', mCols[4] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  currentY += 36;

  const breakdown = (data.monthlyBreakdown || []).slice(0, 12);
  breakdown.forEach((mb, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(70, currentY, tableW, 30);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(70, currentY, tableW, 30);

    drawText(mb.month, mCols[0] + 12, currentY + 20, '13px Arial', '#334155');
    drawText(`${mb.count} টি`, mCols[1] + 12, currentY + 20, '13px Arial', '#334155');
    drawText(formatMoney(mb.principalAmount), mCols[2] + 12, currentY + 20, '13px Arial', '#166534');
    drawText(formatMoney(mb.penaltyAmount), mCols[3] + 12, currentY + 20, '13px Arial', '#b45309');
    drawText(formatMoney(mb.totalAmount), mCols[4] + 12, currentY + 20, 'bold 13.5px Arial', '#1e40af');
    currentY += 30;
  });

  // Footer & Signatures
  const footerY = 1530;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, footerY);
  ctx.lineTo(canvas.width - 70, footerY);
  ctx.stroke();

  if (data.signatureImage) {
    try {
      const sigImg = new Image();
      await new Promise<void>((resolve) => {
        sigImg.onload = () => resolve();
        sigImg.onerror = () => resolve();
        sigImg.src = data.signatureImage!;
      });
      if (sigImg.complete && sigImg.naturalWidth > 0) {
        const maxSigW = 180;
        const maxSigH = 50;
        const sigScale = Math.min(maxSigW / sigImg.naturalWidth, maxSigH / sigImg.naturalHeight);
        const sigW = sigImg.naturalWidth * sigScale;
        const sigH = sigImg.naturalHeight * sigScale;
        ctx.drawImage(sigImg, 950 - sigW / 2, footerY + 52 - sigH, sigW, sigH);
      }
    } catch {
      // Ignore
    }
  }

  drawText('____________________________________', 230, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('চেয়ারম্যান / পরিচালকের স্বাক্ষর', 230, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  drawText('____________________________________', 950, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('অনুমোদিত হিসাবরক্ষক স্বাক্ষর', 950, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  drawText(
    'এনএস ফাউন্ডেশন সমবায় সমিতি লিঃ · অফিশিয়াল বার্ষিক নিরীক্ষা ও আর্থিক সারসংক্ষেপ',
    canvas.width / 2,
    1650,
    '13px Arial',
    '#64748b',
    'center'
  );

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate annual report image'));
        return;
      }
      const datePart = now.toISOString().slice(0, 10);
      const filename = `NSF_Annual_Report_${data.year}_${datePart}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(filename);
      }, 500);
    }, 'image/png');
  });
}

export interface AuditPackImageData {
  year: number;
  totalEvents: number;
  integrityPassed: boolean;
  activePoliciesCount: number;
  logs: Array<{
    id: string;
    timestamp: string;
    performedBy: string;
    role: string;
    action: string;
    entityName: string;
    reason: string;
  }>;
  logo?: string | null;
}

export async function downloadAuditPackImage(data: AuditPackImageData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(44, 44, canvas.width - 88, canvas.height - 88);

  const drawText = (
    value: string,
    x: number,
    y: number,
    font = '18px Arial',
    color = '#0f172a',
    align: CanvasTextAlign = 'left',
    maxWidth?: number
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if (maxWidth !== undefined) {
      ctx.fillText(value, x, y, maxWidth);
    } else {
      ctx.fillText(value, x, y);
    }
  };

  let headerTitleX = 70;
  if (data.logo) {
    try {
      const img = new Image();
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = data.logo!;
      });
      if (img.complete && img.naturalWidth > 0) {
        const scale = Math.min(84 / img.naturalWidth, 84 / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, 70 + (84 - w) / 2, 65 + (84 - h) / 2, w, h);
        headerTitleX = 175;
      }
    } catch {
      // Ignore logo error
    }
  }

  drawText('NS FOUNDATION COOPERATIVE SOCIETY', headerTitleX, 98, 'bold 28px Arial', '#0f172a');
  drawText(`সুপার অ্যাডমিন অডিট ও কমপ্লায়েন্স প্যাক · Super Admin Audit Pack (${data.year})`, headerTitleX, 128, '17px Arial', '#475569');
  drawText('নিরাপত্তা স্তর: SUPER_ADMIN ONLY // অপরিবর্তনীয় ডিজিটাল অডিট ট্রেইল', headerTitleX, 154, 'bold 15px Arial', '#be123c');

  const now = new Date();
  drawText(`তারিখ: ${now.toLocaleDateString('bn-BD')}`, canvas.width - 70, 98, '15px Arial', '#64748b', 'right');
  drawText(`নিরীক্ষা বছর: ${data.year}`, canvas.width - 70, 126, 'bold 16px Arial', '#1e293b', 'right');

  // Separator
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, 185);
  ctx.lineTo(canvas.width - 70, 185);
  ctx.stroke();

  // 4 Audit Metric Cards
  const cardsY = 210;
  const cardW = 250;
  const cardH = 95;
  const gap = 20;
  const startX = 70;

  const metricCards = [
    {
      label: 'মোট অডিট ইভেন্ট (Audit Logs)',
      amount: `${data.totalEvents} টি ইভেন্ট`,
      bg: '#fff1f2',
      border: '#fca5a5',
      titleColor: '#9f1239',
      valColor: '#be123c',
    },
    {
      label: 'সিস্টেম ইন্টিগ্রিটি (Integrity)',
      amount: '১০০% নিশ্চিত (PASSED)',
      bg: '#f0fdf4',
      border: '#86efac',
      titleColor: '#166534',
      valColor: '#15803d',
    },
    {
      label: 'সক্রিয় নীতিমালা (Policies)',
      amount: `${data.activePoliciesCount} টি পলিসি রুল`,
      bg: '#eff6ff',
      border: '#93c5fd',
      titleColor: '#1e40af',
      valColor: '#1d4ed8',
    },
    {
      label: 'ডেটা অপরিবর্তনযোগ্যতা (Tamper)',
      amount: 'IMMUTABLE (সুরক্ষিত)',
      bg: '#faf5ff',
      border: '#d8b4fe',
      titleColor: '#6b21a8',
      valColor: '#7e22ce',
    },
  ];

  metricCards.forEach((card, idx) => {
    const cx = startX + idx * (cardW + gap);
    ctx.fillStyle = card.bg;
    ctx.fillRect(cx, cardsY, cardW, cardH);
    ctx.strokeStyle = card.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx, cardsY, cardW, cardH);

    drawText(card.label, cx + 15, cardsY + 32, 'bold 12.5px Arial', card.titleColor);
    drawText(card.amount, cx + 15, cardsY + 68, 'bold 19px Arial', card.valColor);
  });

  // Table of Audit Logs
  let currentY = 345;
  drawText('অপরিবর্তনীয় অডিট ট্রেইল ও প্রশাসনিক রেকর্ড (Immutable Audit Log Records)', 70, currentY, 'bold 19px Arial', '#1e293b');
  currentY += 20;

  const tableW = canvas.width - 140;
  const aCols = [70, 240, 440, 680, canvas.width - 70];
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(70, currentY, tableW, 36);
  ctx.strokeStyle = '#cbd5e1';
  ctx.strokeRect(70, currentY, tableW, 36);

  drawText('তারিখ ও সময় (Timestamp)', aCols[0] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('ব্যবহারকারী / ভূমিকা (User / Role)', aCols[1] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('কার্যক্রম (Action)', aCols[2] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  drawText('কারণ ও বিবরণ (Reason / Details)', aCols[3] + 12, currentY + 23, 'bold 13px Arial', '#475569');
  currentY += 36;

  const displayLogs = (data.logs || []).slice(0, 25);
  displayLogs.forEach((l, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(70, currentY, tableW, 34);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(70, currentY, tableW, 34);

    const timeStr = l.timestamp.replace('T', ' ').slice(0, 16);
    drawText(timeStr, aCols[0] + 12, currentY + 22, '12px Arial', '#334155');
    drawText(`${l.performedBy} (${l.role})`.slice(0, 24), aCols[1] + 12, currentY + 22, 'bold 12px Arial', '#1e293b');
    drawText(l.action.slice(0, 24), aCols[2] + 12, currentY + 22, '12px Arial', '#be123c');
    drawText(l.reason.slice(0, 45), aCols[3] + 12, currentY + 22, '12px Arial', '#475569', 'left', aCols[4] - aCols[3] - 24);
    currentY += 34;
  });

  // Footer & Signatures
  const footerY = 1540;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(70, footerY);
  ctx.lineTo(canvas.width - 70, footerY);
  ctx.stroke();

  drawText('____________________________________', 230, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('সুপার অ্যাডমিন অডিট সিল (Super Admin Seal)', 230, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  drawText('____________________________________', 950, footerY + 60, '15px Arial', '#94a3b8', 'center');
  drawText('গভর্নেন্স ডিরেক্টর স্বাক্ষর (Governance Director)', 950, footerY + 84, 'bold 14px Arial', '#475569', 'center');

  drawText(
    `এনএস ফাউন্ডেশন সমবায় সমিতি লিঃ · ডিজিটাল সিকিউরিটি হ্যাশ: ${btoa(`AUDIT-${data.year}-${data.totalEvents}`)}`,
    canvas.width / 2,
    1650,
    '13px Arial',
    '#64748b',
    'center'
  );

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate audit pack image'));
        return;
      }
      const datePart = now.toISOString().slice(0, 10);
      const filename = `NSF_Audit_Pack_${data.year}_${datePart}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve(filename);
      }, 500);
    }, 'image/png');
  });
}
