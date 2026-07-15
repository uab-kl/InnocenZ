import { typeDefs as userTypeDefs } from '@/features/user/user.typeDefs';
import { typeDefs as auditLogTypeDefs } from '@/features/audit-log/audit-log.typeDefs';
import { directiveTypeDefs } from './directives';

const baseTypeDefs = `#graphql
  scalar JSON

  type Query {
    _health: String
  }

  type Mutation {
    _health: String
  }

  type Pagination {
    count: Int!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPrevPage: Boolean!
  }
`;

export const typeDefs = [directiveTypeDefs, baseTypeDefs, userTypeDefs, auditLogTypeDefs];
