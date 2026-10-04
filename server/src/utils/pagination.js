export const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const from = (page - 1) * limit;
  return { page, limit, from, to: from + limit - 1 };
};

export const pageMeta = (count, page, limit) => ({
  page,
  limit,
  total: count ?? 0,
  totalPages: Math.ceil((count ?? 0) / limit),
});

// Strip characters that would break PostgREST or()/ilike filters
export const sanitizeSearch = (s = '') => String(s).replace(/[,()%*\\]/g, ' ').trim();
