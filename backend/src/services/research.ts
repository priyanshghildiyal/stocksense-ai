import OpenAI from 'openai';
import { env, isOpenAiConfigured } from '../lib/config.js';
import { AppError } from '../lib/errors.js';
import { yahooProvider } from '../providers/yahoo.js';
import { resolveYahooSymbol, getSecuritiesPayload } from './market.js';
import { computeTechnicals } from './technicals.js';

export type ResearchSource = {
  id: string;
  title: string;
  url?: string;
  publisher?: string;
  asOf?: string;
  kind: 'quote' | 'history' | 'fundamentals' | 'news' | 'screener' | 'technicals';
};

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_quote',
      description: 'Get the latest timestamped quote for a ticker from Yahoo Finance.',
      parameters: {
        type: 'object',
        properties: { ticker: { type: 'string' } },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_history',
      description: 'Get historical OHLCV bars for a ticker.',
      parameters: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          range: { type: 'string', enum: ['1m', '3m', '6m', '1y', '5y'] },
        },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fundamentals',
      description: 'Get fundamentals snapshot for a ticker from Yahoo Finance quoteSummary.',
      parameters: {
        type: 'object',
        properties: { ticker: { type: 'string' } },
        required: ['ticker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Get recent news items attributed to publishers from Yahoo Finance search.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          ticker: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'screen_securities',
      description: 'List securities currently in the StockSense universe with live quotes.',
      parameters: {
        type: 'object',
        properties: {
          sector: { type: 'string' },
        },
      },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>, sources: ResearchSource[]) {
  switch (name) {
    case 'get_quote': {
      const ticker = String(args.ticker || '').toUpperCase();
      const symbol = await resolveYahooSymbol(ticker);
      const quotes = await yahooProvider.getQuotes([symbol]);
      const q = quotes[0];
      if (q) {
        sources.push({
          id: `quote:${q.ticker}:${q.asOf}`,
          title: `${q.ticker} quote`,
          asOf: q.asOf,
          publisher: q.source,
          kind: 'quote',
        });
      }
      return q || { error: 'Quote unavailable' };
    }
    case 'get_history': {
      const ticker = String(args.ticker || '').toUpperCase();
      const range = String(args.range || '1y');
      const symbol = await resolveYahooSymbol(ticker);
      const history = await yahooProvider.getHistory(symbol, range);
      sources.push({
        id: `history:${ticker}:${range}`,
        title: `${ticker} history (${range})`,
        publisher: history.source,
        asOf: history.bars.at(-1)?.date,
        kind: 'history',
      });
      return {
        symbol: history.symbol,
        source: history.source,
        bars: history.bars.slice(-30),
        count: history.bars.length,
      };
    }
    case 'get_fundamentals': {
      const ticker = String(args.ticker || '').toUpperCase();
      const symbol = await resolveYahooSymbol(ticker);
      const data = await yahooProvider.getFundamentals(symbol);
      if (data) {
        sources.push({
          id: `fundamentals:${ticker}:${data.asOf}`,
          title: `${ticker} fundamentals`,
          publisher: data.source,
          asOf: data.asOf,
          kind: 'fundamentals',
        });
      }
      return data || { error: 'Fundamentals unavailable' };
    }
    case 'get_news': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      const query = args.query ? String(args.query) : undefined;
      const news = await yahooProvider.getNews(query, ticker ? [ticker] : []);
      for (const item of news.slice(0, 8)) {
        sources.push({
          id: `news:${item.id}`,
          title: item.title,
          url: item.link,
          publisher: item.publisher,
          asOf: item.publishedAt,
          kind: 'news',
        });
      }
      return news.slice(0, 8);
    }
    case 'screen_securities': {
      const payload = await getSecuritiesPayload(false);
      const sector = args.sector ? String(args.sector) : undefined;
      const rows = sector && sector !== 'All sectors'
        ? payload.securities.filter((s) => s.sector === sector)
        : payload.securities;
      sources.push({
        id: `screener:${payload.updatedAt}`,
        title: 'Universe screener',
        publisher: payload.source,
        asOf: payload.updatedAt,
        kind: 'screener',
      });
      return rows.slice(0, 25);
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export async function runResearchAsk(question: string, ticker?: string) {
  if (!isOpenAiConfigured()) {
    throw new AppError(
      503,
      'Research services are not connected. Set OPENAI_API_KEY to enable AI research with source retrieval.',
      'AI_NOT_CONFIGURED',
    );
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const sources: ResearchSource[] = [];
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'You are StockSense Research, a careful financial research assistant. Use tools to retrieve timestamped market data and news. Separate facts from interpretation. Never invent prices, filings, or news. Cite sources by title/publisher/date. If data is unavailable, say so. This is educational, not investment advice.',
    },
    {
      role: 'user',
      content: ticker ? `Context ticker: ${ticker}\n\nQuestion: ${question}` : question,
    },
  ];

  for (let step = 0; step < 6; step++) {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
    });
    const msg = completion.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const args = JSON.parse(call.function.arguments || '{}');
        const result = await runTool(call.function.name, args, sources);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    return {
      answer: msg.content || '',
      sources: dedupeSources(sources),
      model: env.OPENAI_MODEL,
      disclaimer: 'Educational research only. Not investment advice. Verify primary sources.',
    };
  }

  return {
    answer: 'Unable to complete research with available tools.',
    sources: dedupeSources(sources),
    model: env.OPENAI_MODEL,
    disclaimer: 'Educational research only. Not investment advice.',
  };
}

function dedupeSources(sources: ResearchSource[]) {
  const map = new Map<string, ResearchSource>();
  for (const s of sources) map.set(s.id, s);
  return [...map.values()];
}

export async function analyzeDocumentText(title: string, contentText: string) {
  if (!isOpenAiConfigured()) {
    throw new AppError(503, 'Document analysis requires OPENAI_API_KEY.', 'AI_NOT_CONFIGURED');
  }
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'Summarize the uploaded financial document text. Extract key claims, numbers, dates, and risks. Do not invent facts not present in the text. Return JSON with keys: summary, keyClaims, risks, numbersMentioned, openQuestions.',
      },
      { role: 'user', content: `Title: ${title}\n\n${contentText.slice(0, 40000)}` },
    ],
    response_format: { type: 'json_object' },
  });
  const raw = completion.choices[0]?.message?.content || '{}';
  return JSON.parse(raw);
}

export async function industryBrief(sector: string) {
  const payload = await getSecuritiesPayload(false);
  const peers = payload.securities.filter((s) => s.sector === sector);
  const technicals = [];
  for (const peer of peers.slice(0, 8)) {
    try {
      const symbol = await resolveYahooSymbol(peer.ticker);
      const history = await yahooProvider.getHistory(symbol, '6m');
      technicals.push({ ticker: peer.ticker, quote: peer, indicators: computeTechnicals(history.bars) });
    } catch {
      technicals.push({ ticker: peer.ticker, quote: peer, indicators: null });
    }
  }
  return {
    sector,
    source: payload.source,
    updatedAt: payload.updatedAt,
    peerCount: peers.length,
    peers: technicals,
    methodology: 'Industry view aggregates live Yahoo Finance quotes and computed indicators for universe peers in the selected sector. No fabricated sector indices.',
  };
}
