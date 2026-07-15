import {
  AlertCircle,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
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
import { formatDate, formatNumber, formatRoleLabel, getErrorMessage } from '@/lib/utils'
import { formatLimitConfigSummary, findLimitTypeById } from '@/lib/limit-type-display'
import type {
  SubscriptionFeature,
  SubscriptionPagination,
  LimitType,
} from '@/services/subscription'

export type SubscriptionFeatureFilter = 'all' | string

interface SubscriptionFeaturesTableProps {
  features: SubscriptionFeature[]
  pagination: SubscriptionPagination | undefined
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: Error | null
  subscriptionFilter: SubscriptionFeatureFilter
  roleFilter: SubscriptionFeatureFilter
  limitTypeFilter: SubscriptionFeatureFilter
  subscriptionOptions: Array<{ id: string; name: string }>
  roleOptions: Array<{ id: string; roleName: string }>
  limitTypeOptions: Array<{ id: string; name: string }>
  limitTypes: LimitType[]
  subscriptionNameById: Map<string, string>
  roleNameById: Map<string, string>
  limitTypeNameById: Map<string, string>
  onSubscriptionFilterChange: (value: SubscriptionFeatureFilter) => void
  onRoleFilterChange: (value: SubscriptionFeatureFilter) => void
  onLimitTypeFilterChange: (value: SubscriptionFeatureFilter) => void
  onPageChange: (page: number) => void
  onRetry: () => void
  onCreateClick: () => void
  onEditClick: (feature: SubscriptionFeature) => void
  onDeleteClick: (feature: SubscriptionFeature) => void
}

function resolveName(
  id: string | null,
  lookup: Map<string, string>,
): string {
  if (!id) return '—'
  return lookup.get(id) ?? id.slice(0, 8) + '…'
}

export function SubscriptionFeaturesTable({
  features,
  pagination,
  page,
  pageSize,
  isLoading,
  isFetching,
  isError,
  error,
  subscriptionFilter,
  roleFilter,
  limitTypeFilter,
  subscriptionOptions,
  roleOptions,
  limitTypeOptions,
  limitTypes,
  subscriptionNameById,
  roleNameById,
  limitTypeNameById,
  onSubscriptionFilterChange,
  onRoleFilterChange,
  onLimitTypeFilterChange,
  onPageChange,
  onRetry,
  onCreateClick,
  onEditClick,
  onDeleteClick,
}: SubscriptionFeaturesTableProps) {
  const showLoading = isLoading && features.length === 0

  return (
    <Card className="border-(--lavender-soft)/40 bg-card">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Features
              {isFetching && !showLoading && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </CardTitle>
            <CardDescription>
              Link plans, roles, and limit types
            </CardDescription>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Select
              value={subscriptionFilter}
              onValueChange={onSubscriptionFilterChange}
            >
              <SelectTrigger className="sm:w-44" aria-label="Filter by plan">
                <SelectValue placeholder="All Plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {subscriptionOptions.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={roleFilter} onValueChange={onRoleFilterChange}>
              <SelectTrigger className="sm:w-40" aria-label="Filter by role">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roleOptions.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {formatRoleLabel(role.roleName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={limitTypeFilter}
              onValueChange={onLimitTypeFilterChange}
            >
              <SelectTrigger className="sm:w-44" aria-label="Filter by limit type">
                <SelectValue placeholder="All Limit Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Limit Types</SelectItem>
                {limitTypeOptions.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={onCreateClick} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Add Feature
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Limit Type</TableHead>
                <TableHead>Limit</TableHead>
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
                      <span>Loading subscription features...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <p className="font-medium text-destructive">
                        Failed to load subscription features
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
              ) : features.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Layers className="h-6 w-6" />
                      <span>No subscription features found</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                features.map((feature) => (
                  <TableRow key={feature.id}>
                    <TableCell className="font-medium">
                      {resolveName(feature.subscriptionId, subscriptionNameById)}
                    </TableCell>
                    <TableCell>
                      {feature.roleId
                        ? formatRoleLabel(
                            roleNameById.get(feature.roleId) ?? feature.roleId,
                          )
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {resolveName(feature.limitTypeId, limitTypeNameById)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatLimitConfigSummary(
                        findLimitTypeById(limitTypes, feature.limitTypeId)?.configSchema,
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(feature.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Feature actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditClick(feature)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDeleteClick(feature)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
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
              features
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
