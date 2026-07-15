import { useEffect, useMemo, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Key, Loader2, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage } from '@/lib/utils'
import {
  RoleSchema,
  fetchModules,
  fetchPermissions,
  fetchRolePermissions,
  type CreateRoleInput,
  type RbacPermission,
  type RbacRole,
} from '@/services/rbac'

interface RoleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'manage'
  role?: RbacRole | null
  onCreate: (input: CreateRoleInput) => void
  onSaveManage: (input: CreateRoleInput, permissionIds: string[]) => void
  isSubmitting: boolean
  error: Error | null
  onRefreshFail: () => void
}

export function RoleSheet({
  open,
  onOpenChange,
  mode,
  role,
  onCreate,
  onSaveManage,
  isSubmitting,
  error,
  onRefreshFail,
}: RoleSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const isManage = mode === 'manage'
  const isBusy = isSubmitting

  const form = useForm({
    defaultValues: {
      roleName: '',
      status: 'active' as 'active' | 'inactive',
    },
    validators: {
      onChange: RoleSchema,
      onSubmit: RoleSchema,
    },
    onSubmit: async ({ value }) => {
      if (isManage) {
        onSaveManage(value, [...selectedIds])
        return
      }
      onCreate(value)
    },
  })

  const modulesQuery = useQuery({
    queryKey: ['rbac-modules', 'all-active'],
    queryFn: () =>
      fetchModules({ status: 'active', pageSize: 500 }, onRefreshFail),
    enabled: open && isManage,
    staleTime: 60_000,
  })

  const permissionsQuery = useQuery({
    queryKey: ['rbac-permissions', 'all-active'],
    queryFn: () =>
      fetchPermissions({ status: 'active', pageSize: 500 }, onRefreshFail),
    enabled: open && isManage,
    staleTime: 60_000,
  })

  const rolePermissionsQuery = useQuery({
    queryKey: ['rbac-role-permissions', role?.roleId],
    queryFn: () => fetchRolePermissions(role!.roleId, onRefreshFail),
    enabled: open && isManage && !!role,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!open) return

    form.reset()
    if (isManage && role) {
      form.setFieldValue('roleName', role.roleName)
      form.setFieldValue('status', role.status)
    }
  }, [open, isManage, role, form])

  useEffect(() => {
    if (open && isManage && rolePermissionsQuery.data) {
      setSelectedIds(
        new Set(
          rolePermissionsQuery.data.data.map((item) => item.permissionId),
        ),
      )
    }
  }, [open, isManage, rolePermissionsQuery.data])

  const groupedPermissions = useMemo(() => {
    const permissions = permissionsQuery.data?.data ?? []
    const groups = new Map<string, RbacPermission[]>()

    for (const permission of permissions) {
      const list = groups.get(permission.moduleId) ?? []
      list.push(permission)
      groups.set(permission.moduleId, list)
    }

    return groups
  }, [permissionsQuery.data])

  const moduleLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const module of modulesQuery.data?.data ?? []) {
      labels.set(module.moduleId, module.moduleName)
    }
    for (const assignment of rolePermissionsQuery.data?.data ?? []) {
      labels.set(assignment.moduleId, assignment.moduleName)
    }
    return labels
  }, [modulesQuery.data, rolePermissionsQuery.data])

  const togglePermission = (permissionId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(permissionId)
      else next.delete(permissionId)
      return next
    })
  }

  const permissionsLoading =
    modulesQuery.isLoading ||
    permissionsQuery.isLoading ||
    rolePermissionsQuery.isLoading

  const permissionsError =
    modulesQuery.error ??
    permissionsQuery.error ??
    rolePermissionsQuery.error

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) return
    onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        className={`flex w-full flex-col ${isManage ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
              <Shield className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {isManage ? 'Manage Role' : 'Create New Role'}
              </SheetTitle>
              <SheetDescription>
                {isManage
                  ? 'Edit role details and assign permissions.'
                  : 'Add a new role to define user access levels in the system.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <ScrollArea className="flex-1 px-4 py-6">
            <FieldGroup className="gap-6">
              <form.Field name="roleName">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="role-name">Role Name</FieldLabel>
                      <Input
                        id="role-name"
                        placeholder="Enter role name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        disabled={isBusy}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              </form.Field>

              <form.Field name="status">
                {(field) => (
                  <Field>
                    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                      <div className="space-y-1">
                        <FieldLabel htmlFor="role-status">
                          Active Status
                        </FieldLabel>
                        <p className="text-sm text-muted-foreground">
                          Set role as active or inactive.
                        </p>
                      </div>
                      <Switch
                        id="role-status"
                        checked={field.state.value === 'active'}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked ? 'active' : 'inactive')
                        }
                        disabled={isBusy}
                        aria-label="Toggle role active status"
                      />
                    </div>
                  </Field>
                )}
              </form.Field>

              {isManage && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Permissions
                      </h3>
                    </div>

                    {permissionsLoading ? (
                      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Loading permissions...</span>
                      </div>
                    ) : permissionsError ? (
                      <div className="flex min-h-32 flex-col items-center justify-center gap-2 text-destructive">
                        <AlertCircle className="h-5 w-5" />
                        <span className="text-sm text-center">
                          {getErrorMessage(permissionsError)}
                        </span>
                      </div>
                    ) : groupedPermissions.size === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No active permissions found. Create permissions first.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {[...groupedPermissions.entries()].map(
                          ([moduleId, permissions]) => (
                            <div key={moduleId} className="space-y-2">
                              <h4 className="text-sm font-medium text-foreground">
                                {moduleLabels.get(moduleId) ??
                                  `Module ${moduleId.slice(0, 8)}`}
                              </h4>
                              <div className="space-y-2">
                                {permissions.map((permission) => (
                                  <div
                                    key={permission.permissionId}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                                  >
                                    <div className="min-w-0 space-y-1">
                                      <Badge
                                        variant="outline"
                                        className="capitalize"
                                      >
                                        {permission.permissionType}
                                      </Badge>
                                      <p className="text-sm text-muted-foreground truncate">
                                        {permission.description}
                                      </p>
                                    </div>
                                    <Switch
                                      checked={selectedIds.has(
                                        permission.permissionId,
                                      )}
                                      onCheckedChange={(checked) =>
                                        togglePermission(
                                          permission.permissionId,
                                          checked,
                                        )
                                      }
                                      disabled={isBusy}
                                      aria-label={`Toggle ${permission.permissionType} permission`}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {error && (
                <div
                  className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{getErrorMessage(error)}</span>
                </div>
              )}
            </FieldGroup>
          </ScrollArea>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isBusy}
            >
              Close
            </Button>
            <Button
              type="submit"
              disabled={isBusy || (isManage && permissionsLoading)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isManage ? (
                'Save Changes'
              ) : (
                'Create Role'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
