import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import {
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, PageShell } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/lib/auth-context';
import { toMutationError } from '@/lib/mutation-error';
import { formatDate, formatNumber, getErrorMessage } from '@/lib/utils';
import {
  adminApproveJob,
  adminDeclineJob,
  fetchAdminPendingJobs,
  fetchSpecialServiceSummary,
  fetchSpecialServices,
  type SpecialService,
  type SpecialServiceCategory,
  type SpecialServiceInitiatedBy,
  type SpecialServiceStatus,
  type SpecialServicesQueryParams,
  type UpdateSpecialServiceInput,
  updateSpecialService,
  updateSpecialServiceStatus,
} from '@/services/special-service';

export const Route = createFileRoute('/admin/service/other')({
  component: SpecialServicesPage,
  head: () => ({
    meta: [{ title: 'Jobs & Special Services — Innocenz Admin' }],
  }),
});

const PAGE_SIZE = 10;

type ViewMode = 'all' | 'pending_review';
type StatusFilter = 'all' | SpecialServiceStatus;
type CategoryFilter = 'all' | SpecialServiceCategory;
type SourceFilter = 'all' | SpecialServiceInitiatedBy;

const STATUSES: SpecialServiceStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
];

const CATEGORIES: SpecialServiceCategory[] = [
  'transportation',
  'delivery',
  'wardrobe',
  'makeup',
  'vip_escort',
  'uniform',
  'emergency_cover',
  'training',
  'others',
];

const categoryLabels: Record<SpecialServiceCategory, string> = {
  transportation: 'Transportation',
  delivery: 'Deliveries',
  wardrobe: 'Wardrobe & styling',
  makeup: 'Makeup & grooming',
  vip_escort: 'VIP escort',
  uniform: 'Uniform & documents',
  emergency_cover: 'Emergency cover',
  training: 'Training top-up',
  others: 'Others',
};

const statusLabels: Record<SpecialServiceStatus, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusBadgeColors: Record<SpecialServiceStatus, string> = {
  open: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  assigned: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  in_progress:
    'border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender',
  completed:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cancelled: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

function SpecialServicesPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [page, setPage] = useState(1);
  const [actionId, setActionId] = useState<string | null>(null);
  const [draftBudgets, setDraftBudgets] = useState<Record<string, string>>({});
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
  const [draftSources, setDraftSources] = useState<Record<string, string>>({});
  const [draftDescriptions, setDraftDescriptions] = useState<
    Record<string, string>
  >({});

  const queryParams: SpecialServicesQueryParams = { page, pageSize: PAGE_SIZE };
  if (statusFilter !== 'all') queryParams.status = statusFilter;
  if (categoryFilter !== 'all') queryParams.category = categoryFilter;
  if (sourceFilter !== 'all') queryParams.initiatedBy = sourceFilter;

  const isPendingView = viewMode === 'pending_review';

  const servicesQuery = useQuery({
    queryKey: isPendingView
      ? ['special-services', 'admin-pending', { page, pageSize: PAGE_SIZE }]
      : ['special-services', queryParams],
    queryFn: () =>
      isPendingView
        ? fetchAdminPendingJobs({ page, pageSize: PAGE_SIZE }, logout)
        : fetchSpecialServices(queryParams, logout),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 2,
  });

  const summaryQuery = useQuery({
    queryKey: ['special-services', 'summary'],
    queryFn: () => fetchSpecialServiceSummary(logout),
    staleTime: 30_000,
  });

  const pendingCountQuery = useQuery({
    queryKey: ['special-services', 'admin-pending', 'count'],
    queryFn: () => fetchAdminPendingJobs({ page: 1, pageSize: 1 }, logout),
    staleTime: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: SpecialServiceStatus;
    }) => updateSpecialServiceStatus(id, status, logout),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['special-services'] });
      toast.success(response.message || 'Status updated');
    },
    onError: (error) => {
      toast.error(
        toMutationError(error, 'Failed to update status')?.message ??
          'Failed to update status',
      );
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminApproveJob(id, logout),
    onMutate: (id) => setActionId(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['special-services'] });
      toast.success(response.message || 'Job posting approved');
    },
    onError: (error) => {
      toast.error(
        toMutationError(error, 'Failed to approve job')?.message ??
          'Failed to approve job',
      );
    },
    onSettled: () => setActionId(null),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => adminDeclineJob(id, logout),
    onMutate: (id) => setActionId(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['special-services'] });
      toast.success(response.message || 'Job posting declined');
    },
    onError: (error) => {
      toast.error(
        toMutationError(error, 'Failed to decline job')?.message ??
          'Failed to decline job',
      );
    },
    onSettled: () => setActionId(null),
  });

  const fieldsMutation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & UpdateSpecialServiceInput) =>
      updateSpecialService(id, input, logout),
    onMutate: ({ id }) => setActionId(id),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['special-services'] });
      setDraftBudgets((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      setDraftTitles((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      setDraftSources((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      setDraftDescriptions((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast.success(response.message || 'Order updated');
    },
    onError: (error) => {
      toast.error(
        toMutationError(error, 'Failed to update order')?.message ??
          'Failed to update order',
      );
    },
    onSettled: () => setActionId(null),
  });

  const saveBudget = (id: string, original: string | null) => {
    const raw = (draftBudgets[id] ?? original ?? '').trim();
    const originalNorm = original ?? '';
    if (raw === originalNorm) return;
    if (raw === '') {
      fieldsMutation.mutate({ id, budget: null });
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error('Enter a valid non-negative budget');
      return;
    }
    fieldsMutation.mutate({ id, budget: parsed });
  };

  const sourceNameOf = (record: SpecialService) =>
    record.initiatedBy === 'agency'
      ? record.postingAgencyName || ''
      : record.outletName;

  const saveTitle = (record: SpecialService) => {
    const next = (draftTitles[record.id] ?? record.title).trim();
    if (!next || next === record.title) return;
    fieldsMutation.mutate({ id: record.id, title: next });
  };

  const saveSource = (record: SpecialService) => {
    const next = (draftSources[record.id] ?? sourceNameOf(record)).trim();
    if (!next || next === sourceNameOf(record)) return;
    if (record.initiatedBy === 'agency') {
      fieldsMutation.mutate({ id: record.id, postingAgencyName: next });
    } else {
      fieldsMutation.mutate({ id: record.id, outletName: next });
    }
  };

  const saveDescription = (record: SpecialService) => {
    const next = (
      draftDescriptions[record.id] ??
      record.description ??
      ''
    ).trim();
    const original = (record.description ?? '').trim();
    if (next === original) return;
    fieldsMutation.mutate({
      id: record.id,
      description: next === '' ? null : next,
    });
  };

  const records = servicesQuery.data?.data ?? [];
  const pagination = servicesQuery.data?.pagination;
  const showLoading = servicesQuery.isLoading && records.length === 0;
  const summary = summaryQuery.data?.data;
  const pendingCount = pendingCountQuery.data?.pagination.totalCount ?? 0;

  const summaryCards: Array<{ key: SpecialServiceStatus; label: string }> = [
    { key: 'open', label: 'Open' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={LayoutGrid}
        title="Jobs & Special Services"
        description="Edit Title, Source, Category, and Budget inline — press Enter or leave a field to save. Category “Other” opens a description field."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card
          className="cursor-pointer border-amber-500/30 bg-card transition-colors hover:bg-amber-500/5"
          onClick={() => {
            setViewMode('pending_review');
            setPage(1);
          }}
        >
          <CardHeader className="pb-2">
            <CardDescription>Pending review</CardDescription>
            <CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
              {formatNumber(pendingCount)}
            </CardTitle>
          </CardHeader>
        </Card>
        {summaryCards.map((card) => (
          <Card key={card.key} className="border-(--lavender-soft)/40 bg-card">
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl">
                {formatNumber(summary?.[card.key] ?? 0)}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="border-(--lavender-soft)/40 bg-card">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isPendingView ? 'Agency job postings' : 'All orders'}
                {servicesQuery.isFetching && !showLoading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
              <CardDescription>
                {isPendingView
                  ? 'Agency-submitted posts awaiting admin approve or decline'
                  : 'Outlet orders and agency jobs — status and assignment'}
              </CardDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Select
                value={viewMode}
                onValueChange={(value) => {
                  setViewMode(value as ViewMode);
                  setPage(1);
                }}
              >
                <SelectTrigger className="sm:w-48" aria-label="View mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All orders</SelectItem>
                  <SelectItem value="pending_review">
                    Pending review
                    {pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </SelectItem>
                </SelectContent>
              </Select>

              {!isPendingView && (
                <>
                  <Select
                    value={sourceFilter}
                    onValueChange={(value) => {
                      setSourceFilter(value as SourceFilter);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className="sm:w-40"
                      aria-label="Filter by source"
                    >
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="outlet">Outlet</SelectItem>
                      <SelectItem value="agency">Agency</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={categoryFilter}
                    onValueChange={(value) => {
                      setCategoryFilter(value as CategoryFilter);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className="sm:w-40"
                      aria-label="Filter by category"
                    >
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {categoryLabels[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={statusFilter}
                    onValueChange={(value) => {
                      setStatusFilter(value as StatusFilter);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      className="sm:w-40"
                      aria-label="Filter by status"
                    >
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabels[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[180px]">Category</TableHead>
                  <TableHead>Budget (RM)</TableHead>
                  <TableHead>Assigned Agency</TableHead>
                  <TableHead className="w-[130px]">Scheduled</TableHead>
                  {isPendingView ? (
                    <TableHead className="w-[200px]">Actions</TableHead>
                  ) : (
                    <TableHead className="w-[170px]">Status</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {showLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>Loading…</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : servicesQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <p className="font-medium text-destructive">
                          Failed to load
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {getErrorMessage(servicesQuery.error)}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => servicesQuery.refetch()}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Try Again
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32">
                      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <LayoutGrid className="h-6 w-6" />
                        <span>
                          {isPendingView
                            ? 'No job postings pending review'
                            : 'No special services found'}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => {
                    const busy = actionId === record.id;
                    return (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Input
                            className="h-8 min-w-[160px] font-medium"
                            aria-label={`Title for ${record.id}`}
                            disabled={busy && fieldsMutation.isPending}
                            value={draftTitles[record.id] ?? record.title}
                            onChange={(e) =>
                              setDraftTitles((prev) => ({
                                ...prev,
                                [record.id]: e.target.value,
                              }))
                            }
                            onBlur={() => saveTitle(record)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <Input
                              className="h-8 min-w-[130px]"
                              aria-label={`Source for ${record.title}`}
                              disabled={busy && fieldsMutation.isPending}
                              value={
                                draftSources[record.id] ?? sourceNameOf(record)
                              }
                              onChange={(e) =>
                                setDraftSources((prev) => ({
                                  ...prev,
                                  [record.id]: e.target.value,
                                }))
                              }
                              onBlur={() => saveSource(record)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                            />
                            <Select
                              value={record.initiatedBy}
                              disabled={busy && fieldsMutation.isPending}
                              onValueChange={(value) =>
                                fieldsMutation.mutate({
                                  id: record.id,
                                  initiatedBy:
                                    value as SpecialServiceInitiatedBy,
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-[110px]"
                                aria-label={`Role type for ${record.title}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="outlet">Outlet</SelectItem>
                                <SelectItem value="agency">Agency</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-[160px] flex-col gap-1.5">
                            <Badge
                              variant="outline"
                              className="w-fit border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender"
                            >
                              {categoryLabels[record.category] ??
                                record.category}
                            </Badge>
                            {record.category === 'others' && (
                              <Input
                                className="h-8"
                                placeholder="Describe other…"
                                aria-label={`Other category description for ${record.title}`}
                                disabled={busy && fieldsMutation.isPending}
                                value={
                                  draftDescriptions[record.id] ??
                                  record.description ??
                                  ''
                                }
                                onChange={(e) =>
                                  setDraftDescriptions((prev) => ({
                                    ...prev,
                                    [record.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => saveDescription(record)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                }}
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                              RM
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              className="h-8 w-[110px]"
                              placeholder="0.00"
                              aria-label={`Budget for ${record.title}`}
                              disabled={busy && fieldsMutation.isPending}
                              value={
                                draftBudgets[record.id] ?? record.budget ?? ''
                              }
                              onChange={(e) =>
                                setDraftBudgets((prev) => ({
                                  ...prev,
                                  [record.id]: e.target.value,
                                }))
                              }
                              onBlur={() =>
                                saveBudget(record.id, record.budget)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur();
                                }
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {record.assignedAgencyName ?? '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.scheduledFor
                            ? formatDate(record.scheduledFor)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {isPendingView ? (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  approveMutation.mutate(record.id)
                                }
                              >
                                {busy && approveMutation.isPending ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  declineMutation.mutate(record.id)
                                }
                              >
                                {busy && declineMutation.isPending ? (
                                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <XCircle className="mr-1 h-3.5 w-3.5" />
                                )}
                                Decline
                              </Button>
                            </div>
                          ) : (
                            <Select
                              value={record.status}
                              onValueChange={(value) =>
                                statusMutation.mutate({
                                  id: record.id,
                                  status: value as SpecialServiceStatus,
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 w-[150px]"
                                aria-label={`Status for ${record.title}`}
                              >
                                <SelectValue>
                                  <Badge
                                    variant="outline"
                                    className={`${statusBadgeColors[record.status]} w-fit`}
                                  >
                                    {statusLabels[record.status]}
                                  </Badge>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {statusLabels[status]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {pagination && pagination.totalCount > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <div>
                Showing{' '}
                <span className="font-medium">
                  {formatNumber((pagination.page - 1) * PAGE_SIZE + 1)}
                </span>{' '}
                -{' '}
                <span className="font-medium">
                  {formatNumber(
                    Math.min(
                      pagination.page * PAGE_SIZE,
                      pagination.totalCount,
                    ),
                  )}
                </span>{' '}
                of{' '}
                <span className="font-medium">
                  {formatNumber(pagination.totalCount)}
                </span>{' '}
                {isPendingView ? 'jobs' : 'orders'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasPrevPage || servicesQuery.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasNextPage || servicesQuery.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
