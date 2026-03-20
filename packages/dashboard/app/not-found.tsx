import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-6xl tabular-nums">404</p>
      <p className="text-sm text-muted-foreground text-pretty">
        this page doesn't exist, or you don't have access to it.
      </p>
      <Button asChild variant="outline">
        <Link href="/">go home</Link>
      </Button>
    </div>
  )
}
