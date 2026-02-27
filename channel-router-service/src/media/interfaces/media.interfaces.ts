export interface MediaEntry {
  type: string;
  url: string;
  alt?: string;
  filename?: string;
  mimeType?: string;
  context: 'inline' | 'attachment';
}

export interface ProcessedMedia {
  type: string;
  filename?: string;
  mimeType?: string;
  content?: string;
  url?: string;
  context: 'inline' | 'attachment';
  error?: string;
}
