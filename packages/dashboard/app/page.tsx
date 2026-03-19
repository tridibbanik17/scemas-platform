import { redirect } from 'next/navigation'

// root page redirects to login (or dashboard if authed, handled by middleware)
export default function Home() {
  redirect('/sign-in')
}
