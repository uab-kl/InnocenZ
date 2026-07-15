import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
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
import type { AdminPagination, AdminUser } from '@/services/admin'
import { formatDate, getErrorMessage, statusColors } from '@/lib/utils'

export type AdminStatusFilter = 'all' | 'active' | 'inactive'

interface AdminsTableProps {
  admins: AdminUser[]
  pagination: AdminPagination | undefined
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  statusFilter: AdminStatusFilter
  onStatusFilterChange: (value: AdminStatusFilter) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  onCreateClick: () => void
}

export function AdminsTable({
  admins,
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
}: AdminsTableProps) {
  const showLoading = isLoading && admins.length === 0

  return (
    <Card className="border-(--lavender-soft)/40 bg-card">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Admin Users
              {isFetching && !showLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Manage administrators in the admin table
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                onStatusFilterChange(value as AdminStatusFilter)
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
              Create Admin
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[180px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span>Loading admin users...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <p className="font-medium text-destructive">
                        Failed to load admin users
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
              ) : admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Shield className="h-6 w-6" />
                      <span>No admin users found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.displayName}
                    </TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusColors[admin.status] ?? statusColors.inactive} flex w-fit items-center gap-1 capitalize`}
                      >
                        {admin.status === 'active' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {admin.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(admin.createdAt)}
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
              admins
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
