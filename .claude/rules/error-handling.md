# Error Handling

- Wrap all external calls (API, scraper) with `withRetry`
- Always log errors before throwing - never swallow silently
