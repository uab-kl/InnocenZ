import {
  AlertCircle,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { RbacPagination, RbacRole } from '@/services/rbac'
import { getErrorMessage, statusColors } from '@/lib/utils'

export type RoleStatusFilter = 'all' | 'active' | 'inactive'

interface RolesGridProps {
  roles: RbacRole[]
  pagination?: RbacPagination
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  statusFilter: RoleStatusFilter
  onStatusFilterChange: (value: RoleStatusFilter) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  onCreateClick: () => void
  onRoleClick: (role: RbacRole) => void
}

export function RolesGrid({
  roles,
  pagination,
  page,
  pageSize,
  isLoading,
  isFetching,
  isError,
  error,
  statusFilter,
  onStatusFilterChange,
  onPageChange,
  onRetry,
  onCreateClick,
  onRoleClick,
}: RolesGridProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as RoleStatusFilter)
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
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <Button onClick={onCreateClick} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </div>

      {isLoading && roles.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Loading roles...</span>
        </div>
      ) : isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div className="text-center">
            <p className="font-medium text-destructive">Failed to load roles</p>
            <p className="text-sm text-muted-foreground mt-1">
              {getErrorMessage(error)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      ) : roles.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Shield className="h-8 w-8" />
          <span>No roles found</span>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <button
              key={role.roleId}
              type="button"
              onClick={() => onRoleClick(role)}
              className={cn(
                'w-full rounded-xl border border-(--lavender-soft)/40 bg-card p-5 text-left',
                'transition-colors hover:border-(--lavender-muted)/60 hover:bg-accent/40',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                    <Shield className="h-5 w-5" />
                  </div>
                  <h3 className="truncate font-semibold text-foreground">
                    {role.roleName.charAt(0).toUpperCase() +
                      role.roleName.slice(1)}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={`${statusColors[role.status]} shrink-0`}
                >
                  {role.status.charAt(0).toUpperCase() + role.status.slice(1)}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {pagination && pagination.totalCount > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing{' '}
            <span className="font-medium">
              {(pagination.page - 1) * pageSize + 1}
            </span>{' '}
            -{' '}
            <span className="font-medium">
              {Math.min(pagination.page * pageSize, pagination.totalCount)}
            </span>{' '}
            of <span className="font-medium">{pagination.totalCount}</span> roles
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
    </div>
  )
}
