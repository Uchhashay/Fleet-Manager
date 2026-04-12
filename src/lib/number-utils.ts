import { toWords } from 'number-to-words';

export function amountToWordsIndian(amount: number): string {
  if (amount === 0) return 'Zero Rupees Only';
  
  const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const doubleDigits = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tensPlace = ["", "Ten", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  
  function convertToWords(n: number): string {
    if (n === 0) return "";
    if (n < 10) return singleDigits[n];
    if (n < 20) return doubleDigits[n - 10];
    if (n < 100) return tensPlace[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + singleDigits[n % 10] : "");
    if (n < 1000) return singleDigits[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convertToWords(n % 100) : "");
    return "";
  }

  let words = "";
  const crore = Math.floor(amount / 10000000);
  amount %= 10000000;
  const lakh = Math.floor(amount / 100000);
  amount %= 100000;
  const thousand = Math.floor(amount / 1000);
  amount %= 1000;
  const remaining = amount;

  if (crore > 0) words += convertToWords(crore) + " Crore ";
  if (lakh > 0) words += convertToWords(lakh) + " Lakh ";
  if (thousand > 0) words += convertToWords(thousand) + " Thousand ";
  if (remaining > 0) words += convertToWords(remaining);

  return words.trim() + " Rupees Only";
}
