import type { Metadata } from 'next'
import './globals.css'
import { TRPCProvider } from '@/lib/trpc-provider'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'SCEMAS - Smart City Environmental Monitoring',
  description: 'Environmental monitoring and alert system for Hamilton, ON',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="antialiased">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  )
}
