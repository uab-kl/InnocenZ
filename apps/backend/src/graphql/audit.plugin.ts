import type { ApolloServerPlugin } from '@apollo/server';
import type { GraphQLContext } from '@/graphql/context';
import { logger } from '@/util/logger';
import { logGraphQLMutation, getGraphqlAuditRole } from '@/features/audit-log/audit-log.wrapper';

export function auditLogPlugin(): ApolloServerPlugin<GraphQLContext> {
  return {
    async requestDidStart() {
      return {
        async willSendResponse(requestContext) {
          if (requestContext.contextValue.auditLogged) {
            return;
          }

          if (requestContext.operation?.operation !== 'mutation') {
            return;
          }

          const fieldName =
            requestContext.operation.selectionSet.selections[0]?.kind === 'Field'
              ? requestContext.operation.selectionSet.selections[0].name.value
              : 'unknown';

          const errors = requestContext.errors;
          const errorMessage = errors?.[0]?.message;
          const singleResult =
            requestContext.response.body.kind === 'single'
              ? requestContext.response.body.singleResult
              : null;
          const result = singleResult?.data?.[fieldName];

          try {
            await logGraphQLMutation(
              requestContext.contextValue.req,
              fieldName,
              requestContext.request.variables ?? undefined,
              result,
              errorMessage,
              getGraphqlAuditRole(requestContext.contextValue),
            );
          } catch (error) {
            logger.error('[auditLogPlugin] Failed to write audit log', error);
          }
        },
      };
    },
  };
}
