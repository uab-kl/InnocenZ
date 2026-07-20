export const typeDefs = `#graphql
  type User {
    id: ID!
    email: String
    phoneNum: String
    profileImage: String
    username: String!
    status: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
    profile: UserProfile!
  }

  type UserProfile {
    id: ID
    userId: ID!
    fullName: String
    nationality: String
    idType: String
    idNo: String
    dob: String
    addressLine1: String
    addressLine2: String
    postcode: String
    state: String
    country: String
    idPhotoFront: String
    idPhotoBack: String
    verificationStatus: String
    verifiedAt: String
    createdAt: String
    updatedAt: String
    createdBy: String
    updatedBy: String
  }

  type UserPaginatedResponse {
    query: [User!]!
    pagination: Pagination!
  }

  input UserFilterInput {
    id: ID
    email: String
    phoneNum: String
    username: String
    status: String
    roleId: ID
    startDate: String
    endDate: String
  }

  enum UserSortField {
    CREATED_AT
    UPDATED_AT
    USERNAME
    EMAIL
    STATUS
  }

  enum SortDirection {
    ASC
    DESC
  }

  input UserSortInput {
    field: UserSortField
    direction: SortDirection
  }

  input CreateUserInput {
    username: String!
    email: String
    phoneNum: String
    profileImage: String
  }

  extend type Query {
    users(
      filter: UserFilterInput
      pageSize: Int
      pageNumber: Int
      sort: UserSortInput
    ): UserPaginatedResponse! @auth
    user(id: ID!): User @auth
  }
`;
