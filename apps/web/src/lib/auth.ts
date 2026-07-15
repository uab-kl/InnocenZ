export interface User {
  id: string
  email: string
  displayName: string
  contactNo: string
  isActive: boolean
  roles: string[]
  readPermission: string[]
  createPermission: string[]
  updatePermission: string[]
}
