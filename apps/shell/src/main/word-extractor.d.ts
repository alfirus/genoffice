declare module 'word-extractor' {
  interface Document {
    getBody(): string
    getFootnotes(): string | null
    getEndnotes(): string | null
    getHeaders(): string | null
    getAnnotations(): string | null
    getTextboxes(): string | null
  }

  class WordExtractor {
    extract(filePath: string): Promise<Document>
    extract(buffer: Buffer): Promise<Document>
  }

  export = WordExtractor
}
