'use client'

// ReportEnvironmentalHazard boundary: public submission dialog (SRS CP-C3)

import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { trpc } from '@/lib/trpc'

const categories = [
  { value: 'environmental_hazard', label: 'environmental hazard' },
  { value: 'system_misuse', label: 'system misuse' },
  { value: 'inappropriate_content', label: 'inappropriate content' },
  { value: 'other', label: 'other' },
] as const

type HazardCategory = (typeof categories)[number]['value']

export function HazardReportForm({ zones }: { zones: { zone: string; zoneName: string }[] }) {
  const [open, setOpen] = useState(false)
  const [zone, setZone] = useState('')
  const [category, setCategory] = useState<HazardCategory | ''>('')
  const [description, setDescription] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const trimmedDescription = description.trim()
  const descriptionLength = description.length
  const isSubmitDisabled = submitIsDisabled(zone, category, trimmedDescription, submitted)

  const submit = trpc.reports.submit.useMutation({
    onSuccess: () => {
      setError(null)
      setSubmitted(true)
    },
    onError: err => {
      setError(err.message)
    },
  })

  function resetForm() {
    setZone('')
    setCategory('')
    setDescription('')
    setContactEmail('')
    setError(null)
    setSubmitted(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitDisabled || submitted || !category) {
      return
    }

    setError(null)

    submit.mutate({
      zone,
      category,
      description: trimmedDescription,
      contactEmail: contactEmail.trim() || null,
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  function handleCloseSuccess() {
    setOpen(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          report hazard
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-balance">report an environmental hazard</DialogTitle>
          <DialogDescription className="text-pretty">
            submit a report about environmental hazards, system misuse, or inappropriate content.
            your report will be reviewed by an administrator.
          </DialogDescription>
        </DialogHeader>
        {submitted ? (
          <div className="space-y-4 py-2">
            <p aria-live="polite" className="text-pretty text-sm text-muted-foreground">
              report submitted successfully. thank you.
            </p>
            <Button className="w-full" onClick={handleCloseSuccess} type="button">
              close
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="zone">zone</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger id="zone">
                  <SelectValue placeholder="select a zone" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map(zoneOption => (
                    <SelectItem key={zoneOption.zone} value={zoneOption.zone}>
                      {zoneOption.zoneName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">category</Label>
              <Select
                value={category}
                onValueChange={value => {
                  if (isHazardCategory(value)) {
                    setCategory(value)
                  }
                }}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(categoryOption => (
                    <SelectItem key={categoryOption.value} value={categoryOption.value}>
                      {categoryOption.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">description</Label>
              <Textarea
                id="description"
                maxLength={500}
                onChange={e => setDescription(e.target.value)}
                placeholder="describe the issue (10-500 characters)"
                rows={4}
                value={description}
              />
              <p className="text-xs text-muted-foreground tabular-nums">{descriptionLength}/500</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">contact email (optional)</Label>
              <Input
                id="email"
                onChange={e => setContactEmail(e.target.value)}
                placeholder="for follow-up only"
                type="email"
                value={contactEmail}
              />
            </div>

            {error ? (
              <p aria-live="polite" className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              className="w-full"
              disabled={submit.isPending || isSubmitDisabled}
              type="submit"
            >
              {submit.isPending ? 'submitting...' : 'submit report'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function submitIsDisabled(
  zone: string,
  category: HazardCategory | '',
  description: string,
  submitted: boolean,
): boolean {
  return submitted || !zone || !category || description.length < 10
}

function isHazardCategory(value: string): value is HazardCategory {
  return categories.some(category => category.value === value)
}
