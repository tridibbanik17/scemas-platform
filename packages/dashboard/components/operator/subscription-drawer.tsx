'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { SubscriptionManager } from './subscription-manager'

type SubscriptionDrawerProps = { availableZones: string[] }

export function SubscriptionDrawer({ availableZones }: SubscriptionDrawerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          subscriptions
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>alert subscriptions</SheetTitle>
          <SheetDescription>personalize which alerts you receive</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <SubscriptionManager availableZones={availableZones} onSaved={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
