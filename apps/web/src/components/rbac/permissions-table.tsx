import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  RbacModule,
  RbacPagination,
  RbacPermission,
} from '@/services/rbac'
import { getErrorMessage, statusColors } from '@/lib/utils'

export type PermissionStatusFilter = 'all' | 'active' | 'inactive'
export type PermissionModuleFilter = 'all' | string

interface PermissionsTableProps {
  permissions: RbacPermission[]
  modules: RbacModule[]
  moduleNameById: Map<string, string>
  pagination: RbacPagination | undefined
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  statusFilter: PermissionStatusFilter
  moduleFilter: PermissionModuleFilter
  onStatusFilterChange: (value: PermissionStatusFilter) => void
  onModuleFilterChange: (value: PermissionModuleFilter) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  onCreateClick: () => void
  onEditClick: (permission: RbacPermission) => void
  onDeactivateClick: (permission: RbacPermission) => void
}

export function PermissionsTable({
  permissions,
  modules,
  moduleNameById,
  pagination,
  page,
  pageSize,
  isLoading,
  isFetching,
  isError,
  error,
  statusFilter,
  moduleFilter,
  onStatusFilterChange,
  onModuleFilterChange,
  onPageChange,
  onRetry,
  onCreateClick,
  onEditClick,
  onDeactivateClick,
}: PermissionsTableProps) {
  const showLoading = isLoading && permissions.length === 0

  return (
    <Card className="border-(--lavender-soft)/40 bg-card">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Permissions
              {isFetching && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Access rules tied to modules and action types.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <Select
              value={moduleFilter}
              onValueChange={(value) => onModuleFilterChange(value)}
            >
              <SelectTrigger className="sm:w-48" aria-label="Filter by module">
                <SelectValue placeholder="Filter by module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {modules.map((module) => (
                  <SelectItem key={module.moduleId} value={module.moduleId}>
                    {module.moduleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                onStatusFilterChange(value as PermissionStatusFilter)
              }
            >
              <SelectTrigger className="sm:w-40" aria-label="Filter by status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onCreateClick} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Create Permission
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {showLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span>Loading permissions...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <p className="font-medium text-destructive">
                        Failed to load permissions
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {getErrorMessage(error)}
                      </p>
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Try Again
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : permissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Key className="h-6 w-6" />
                      <span>No permissions found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                permissions.map((permission) => (
                  <TableRow key={permission.permissionId}>
                    <TableCell className="font-medium">
                      {moduleNameById.get(permission.moduleId) ??
                        permission.moduleId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {permission.permissionType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {permission.description}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusColors[permission.status]} flex w-fit items-center gap-1 capitalize`}
                      >
                        {permission.status === 'active' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {permission.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Permission actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onEditClick(permission)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {permission.status === 'active' && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDeactivateClick(permission)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Deactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.totalCount > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing{' '}
              <span className="font-medium">
                {(pagination.page - 1) * pageSize + 1}
              </span>{' '}
              -{' '}
              <span className="font-medium">
                {Math.min(pagination.page * pageSize, pagination.totalCount)}
              </span>{' '}
              of{' '}
              <span className="font-medium">{pagination.totalCount}</span>{' '}
              permissions
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrevPage || isFetching}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNextPage || isFetching}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
