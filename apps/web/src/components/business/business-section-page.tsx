import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BusinessSection } from '@/constants/business-sections'

export function BusinessSectionPage({ section }: { section: BusinessSection }) {
  const Icon = section.icon

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--lavender-muted)/50 bg-(--lavender-soft)/20 text-lavender">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {section.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {section.description}
          </p>
        </div>
      </div>

      <Card className="border-(--lavender-soft)/40 bg-card">
        <CardHeader>
          <CardTitle>{section.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Connect your {section.title.toLowerCase()} API to populate this
          section.
        </CardContent>
      </Card>
    </div>
  )
}
