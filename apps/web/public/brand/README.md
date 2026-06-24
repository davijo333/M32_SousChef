# Brand icons

All logos live here. Replace `icon.png` in a folder to update that asset app-wide.

| Folder | File | Used for |
|--------|------|----------|
| [app-logo/](./app-logo/) | `icon.png` | App logo — nav, login, signup, favicon |
| [head-chef/](./head-chef/) | `icon.png` | Sous Chef supervisor (floating chat / tabs) |
| [inventory-agent/](./inventory-agent/) | `icon.png` | Inventory Assistant — dashboard + chat |
| [business-agent/](./business-agent/) | `icon.png` | Business Assistant — dashboard + chat |
| [creative-agent/](./creative-agent/) | `icon.png` | Creative Assistant — dashboard + chat |

## Paths in code

Do not hardcode URLs in components. Use `@/lib/agent-icons`:

```ts
import { AGENT_ICONS } from "@/lib/agent-icons";

AGENT_ICONS.sousChef    // /brand/app-logo/icon.png
AGENT_ICONS.headChef    // /brand/head-chef/icon.png
AGENT_ICONS.inventory   // /brand/inventory-agent/icon.png
AGENT_ICONS.business    // /brand/business-agent/icon.png
AGENT_ICONS.creative    // /brand/creative-agent/icon.png
```

Or `<AgentAvatar agent="inventory" />` / `<AuthBrandLogo />`.

## Where each appears today

| Asset | UI |
|-------|-----|
| App logo | Nav, login, signup, browser tab |
| Inventory | Dashboard → Inventory section, chat header |
| Business | Dashboard → Business section, chat header |
| Creative | Dashboard → Creative section, chat header |
| Sous Chef | Asset ready — shown when Sous Chef chat dock ships |

## Replace an icon

1. Drop new `icon.png` into the folder (trim extra margins if the artwork looks small).
2. Hard-refresh the browser (Cmd+Shift+R).

See [docs/Agentic_Tools/Icon_Prompts.md](../../../../docs/Agentic_Tools/Icon_Prompts.md) for generation prompts.
