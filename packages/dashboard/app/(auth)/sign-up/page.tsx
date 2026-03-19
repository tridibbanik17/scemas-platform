import { SignupForm } from '@/components/auth/signup-form'

// SignupForAccount boundary (AccessManager)
export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">create account</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          join SCEMAS with a named account, then land in the dashboard your role allows
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
