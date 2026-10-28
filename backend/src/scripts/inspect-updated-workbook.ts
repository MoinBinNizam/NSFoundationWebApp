import * as XLSX from 'xlsx';
import * as path from 'path';

const filePath = path.resolve(__dirname, '../../../docs/updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');

console.log('Loading workbook:', filePath);
const workbook = XLSX.readFile(filePath);

console.log('Sheet Names (' + workbook.SheetNames.length + '):');
workbook.SheetNames.forEach((sheetName, index) => {
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  console.log(`[${index + 1}] "${sheetName}" -> Rows: ${data.length}, Cols: ${data[0]?.length || 0}`);
  if (data.length > 0) {
    // Print first 2 non-empty rows (headers/samples)
    const headerRows = data.slice(0, 3).filter(r => r && r.length > 0);
    headerRows.forEach((row, rIdx) => {
      const cleanRow = row.slice(0, 12).map(c => c !== undefined && c !== null ? String(c).trim() : '');
      console.log(`     Row ${rIdx + 1}: ${JSON.stringify(cleanRow)}`);
    });
  }
});
