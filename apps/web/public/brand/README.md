# Brand icons

All logos live here. Replace `icon.png` in a folder to update that asset app-wide.

| Folder | File | Used for |
|--------|------|----------|
| [app-logo/](./app-logo/) | `icon.png` | App logo — nav, login, signup, favicon |
| [head-chef/](./head-chef/) | `icon.png` | Sous Chef — dock when supervising |
| [inventory-agent/](./inventory-agent/) | `icon.png` | Inventory Agent — dashboard + dock when connected |
| [business-agent/](./business-agent/) | `icon.png` | Business Agent — dashboard + dock when connected |
| [creative-agent/](./creative-agent/) | `icon.png` | Creative Agent — dashboard + dock when connected |

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

## Where each appears

| Asset | UI |
|-------|-----|
| App logo | Nav, login, signup, browser tab |
| Sous Chef (`head-chef`) | Dock default + after **Connect back to Sous Chef** |
| Inventory | Dashboard → Inventory section; dock when connected |
| Business | Dashboard → Business section; dock when connected |
| Creative | Dashboard → Create section; dock when connected |

## Replace an icon

1. Drop new `icon.png` into the folder (trim extra margins if the artwork looks small).
2. Hard-refresh the browser (Cmd+Shift+R).

See [icon-prompts.md](./icon-prompts.md) for generation prompts.
