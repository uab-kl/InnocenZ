import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { AlertCircle, Info, Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
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
import { formatRoleLabel, getErrorMessage } from '@/lib/utils'
import { formatLimitConfigSummary, findLimitTypeById } from '@/lib/limit-type-display'
import {
  SubscriptionFeatureSchema,
  type CreateSubscriptionFeatureInput,
  type SubscriptionFeature,
  type LimitType,
} from '@/services/subscription'

interface SubscriptionFeatureFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateSubscriptionFeatureInput) => void
  isSubmitting: boolean
  error: Error | null
  editTarget?: SubscriptionFeature | null
  subscriptionOptions: Array<{ id: string; name: string }>
  roleOptions: Array<{ id: string; roleName: string }>
  limitTypeOptions: Array<{ id: string; name: string }>
  limitTypes: LimitType[]
}

export function SubscriptionFeatureFormSheet({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
  editTarget,
  subscriptionOptions,
  roleOptions,
  limitTypeOptions,
  limitTypes,
}: SubscriptionFeatureFormSheetProps) {
  const isEditing = !!editTarget

  const form = useForm({
    defaultValues: {
      subscriptionId: '',
      roleId: '',
      limitTypeId: '',
    },
    onSubmit: async ({ value }) => {
      const parsed = SubscriptionFeatureSchema.safeParse(value)
      if (!parsed.success) return
      onSubmit(parsed.data)
    },
  })

  useEffect(() => {
    if (!open) {
      form.reset()
      return
    }

    if (editTarget) {
      form.setFieldValue('subscriptionId', editTarget.subscriptionId ?? '')
      form.setFieldValue('roleId', editTarget.roleId ?? '')
      form.setFieldValue('limitTypeId', editTarget.limitTypeId ?? '')
    } else {
      form.reset()
    }
  }, [open, editTarget, form])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return
    onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
              <Layers className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {isEditing ? 'Edit Feature' : 'Add Feature'}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? 'Update the plan, role, and limit type link.'
                  : 'Assign a limit type to a plan for a specific role.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            {!isEditing && (
              <div className="mb-5 rounded-lg border border-(--lavender-soft)/40 bg-(--lavender-soft)/10 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
                  <Info className="h-4 w-4 text-lavender" />
                  PR / PV example
                </div>
                <p className="mb-2 text-muted-foreground">
                  For agency PR limits, create these limit types first, then add one
                  feature per limit:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>· <span className="text-foreground">Max PRs on roster</span> → 20 PRs</li>
                  <li>· <span className="text-foreground">PV per active PR per week</span> → 1 PV</li>
                  <li>· <span className="text-foreground">Max PV per week</span> → 25 PV / week</li>
                </ul>
                <p className="mt-2 text-muted-foreground text-xs">
                  &quot;PVs issued last payroll week&quot; is usage data from payroll — not set here.
                </p>
              </div>
            )}

            <FieldGroup>
              <form.Field name="subscriptionId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Plan</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {subscriptionOptions.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <form.Field name="roleId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Role</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {formatRoleLabel(role.roleName)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <form.Field name="limitTypeId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Limit Type</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Select limit type" />
                      </SelectTrigger>
                      <SelectContent>
                        {limitTypeOptions.map((lt) => (
                          <SelectItem key={lt.id} value={lt.id}>
                            {lt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.limitTypeId}>
                {(limitTypeId) => {
                  const selectedLimitType = findLimitTypeById(limitTypes, limitTypeId)
                  if (!selectedLimitType) return null
                  const limitSummary = formatLimitConfigSummary(
                    selectedLimitType.configSchema,
                  )
                  return (
                    <div className="rounded-lg border border-(--lavender-soft)/40 bg-muted/40 p-3 text-sm">
                      <p className="font-medium text-foreground">Limit on this plan</p>
                      <p className="mt-1 text-foreground">{limitSummary}</p>
                      {selectedLimitType.description && (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {selectedLimitType.description}
                        </p>
                      )}
                      <p className="mt-2 text-muted-foreground text-xs">
                        To change the number, edit the limit type on the Limit Types tab
                        (default value field).
                      </p>
                    </div>
                  )
                }}
              </form.Subscribe>
            </FieldGroup>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{getErrorMessage(error)}</span>
              </div>
            )}
          </div>

          <SheetFooter className="shrink-0 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Add Feature'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
