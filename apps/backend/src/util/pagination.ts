import { PgSelectBase } from 'drizzle-orm/pg-core';

export type PgQueryType = PgSelectBase<any, any, any, any>;

export type PaginationParams = {
  page?: number;
  pageSize?: number;
  pageNumber?: number;
};

export type PaginationMeta = {
  count: number;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type PaginatedResponse<T> = {
  query: T[];
  pagination: PaginationMeta;
};

export type PaginatedResult<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

export function paginateQuery<T extends PgQueryType>(
  query: Omit<T, 'where'>,
  pageSize: number,
  pageNumber: number,
  totalCount: number,
) {
  const offset = (pageNumber - 1) * pageSize;
  query.offset(offset).limit(pageSize);

  const totalPages = Math.ceil(totalCount / pageSize);
  const currentPage = pageNumber;

  return {
    query,
    pagination: {
      count: Math.min(pageSize, Math.max(0, totalCount - offset)),
      totalCount,
      currentPage,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
  };
}

export function paginate<T>(items: T[], page = 1, pageSize = 10): PaginatedResult<T> {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    data: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
}
