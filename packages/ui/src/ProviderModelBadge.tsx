import React from 'react'

/**
 * Subtle badge shown above each assistant message showing the active
 * provider label and model name. Rendered as muted 12px gray text.
 */
export function ProviderModelBadge({
  providerLabel,
  model,
}: {
  providerLabel: string
  model?: string
}): React.JSX.Element {
  if (!providerLabel && !model) return <></>
  return (
    <span
      className="ai-provider-badge"
      style={{
        display: 'block',
        fontSize: '12px',
        color: 'var(--text-secondary, #888)',
        marginBottom: '4px',
        lineHeight: 1.4,
      }}
    >
      {providerLabel}
      {model ? ` · ${model}` : ''}
    </span>
  )
}
