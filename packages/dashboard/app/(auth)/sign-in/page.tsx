import { LoginForm } from '@/components/auth/login-form'

// LoginToSCEMAS boundary (AccessManager)
export default function SignInPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">SCEMAS</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          sign in to access the operator, admin, or public-facing dashboard flows
        </p>
      </div>
      <LoginForm />
    </div>
  )
}
