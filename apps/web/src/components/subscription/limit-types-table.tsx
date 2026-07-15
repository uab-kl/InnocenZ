import {
  AlertCircle,
  CheckCircle2,
  Gauge,
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
import { formatDate, formatNumber, getErrorMessage, statusColors } from '@/lib/utils'
import type {
  LimitType,
  SubscriptionPagination,
  SubscriptionStatus,
} from '@/services/subscription'

export type LimitTypeStatusFilter = 'all' | SubscriptionStatus

interface LimitTypesTableProps {
  limitTypes: LimitType[]
  pagination: SubscriptionPagination | undefined
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  statusFilter: LimitTypeStatusFilter
  onStatusFilterChange: (value: LimitTypeStatusFilter) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  onCreateClick: () => void
  onEditClick: (limitType: LimitType) => void
  onDeactivateClick: (limitType: LimitType) => void
}

export function LimitTypesTable({
  limitTypes,
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
  onEditClick,
  onDeactivateClick,
}: LimitTypesTableProps) {
  const showLoading = isLoading && limitTypes.length === 0

  return (
    <Card className="border-(--lavender-soft)/40 bg-card">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Limit Types
              {isFetching && !showLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Define what can be limited on a plan (e.g. users, outlets). Then assign limits
              on the Features tab.
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                onStatusFilterChange(value as LimitTypeStatusFilter)
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
              Create Limit Type
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[180px]">Created</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {showLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span>Loading limit types...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <p className="font-medium text-destructive">
                        Failed to load limit types
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
              ) : limitTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40">
                    <div className="flex flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
                      <Gauge className="h-6 w-6" />
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">No limit types yet</p>
                        <p className="max-w-md text-sm">
                          Create a limit type first (e.g. Max Users), then go to the{' '}
                          <span className="text-foreground">Features</span> tab to link it
                          with a plan and role.
                        </p>
                      </div>
                      <Button size="sm" onClick={onCreateClick}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create your first limit type
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                limitTypes.map((limitType) => (
                  <TableRow key={limitType.id}>
                    <TableCell className="font-mono text-sm">{limitType.code}</TableCell>
                    <TableCell className="font-medium">{limitType.name}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground text-sm">
                      {limitType.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusColors[limitType.status] ?? statusColors.inactive} flex w-fit items-center gap-1 capitalize`}
                      >
                        {limitType.status === 'active' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {limitType.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(limitType.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${limitType.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditClick(limitType)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {limitType.status === 'active' && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDeactivateClick(limitType)}
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
                {formatNumber((pagination.page - 1) * pageSize + 1)}
              </span>{' '}
              -{' '}
              <span className="font-medium">
                {formatNumber(Math.min(pagination.page * pageSize, pagination.totalCount))}
              </span>{' '}
              of{' '}
              <span className="font-medium">{formatNumber(pagination.totalCount)}</span>{' '}
              limit types
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
