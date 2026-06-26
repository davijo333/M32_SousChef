"""Persona spec loader tests."""

from prompts.spec_loader import load_contract, load_instructions, load_profile


def test_sous_chef_has_full_persona():
    profile = load_profile("head")
    assert profile["name"] == "Sous Chef"
    assert "no-nonsense" in profile["persona"].lower() or "polished" in profile["persona"].lower()
    assert profile["role"]
    assert "never talks to workers" in profile["role"].lower() or "single chat" in profile["role"].lower()


def test_workers_have_no_persona():
    for ctx in ("inventory", "business", "create"):
        profile = load_profile(ctx)
        assert not profile.get("persona")


def test_workers_have_contracts():
    for ctx in ("inventory", "business", "create"):
        contract = load_contract(ctx)
        assert contract.get("worker") == ctx or (ctx == "create" and contract.get("worker") == "create")
        assert "rules" in contract


def test_sous_chef_instructions_no_agent_names_in_user_rules():
    text = load_instructions("head", name="Sous Chef", task_prompt="test")
    assert "never name them" in text.lower() or "invisible" in text.lower()
