declare module "@neoxr/quote-api" {
  type QuoteResult = { image?: string; error?: string; [key: string]: unknown };
  const quoteApi: (params: unknown) => Promise<QuoteResult>;
  export default quoteApi;
}
