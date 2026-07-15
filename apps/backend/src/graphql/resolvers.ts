import { mergeResolvers } from '@graphql-tools/merge';
import { resolvers as userResolvers } from '@/features/user/user.resolvers';
import { resolvers as auditLogResolvers } from '@/features/audit-log/audit-log.resolvers';

const baseResolvers = {
  Query: {
    _health: () => 'GraphQL server is running!',
  },
  Mutation: {
    _health: () => 'GraphQL mutations are available!',
  },
};

export const resolvers = mergeResolvers([baseResolvers, userResolvers, auditLogResolvers]);
