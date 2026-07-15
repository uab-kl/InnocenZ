import { useEffect } from 'react'
import { useForm } from '@tanstack/react-form'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { CreateAdminSchema, type CreateAdminInput } from '@/services/admin'

interface CreateAdminSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateAdminInput) => void
  isSubmitting: boolean
  error: Error | null
}

export function CreateAdminSheet({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: CreateAdminSheetProps) {
  const form = useForm({
    defaultValues: {
      email: '',
      displayName: '',
      password: '',
      status: 'active' as 'active' | 'inactive',
    },
    onSubmit: async ({ value }) => {
      const parsed = CreateAdminSchema.safeParse(value)
      if (!parsed.success) return
      onSubmit(parsed.data)
    },
  })

  useEffect(() => {
    if (!open) {
      form.reset()
    }
  }, [open, form])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return
    onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
              <UserPlus className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">Create Admin User</SheetTitle>
              <SheetDescription>
                Add a new administrator to the admin table.
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
            <form.Field name="displayName">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.value.trim()

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="create-admin-display-name">
                      Display Name
                    </FieldLabel>
                    <Input
                      id="create-admin-display-name"
                      placeholder="Enter display name"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={[{ message: 'Display name is required' }]} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="email">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched &&
                  !CreateAdminSchema.shape.email.safeParse(field.state.value)
                    .success

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="create-admin-email">Email</FieldLabel>
                    <Input
                      id="create-admin-email"
                      type="email"
                      placeholder="admin@example.com"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError
                        errors={[{ message: 'Please enter a valid email address' }]}
                      />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <form.Field name="password">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched &&
                  field.state.value.length > 0 &&
                  field.state.value.length < 6

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor="create-admin-password">
                      Password
                    </FieldLabel>
                    <Input
                      id="create-admin-password"
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      disabled={isSubmitting}
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError
                        errors={[
                          { message: 'Password must be at least 6 characters' },
                        ]}
                      />
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
                      <FieldLabel htmlFor="create-admin-status">
                        Active Status
                      </FieldLabel>
                      <p className="text-sm text-muted-foreground">
                        Set account as active or inactive.
                      </p>
                    </div>
                    <Switch
                      id="create-admin-status"
                      checked={field.state.value === 'active'}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? 'active' : 'inactive')
                      }
                      disabled={isSubmitting}
                      aria-label="Toggle admin active status"
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Admin'
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
