import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { GraphQLSchema, defaultFieldResolver, GraphQLError } from 'graphql';
import { GraphQLContext, isAuthenticated } from '../context';
import { logger } from '@/util/logger';

export class AuthenticationError extends GraphQLError {
  constructor(message = 'Unauthorized') {
    super(message, {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
}

export const directiveTypeDefs = `#graphql
  directive @auth on FIELD_DEFINITION
`;

function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context: GraphQLContext, info) {
          if (!isAuthenticated(context)) {
            logger.warn(
              `[GraphQL] Unauthorized access attempt to ${info.parentType.name}.${info.fieldName}`,
            );
            throw new AuthenticationError('You must be logged in to access this resource');
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

export function applyDirectives(schema: GraphQLSchema): GraphQLSchema {
  return authDirectiveTransformer(schema);
}
