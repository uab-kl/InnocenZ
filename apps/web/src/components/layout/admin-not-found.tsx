import { Link } from '@tanstack/react-router'
import { FileQuestion, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AdminNotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <div className="mb-10 flex items-center justify-center gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-white dark:text-[#1a1726] shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
            Z
          </div>

          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
            <FileQuestion
              className="h-9 w-9 text-primary"
              strokeWidth={1.5}
            />
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Page not found
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          Sorry, we couldn&apos;t find the page you&apos;re looking for. The
          page might have been removed or the URL might be incorrect.
        </p>

        <Button asChild size="lg" className="mt-8 h-11 gap-2.5 px-8 text-white dark:text-[#1a1726]">
          <Link to="/dashboard" className="text-inherit [&_svg]:text-inherit">
            <LayoutDashboard className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
