export const typeDefs = `#graphql
  type User {
    id: ID!
    email: String!
    displayName: String!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input RegisterInput {
    email: String!
    displayName: String!
  }

  type AuthResponse {
    accessToken: String!
    refreshToken: String!
    expiresAt: String!
    user: User!
  }

  extend type Query {
    me: User @auth
  }

  extend type Mutation {
    login(input: LoginInput!): AuthResponse!
    register(input: RegisterInput!): User!
  }
`;
