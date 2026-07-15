import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CreditCard, Loader2, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { formatRoleLabel, getErrorMessage } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { fetchRoles } from '@/services/rbac'
import { SubscriptionSchema, type CreateSubscriptionInput } from '@/services/subscription'
import type { Subscription } from '@/services/subscription'
import type { RbacRole } from '@/services/rbac/types'

interface SubscriptionFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateSubscriptionInput) => void
  isSubmitting: boolean
  error: Error | null
  editTarget?: Subscription | null
}

export function SubscriptionFormSheet({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
  editTarget,
}: SubscriptionFormSheetProps) {
  const { logout } = useAuth()
  const isEditing = !!editTarget
  const [roleRows, setRoleRows] = useState<string[]>([''])

  const rolesQuery = useQuery({
    queryKey: ['rbac-roles', 'subscription-form'],
    queryFn: () => fetchRoles({ status: 'active', pageSize: 100 }, logout),
    enabled: open,
    staleTime: 60_000,
  })

  const form = useForm({
    defaultValues: {
      name: editTarget?.name ?? '',
      price: editTarget ? Number(editTarget.price) : 0,
      billingCycle: (editTarget?.billingCycle ?? 'monthly') as 'weekly' | 'monthly' | 'annually',
      status: (editTarget?.status ?? 'active') as 'active' | 'inactive',
      roleIds: editTarget?.roles.map((role) => role.id) ?? [],
    },
    onSubmit: async ({ value }) => {
      const parsed = SubscriptionSchema.safeParse(value)
      if (!parsed.success) return
      onSubmit(parsed.data)
    },
  })

  useEffect(() => {
    if (!open) {
      form.reset()
      setRoleRows([''])
      return
    }

    const roleIds = editTarget?.roles.map((role) => role.id) ?? []
    setRoleRows(roleIds.length > 0 ? roleIds : [''])
    form.setFieldValue('name', editTarget?.name ?? '')
    form.setFieldValue('price', editTarget ? Number(editTarget.price) : 0)
    form.setFieldValue('billingCycle', editTarget?.billingCycle ?? 'monthly')
    form.setFieldValue('status', editTarget?.status ?? 'active')
    form.setFieldValue('roleIds', roleIds)
  }, [open, editTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const syncRoleRows = (rows: string[]) => {
    setRoleRows(rows)
    form.setFieldValue('roleIds', rows.filter(Boolean))
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return
    onOpenChange(nextOpen)
  }

  const availableRoles = rolesQuery.data?.data ?? []

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {isEditing ? 'Edit Plan' : 'Create Plan'}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? 'Update the plan details.'
                  : 'Add a new plan for agencies.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <FieldGroup className="gap-6">
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.value.trim()
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="sub-name">Plan Name</FieldLabel>
                    <Input
                      id="sub-name"
                      placeholder="e.g. Basic, Pro, Enterprise"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={[{ message: 'Plan name is required' }]} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <Field>
              <FieldLabel>Roles</FieldLabel>
              <p className="mb-3 text-sm text-muted-foreground">
                Select which roles can use this plan.
              </p>
              {rolesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading roles...
                </div>
              ) : rolesQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load roles.</p>
              ) : availableRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active roles found.</p>
              ) : (
                <SubscriptionRolePicker
                  roleRows={roleRows}
                  availableRoles={availableRoles}
                  disabled={isSubmitting}
                  onChange={syncRoleRows}
                />
              )}
            </Field>

            <form.Field name="price">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && field.state.value < 0
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="sub-price">Price (RM)</FieldLabel>
                    <Input
                      id="sub-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) =>
                        field.handleChange(Number(e.target.value))
                      }
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={[{ message: 'Price must be 0 or more' }]} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="billingCycle">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="sub-billing-cycle">Billing Cycle</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(value as 'weekly' | 'monthly' | 'annually')
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="sub-billing-cycle">
                      <SelectValue placeholder="Select billing cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <Field>
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div className="space-y-1">
                      <FieldLabel htmlFor="sub-status">Active Status</FieldLabel>
                      <p className="text-sm text-muted-foreground">
                        Set plan as active or inactive.
                      </p>
                    </div>
                    <Switch
                      id="sub-status"
                      checked={field.state.value === 'active'}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? 'active' : 'inactive')
                      }
                      disabled={isSubmitting}
                      aria-label="Toggle subscription active status"
                    />
                  </div>
                </Field>
              )}
            </form.Field>

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
          </div>

          <SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Plan'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function SubscriptionRolePicker({
  roleRows,
  availableRoles,
  disabled,
  onChange,
}: {
  roleRows: string[]
  availableRoles: RbacRole[]
  disabled: boolean
  onChange: (rows: string[]) => void
}) {
  const selectedElsewhere = (roleId: string, rowIndex: number) =>
    roleRows.some((id, index) => index !== rowIndex && id === roleId)

  const canAddRow = roleRows.length < availableRoles.length

  return (
    <div className="space-y-2">
      {roleRows.map((roleId, index) => {
        const options = availableRoles.filter(
          (role) =>
            role.roleId === roleId || !selectedElsewhere(role.roleId, index),
        )

        return (
          <div key={`role-row-${index}`} className="flex items-center gap-2">
            <Select
              value={roleId || undefined}
              onValueChange={(value) => {
                const next = [...roleRows]
                next[index] = value
                onChange(next)
              }}
              disabled={disabled}
            >
              <SelectTrigger className="flex-1" aria-label={`Role ${index + 1}`}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {options.map((role) => (
                  <SelectItem key={role.roleId} value={role.roleId}>
                    {formatRoleLabel(role.roleName)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              disabled={disabled || roleRows.length === 1}
              onClick={() => {
                const next = roleRows.filter((_, i) => i !== index)
                onChange(next.length > 0 ? next : [''])
              }}
              aria-label="Remove role"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled || !canAddRow}
        onClick={() => onChange([...roleRows, ''])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add role
      </Button>
    </div>
  )
}
