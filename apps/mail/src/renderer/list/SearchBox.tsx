import type { FormEvent } from 'react'
import { useI18n } from '../i18n/locale'
import './list.css'

/**
 * Mailbox search box (Lane R owns). Submit runs `mail:search-local`
 * over the IPC fakes, then the caller applies the `matchesQuery`
 * post-filter locally (`applyLocalSearch`); the real sync engine is a
 * later phase. Server expansion stays an explicit button in the list
 * footer (`mail.list.moreOnServer`), never implicit.
 */

export interface SearchBoxProps {
  value: string
  searching: boolean
  onChange(value: string): void
  onSubmit(): void
  onClear(): void
}

export function SearchBox({ value, searching, onChange, onSubmit, onClear }: SearchBoxProps) {
  const { t } = useI18n()

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form className="mail-search" role="search" onSubmit={submit}>
      <label className="mail-search-label" htmlFor="mail-search-input">
        {t('mail.search.box')}
      </label>
      <input
        id="mail-search-input"
        className="mail-search-input"
        type="search"
        autoComplete="off"
        placeholder={t('mail.list.searchPlaceholder')}
        value={value}
        disabled={searching}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="mail-search-clear"
          aria-label={t('mail.search.box')}
          onClick={onClear}
        >
          x
        </button>
      )}
      <button type="submit" className="mail-search-go" disabled={searching}>
        {t('mail.search.box')}
      </button>
    </form>
  )
}
