/**
 * @genoffice/mail-protocols entry point (Lane B: IMAP/SMTP driver).
 *
 * The canonical MailProvider/MailStore/MIME surface is owned by Lane A;
 * this lane adds the IMAP/SMTP driver, the local staging fakes, and the
 * contract copy it builds against (see mail-provider.ts).
 */
export * from './mail-provider.js'
export * from './imap-smtp-driver.js'
export * from './imap-transport.js'
export * from './imap-fakes.js'
