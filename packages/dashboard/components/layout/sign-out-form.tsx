import { Button } from '@/components/ui/button'
import { signOut } from './sign-out-action'

type SignOutFormProps = {
  className?: string
  label?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
}

export function SignOutForm({
  className,
  label = 'sign out',
  variant = 'outline',
}: SignOutFormProps) {
  return (
    <form action={signOut}>
      <Button className={className} type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  )
}
