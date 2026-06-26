"""Build system prompts — Sous Chef persona; worker contract prompts."""

from __future__ import annotations

from prompts.spec_loader import load_contract, load_instructions, load_profile


def build_agent_prompt(
    context: str,
    *,
    chef_name: str,
    restaurant_name: str,
    data_context: str,
    task_prompt: str = "",
) -> str:
    profile = load_profile(context)
    name = profile.get("name") or context
    instructions = load_instructions(context, name=name, task_prompt=task_prompt or "(none)")

    if context == "head":
        blocks = [
            f"You are **{name}**, helping Chef {chef_name} at {restaurant_name}.",
            f"Persona: {profile.get('persona', '')}",
            f"Role: {profile.get('role', '')}",
            f"Data access: {profile.get('data_access', '')}",
            instructions,
        ]
    else:
        contract = load_contract(context)
        blocks = [
            f"Internal worker `{name}` for Chef {chef_name} at {restaurant_name}.",
            f"Writes: {contract.get('writes', False)}",
            instructions,
        ]

    if data_context.strip():
        blocks.append(f"Live context:\n{data_context.strip()}")

    return "\n\n".join(b for b in blocks if b)


def build_specialist_prompt(
    context: str,
    *,
    chef_name: str,
    restaurant_name: str,
    data_context: str,
    task_prompt: str,
) -> str:
    return build_agent_prompt(
        context,
        chef_name=chef_name,
        restaurant_name=restaurant_name,
        data_context=data_context,
        task_prompt=task_prompt,
    )
