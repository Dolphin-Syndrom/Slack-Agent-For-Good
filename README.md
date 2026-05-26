# 🚨 ResQ AI — Multi-Agent Crisis Response Coordinator for Slack

[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://slack.com)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blue)](https://modelcontextprotocol.io)
[![Groq](https://img.shields.io/badge/Groq-LLM-orange)](https://groq.com)
[![Track](https://img.shields.io/badge/Track-Agent_for_Good-green)](https://devpost.com)

> **Slack Agent Builder Challenge 2025 — Agent for Good Track**  
> Empowering nonprofit and government emergency response teams with AI-orchestrated crisis coordination inside Slack.

---

## 🎯 What It Does

ResQ AI transforms Slack into a real-time crisis command center. When disaster strikes — floods, wildfires, earthquakes — responders no longer waste critical time hunting for information across scattered tools.

**In one command, ResQ AI:**
- 🔍 Gathers live weather, seismic, and news intelligence (via MCP + real APIs)
- 📦 Recommends and tracks resource allocation (WHO-standard calculations)
- 📢 Drafts public alerts, press releases, and volunteer briefings (Groq LLM)
- 📋 Generates military-style SITREPs on demand
- 🤖 Orchestrates 5 specialized AI agents via the Google A2A protocol

---

## 🏗️ Architecture

### System Architecture

```mermaid
graph TB
    subgraph Slack["🟣 Slack Workspace (Socket Mode)"]
        U[("👤 Responder")]
        CMD["💬 /crisis · /resq<br/>Slash Commands"]
        CH["📢 Crisis Channel<br/>#crisis-flood-austin"]
        HT["🏠 App Home Tab<br/>Dashboard"]
        BTN["🔘 Block Kit Buttons<br/>Approve / Discard"]
    end

    subgraph App["⚡ ResQ AI App (Node.js / TypeScript)"]
        BOLT["@slack/bolt<br/>Socket Mode Handler"]
        CMD_H["commands.ts<br/>registerCommands()"]
        ACT_H["actions.ts<br/>registerActions()"]
        EVT_H["views.ts<br/>registerEvents()"]
        FMT["formatter.ts<br/>Block Kit Builders"]
    end

    subgraph Orchestrator["🎯 Orchestrator Agent"]
        ORC["orchestrator.ts<br/>activate() · generateSitRep()"]
        PIPE["runAgentPipeline()<br/>Parallel Dispatch"]
    end

    subgraph SubAgents["🤖 Specialized AI Agents  (Google A2A Protocol · port 3002)"]
        INTEL["🔍 Intel Agent<br/>intel-agent.ts<br/>gather_intel"]
        RSRC["📦 Resource Agent<br/>resource-agent.ts<br/>allocate_resources"]
        COMMS["📢 Comms Agent<br/>comms-agent.ts<br/>draft_alert · draft_sitrep"]
        REPT["📋 Report Agent<br/>report-agent.ts<br/>generate_sitrep"]
    end

    subgraph MCP["🔧 MCP Server  (port 3001 · StreamableHTTP)"]
        MCPSRV["McpServer<br/>9 Tools Exposed"]
        T1["get_weather"]
        T2["get_earthquakes"]
        T3["search_news"]
        T4["find_resources"]
        T5["create_crisis"]
        T6["get_crisis_status"]
        T7["update_crisis"]
        T8["log_intel_update"]
        T9["log_resource"]
    end

    subgraph ExternalAPIs["🌍 External APIs"]
        OWM["☁️ OpenWeatherMap<br/>Weather + Alerts"]
        USGS["🌐 USGS Earthquake API<br/>Free · No Key"]
        NAPI["📰 NewsAPI<br/>Real-Time Articles"]
        GROQ["🦙 Groq LLM API<br/>llama-3.3-70b-versatile"]
    end

    subgraph DB["🗄️ SQLite Database (better-sqlite3)"]
        TBL1[("crises")]
        TBL2[("resources")]
        TBL3[("intel_updates")]
        TBL4[("comms_drafts")]
        TBL5[("a2a_tasks")]
    end

    U --> CMD --> BOLT --> CMD_H --> ORC
    BTN --> BOLT --> ACT_H
    U --> HT --> EVT_H

    ORC --> PIPE
    PIPE -->|"A2A JSON-RPC"| INTEL
    PIPE -->|"A2A JSON-RPC"| RSRC
    PIPE -->|sequential| COMMS
    ORC --> REPT

    INTEL -->|"MCP tool calls"| MCPSRV
    MCPSRV --> T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 & T9

    T1 --> OWM
    T2 --> USGS
    T3 --> NAPI

    INTEL -->|"runAgentLoop()"| GROQ
    RSRC -->|"complete()"| GROQ
    COMMS -->|"complete()"| GROQ
    REPT -->|"complete()"| GROQ

    INTEL --> TBL3
    RSRC --> TBL2
    COMMS --> TBL4
    ORC --> TBL1
    REPT --> TBL3 & TBL2 & TBL4

    ORC --> FMT --> CH
    COMMS --> FMT
    REPT --> FMT

    style Slack fill:#4A154B,color:#fff,stroke:#7B68EE
    style App fill:#1a1a2e,color:#eee,stroke:#7B68EE
    style Orchestrator fill:#16213e,color:#eee,stroke:#0f3460
    style SubAgents fill:#0f3460,color:#eee,stroke:#533483
    style MCP fill:#162032,color:#eee,stroke:#00b4d8
    style ExternalAPIs fill:#1b2838,color:#eee,stroke:#4CAF50
    style DB fill:#1c1c1e,color:#eee,stroke:#FF9800
```

---

### 🔄 Crisis Activation Data Flow

```mermaid
sequenceDiagram
    actor R as 👤 Responder
    participant S as Slack
    participant CMD as commands.ts
    participant ORC as Orchestrator
    participant DB as SQLite DB
    participant INTEL as Intel Agent
    participant RSRC as Resource Agent
    participant COMMS as Comms Agent
    participant MCP as MCP Server
    participant GROQ as Groq LLM
    participant EXT as External APIs

    R->>S: /crisis activate flood "Austin TX" critical
    S->>CMD: ack() + parse args
    CMD->>ORC: orchestratorAgent.activate(input)

    ORC->>DB: createCrisis(type, location, severity)
    DB-->>ORC: crisis { id, status: ACTIVE }

    ORC->>S: conversations.create(#crisis-flood-austin-tx)
    S-->>ORC: crisisChannelId

    ORC->>S: postMessage(crisisActivatedBlocks)
    S-->>R: 🚨 Crisis channel created

    ORC->>CMD: return { crisisId, status: activated }
    CMD->>S: respond("Crisis activated! Head to #channel")
    S-->>R: ✅ Immediate ACK (< 3s)

    Note over ORC,COMMS: Background Pipeline (runAgentPipeline) — non-blocking

    par Phase 1 — Parallel Intel + Resource
        ORC->>+INTEL: gatherIntelligence(crisisId, type, location)
        INTEL->>GROQ: runAgentLoop(SYSTEM_PROMPT, tools)
        loop Tool Calling Loop (max 8 iterations)
            GROQ-->>INTEL: tool_call: get_weather / get_earthquakes / search_news
            INTEL->>MCP: POST /mcp { method: tools/call }
            MCP->>EXT: OpenWeatherMap / USGS / NewsAPI
            EXT-->>MCP: raw data
            MCP-->>INTEL: formatted report
        end
        GROQ-->>INTEL: final briefing text
        INTEL->>DB: createIntelUpdate × N (weather, news, seismic, briefing)
        INTEL-->>ORC: { briefing, updateCount, sources }
        deactivate INTEL
    and
        ORC->>+RSRC: allocateResources(crisisId, type, severity)
        RSRC->>GROQ: complete(SYSTEM_PROMPT, allocationPrompt)
        GROQ-->>RSRC: allocationPlan text
        RSRC->>DB: createResource × 3 (CRITICAL items auto-logged)
        RSRC-->>ORC: { recommendedResources, allocationPlan }
        deactivate RSRC
    end

    ORC->>S: postMessage(intelUpdateBlocks) → #crisis-channel
    S-->>R: 🔍 Intel Update card

    ORC->>S: postMessage(resourceSummaryBlocks) → #crisis-channel
    S-->>R: 📦 Resource Recommendations card

    Note over ORC,COMMS: Phase 2 — Comms Draft (sequential)

    ORC->>+COMMS: draftCommunication(crisisId, public_alert)
    COMMS->>DB: getIntelByCrisis(crisisId, 5)
    DB-->>COMMS: recent intel context
    COMMS->>GROQ: complete(PUBLIC_ALERT_PROMPT, crisisContext + intel)
    GROQ-->>COMMS: drafted alert text
    COMMS->>DB: createCommsDraft(title, content, status: draft)
    COMMS-->>ORC: { draftId, title, content }
    deactivate COMMS

    ORC->>S: postMessage(commsDraftBlocks + Approve button)
    S-->>R: 📢 Draft alert with [✅ Approve & Send] button

    R->>S: Click "Approve & Send"
    S->>CMD: action: approve_draft (draftId)
    CMD->>DB: updateCommsDraft(status: approved)
    CMD->>S: postMessage(approved alert to channel)
    S-->>R: ✅ Alert published
```

---

### 🗂️ Command & Decision Flowchart

```mermaid
flowchart TD
    START(["👤 User types command in Slack"]) --> PARSE["Parse command tokens"]

    PARSE --> CRISIS{"/crisis ?"}
    PARSE --> RESQ{"/resq ?"}

    %% /crisis branch
    CRISIS -->|"activate"| ACT_CHECK{"type & location\nprovided?"}
    CRISIS -->|"status"| STAT_CHECK{"crisis_id\nprovided?"}
    CRISIS -->|"resolve"| RES_CHECK{"crisis_id\nprovided?"}
    CRISIS -->|"list"| LIST["getAllCrises()"]
    CRISIS -->|"other"| HELP_C["Show help text"]

    ACT_CHECK -->|"❌ missing"| ERR1["❌ Usage error → ephemeral"]
    ACT_CHECK -->|"✅ valid"| ACTIVATE["orchestratorAgent.activate()"]
    ACTIVATE --> CREATE_CH["Create #crisis-channel in Slack"]
    CREATE_CH --> DISPATCH["Dispatch agents in background"]
    DISPATCH --> ACK["✅ ACK user immediately"]
    DISPATCH --> PIPELINE["runAgentPipeline()"]

    PIPELINE --> PAR{{"⚡ Parallel"}}
    PAR --> INTEL_RUN["Intel Agent\nWeather + Seismic + News\n→ Groq LLM synthesis"]
    PAR --> RSRC_RUN["Resource Agent\nWHO calculations\n→ Groq LLM plan"]
    INTEL_RUN & RSRC_RUN --> POST_INTEL["Post intel card to channel"]
    POST_INTEL --> POST_RSRC["Post resource card to channel"]
    POST_RSRC --> COMMS_RUN["Comms Agent\nDraft public_alert\n→ Groq LLM"]
    COMMS_RUN --> DRAFT_POST["Post draft + Approve/Discard buttons"]
    DRAFT_POST --> USER_ACT{{"👤 Coordinator clicks button"}}
    USER_ACT -->|"✅ Approve"| APPROVE["Mark draft approved\nPost alert to channel"]
    USER_ACT -->|"🗑️ Discard"| DISCARD["Mark draft discarded"]

    STAT_CHECK -->|"✅ id provided"| GET_ONE["getCrisisById()\ngetIntelByCrisis()"]
    STAT_CHECK -->|"❌ no id"| GET_ALL["getAllCrises() dashboard"]
    GET_ONE --> POST_STAT["Post intel + status blocks"]
    GET_ALL --> POST_DASH["Post status dashboard"]

    RES_CHECK -->|"❌ missing"| ERR2["❌ Usage error"]
    RES_CHECK -->|"✅ valid"| RESOLVE["updateCrisis(RESOLVED)\npost resolution card"]

    LIST --> POST_LIST["Post crisis list blocks"]

    %% /resq branch
    RESQ -->|"report"| RPT_CHECK{"active crisis\nfound?"}
    RESQ -->|"draft"| DFT_CHECK{"active crisis\nfound?"}
    RESQ -->|"intel"| INT_CHECK{"active crisis\nfound?"}
    RESQ -->|"other"| HELP_R["Show quick reference"]

    RPT_CHECK -->|"❌ none"| ERR3["❌ No active crisis"]
    RPT_CHECK -->|"✅ found"| RPT_GEN["reportAgent.generateSitRep()\n→ Groq LLM 7-section SITREP"]
    RPT_GEN --> POST_RPT["Post SITREP blocks to channel"]

    DFT_CHECK -->|"❌ none"| ERR4["❌ No active crisis"]
    DFT_CHECK -->|"✅ found"| DFT_TYPE{"draft type?"}
    DFT_TYPE -->|"alert"| D_ALERT["commsAgent.draftCommunication\npublic_alert"]
    DFT_TYPE -->|"press"| D_PRESS["commsAgent.draftCommunication\npress_release"]
    DFT_TYPE -->|"volunteer"| D_VOL["commsAgent.draftCommunication\nvolunteer_brief"]
    DFT_TYPE -->|"sitrep"| D_SIT["commsAgent.draftCommunication\nsitrep"]
    D_ALERT & D_PRESS & D_VOL & D_SIT --> DFT_POST["Post draft + Approve/Discard"]

    INT_CHECK -->|"❌ none"| ERR5["❌ No active crisis"]
    INT_CHECK -->|"✅ found"| INT_REFRESH["intelAgent.gatherIntelligence()\nrefresh all sources"]
    INT_REFRESH --> POST_INT["Post updated intel blocks"]

    style START fill:#4A154B,color:#fff,stroke:none
    style PIPELINE fill:#0f3460,color:#fff,stroke:none
    style PAR fill:#162032,color:#eee,stroke:#00b4d8
    style USER_ACT fill:#1a1a2e,color:#eee,stroke:#7B68EE
    style APPROVE fill:#1b5e20,color:#fff,stroke:none
    style DISCARD fill:#b71c1c,color:#fff,stroke:none
    style ERR1 fill:#b71c1c,color:#fff,stroke:none
    style ERR2 fill:#b71c1c,color:#fff,stroke:none
    style ERR3 fill:#b71c1c,color:#fff,stroke:none
    style ERR4 fill:#b71c1c,color:#fff,stroke:none
    style ERR5 fill:#b71c1c,color:#fff,stroke:none
```

### Technology Stack

| Component | Technology |
|---|---|
| Slack Framework | `@slack/bolt` v4 (Socket Mode) |
| LLM | Groq API (`llama-3.3-70b-versatile`) |
| MCP SDK | `@modelcontextprotocol/sdk` v1.12 |
| A2A Protocol | Google A2A spec (HTTP JSON-RPC) |
| Real-Time Search | NewsAPI + OpenWeatherMap + USGS |
| Database | SQLite (better-sqlite3) |
| Language | TypeScript / Node.js |

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js 18+
- A Slack workspace with admin access
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Install Dependencies

```bash
cd slack
npm install
```

### 2. Create Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name: `ResQ AI`, select your workspace

**Enable Socket Mode:**
- Settings → Socket Mode → Enable
- Generate an **App-Level Token** with `connections:write` scope
- Copy the `xapp-...` token → `SLACK_APP_TOKEN`

**Bot Token Scopes** (OAuth & Permissions):
```
channels:manage    channels:read      channels:write
chat:write         commands           app_mentions:read
im:write           users:read
```

**Slash Commands** (Slash Commands → Create):
- `/crisis` → Request URL: (handled via Socket Mode)
- `/resq` → Request URL: (handled via Socket Mode)

**Event Subscriptions** (Socket Mode handles this):
- `app_home_opened`
- `app_mention`

**Install the app** to your workspace → copy `Bot User OAuth Token` → `SLACK_BOT_TOKEN`

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SLACK_BOT_TOKEN=xoxb-...        # From OAuth & Permissions
SLACK_SIGNING_SECRET=...         # From Basic Information
SLACK_APP_TOKEN=xapp-...         # From Socket Mode

GROQ_API_KEY=gsk_...             # From console.groq.com (free)

# Optional — app works with mock data without these:
OPENWEATHER_API_KEY=...          # openweathermap.org (free tier)
NEWS_API_KEY=...                 # newsapi.org (free tier)
```

### 4. Run the App

```bash
npm run dev
```

You should see:
```
🚨 Starting ResQ AI — Multi-Agent Crisis Response Coordinator
✅  ResQ AI is live! (Socket Mode — no public URL needed)
🔧 MCP Server running on http://localhost:3001/mcp
🤖 A2A server running on http://localhost:3002/a2a
```

---

## 💬 Usage

### Activate a Crisis Response

```
/crisis activate flood "Austin TX" high
/crisis activate wildfire "Los Angeles CA" critical
/crisis activate earthquake "Kathmandu Nepal" critical
```

ResQ AI will automatically:
1. Create a dedicated `#crisis-flood-austin-tx` channel
2. Dispatch Intel Agent → fetches weather, seismic data, news
3. Dispatch Resource Agent → recommends resources (WHO standards)
4. Post Comms Agent's draft public alert for 1-click approval

### Generate a Situation Report

```
/resq report              # Uses most recent active crisis
/resq report <crisis_id>  # Specific crisis
```

### Draft Communications

```
/resq draft alert          # Public safety alert
/resq draft press          # Press release
/resq draft volunteer      # Volunteer briefing
/resq draft sitrep         # Military-style SITREP
```

### Other Commands

```
/crisis status             # Dashboard of all crises
/crisis resolve <id>       # Mark crisis resolved
/resq intel                # Refresh live intelligence
```

---

## 🤖 Agent Details

### Orchestrator Agent
Master coordinator. Receives activation request, creates crisis record, auto-creates Slack channel, dispatches sub-agents in parallel via A2A, then posts results back to Slack.

### Intel Agent
Gathers live situational intelligence using a Groq tool-calling loop:
- **Weather**: OpenWeatherMap (or mock) — conditions, alerts
- **Seismic**: USGS Earthquake API (free, no key needed) — recent activity
- **News**: NewsAPI (or mock) — latest crisis coverage
- Synthesizes a briefing using LLM and saves all updates to DB

### Resource Agent
Evidence-based resource allocation:
- Calculates requirements from severity/population (WHO standards)
- Crisis-type-specific items (rescue boats for floods, N95 for wildfires)
- Auto-logs CRITICAL items to the DB inventory
- Tracks: volunteers, vehicles, shelters, medical, food, water

### Comms Agent
Generates 4 document types using crisis context + stored intel:
- **Public Alert** — simple language, imperative verbs, immediate actions
- **Press Release** — AP style, factual, for media distribution
- **Volunteer Briefing** — operational instructions, safety, chain of command
- **SITREP** — military format (Situation/Mission/Execution/Logistics/C2)

### Report Agent
On-demand SITREP generation aggregating all DB data:
- Pulls all intel updates, resource inventory, comms drafts
- Generates structured 7-section SITREP via Groq
- Includes metrics: hours active, resources tracked, intel count

---

## 🔧 MCP Server Tools

The MCP server (`src/mcp/server.ts`) exposes 9 tools:

| Tool | Description | API |
|---|---|---|
| `get_weather` | Current conditions + alerts | OpenWeatherMap |
| `get_earthquakes` | Recent seismic activity | USGS (free) |
| `search_news` | Crisis-relevant articles | NewsAPI |
| `find_resources` | Query resource inventory | SQLite |
| `create_crisis` | Create crisis record | SQLite |
| `get_crisis_status` | Crisis details by ID | SQLite |
| `update_crisis` | Update status/severity | SQLite |
| `log_intel_update` | Save intelligence update | SQLite |
| `log_resource` | Add resource to inventory | SQLite |

Test the MCP server directly:
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":"get_earthquakes","arguments":{"location":"California"}}}'
```

---

## 🤝 A2A Protocol

Agent-to-Agent communication follows the [Google A2A specification](https://google.github.io/A2A/).

**Agent Cards** available at:
- `GET http://localhost:3002/.well-known/agent.json` — Orchestrator card
- `GET http://localhost:3002/a2a/{intel|resource|comms|report}` — Sub-agent cards

**Send a task to an agent:**
```bash
curl -X POST http://localhost:3002/a2a/intel \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tasks/send",
    "id": "test-1",
    "params": {
      "skill": "gather_intel",
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "{\"crisisId\":\"test\",\"crisisType\":\"flood\",\"location\":\"Austin TX\",\"severity\":\"high\"}"}]
      }
    }
  }'
```

---

## 📁 Project Structure

```
slack/
├── src/
│   ├── app.ts                    # Main entrypoint (Bolt + Express + MCP)
│   ├── config.ts                 # Environment configuration
│   ├── agents/
│   │   ├── orchestrator.ts       # Master coordinator
│   │   ├── intel-agent.ts        # Intelligence gathering
│   │   ├── resource-agent.ts     # Resource allocation
│   │   ├── comms-agent.ts        # Communications drafting
│   │   └── report-agent.ts       # SITREP generation
│   ├── mcp/
│   │   ├── server.ts             # MCP HTTP server (9 tools)
│   │   └── tools/
│   │       ├── get-weather.ts    # OpenWeatherMap integration
│   │       ├── get-earthquakes.ts# USGS free API
│   │       ├── search-news.ts    # NewsAPI integration
│   │       └── find-resources.ts # DB resource queries
│   ├── a2a/
│   │   ├── agent-card.ts         # A2A spec agent cards
│   │   ├── client.ts             # HTTP task sender
│   │   └── server.ts             # JSON-RPC router
│   ├── slack/
│   │   ├── commands.ts           # /crisis + /resq handlers
│   │   ├── actions.ts            # Block Kit button handlers
│   │   └── views.ts              # Modal + event handlers
│   ├── db/
│   │   ├── schema.ts             # SQLite schema + init
│   │   └── queries.ts            # CRUD operations
│   └── utils/
│       ├── llm.ts                # Groq client + agent loop
│       └── formatter.ts          # Slack Block Kit builders
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```


---

## 🌍 Social Impact

ResQ AI directly addresses the **coordination failures** that cost lives in disasters:

- **2011 Japan Earthquake**: 1,600+ people died in evacuation-related incidents due to poor coordination
- **2018 Camp Fire (CA)**: Delayed evacuation orders from fragmented communication systems
- **COVID-19 PPE Crisis**: States bidding against each other due to no unified resource visibility

ResQ AI gives nonprofits and local governments the same AI-powered coordination that enterprise companies have — for free, inside the tools they already use.

**Target users**: Red Cross chapters, FEMA field offices, local EOCs, NGOs, hospital networks

---

## 📄 License

MIT — Built for the Slack Agent Builder Challenge 2025
