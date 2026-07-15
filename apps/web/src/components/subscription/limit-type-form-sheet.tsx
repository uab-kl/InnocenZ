import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { AlertCircle, Gauge, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
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
import { cn, getErrorMessage } from '@/lib/utils'
import {
  LimitTypeSchema,
  type CreateLimitTypeInput,
  type LimitType,
} from '@/services/subscription'

interface LimitTypeFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateLimitTypeInput) => void
  isSubmitting: boolean
  error: Error | null
  editTarget?: LimitType | null
}

type ConfigMode = 'number' | 'boolean' | 'text' | 'advanced'

type LimitTypeTemplate = {
  id: string
  label: string
  hint: string
  code: string
  name: string
  description: string
  configMode: ConfigMode
  numberDefault?: string
  numberMin?: string
  numberMax?: string
  numberUnit?: string
  numberPeriod?: string
  booleanDefault?: boolean
  textDefault?: string
}

const LIMIT_TYPE_TEMPLATES: LimitTypeTemplate[] = [
  {
    id: 'max-users',
    label: 'Max users',
    hint: 'Cap how many users an agency can add',
    code: 'max_users',
    name: 'Max Users',
    description: 'Maximum number of users allowed',
    configMode: 'number',
    numberDefault: '10',
    numberMin: '1',
    numberMax: '500',
    numberUnit: 'users',
  },
  {
    id: 'max-outlets',
    label: 'Max outlets',
    hint: 'Limit outlet locations per plan',
    code: 'max_outlets',
    name: 'Max Outlets',
    description: 'Maximum number of outlets allowed',
    configMode: 'number',
    numberDefault: '5',
    numberMin: '1',
    numberMax: '100',
    numberUnit: 'outlets',
  },
  {
    id: 'storage-gb',
    label: 'Storage (GB)',
    hint: 'Storage quota in gigabytes',
    code: 'storage_gb',
    name: 'Storage (GB)',
    description: 'Storage space included in the plan',
    configMode: 'number',
    numberDefault: '50',
    numberMin: '1',
    numberMax: '1000',
    numberUnit: 'GB',
  },
  {
    id: 'api-access',
    label: 'API access',
    hint: 'Turn API access on or off',
    code: 'api_access',
    name: 'API Access',
    description: 'Whether API access is enabled',
    configMode: 'boolean',
    booleanDefault: true,
  },
  {
    id: 'max-pr-roster',
    label: 'Max PRs on roster',
    hint: 'Cap PR headcount — e.g. 20 PRs',
    code: 'max_pr_roster',
    name: 'Max PRs on Roster',
    description: 'Maximum PR representatives on the agency roster',
    configMode: 'number',
    numberDefault: '20',
    numberMin: '1',
    numberMax: '200',
    numberUnit: 'PRs',
  },
  {
    id: 'pv-per-active-pr-week',
    label: 'PV per active PR / week',
    hint: '1 PV per active PR each payroll week',
    code: 'pv_per_active_pr_per_week',
    name: 'PV per Active PR per Week',
    description: 'Payroll vouchers earned per active PR each week',
    configMode: 'advanced',
  },
  {
    id: 'max-pv-per-week',
    label: 'Max PV / week',
    hint: 'Plan weekly PV cap — e.g. 25 PV/week',
    code: 'max_pv_per_week',
    name: 'Max PV per Week',
    description: 'Maximum payroll vouchers the plan allows per week',
    configMode: 'number',
    numberDefault: '25',
    numberMin: '1',
    numberMax: '500',
    numberUnit: 'PV',
    numberPeriod: 'week',
  },
]

function slugifyCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function formatConfigSchema(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return ''
  return JSON.stringify(value, null, 2)
}

function inferConfigMode(schema: Record<string, unknown> | null): ConfigMode {
  if (!schema) return 'number'
  const type = schema.type
  if (type === 'rate') return 'advanced'
  if (type === 'boolean') return 'boolean'
  if (type === 'text') return 'text'
  if (type === 'number' || typeof schema.default === 'number') return 'number'
  return 'advanced'
}

function buildConfigSchema(
  mode: ConfigMode,
  options: {
    numberDefault: string
    numberMin: string
    numberMax: string
    numberUnit: string
    numberPeriod: string
    booleanDefault: boolean
    textDefault: string
    advancedJson: string
  },
): { schema: Record<string, unknown> | null; error: string | null } {
  if (mode === 'advanced') {
    const trimmed = options.advancedJson.trim()
    if (!trimmed) return { schema: null, error: null }
    try {
      return { schema: JSON.parse(trimmed) as Record<string, unknown>, error: null }
    } catch {
      return { schema: null, error: 'Advanced config must be valid JSON' }
    }
  }

  if (mode === 'boolean') {
    return {
      schema: { type: 'boolean', default: options.booleanDefault },
      error: null,
    }
  }

  if (mode === 'text') {
    return {
      schema: { type: 'text', default: options.textDefault },
      error: null,
    }
  }

  const schema: Record<string, unknown> = { type: 'number' }
  const defaultValue = Number(options.numberDefault)
  if (options.numberDefault.trim() && !Number.isNaN(defaultValue)) {
    schema.default = defaultValue
  }
  const min = Number(options.numberMin)
  if (options.numberMin.trim() && !Number.isNaN(min)) schema.min = min
  const max = Number(options.numberMax)
  if (options.numberMax.trim() && !Number.isNaN(max)) schema.max = max
  if (options.numberUnit.trim()) schema.unit = options.numberUnit.trim()
  if (options.numberPeriod.trim()) schema.period = options.numberPeriod.trim()

  return { schema, error: null }
}

export function LimitTypeFormSheet({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
  editTarget,
}: LimitTypeFormSheetProps) {
  const isEditing = !!editTarget
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false)
  const [configMode, setConfigMode] = useState<ConfigMode>('number')
  const [numberDefault, setNumberDefault] = useState('10')
  const [numberMin, setNumberMin] = useState('1')
  const [numberMax, setNumberMax] = useState('100')
  const [numberUnit, setNumberUnit] = useState('users')
  const [numberPeriod, setNumberPeriod] = useState('')
  const [booleanDefault, setBooleanDefault] = useState(true)
  const [textDefault, setTextDefault] = useState('')
  const [advancedJson, setAdvancedJson] = useState('')
  const [configSchemaError, setConfigSchemaError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      code: '',
      name: '',
      description: '' as string | null,
      configSchema: null as Record<string, unknown> | null,
      status: 'active' as 'active' | 'inactive',
    },
    onSubmit: async ({ value }) => {
      const { schema, error: schemaError } = buildConfigSchema(configMode, {
        numberDefault,
        numberMin,
        numberMax,
        numberUnit,
        numberPeriod,
        booleanDefault,
        textDefault,
        advancedJson,
      })
      if (schemaError) {
        setConfigSchemaError(schemaError)
        return
      }
      setConfigSchemaError(null)

      const parsed = LimitTypeSchema.safeParse({
        ...value,
        code: value.code.trim(),
        name: value.name.trim(),
        description: value.description?.trim() || null,
        configSchema: schema,
      })
      if (!parsed.success) return
      onSubmit(parsed.data)
    },
  })

  const applyTemplate = (template: LimitTypeTemplate) => {
    form.setFieldValue('code', template.code)
    form.setFieldValue('name', template.name)
    form.setFieldValue('description', template.description)
    setCodeManuallyEdited(true)
    setConfigMode(template.configMode)
    setNumberDefault(template.numberDefault ?? '10')
    setNumberMin(template.numberMin ?? '1')
    setNumberMax(template.numberMax ?? '100')
    setNumberUnit(template.numberUnit ?? '')
    setNumberPeriod(template.numberPeriod ?? '')
    setBooleanDefault(template.booleanDefault ?? true)
    setTextDefault(template.textDefault ?? '')
    if (template.id === 'pv-per-active-pr-week') {
      setAdvancedJson(
        JSON.stringify(
          {
            type: 'rate',
            default: 1,
            unit: 'PV',
            per: 'active_pr',
            period: 'week',
          },
          null,
          2,
        ),
      )
    } else {
      setAdvancedJson('')
    }
    setConfigSchemaError(null)
  }

  const hydrateFromEditTarget = (target: LimitType) => {
    form.setFieldValue('code', target.code)
    form.setFieldValue('name', target.name)
    form.setFieldValue('description', target.description ?? '')
    form.setFieldValue('status', target.status)
    setCodeManuallyEdited(true)

    const schema = target.configSchema
    const mode = inferConfigMode(schema)
    setConfigMode(mode)

    if (mode === 'advanced') {
      setAdvancedJson(formatConfigSchema(schema))
      return
    }

    if (mode === 'boolean') {
      setBooleanDefault(schema?.default === true)
      return
    }

    if (mode === 'text') {
      setTextDefault(String(schema?.default ?? ''))
      return
    }

    setNumberDefault(String(schema?.default ?? '10'))
    setNumberMin(schema?.min != null ? String(schema.min) : '')
    setNumberMax(schema?.max != null ? String(schema.max) : '')
    setNumberUnit(schema?.unit != null ? String(schema.unit) : '')
    setNumberPeriod(schema?.period != null ? String(schema.period) : '')
  }

  useEffect(() => {
    if (!open) {
      form.reset()
      setCodeManuallyEdited(false)
      setConfigMode('number')
      setNumberDefault('10')
      setNumberMin('1')
      setNumberMax('100')
      setNumberUnit('users')
      setNumberPeriod('')
      setBooleanDefault(true)
      setTextDefault('')
      setAdvancedJson('')
      setConfigSchemaError(null)
      return
    }

    if (editTarget) {
      hydrateFromEditTarget(editTarget)
    } else {
      form.reset()
      setCodeManuallyEdited(false)
      setConfigMode('number')
      setNumberDefault('10')
      setNumberMin('1')
      setNumberMax('100')
      setNumberUnit('users')
      setNumberPeriod('')
      setBooleanDefault(true)
      setTextDefault('')
      setAdvancedJson('')
    }
    setConfigSchemaError(null)
  }, [open, editTarget, form])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) return
    onOpenChange(nextOpen)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-border">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
              <Gauge className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {isEditing ? 'Edit Limit Type' : 'Create Limit Type'}
              </SheetTitle>
              <SheetDescription>
                {isEditing
                  ? 'Update what this limit measures and how it is configured.'
                  : 'Define what you want to cap or control, then assign it on the Features tab.'}
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
                  How it works
                </div>
                <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
                  <li>
                    <span className="text-foreground">Create a limit type</span> — e.g.
                    &quot;Max Users&quot; or &quot;Storage (GB)&quot;.
                  </li>
                  <li>
                    Open the <span className="text-foreground">Features</span> tab and link a{' '}
                    <span className="text-foreground">Plan</span>,{' '}
                    <span className="text-foreground">Role</span>, and this limit type.
                  </li>
                  <li>
                    The plan then enforces that limit for users with that role.
                  </li>
                </ol>
              </div>
            )}

            {!isEditing && (
              <div className="mb-5">
                <p className="mb-2 text-sm font-medium">Quick start</p>
                <p className="mb-3 text-muted-foreground text-sm">
                  Pick a template to pre-fill the form, then adjust as needed.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LIMIT_TYPE_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => applyTemplate(template)}
                      className={cn(
                        'rounded-lg border border-(--lavender-soft)/40 bg-card p-3 text-left transition-colors',
                        'hover:border-(--lavender-soft) hover:bg-(--lavender-soft)/10',
                      )}
                    >
                      <span className="block text-sm font-medium">{template.label}</span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">
                        {template.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <FieldGroup>
              <form.Field name="name">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        const nextName = e.target.value
                        field.handleChange(nextName)
                        if (!isEditing && !codeManuallyEdited) {
                          form.setFieldValue('code', slugifyCode(nextName))
                        }
                      }}
                      placeholder="Max Users"
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      Shown in tables and dropdowns. Example: &quot;Max Users&quot; or
                      &quot;Storage (GB)&quot;.
                    </FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <form.Field name="code">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Code</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        setCodeManuallyEdited(true)
                        field.handleChange(e.target.value)
                      }}
                      placeholder="max_users"
                      className="font-mono text-sm"
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      Unique ID for the system. Use lowercase letters, numbers, and
                      underscores only (e.g. <code className="text-xs">max_users</code>).
                    </FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>
                      Description <span className="font-normal text-muted-foreground">(optional)</span>
                    </FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value ?? ''}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Maximum number of users allowed on this plan"
                      disabled={isSubmitting}
                    />
                    <FieldDescription>
                      Short note for admins — helps others understand what this limit does.
                    </FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>

              <Field>
                <FieldLabel htmlFor="configMode">Limit value type</FieldLabel>
                <Select
                  value={configMode}
                  onValueChange={(value) => {
                    setConfigMode(value as ConfigMode)
                    setConfigSchemaError(null)
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="configMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number — count or amount (most common)</SelectItem>
                    <SelectItem value="boolean">Yes / No — feature on or off</SelectItem>
                    <SelectItem value="text">Text — short text value</SelectItem>
                    <SelectItem value="advanced">Advanced — custom JSON</SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Describes the kind of value this limit stores. You assign the actual limit
                  per plan on the Features tab.
                </FieldDescription>
              </Field>

              {configMode === 'number' && (
                <div className="grid gap-4 rounded-lg border border-(--lavender-soft)/30 p-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="numberDefault">Default value</FieldLabel>
                    <Input
                      id="numberDefault"
                      type="number"
                      value={numberDefault}
                      onChange={(e) => setNumberDefault(e.target.value)}
                      placeholder="10"
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="numberUnit">Unit label</FieldLabel>
                    <Input
                      id="numberUnit"
                      value={numberUnit}
                      onChange={(e) => setNumberUnit(e.target.value)}
                      placeholder="users"
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="numberPeriod">Period</FieldLabel>
                    <Select
                      value={numberPeriod || 'none'}
                      onValueChange={(value) =>
                        setNumberPeriod(value === 'none' ? '' : value)
                      }
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="numberPeriod">
                        <SelectValue placeholder="No period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No period</SelectItem>
                        <SelectItem value="week">Per week</SelectItem>
                        <SelectItem value="payroll_week">Per payroll week</SelectItem>
                        <SelectItem value="month">Per month</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="numberMin">Minimum</FieldLabel>
                    <Input
                      id="numberMin"
                      type="number"
                      value={numberMin}
                      onChange={(e) => setNumberMin(e.target.value)}
                      placeholder="1"
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="numberMax">Maximum</FieldLabel>
                    <Input
                      id="numberMax"
                      type="number"
                      value={numberMax}
                      onChange={(e) => setNumberMax(e.target.value)}
                      placeholder="100"
                      disabled={isSubmitting}
                    />
                  </Field>
                  <FieldDescription className="sm:col-span-2">
                    Example: 25 PV per week, or 20 PRs on roster (leave period empty).
                  </FieldDescription>
                </div>
              )}

              {configMode === 'boolean' && (
                <Field orientation="horizontal">
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel htmlFor="booleanDefault">Default when enabled</FieldLabel>
                    <FieldDescription>Usually leave on (Yes).</FieldDescription>
                  </div>
                  <Switch
                    id="booleanDefault"
                    checked={booleanDefault}
                    onCheckedChange={setBooleanDefault}
                    disabled={isSubmitting}
                  />
                </Field>
              )}

              {configMode === 'text' && (
                <Field>
                  <FieldLabel htmlFor="textDefault">Default text</FieldLabel>
                  <Input
                    id="textDefault"
                    value={textDefault}
                    onChange={(e) => setTextDefault(e.target.value)}
                    placeholder="standard"
                    disabled={isSubmitting}
                  />
                </Field>
              )}

              {configMode === 'advanced' && (
                <Field>
                  <FieldLabel htmlFor="advancedJson">Custom config (JSON)</FieldLabel>
                  <Textarea
                    id="advancedJson"
                    value={advancedJson}
                    onChange={(e) => {
                      setAdvancedJson(e.target.value)
                      setConfigSchemaError(null)
                    }}
                    placeholder={'{\n  "type": "number",\n  "default": 10,\n  "unit": "users"\n}'}
                    rows={6}
                    className="font-mono text-sm"
                    disabled={isSubmitting}
                  />
                  <FieldDescription>
                    For power users only. Leave empty if you do not need custom rules.
                  </FieldDescription>
                  {configSchemaError && (
                    <p className="text-destructive text-sm">{configSchemaError}</p>
                  )}
                </Field>
              )}

              <form.Field name="status">
                {(field) => (
                  <Field orientation="horizontal">
                    <div className="flex flex-1 flex-col gap-1">
                      <FieldLabel htmlFor={field.name}>Active</FieldLabel>
                      <FieldDescription>
                        Only active limit types can be selected on the Features tab.
                      </FieldDescription>
                    </div>
                    <Switch
                      id={field.name}
                      checked={field.state.value === 'active'}
                      onCheckedChange={(checked) =>
                        field.handleChange(checked ? 'active' : 'inactive')
                      }
                      disabled={isSubmitting}
                    />
                  </Field>
                )}
              </form.Field>
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
              {isEditing ? 'Save Changes' : 'Create Limit Type'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
