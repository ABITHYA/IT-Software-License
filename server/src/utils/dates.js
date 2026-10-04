export const todayStr = () => new Date().toISOString().slice(0, 10);

export const addDays = (days, from = new Date()) => {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const daysUntil = (dateStr) =>
  dateStr ? Math.ceil((new Date(dateStr) - new Date(todayStr())) / 86400000) : null;
