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
    city: String
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

  # The 'users' and 'user' queries were REMOVED (31 Jul 2026), not gated.
  #
  # The backlog carried them as the unclosed half of the GET /user hash leak —
  # "the users resolver reads the same table behind @auth only, so the leak path
  # is narrowed, not closed". Re-deriving from the code before acting showed
  # there is no resolver: user.resolvers.ts is 'Query: {}', and graphql/
  # resolvers.ts merges only the base health fields, that empty object, and
  # audit-log's three. So these two fields could not read anything — declared in
  # the schema, unimplemented, and non-null, so an actual call errored.
  #
  # Deleted rather than implemented, deliberately. A schema field that advertises
  # a capability nothing serves is worse than no field: it appears in
  # introspection as a way to enumerate every account, it invites exactly the
  # guard the backlog asked for, and it would have had someone write a resolver
  # to satisfy the schema. Reading users is the REST GET /user path's job, and
  # that one is already gated requireRole('admin','agency','outlet') with
  # identity documents redacted for outlet callers — a second, unconsumed way in
  # is surface, not a feature. No web or mobile client queries either field.
  #
  # This leaves the User and UserPaginatedResponse types unreferenced. They are
  # kept for now: an unreferenced type is inert, whereas removing them touches
  # the filter/sort inputs too, which is a bigger edit than this finding needs.
`;
