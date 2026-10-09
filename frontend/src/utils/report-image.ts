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
    totalDues: number;
    totalPenaltyPaid: number;
    totalPenaltyDue: number;
    totalPrincipalDue?: number;
    totalPrincipalPaid?: number;
  };
  payments?: Array<{
    _id?: string;
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
  }>;
  logo?: string | null;
}

const formatMoney = (val: number): string => {
  return `৳ ${(Number(val) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export async function downloadMemberReportImage(data: MemberFinancialReportData): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700; // High-res portrait statement
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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
    align: CanvasTextAlign = 'left'
  ) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
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

  const metricCards = [
    {
      label: 'মোট পরিশোধিত (Total Paid)',
      amount: formatMoney(data.summary.totalPayments || 0),
      bg: '#f0fdf4',
      border: '#86efac',
      titleColor: '#166534',
      valColor: '#15803d',
    },
    {
      label: 'মোট বকেয়া (Total Dues)',
      amount: formatMoney(data.summary.totalDues || 0),
      bg: '#fef2f2',
      border: '#fca5a5',
      titleColor: '#991b1b',
      valColor: '#b91c1c',
    },
    {
      label: 'পরিশোধিত জরিমানা (Penalty Paid)',
      amount: formatMoney(data.summary.totalPenaltyPaid || 0),
      bg: '#eff6ff',
      border: '#93c5fd',
      titleColor: '#1e40af',
      valColor: '#1d4ed8',
    },
    {
      label: 'বকেয়া জরিমানা (Penalty Due)',
      amount: formatMoney(data.summary.totalPenaltyDue || 0),
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

    drawText(card.label, cx + 15, cardsY + 32, 'bold 13px Arial', card.titleColor);
    drawText(card.amount, cx + 15, cardsY + 68, 'bold 20px Arial', card.valColor);
  });

  // 5. Payment History Section Title
  const tableTitleY = 425;
  drawText('পেমেন্ট ও চাঁদা লেনদেন তালিকা (Payment History Records)', 70, tableTitleY, 'bold 19px Arial', '#1e293b');

  // Table Coordinates
  const tableY = 445;
  const cols = [70, 240, 520, 760, 960, canvas.width - 70];
  const headerH = 40;
  const rowH = 42;

  // Header Row
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(70, tableY, canvas.width - 140, headerH);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(70, tableY, canvas.width - 140, headerH);

  drawText('তারিখ (Date)', cols[0] + 15, tableY + 26, 'bold 15px Arial', '#475569');
  drawText('রশিদ নং (Receipt #)', cols[1] + 15, tableY + 26, 'bold 15px Arial', '#475569');
  drawText('পদ্ধতি (Method)', cols[2] + 15, tableY + 26, 'bold 15px Arial', '#475569');
  drawText('পরিমাণ (Amount)', cols[3] + 15, tableY + 26, 'bold 15px Arial', '#475569');
  drawText('স্ট্যাটাস (Status)', cols[4] + 15, tableY + 26, 'bold 15px Arial', '#475569');

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

      const pDate = new Date(p.paymentDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      drawText(pDate, cols[0] + 15, currentY + 27, '14px Arial', '#334155');
      drawText(p.receiptNumber, cols[1] + 15, currentY + 27, 'bold 14px Arial', '#2563eb');
      drawText(p.paymentMethod, cols[2] + 15, currentY + 27, '14px Arial', '#475569');
      drawText(formatMoney(p.totalAmount), cols[3] + 15, currentY + 27, 'bold 14px Arial', '#166534');
      drawText(p.status, cols[4] + 15, currentY + 27, 'bold 13px Arial', p.status === 'PAID' ? '#166534' : '#b45309');

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

  // Signature lines
  drawText('____________________________________', 100, footerY + 60, '15px Arial', '#94a3b8');
  drawText('সদস্যের স্বাক্ষর (Member Signature)', 100, footerY + 84, 'bold 14px Arial', '#475569');

  drawText('____________________________________', canvas.width - 360, footerY + 60, '15px Arial', '#94a3b8');
  drawText('অনুমোদিত হিসাবরক্ষক (Authorized Accountant)', canvas.width - 360, footerY + 84, 'bold 14px Arial', '#475569');

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
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NSF_Report_${data.member.memberId}_${now.toISOString().slice(0, 10)}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
