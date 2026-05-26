import axios from 'axios';
import { config } from '../../config';

export type NewsArticle = {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  relevanceScore: number;
};

export type NewsResult = {
  query: string;
  location: string;
  totalResults: number;
  articles: NewsArticle[];
  timestamp: string;
};

export async function searchNews(query: string, location: string): Promise<NewsResult> {
  if (!config.apis.newsApiKey) {
    return getMockNews(query, location);
  }

  const searchQuery = `${query} ${location}`.trim();

  try {
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: searchQuery,
        sortBy: 'publishedAt',
        language: 'en',
        pageSize: 10,
        apiKey: config.apis.newsApiKey,
      },
      timeout: 8000,
    });

    const articles: NewsArticle[] = (response.data.articles ?? []).map((a: any) => ({
      title: a.title ?? 'Untitled',
      description: a.description ?? 'No description available.',
      url: a.url ?? '',
      source: a.source?.name ?? 'Unknown',
      publishedAt: a.publishedAt ?? new Date().toISOString(),
      relevanceScore: calculateRelevance(a.title + ' ' + a.description, query),
    }));

    // Sort by relevance
    articles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      query,
      location,
      totalResults: response.data.totalResults ?? articles.length,
      articles: articles.slice(0, 5),
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[NewsTool] NewsAPI error, using mock data:', (err as Error).message);
    return getMockNews(query, location);
  }
}

function calculateRelevance(text: string, query: string): number {
  const keywords = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  return keywords.reduce((score, kw) => score + (textLower.includes(kw) ? 1 : 0), 0);
}

function getMockNews(query: string, location: string): NewsResult {
  const crisisType = query.toLowerCase();
  const now = new Date();

  const mockArticles: Record<string, NewsArticle[]> = {
    flood: [
      {
        title: `Major flooding hits ${location} — thousands evacuated`,
        description: `Emergency services are responding to severe flooding in the ${location} area. Water levels have risen 3 meters above normal, forcing mass evacuations. Local shelters are at capacity.`,
        url: 'https://example.com/news/flood-1',
        source: 'Emergency News Network',
        publishedAt: new Date(now.getTime() - 30 * 60000).toISOString(),
        relevanceScore: 5,
      },
      {
        title: `Red Cross mobilizes disaster relief teams for ${location} flood`,
        description: 'The American Red Cross has deployed 200 volunteers and opened 5 emergency shelters to assist flood victims in the affected region.',
        url: 'https://example.com/news/flood-2',
        source: 'Relief Wire',
        publishedAt: new Date(now.getTime() - 90 * 60000).toISOString(),
        relevanceScore: 4,
      },
      {
        title: `Power outages affect 50,000 homes in ${location} flood zone`,
        description: 'Utility companies report widespread outages as floodwaters damage electrical infrastructure. Restoration teams are staged but cannot enter unsafe areas.',
        url: 'https://example.com/news/flood-3',
        source: 'Local News Today',
        publishedAt: new Date(now.getTime() - 2 * 3600000).toISOString(),
        relevanceScore: 3,
      },
    ],
    wildfire: [
      {
        title: `Wildfire spreads rapidly near ${location} — 10,000 acres burned`,
        description: 'Driven by strong winds, the ${location} fire has grown to 10,000 acres. Containment is at 0%. Mandatory evacuation orders in effect for 3 zones.',
        url: 'https://example.com/news/fire-1',
        source: 'Fire News Network',
        publishedAt: new Date(now.getTime() - 20 * 60000).toISOString(),
        relevanceScore: 5,
      },
    ],
    earthquake: [
      {
        title: `M5.8 earthquake shakes ${location} — structural damage reported`,
        description: 'A magnitude 5.8 earthquake struck near ${location} at 14:32 local time. Multiple buildings have sustained damage. Search and rescue teams are being deployed.',
        url: 'https://example.com/news/quake-1',
        source: 'Seismic Alert',
        publishedAt: new Date(now.getTime() - 15 * 60000).toISOString(),
        relevanceScore: 5,
      },
    ],
  };

  const articles = Object.entries(mockArticles).find(([key]) =>
    crisisType.includes(key)
  )?.[1] ?? mockArticles.flood;

  return {
    query,
    location,
    totalResults: articles.length,
    articles,
    timestamp: now.toISOString(),
  };
}

export function formatNewsReport(news: NewsResult): string {
  if (news.articles.length === 0) {
    return `📰 NEWS REPORT — "${news.query}" in ${news.location}\nNo recent articles found.`;
  }

  const articleList = news.articles
    .map(
      (a, i) =>
        `${i + 1}. *${a.title}*\n   ${a.description.slice(0, 120)}...\n   Source: ${a.source} | ${new Date(a.publishedAt).toLocaleString()}`
    )
    .join('\n\n');

  return `📰 NEWS REPORT — "${news.query}" in ${news.location}
${news.totalResults} total results | Showing top ${news.articles.length}

${articleList}

Updated: ${news.timestamp}`;
}
