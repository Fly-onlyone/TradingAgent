---
tags: [desktop, agent, knowledge, search, news]
---

# Knowledge and Search

> What the app collects and how it is found again. Code: `src/TradingAgent.Data/Knowledge`,
> `src/TradingAgent.Data/News`, `src/TradingAgent.Agent/Knowledge`, `src/TradingAgent.Agent/News`,
> `src/TradingAgent.Agent/Web`, tools in `src/TradingAgent.Agent/Tools/KnowledgeTools.cs`.

## Five kinds of things

| Kind | Table | Comes from |
|---|---|---|
| Memory | `agent_memories` | the agent (`save_memory`) or the Memory page |
| Strategy | `strategy_knowledge` + `strategies` | the Strategies page, an import, discovery |
| Trade lesson | `trade_lessons` | every closed trade ([[Trades and Learning]]) |
| Pattern | `trading_patterns` | the pattern miner ([[Trades and Learning]]) |
| News | `news_articles` | the news crawler |

A strategy is two rows, written and removed together: the knowledge the search reads, and the
tradable strategy the user switches on. A strategy of the same name is not saved twice.

## Search

`KnowledgeSearch` searches any of the five kinds two ways and joins the rankings by rank (reciprocal
rank fusion):

- **By words**: the FTS5 index of each table. What was typed is turned into quoted words joined with
  OR (`FtsQuery.From`), so nothing typed is read as query syntax.
- **By meaning**: embeddings, when the user chose a provider on the Knowledge page. Ollama and
  LM Studio on this computer, OpenAI, or any server that speaks the OpenAI embeddings API. None by
  default: then the search uses words only, and says so.

Vectors are stored as BLOBs in `vectors` and compared in memory one by one. That is fast enough for
what one person collects, and it needs no SQLite extension, which the Native AOT build could not
load. Each vector carries the name of the provider and model that made it; after a change of model
everything is embedded again in the background (`EmbeddingIndexer`). A changed or deleted item drops
its vector.

The OpenAI key is sent to OpenAI only, never to an address the user typed for another provider.

## The newest memories go into the prompt

`TradingSystemPrompt` adds the twelve newest memories, so the model knows them without asking;
`search_memory` finds the rest.

## News

`NewsCrawler` reads the RSS or Atom feed of every enabled source when it is due (hourly), stores
what is new, and removes articles older than 90 days. An article is stored once, under its address
without tracking parameters. `AssetTagger` notes which coins a title and summary name, as whole
words. A new installation starts with five well-known feeds; the News page adds and removes sources.

## The web

- `web_search` uses the Brave Search API with the user's own key (Settings). Without a key it says
  so.
- `fetch_url` reads one page as text through `PageReader`: public http and https addresses only. An
  address on this computer or on the local network is refused, also when a public page redirects
  there, which is why the reader follows redirects itself and its HTTP handler must not.

Text from the web and from news is written by strangers. The prompt says it is information, never an
instruction, and the runs that read the most of it (discovery, imports) cannot trade.

## Strategy import and discovery

Both are agent runs, not separate machinery:

- **Import** (Strategies page): a chat in which the agent reads the address or text given and saves
  the strategy with `save_strategy` when its rules are clear.
- **Discovery** (`StrategyDiscovery`, off by default): on a schedule, or by hand, the agent looks in
  the collected news and on the web and saves what has clear rules. The run's session is blocked
  from trading ([[Scheduled Tasks]]); what it saved is marked as found by discovery.

## See also

- [[SQLite Schema Conventions]]
- [[Agent Runs]]
