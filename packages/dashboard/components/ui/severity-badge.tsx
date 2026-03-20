type SeverityBadgeProps = {
  severity: number
}

const config: Record<number, { label: string; color: string }> = {
  1: { label: 'low', color: 'var(--color-severity-low)' },
  2: { label: 'warning', color: 'var(--color-severity-warning)' },
  3: { label: 'critical', color: 'var(--color-severity-critical)' },
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const { label, color } = config[severity] ?? config[1]
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
