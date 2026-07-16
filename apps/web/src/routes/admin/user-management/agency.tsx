import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, PageShell } from '@/components/admin/page-header';
import { AgenciesTable, type OrgStatusFilter } from '@/components/organization';
import { getUserTypeByKey } from '@/constants/user-types';
import { useAuth } from '@/lib/auth-context';
import { toMutationError } from '@/lib/mutation-error';
import {
  type AgenciesQueryParams,
  approveAgency,
  fetchAgencies,
  suspendAgency,
} from '@/services/agency';

export const Route = createFileRoute('/admin/user-management/agency')({
  component: AgencyOrgsPage,
  head: () => ({
    meta: [{ title: 'Agency Organizations — Innocenz Admin' }],
  }),
});

const PAGE_SIZE = 10;

function AgencyOrgsPage() {
  const type = getUserTypeByKey('agency')!;
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const queryParams: AgenciesQueryParams = {
    page: currentPage,
    pageSize: PAGE_SIZE,
  };
  if (statusFilter !== 'all') queryParams.status = statusFilter;
  if (debouncedSearch) queryParams.name = debouncedSearch;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['agencies', queryParams],
    queryFn: () => fetchAgencies(queryParams, logout),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 2,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAgency(id, logout),
    onMutate: (id) => setActionId(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      toast.success(response.message || 'Agency approved');
    },
    onError: (err) => {
      toast.error(toMutationError(err, 'Failed to approve agency').message);
    },
    onSettled: () => setActionId(null),
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => suspendAgency(id, logout),
    onMutate: (id) => setActionId(id),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['agencies'] });
      toast.success(response.message || 'Agency suspended');
    },
    onError: (err) => {
      toast.error(toMutationError(err, 'Failed to suspend agency').message);
    },
    onSettled: () => setActionId(null),
  });

  return (
    <PageShell>
      <PageHeader
        icon={type.icon}
        title={type.title}
        description={type.description}
      />

      <AgenciesTable
        agencies={data?.data ?? []}
        pagination={data?.pagination}
        page={currentPage}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        error={error as Error | null}
        search={searchInput}
        statusFilter={statusFilter}
        onSearchChange={setSearchInput}
        onStatusFilterChange={(value) => {
          setStatusFilter(value);
          setCurrentPage(1);
        }}
        onPageChange={setCurrentPage}
        onRetry={() => refetch()}
        onApprove={(id) => approveMutation.mutate(id)}
        onSuspend={(id) => suspendMutation.mutate(id)}
        actionId={actionId}
      />
    </PageShell>
  );
}
