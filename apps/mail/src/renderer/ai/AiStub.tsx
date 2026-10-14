import { useI18n } from '../i18n/locale'
import './ai.css'

/**
 * AI stub rail (Lane R owns the stub only). Triage, summarize,
 * compose-assist, and ask-mail render as disabled actions scoped to the
 * current account; Farah + Nadia wire them in the AI phase under the
 * Alya PII matrix (headers-first, account-scoped, cited claims only).
 * This stub never calls the AI channels.
 */

export interface AiStubProps {
  accountId?: string
}

export function AiStub({ accountId }: AiStubProps) {
  const { t } = useI18n()
  return (
    <aside className="mail-ai" aria-label={t('mail.ai.askMail')} data-account={accountId ?? ''}>
      <div className="mail-ai-actions">
        <button type="button" disabled title={t('mail.ai.scopedAccount')}>
          {t('mail.ai.triage')}
        </button>
        <button type="button" disabled title={t('mail.ai.scopedAccount')}>
          {t('mail.ai.summarize')}
        </button>
        <button type="button" disabled title={t('mail.ai.scopedAccount')}>
          {t('mail.ai.composeAssist')}
        </button>
        <button type="button" disabled title={t('mail.ai.scopedAccount')}>
          {t('mail.ai.askMail')}
        </button>
      </div>
      <p className="mail-ai-note">{t('mail.ai.scopedAccount')}</p>
      <p className="mail-ai-note">{t('mail.ai.citationsOpen')}</p>
    </aside>
  )
}
