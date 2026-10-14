import { useI18n } from './i18n/locale'

// STUB ONLY (Lane S owns this placeholder). Mailbox composition — folders,
// list, reader, ComposeHost mount — belongs to Lane R; do not build it here.
export default function App() {
  const { t } = useI18n()
  return (
    <div className="mail-stub">
      <div className="mail-stub-title">{t('mail.tabTitle')}</div>
      <div className="mail-stub-banner">{t('mail.noKeyringBanner')}</div>
    </div>
  )
}
