# 则灵 consultation skills

Four original, host-adapted workflows shipped and registered with the plugin:
prepare → evidence / decision → adopt. Plugin registration uses dsh SkillRegistry,
not filesystem writes to the user's global skills directory. Package installation
makes them discoverable; the short button request explicitly asks the local agent
to load the prepare skill. Loading and following a skill still depends on the
host agent; registration is not a deterministic replacement for the agent loop.

Design references reviewed before writing these instructions:
- https://github.com/getpaseo/paseo/blob/main/skills/paseo-handoff/SKILL.md — self-contained briefing and task boundaries.
- https://github.com/jugugug/AgentHandoff — summary/index/source separation; no Codex exporter is shipped here.
- https://github.com/obra/superpowers/tree/main/skills/requesting-code-review — bounded work-product review context.
- https://github.com/obra/superpowers/tree/main/skills/systematic-debugging — original symptoms, reproduction and boundary evidence.
- https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering/tree/main/skills/context-compression — retain decisions and incremental state.

This is a new Zesia-specific implementation, not an installation of those upstream
skills or their harnesses. There is no upstream multi-agent orchestration dependency.
