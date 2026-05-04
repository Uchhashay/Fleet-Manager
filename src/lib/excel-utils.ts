import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Sheet1') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Try to adjust column widths
  const max_width = data.reduce((w, r) => Math.max(w, Object.keys(r).length), 10);
  worksheet['!cols'] = Array(max_width).fill({ wch: 20 });

  XLSX.writeFile(workbook, `${fileName}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
};
