import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { userTypes } from '@/constants/user-types'

type UserType = (typeof userTypes)[number]

export function UserTypePage({ type }: { type: UserType }) {
  const Icon = type.icon

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--lavender-muted)/50 bg-(--lavender-soft)/20 text-lavender">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {type.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {type.description}
          </p>
        </div>
      </div>

      <Card className="border-(--lavender-soft)/40 bg-card">
        <CardHeader>
          <CardTitle>{type.title} users</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connect your {type.title.toLowerCase()} user API to populate this
          section.
        </CardContent>
      </Card>
    </div>
  )
}
