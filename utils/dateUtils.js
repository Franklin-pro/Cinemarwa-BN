// 📌 Helper function to calculate expiry date
export function calculateExpiryDate(period) {
  if (!period || period === "one-time") return null;
  
  const now = new Date();
  const periods = {
    "24h": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "180d": 180,
    "365d": 365
  };
  
  const days = periods[period];
  if (!days) return null;
  
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

// 📌 Helper to get access period label
export function getAccessPeriodLabel(period) {
  const labels = {
    "24h": "24 Hours",
    "7d": "7 Days",
    "30d": "30 Days",
    "90d": "90 Days",
    "180d": "180 Days",
    "365d": "1 Year"
  };
  return labels[period] || period;
}

// 📌 Calculate days remaining between two dates
export function calculateDaysRemaining(expiryDate) {
  if (!expiryDate) return null;
  
  const now = new Date();
  const expiry = new Date(expiryDate);
  const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  
  return Math.max(0, daysRemaining);
}

// 📌 Format date for display
export function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD HH:mm:ss':
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    case 'MMM DD, YYYY':
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[d.getMonth()]} ${day}, ${year}`;
    default:
      return d.toISOString();
  }
}