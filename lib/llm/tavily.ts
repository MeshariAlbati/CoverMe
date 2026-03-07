type TavilySearchResponse = {
  results?: Array<{
    title?: string
    url?: string
    content?: string
  }>
}

function trimText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max)}...`
}

export async function getTavilyCompanyContext(companyName: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY?.trim()
  if (!apiKey) {
    return ''
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${companyName} company mission values products culture recent news`,
        search_depth: 'advanced',
        max_results: 6,
        include_answer: false,
      }),
    })

    if (!response.ok) {
      return ''
    }

    const payload = await response.json() as TavilySearchResponse
    const results = Array.isArray(payload.results) ? payload.results : []
    if (!results.length) {
      return ''
    }

    return results
      .slice(0, 6)
      .map((result, index) => {
        const title = trimText(result.title, 120) || 'Untitled'
        const url = trimText(result.url, 180) || 'No URL provided'
        const snippet = trimText(result.content, 420) || 'No summary text available'
        return `${index + 1}. ${title}\nURL: ${url}\n${snippet}`
      })
      .join('\n\n')
  } catch {
    return ''
  }
}
