import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { AlertCircle, Key, Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/utils'
import {
  PermissionSchema,
  type CreatePermissionInput,
  type RbacModule,
  type RbacPermission,
} from '@/services/rbac'

const permissionTypes = ['read', 'create', 'update', 'delete'] as const

interface PermissionFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  permission?: RbacPermission | null
  modules: RbacModule[]
  onSubmit: (input: CreatePermissionInput) => void
  isSubmitting: boolean
  error: Error | null
}

export function PermissionFormSheet({
  open,
  onOpenChange,
  mode,
  permission,
  modules,
  onSubmit,
  isSubmitting,
  error,
}: PermissionFormSheetProps) {
  const form = useForm({
    defaultValues: {
      moduleId: '',
      permissionType: 'read' as (typeof permissionTypes)[number],
      description: '',
      status: 'active' as 'active' | 'inactive',
    },
    validators: {
      onChange: PermissionSchema,
      onSubmit: PermissionSchema,
    },
    onSubmit: async ({ value }) => {
      onSubmit(value)
    },
  })

  useEffect(() => {
    if (open) {
      form.reset()
      if (mode === 'edit' && permission) {
        form.setFieldValue('moduleId', permission.moduleId)
        form.setFieldValue('permissionType', permission.permissionType)
        form.setFieldValue('description', permission.description)
        form.setFieldValue('status', permission.status)
      } else if (modules[0]) {
        form.setFieldValue('moduleId', modules[0].moduleId)
      }
    }
  }, [open, mode, permission, modules, form])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return
    onOpenChange(nextOpen)
  }

  const isEdit = mode === 'edit'

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500">
              <Key className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {isEdit ? 'Edit Permission' : 'Create Permission'}
              </SheetTitle>
              <SheetDescription>
                {isEdit
                  ? 'Update permission details and status.'
                  : 'Define a permission for a module and action type.'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="flex-1 gap-6 px-4 py-6">
            <form.Field name="moduleId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>Module</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      disabled={isSubmitting || modules.length === 0}
                    >
                      <SelectTrigger aria-invalid={isInvalid}>
                        <SelectValue placeholder="Select module" />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map((module) => (
                          <SelectItem
                            key={module.moduleId}
                            value={module.moduleId}
                          >
                            {module.moduleName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="permissionType">
              {(field) => (
                <Field>
                  <FieldLabel>Permission Type</FieldLabel>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) =>
                      field.handleChange(
                        value as (typeof permissionTypes)[number],
                      )
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {permissionTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>

            <form.Field name="description">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="permission-description">
                      Description
                    </FieldLabel>
                    <Textarea
                      id="permission-description"
                      placeholder="Describe what this permission allows"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                      rows={3}
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
                      <FieldLabel htmlFor="permission-status">
                        Active Status
                      </FieldLabel>
                      <p className="text-sm text-muted-foreground">
                        Set permission as active or inactive.
                      </p>
                    </div>
                    <Switch
                      id="permission-status"
                      checked={field.state.value === 'active'}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? 'active' : 'inactive')
                      }
                      disabled={isSubmitting}
                      aria-label="Toggle permission active status"
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

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || modules.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Saving...' : 'Creating...'}
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Permission'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
